from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..errors import AppError
from ..ingestion.service import ingest_document
from ..ingestion.validate import MAX_FILE_BYTES, validate_upload
from ..models import Document

router = APIRouter(prefix="/api", tags=["documents"])


def _document_json(d: Document) -> dict:
    return {
        "documentId": d.id,
        "filename": d.filename,
        "sourceType": d.source_type,
        "pageCount": d.page_count,
        "chunkCount": d.chunk_count,
        "createdAt": d.created_at.isoformat() if d.created_at else None,
    }


@router.post("/upload", status_code=201)
def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db)) -> dict:
    """Upload a .pdf or .pptx (max 25 MB). Extracts, cleans and chunks the text and stores it."""
    data = file.file.read(MAX_FILE_BYTES + 1)
    if len(data) > MAX_FILE_BYTES:
        raise AppError("FILE_TOO_LARGE", 413, f"File exceeds the {MAX_FILE_BYTES // (1024 * 1024)} MB limit.")
    upload = validate_upload(file.filename, file.content_type, data)
    document, total_tokens = ingest_document(db, upload)
    return {**_document_json(document), "totalTokens": total_tokens}


@router.get("/documents")
def list_documents(db: Session = Depends(get_db)) -> list[dict]:
    return [_document_json(d) for d in db.scalars(select(Document).order_by(Document.created_at.desc()).limit(100))]


@router.get("/documents/{document_id}")
def get_document(document_id: str, db: Session = Depends(get_db)) -> dict:
    document = db.get(Document, document_id)
    if document is None:
        raise AppError("NOT_FOUND", 404, "That document doesn't exist.")
    return _document_json(document)
