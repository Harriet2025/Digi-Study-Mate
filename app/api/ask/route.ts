import { NextResponse } from "next/server";
import { z } from "zod";
import { GroqError } from "@/lib/ai/groq";
import { answerQuestion } from "@/lib/ask/answer";
import { AskError } from "@/lib/ask/errors";
import { transcribeQuestion, whisperExtension } from "@/lib/ask/transcribe";
import { withRetry } from "@/lib/tts/async";
import { getTtsProvider, TtsError } from "@/lib/tts/generateAudio";

export const maxDuration = 60;

/** Whisper's upload limit. A 60-second voice question is far below this. */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const ContextSchema = z.object({
  lectureTitle: z.string().max(300).optional(),
  transcript: z.string().max(20_000).default(""),
  currentTimeSec: z.number().nonnegative().optional(),
});

export interface AskResponse {
  question: string;
  answer: string;
  audio: { mimeType: "audio/mpeg"; base64: string };
}

type ErrorBody = { error: { code: string; message: string } };

/**
 * POST /api/ask: the "Interrupt & Ask" flow.
 * Body (multipart/form-data):
 *   audio:   the recorded question (webm / mp4 / ogg / wav / mp3)
 *   context: JSON { lectureTitle?, transcript, currentTimeSec? }
 * Returns the transcribed question, Alex's answer, and the answer as MP3 (base64).
 */
export async function POST(request: Request): Promise<NextResponse<AskResponse | ErrorBody>> {
  try {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
      throw new AskError("INVALID_REQUEST", 415, "Request must be multipart/form-data.");
    }
    if (Number(request.headers.get("content-length")) > MAX_AUDIO_BYTES + 100_000) {
      throw new AskError("AUDIO_TOO_LARGE", 413, "That recording is too long. Keep questions under a minute.");
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch (err) {
      throw new AskError("INVALID_REQUEST", 400, "The request could not be read.", { cause: err });
    }

    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      throw new AskError("INVALID_REQUEST", 400, "No recording was received.");
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      throw new AskError("AUDIO_TOO_LARGE", 413, "That recording is too long. Keep questions under a minute.");
    }
    const extension = whisperExtension(audio.type);
    if (!extension) {
      throw new AskError("INVALID_REQUEST", 415, `Unsupported recording format "${audio.type}".`);
    }

    let context: z.infer<typeof ContextSchema>;
    try {
      context = ContextSchema.parse(JSON.parse(String(form.get("context") ?? "{}")));
    } catch (err) {
      throw new AskError("INVALID_REQUEST", 400, "The playback context was invalid.", { cause: err });
    }

    const signal = request.signal;

    // 1. Speech → text
    const question = await transcribeQuestion(audio, extension, { prompt: context.lectureTitle, signal });
    if (!question) {
      throw new AskError("NO_SPEECH", 422, "I couldn't hear a question. Try again a little closer to the mic.");
    }

    // 2. Alex's answer, grounded in what the student has heard so far
    const answer = await answerQuestion({
      question,
      transcript: context.transcript,
      lectureTitle: context.lectureTitle,
      signal,
    });

    // 3. Answer → Alex's voice
    const provider = getTtsProvider();
    const mp3 = await withRetry(() => provider.synthesize(answer, "Alex", { signal }), { maxAttempts: 3, signal });

    return NextResponse.json({
      question,
      answer,
      audio: { mimeType: "audio/mpeg", base64: Buffer.from(mp3).toString("base64") },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

function errorResponse(err: unknown): NextResponse<ErrorBody> {
  const json = (status: number, code: string, message: string) =>
    NextResponse.json({ error: { code, message } }, { status });

  if (err instanceof AskError) {
    if (err.status >= 500) console.error(`[ask] ${err.code}`, err.cause ?? err);
    return json(err.status, err.code, err.message);
  }
  if (err instanceof TtsError) {
    console.error("[ask] TTS failed", err);
    // No HTTP status means a local problem such as a missing API key.
    return err.status === undefined
      ? json(500, "CONFIGURATION_ERROR", "Spoken answers aren't set up on this server yet.")
      : json(502, "TTS_FAILED", "Alex's answer couldn't be voiced. Please try again.");
  }
  if (err instanceof GroqError) {
    console.error(`[ask] Groq ${err.kind}`, err.message);
    if (err.kind === "CONFIGURATION") {
      return json(500, "CONFIGURATION_ERROR", "Voice questions aren't set up on this server yet.");
    }
    if (err.kind === "RATE_LIMITED") {
      return json(429, "BUSY", "Alex is getting a lot of questions right now. Try again in a moment.");
    }
    return json(502, "ANSWER_FAILED", "Alex couldn't answer right now. Please try again.");
  }
  if (err instanceof Error && err.name === "AbortError") {
    return json(499, "CANCELLED", "The question was cancelled.");
  }
  console.error("[ask] unexpected error", err);
  return json(500, "INTERNAL_ERROR", "Something went wrong answering your question.");
}
