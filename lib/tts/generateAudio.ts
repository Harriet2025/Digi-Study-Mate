import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseBuffer } from "music-metadata";
import type { ScriptLine } from "@/lib/ai/generateScript";
import { mapWithConcurrency, withRetry } from "./async";
import { ElevenLabsProvider } from "./providers/elevenlabs";
import { OpenAITtsProvider } from "./providers/openai";
import { TtsError, type AudioManifest, type AudioSegment, type TtsProvider } from "./types";

export { TtsError } from "./types";
export type { AudioManifest, AudioSegment, TtsProvider } from "./types";

export const AUDIO_BUCKET = "lecture-audio";

const MAX_SCRIPT_LINES = 2_000;
/** Gap between two different speakers, so turns don't collide. */
const TURN_GAP_SEC = 0.3;
/** Thinking time left after a quiz question before Sam answers. */
const QUIZ_PAUSE_SEC = 3;

export interface GenerateAudioOptions {
  /** Folder name in storage. Defaults to a new UUID. */
  scriptId?: string;
  /** Defaults to the provider picked by TTS_PROVIDER. */
  provider?: TtsProvider;
  /** Parallel TTS requests. Defaults to TTS_CONCURRENCY or the provider's default. */
  concurrency?: number;
  signal?: AbortSignal;
}

/** Picks the TTS provider from env: TTS_PROVIDER = "elevenlabs" (default) | "openai". */
export function getTtsProvider(): TtsProvider {
  const choice = (process.env.TTS_PROVIDER || "elevenlabs").toLowerCase();
  if (choice === "elevenlabs") {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) throw new TtsError("ELEVENLABS_API_KEY is not set.", { retryable: false });
    return new ElevenLabsProvider(key);
  }
  if (choice === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new TtsError("OPENAI_API_KEY is not set.", { retryable: false });
    return new OpenAITtsProvider(key);
  }
  throw new TtsError(`Unknown TTS_PROVIDER "${choice}". Use "elevenlabs" or "openai".`, { retryable: false });
}

/** One TTS request's worth of text, before synthesis. */
interface PlannedPiece {
  lineIndex: number;
  line: ScriptLine;
  text: string;
  previousText?: string;
  nextText?: string;
  isLastPieceOfLine: boolean;
}

/**
 * Converts a script to audio:
 * 1. splits long lines into provider-sized pieces at sentence boundaries,
 * 2. synthesizes each piece with the speaker's voice (bounded concurrency, retries on 429/5xx),
 * 3. uploads each MP3 to Supabase Storage as soon as it's ready,
 * 4. builds a manifest with public URLs and a playback timeline, and uploads it too.
 *
 * If any piece fails for good, all files uploaded for this script are deleted and the error is rethrown.
 */
export async function generateAudio(
  db: SupabaseClient,
  script: ScriptLine[],
  options: GenerateAudioOptions = {},
): Promise<AudioManifest> {
  validateScript(script);

  const provider = options.provider ?? getTtsProvider();
  const scriptId = options.scriptId ?? randomUUID();
  const concurrency = options.concurrency ?? (Number(process.env.TTS_CONCURRENCY) || provider.defaultConcurrency);
  const pieces = planPieces(script, provider.maxCharsPerRequest);

  // Cancels in-flight requests when one piece fails or the caller aborts.
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const uploadedPaths: string[] = [];
  const bucket = db.storage.from(AUDIO_BUCKET);

  try {
    const rendered = await mapWithConcurrency(pieces, concurrency, async (piece, index) => {
      try {
        const audio = await withRetry(
          () =>
            provider.synthesize(piece.text, piece.line.speaker, {
              previousText: piece.previousText,
              nextText: piece.nextText,
              signal,
            }),
          { signal },
        );

        const durationSec = await measureDuration(audio);
        const storagePath = `${scriptId}/${String(index).padStart(4, "0")}-${piece.line.speaker.toLowerCase()}.mp3`;

        const { error } = await bucket.upload(storagePath, audio, {
          contentType: "audio/mpeg",
          cacheControl: "31536000",
          upsert: false,
        });
        if (error) throw new TtsError(`Upload failed for ${storagePath}: ${error.message}`, { retryable: false, cause: error });
        uploadedPaths.push(storagePath);

        return { storagePath, durationSec, url: bucket.getPublicUrl(storagePath).data.publicUrl };
      } catch (err) {
        controller.abort(err);
        throw err;
      }
    });

    // Lay the segments out on one timeline, in script order.
    let cursor = 0;
    const segments: AudioSegment[] = pieces.map((piece, index) => {
      const { storagePath, durationSec, url } = rendered[index]!;
      const nextPiece = pieces[index + 1];
      const pauseAfterSec = !nextPiece
        ? 0
        : piece.isLastPieceOfLine && piece.line.type === "quiz_checkpoint"
          ? QUIZ_PAUSE_SEC
          : nextPiece.line.speaker !== piece.line.speaker
            ? TURN_GAP_SEC
            : 0;

      const segment: AudioSegment = {
        index,
        lineIndex: piece.lineIndex,
        speaker: piece.line.speaker,
        type: piece.line.type,
        text: piece.text,
        url,
        storagePath,
        startSec: round(cursor),
        endSec: round(cursor + durationSec),
        durationSec: round(durationSec),
        pauseAfterSec,
      };
      cursor += durationSec + pauseAfterSec;
      return segment;
    });

    const manifestPath = `${scriptId}/manifest.json`;
    const manifest: AudioManifest = {
      version: 1,
      scriptId,
      provider: provider.name,
      createdAt: new Date().toISOString(),
      totalDurationSec: round(cursor),
      manifestUrl: bucket.getPublicUrl(manifestPath).data.publicUrl,
      segments,
    };

    const { error } = await bucket.upload(manifestPath, JSON.stringify(manifest, null, 2), {
      contentType: "application/json",
      upsert: true,
    });
    if (error) throw new TtsError(`Upload failed for ${manifestPath}: ${error.message}`, { retryable: false, cause: error });

    return manifest;
  } catch (err) {
    // Don't leave half an episode in storage.
    if (uploadedPaths.length > 0) {
      const { error } = await bucket.remove(uploadedPaths);
      if (error) console.error(`[tts] cleanup failed for script ${scriptId}`, error);
    }
    throw err;
  }
}

function validateScript(script: ScriptLine[]): void {
  if (!Array.isArray(script) || script.length === 0) {
    throw new TtsError("The script is empty.", { retryable: false });
  }
  if (script.length > MAX_SCRIPT_LINES) {
    throw new TtsError(`The script has ${script.length} lines; the limit is ${MAX_SCRIPT_LINES}.`, { retryable: false });
  }
  script.forEach((line, i) => {
    if (line.speaker !== "Alex" && line.speaker !== "Sam") {
      throw new TtsError(`Line ${i} has an unknown speaker "${String(line.speaker)}".`, { retryable: false });
    }
    if (typeof line.text !== "string" || !line.text.trim()) {
      throw new TtsError(`Line ${i} has no text.`, { retryable: false });
    }
  });
}

/** Splits each line into pieces no longer than `maxChars`, keeping same-speaker context for smooth joins. */
function planPieces(script: ScriptLine[], maxChars: number): PlannedPiece[] {
  return script.flatMap((line, lineIndex) => {
    const parts = splitText(line.text.trim(), maxChars);
    return parts.map((text, i) => ({
      lineIndex,
      line,
      text,
      previousText: parts[i - 1],
      nextText: parts[i + 1],
      isLastPieceOfLine: i === parts.length - 1,
    }));
  });
}

/** Splits at sentence ends, then at spaces, so no piece exceeds `maxChars`. */
export function splitText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const sentences = text.match(/[^.!?…]+(?:[.!?…]+["')\]]*\s*|$)/g) ?? [text];
  const pieces: string[] = [];
  let current = "";

  const pushWords = (sentence: string) => {
    for (const word of sentence.split(/\s+/).filter(Boolean)) {
      if (current && current.length + 1 + word.length > maxChars) {
        pieces.push(current);
        current = "";
      }
      current = current ? `${current} ${word}` : word.slice(0, maxChars);
    }
  };

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (sentence.length > maxChars) {
      pushWords(sentence);
    } else if (current && current.length + 1 + sentence.length > maxChars) {
      pieces.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/** Reads the MP3's real duration; falls back to a 128 kbps estimate if the header can't be read. */
async function measureDuration(mp3: Uint8Array): Promise<number> {
  try {
    const metadata = await parseBuffer(mp3, { mimeType: "audio/mpeg" }, { duration: true });
    if (metadata.format.duration && Number.isFinite(metadata.format.duration)) return metadata.format.duration;
  } catch {
    // fall through to estimate
  }
  return (mp3.byteLength * 8) / 128_000;
}

function round(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}
