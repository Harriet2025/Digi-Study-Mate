/**
 * A known failure in the ingestion pipeline that maps to an HTTP response.
 * `message` is safe to show to the client; `cause` is for server logs only.
 */
export type IngestionErrorCode =
  | "MISSING_FILE"
  | "INVALID_CONTENT_TYPE"
  | "MALFORMED_REQUEST"
  | "FILE_TOO_LARGE"
  | "EMPTY_FILE"
  | "UNSUPPORTED_FILE_TYPE"
  | "CORRUPT_FILE"
  | "ENCRYPTED_FILE"
  | "TOO_MANY_PAGES"
  | "NO_TEXT_CONTENT"
  | "STORAGE_FAILED"
  | "CONFIGURATION_ERROR";

export class IngestionError extends Error {
  readonly code: IngestionErrorCode;
  readonly status: number;

  constructor(code: IngestionErrorCode, status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "IngestionError";
    this.code = code;
    this.status = status;
  }
}

export function isIngestionError(err: unknown): err is IngestionError {
  return err instanceof IngestionError;
}
