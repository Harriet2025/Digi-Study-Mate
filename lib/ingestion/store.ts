import type { SupabaseClient } from "@supabase/supabase-js";
import { IngestionError } from "./errors";
import type { SourceType, TextChunk } from "./types";

const INSERT_BATCH_SIZE = 100;

export interface DocumentRecord {
  filename: string;
  mimeType: string;
  sourceType: SourceType;
  byteSize: number;
  pageCount: number;
}

/**
 * Inserts the document row and its chunks. If any chunk batch fails, the
 * document row is deleted (chunks cascade) so no half-ingested document is left.
 * `embedding` stays NULL until an embedding step fills it in.
 */
export async function storeDocument(db: SupabaseClient, doc: DocumentRecord, chunks: TextChunk[]): Promise<string> {
  const { data, error } = await db
    .from("documents")
    .insert({
      filename: doc.filename,
      mime_type: doc.mimeType,
      source_type: doc.sourceType,
      byte_size: doc.byteSize,
      page_count: doc.pageCount,
      chunk_count: chunks.length,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    throw new IngestionError("STORAGE_FAILED", 502, "The document could not be saved.", { cause: error });
  }
  const documentId = data.id;

  try {
    for (let start = 0; start < chunks.length; start += INSERT_BATCH_SIZE) {
      const rows = chunks.slice(start, start + INSERT_BATCH_SIZE).map((chunk) => ({
        document_id: documentId,
        filename: doc.filename,
        chunk_index: chunk.index,
        content: chunk.content,
        token_count: chunk.tokenCount,
        page_start: chunk.pageStart,
        page_end: chunk.pageEnd,
        metadata: { source_type: doc.sourceType, char_count: chunk.content.length },
      }));
      const { error: chunkError } = await db.from("document_chunks").insert(rows);
      if (chunkError) throw chunkError;
    }
  } catch (err) {
    const { error: cleanupError } = await db.from("documents").delete().eq("id", documentId);
    if (cleanupError) {
      console.error(`[ingestion] rollback failed for document ${documentId}`, cleanupError);
    }
    throw new IngestionError("STORAGE_FAILED", 502, "The document's text could not be saved.", { cause: err });
  }

  return documentId;
}
