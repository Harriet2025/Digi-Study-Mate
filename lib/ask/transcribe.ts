import { withRetry } from "@/lib/tts/async";
import { AskError } from "./errors";

const ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";
const REQUEST_TIMEOUT_MS = 45_000;

/** Audio formats Whisper accepts, keyed by MIME type, mapped to the file extension it expects. */
const EXTENSION_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "video/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

/** Returns the extension for a recording's MIME type (ignoring codec params), or null if unsupported. */
export function whisperExtension(mimeType: string): string | null {
  return EXTENSION_BY_MIME[mimeType.split(";")[0]!.trim().toLowerCase()] ?? null;
}

/**
 * Transcribes a short spoken question with OpenAI Whisper.
 * `prompt` (e.g. the lecture title) helps Whisper spell subject-specific terms.
 */
export async function transcribeQuestion(
  audio: Blob,
  extension: string,
  options: { prompt?: string; signal?: AbortSignal } = {},
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AskError("CONFIGURATION_ERROR", 500, "Voice questions aren't set up on this server yet.", {
      cause: new Error("OPENAI_API_KEY is not set (needed for Whisper transcription)."),
    });
  }

  return withRetry(
    async () => {
      const form = new FormData();
      form.append("file", audio, `question.${extension}`);
      form.append("model", "whisper-1");
      form.append("response_format", "json");
      if (options.prompt) form.append("prompt", options.prompt.slice(0, 500));

      let res: Response;
      try {
        res = await fetch(ENDPOINT, {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}` },
          body: form,
          signal: options.signal
            ? AbortSignal.any([options.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
            : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        if (options.signal?.aborted) throw err;
        throw new AskError("TRANSCRIPTION_FAILED", 502, "Couldn't reach the transcription service.", {
          cause: err,
          retryable: true,
        });
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const retryAfter = Number(res.headers.get("retry-after"));
        throw new AskError("TRANSCRIPTION_FAILED", 502, "Your question couldn't be transcribed. Please try again.", {
          cause: new Error(`Whisper ${res.status}: ${body.slice(0, 300)}`),
          retryable: res.status === 429 || res.status >= 500,
          retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
        });
      }

      const data = (await res.json()) as { text?: unknown };
      return typeof data.text === "string" ? data.text.trim() : "";
    },
    { maxAttempts: 3, signal: options.signal },
  );
}
