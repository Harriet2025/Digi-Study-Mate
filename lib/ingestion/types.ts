export type SourceType = "pdf" | "pptx";

/** Cleaned text for one PDF page or one slide. `number` is 1-based. */
export interface ExtractedPage {
  number: number;
  text: string;
}

export interface ExtractedDocument {
  sourceType: SourceType;
  pageCount: number;
  pages: ExtractedPage[];
}

export interface TextChunk {
  index: number;
  content: string;
  tokenCount: number;
  pageStart: number;
  pageEnd: number;
}

export interface ValidatedUpload {
  filename: string;
  mimeType: string;
  sourceType: SourceType;
  bytes: Uint8Array;
}

export interface IngestionResult {
  documentId: string;
  filename: string;
  sourceType: SourceType;
  pageCount: number;
  chunkCount: number;
  totalTokens: number;
}
