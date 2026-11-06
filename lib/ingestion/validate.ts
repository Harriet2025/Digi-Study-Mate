import { IngestionError } from "./errors";
import type { SourceType, ValidatedUpload } from "./types";

export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_PAGES = 500;
/** Extra room in Content-Length for multipart boundaries and other form fields. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

const PDF_MIME = "application/pdf";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** MIME types browsers commonly send for each format. Some send nothing useful. */
const ACCEPTED_MIME: Record<SourceType, ReadonlySet<string>> = {
  pdf: new Set([PDF_MIME, "application/x-pdf", "application/octet-stream", ""]),
  pptx: new Set([PPTX_MIME, "application/zip", "application/x-zip-compressed", "application/octet-stream", ""]),
};

/**
 * Rejects oversized bodies from the Content-Length header, before
 * `request.formData()` reads the whole body into memory.
 */
export function assertRequestSize(request: Request): void {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new IngestionError("INVALID_CONTENT_TYPE", 415, "Request must be multipart/form-data.");
  }

  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_FILE_BYTES + MULTIPART_OVERHEAD_BYTES) {
    throw new IngestionError("FILE_TOO_LARGE", 413, `File exceeds the ${MAX_FILE_BYTES / 1024 / 1024} MB limit.`);
  }
}

/** Pulls the `file` field out of the form and checks its size, extension, MIME type and magic bytes. */
export async function validateUpload(formData: FormData): Promise<ValidatedUpload> {
  const entry = formData.get("file");
  if (entry === null) {
    throw new IngestionError("MISSING_FILE", 400, 'No file provided. Send it in a form field named "file".');
  }
  if (typeof entry === "string") {
    throw new IngestionError("MISSING_FILE", 400, 'The "file" field must be a file upload, not text.');
  }

  if (entry.size === 0) {
    throw new IngestionError("EMPTY_FILE", 400, "The uploaded file is empty.");
  }
  if (entry.size > MAX_FILE_BYTES) {
    throw new IngestionError("FILE_TOO_LARGE", 413, `File exceeds the ${MAX_FILE_BYTES / 1024 / 1024} MB limit.`);
  }

  const filename = sanitizeFilename(entry.name);
  const sourceType = sourceTypeFromFilename(filename);
  const mimeType = entry.type.toLowerCase();

  if (!ACCEPTED_MIME[sourceType].has(mimeType)) {
    throw new IngestionError(
      "UNSUPPORTED_FILE_TYPE",
      415,
      `File extension says ${sourceType.toUpperCase()} but the content type is "${mimeType}".`,
    );
  }

  const bytes = new Uint8Array(await entry.arrayBuffer());
  assertMagicBytes(bytes, sourceType);

  return {
    filename,
    mimeType: sourceType === "pdf" ? PDF_MIME : PPTX_MIME,
    sourceType,
    bytes,
  };
}

function sourceTypeFromFilename(filename: string): SourceType {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "pdf") return "pdf";
  if (ext === "pptx") return "pptx";
  if (ext === "ppt") {
    throw new IngestionError(
      "UNSUPPORTED_FILE_TYPE",
      415,
      "Legacy .ppt files are not supported. Save the deck as .pptx and upload it again.",
    );
  }
  throw new IngestionError("UNSUPPORTED_FILE_TYPE", 415, "Only PDF (.pdf) and PowerPoint (.pptx) files are supported.");
}

/** Checks the file signature so a renamed file can't pass as a PDF or PPTX. */
function assertMagicBytes(bytes: Uint8Array, sourceType: SourceType): void {
  const startsWith = (sig: number[]) => sig.every((b, i) => bytes[i] === b);

  // PDFs may have a few junk bytes before the header; the spec allows it in the first 1 KB.
  const isPdf = sourceType === "pdf" && new TextDecoder("latin1").decode(bytes.subarray(0, 1024)).includes("%PDF-");
  const isZip = sourceType === "pptx" && startsWith([0x50, 0x4b, 0x03, 0x04]); // "PK\x03\x04"

  // Password-protected .pptx files (and legacy .ppt) are OLE compound files, not zips.
  if (sourceType === "pptx" && startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    throw new IngestionError(
      "ENCRYPTED_FILE",
      422,
      "This presentation is password-protected or in the old .ppt format. Remove the password or save it as .pptx.",
    );
  }

  if (!isPdf && !isZip) {
    throw new IngestionError(
      "UNSUPPORTED_FILE_TYPE",
      415,
      `The file contents are not a valid ${sourceType.toUpperCase()} file.`,
    );
  }
}

/** Removes path components and control characters, and caps the length. */
export function sanitizeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 255);
  if (!cleaned || cleaned === "." || cleaned === "..") {
    throw new IngestionError("MISSING_FILE", 400, "The uploaded file has no usable filename.");
  }
  return cleaned;
}
