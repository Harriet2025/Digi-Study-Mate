import type { LineType, Speaker } from "@/lib/ai/generateScript";

/** Context passed with each synthesis request. */
export interface SynthesisContext {
  /** Text spoken just before this piece by the same speaker (helps prosody when a line is split). */
  previousText?: string;
  /** Text spoken just after this piece by the same speaker. */
  nextText?: string;
  signal: AbortSignal;
}

/** A text-to-speech backend. Implementations return MP3 bytes. */
export interface TtsProvider {
  readonly name: string;
  /** Longest text the provider accepts in one request. Longer lines are split. */
  readonly maxCharsPerRequest: number;
  /** Requests to run at once; match your plan's concurrency limit. */
  readonly defaultConcurrency: number;
  synthesize(text: string, speaker: Speaker, context: SynthesisContext): Promise<Uint8Array>;
}

/** One playable audio file in the manifest. A long script line may span several segments. */
export interface AudioSegment {
  index: number;
  /** Index of the script line this audio belongs to. */
  lineIndex: number;
  speaker: Speaker;
  type: LineType;
  text: string;
  url: string;
  storagePath: string;
  /** Position on the episode timeline, in seconds. */
  startSec: number;
  endSec: number;
  durationSec: number;
  /** Silence the player should leave after this segment (a turn gap, or thinking time after a quiz question). */
  pauseAfterSec: number;
}

export interface AudioManifest {
  version: 1;
  scriptId: string;
  provider: string;
  createdAt: string;
  totalDurationSec: number;
  manifestUrl: string;
  segments: AudioSegment[];
}

export class TtsError extends Error {
  readonly retryable: boolean;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    options: { retryable: boolean; status?: number; retryAfterMs?: number; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = "TtsError";
    this.retryable = options.retryable;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
  }
}

/** Builds a TtsError from a failed HTTP response, deciding whether it is worth retrying. */
export async function ttsErrorFromResponse(provider: string, res: Response): Promise<TtsError> {
  const body = await res.text().catch(() => "");
  const retryAfter = Number(res.headers.get("retry-after"));
  return new TtsError(`${provider} TTS request failed with ${res.status}: ${body.slice(0, 300)}`, {
    status: res.status,
    // 429 = rate/concurrency limit; 5xx = provider hiccup. 4xx otherwise means a bad request or key.
    retryable: res.status === 429 || res.status >= 500,
    retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
  });
}
