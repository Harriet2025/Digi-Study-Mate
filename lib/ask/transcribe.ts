import { groqTranscribe } from "@/lib/ai/groq";

/** Audio formats Groq Whisper accepts, keyed by MIME type, mapped to the file extension it expects. */
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
  "audio/flac": "flac",
};

/** Returns the extension for a recording's MIME type (ignoring codec params), or null if unsupported. */
export function whisperExtension(mimeType: string): string | null {
  return EXTENSION_BY_MIME[mimeType.split(";")[0]!.trim().toLowerCase()] ?? null;
}

/**
 * Transcribes a spoken question or answer with Groq Whisper.
 * `prompt` (e.g. the lecture title) helps Whisper spell subject-specific terms.
 */
export async function transcribeQuestion(
  audio: Blob,
  extension: string,
  options: { prompt?: string; signal?: AbortSignal } = {},
): Promise<string> {
  return groqTranscribe(audio, `recording.${extension}`, options);
}
