export type AskErrorCode =
  | "INVALID_REQUEST"
  | "AUDIO_TOO_LARGE"
  | "NO_SPEECH"
  | "TRANSCRIPTION_FAILED"
  | "ANSWER_FAILED"
  | "REFUSED"
  | "CONFIGURATION_ERROR";

/** A known failure in the "Interrupt & Ask" flow. `message` is safe to show to students. */
export class AskError extends Error {
  readonly code: AskErrorCode;
  readonly status: number;
  /** Set for upstream HTTP failures worth retrying (429 / 5xx). */
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(
    code: AskErrorCode,
    status: number,
    message: string,
    options: { cause?: unknown; retryable?: boolean; retryAfterMs?: number } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "AskError";
    this.code = code;
    this.status = status;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
  }
}
