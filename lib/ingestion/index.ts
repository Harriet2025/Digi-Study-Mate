import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkPages, type ChunkOptions, DEFAULT_CHUNK_OPTIONS } from "./chunk";
import { IngestionError } from "./errors";
import { extractPdf } from "./extract-pdf";
import { extractPptx } from "./extract-pptx";
import { storeDocument } from "./store";
import type { ExtractedDocument, IngestionResult, TextChunk, ValidatedUpload } from "./types";

export { IngestionError, isIngestionError } from "./errors";
export { assertRequestSize, validateUpload } from "./validate";
export type { IngestionResult } from "./types";

/** Extracts cleaned text and chunks it. Has no side effects, so it is easy to test. */
export async function extractAndChunk(
  upload: ValidatedUpload,
  chunkOptions: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
): Promise<{ document: ExtractedDocument; chunks: TextChunk[] }> {
  const document = upload.sourceType === "pdf" ? await extractPdf(upload.bytes) : await extractPptx(upload.bytes);

  const chunks = chunkPages(document.pages, chunkOptions);
  if (chunks.length === 0) {
    throw new IngestionError(
      "NO_TEXT_CONTENT",
      422,
      upload.sourceType === "pdf"
        ? "No text was found in this PDF. If it is a scanned document, it needs OCR before it can be used."
        : "No text was found in this presentation.",
    );
  }
  return { document, chunks };
}

/** Full pipeline: extract, clean, chunk, store. */
export async function ingestDocument(db: SupabaseClient, upload: ValidatedUpload): Promise<IngestionResult> {
  const byteSize = upload.bytes.byteLength;
  const { document, chunks } = await extractAndChunk(upload);

  const documentId = await storeDocument(
    db,
    {
      filename: upload.filename,
      mimeType: upload.mimeType,
      sourceType: upload.sourceType,
      byteSize,
      pageCount: document.pageCount,
    },
    chunks,
  );

  return {
    documentId,
    filename: upload.filename,
    sourceType: upload.sourceType,
    pageCount: document.pageCount,
    chunkCount: chunks.length,
    totalTokens: chunks.reduce((sum, c) => sum + c.tokenCount, 0),
  };
}
