export type DefenseErrorCode =
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "EMPTY_INPUT"
  | "INPUT_TOO_LARGE"
  | "REFUSED"
  | "TRUNCATED"
  | "INVALID_OUTPUT"
  | "STORAGE_FAILED"
  | "CONFIGURATION_ERROR";

/** A known failure in the defense module. `message` is safe to show to students. */
export class DefenseError extends Error {
  readonly code: DefenseErrorCode;
  readonly status: number;

  constructor(code: DefenseErrorCode, status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DefenseError";
    this.code = code;
    this.status = status;
  }
}
