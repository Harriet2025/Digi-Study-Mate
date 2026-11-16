"""Upload pipeline: extract → clean → chunk → store in MySQL."""

from sqlalchemy.orm import Session

from ..errors import AppError
from ..models import Document, DocumentChunk
from .chunk import chunk_pages
from .extract_pdf import extract_pdf
from .extract_pptx import extract_pptx
from .types import ExtractedDocument, TextChunk, ValidatedUpload


def extract_and_chunk(upload: ValidatedUpload) -> tuple[ExtractedDocument, list[TextChunk]]:
    document = extract_pdf(upload.data) if upload.source_type == "pdf" else extract_pptx(upload.data)
    chunks = chunk_pages(document.pages)
    if not chunks:
        raise AppError(
            "NO_TEXT_CONTENT",
            422,
            "No text was found in this PDF. If it is a scanned document, it needs OCR before it can be used."
            if upload.source_type == "pdf"
            else "No text was found in this presentation.",
        )
    return document, chunks


def ingest_document(db: Session, upload: ValidatedUpload) -> tuple[Document, int]:
    """Stores the document and its chunks in one transaction. Returns the document and total tokens."""
    extracted, chunks = extract_and_chunk(upload)

    document = Document(
        filename=upload.filename,
        mime_type=upload.mime_type,
        source_type=upload.source_type,
        byte_size=len(upload.data),
        page_count=extracted.page_count,
        chunk_count=len(chunks),
    )
    document.chunks = [
        DocumentChunk(
            chunk_index=c.index,
            content=c.content,
            token_count=c.token_count,
            page_start=c.page_start,
            page_end=c.page_end,
        )
        for c in chunks
    ]
    db.add(document)
    db.commit()  # all-or-nothing: if any chunk fails, nothing is saved
    return document, sum(c.token_count for c in chunks)


def load_document_text(
    db: Session, document_id: str, page_start: int | None = None, page_end: int | None = None
) -> tuple[Document, str]:
    """Loads a document's chunks (optionally a page range) as text with page markers the AI can cite."""
    document = db.get(Document, document_id)
    if document is None:
        raise AppError("NOT_FOUND", 404, "That document doesn't exist.")

    unit = "Slide" if document.source_type == "pptx" else "Page"
    selected = [
        c
        for c in document.chunks
        if (page_start is None or c.page_end >= page_start) and (page_end is None or c.page_start <= page_end)
    ]
    if not selected:
        raise AppError("EMPTY_INPUT", 422, "There's no text in that page range.")

    def label(c: DocumentChunk) -> str:
        return f"[{unit} {c.page_start}]" if c.page_start == c.page_end else f"[{unit}s {c.page_start}–{c.page_end}]"

    return document, "\n\n".join(f"{label(c)}\n{c.content}" for c in selected)
