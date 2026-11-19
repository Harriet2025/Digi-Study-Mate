import shutil

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth.deps import guest_limit
from ..db import get_db
from ..errors import AppError
from ..ingestion.service import ingest_document
from ..ingestion.validate import MAX_FILE_BYTES, validate_upload
from ..models import Document, Episode, StudyEvent
from ..tts.audio import episode_dir

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
def upload_document(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)) -> dict:
    """Upload a .pdf or .pptx (max 25 MB). Extracts, cleans and chunks the text and stores it."""
    guest_limit(request, db.scalar(select(func.count(Document.id))) or 0, 1)
    data = file.file.read(MAX_FILE_BYTES + 1)
    if len(data) > MAX_FILE_BYTES:
        raise AppError("FILE_TOO_LARGE", 413, f"File exceeds the {MAX_FILE_BYTES // (1024 * 1024)} MB limit.")
    upload = validate_upload(file.filename, file.content_type, data)
    document, total_tokens = ingest_document(db, upload)
    db.add(StudyEvent(kind="upload", ref_id=document.id, amount=1))
    db.commit()
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


@router.delete("/documents/{document_id}", status_code=204)
def delete_document(document_id: str, db: Session = Depends(get_db)) -> Response:
    """Deletes a document with its chunks, lessons (and their audio files) and practice sets."""
    document = db.get(Document, document_id)
    if document is None:
        raise AppError("NOT_FOUND", 404, "That document doesn't exist.")
    episodes = list(db.scalars(select(Episode).where(Episode.document_id == document_id)))
    if any(e.status in ("queued", "processing") for e in episodes):
        raise AppError("BUSY", 409, "A lesson from this document is still being made. Try again when it's finished.")
    for e in episodes:
        db.delete(e)
    db.delete(document)
    db.commit()
    for e in episodes:
        shutil.rmtree(episode_dir(e.id), ignore_errors=True)
    return Response(status_code=204)
