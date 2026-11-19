"""Exam focus: past-paper banks, predicted questions, practice tests and timed mock exams."""

from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Response, UploadFile
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..auth.scoping import as_current_user
from ..db import get_db
from ..errors import AppError
from ..exams.service import (
    MAX_PAPERS,
    add_papers,
    bank_detail,
    bank_summary,
    check_answer,
    create_bank,
    create_mock,
    delete_bank,
    delete_mock,
    get_bank,
    get_mock,
    list_banks,
    list_mocks,
    mock_detail,
    mock_summary,
    run_bank_job,
    run_mock_job,
    start_mock,
    submit_mock,
)
from ..ingestion.validate import MAX_FILE_BYTES
from ..projects.service import brief_text_from_file

router = APIRouter(prefix="/api/exams", tags=["exams"])


async def _read_papers(files: list[UploadFile]) -> list[tuple[str, str]]:
    papers = []
    for f in files:
        if not f.filename:
            continue
        data = await f.read(MAX_FILE_BYTES + 1)
        text = await run_in_threadpool(brief_text_from_file, f.filename, data)
        papers.append((f.filename, text))
    return papers


@router.post("/banks", status_code=202)
async def new_bank(
    background: BackgroundTasks,
    course: str = Form(..., min_length=1, max_length=200),
    guideIds: str = Form(""),
    papers: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
) -> dict:
    """Upload past papers (PDF, Word, PowerPoint or text) for a course. Analysis runs in the background."""
    if len(papers) > MAX_PAPERS:
        raise AppError("TOO_MANY_FILES", 400, f"Upload up to {MAX_PAPERS} past papers at a time.")
    texts = await _read_papers(papers)
    guide_ids = [g for g in guideIds.split(",") if len(g) == 36][:5]
    bank = await run_in_threadpool(create_bank, db, course=course, papers=texts, guide_ids=guide_ids)
    background.add_task(as_current_user(run_bank_job), bank.id)
    return bank_summary(bank)


@router.get("/banks")
def banks(db: Session = Depends(get_db)) -> list[dict]:
    return [bank_summary(b) for b in list_banks(db)]


@router.get("/banks/{bank_id}")
def bank(bank_id: str, db: Session = Depends(get_db)) -> dict:
    return bank_detail(db, get_bank(db, bank_id))


@router.post("/banks/{bank_id}/papers", status_code=202)
async def more_papers(bank_id: str, background: BackgroundTasks, papers: list[UploadFile] = File(...), db: Session = Depends(get_db)) -> dict:
    texts = await _read_papers(papers)
    bank = await run_in_threadpool(add_papers, db, bank_id, texts)
    background.add_task(as_current_user(run_bank_job), bank.id)
    return bank_summary(bank)


@router.post("/banks/{bank_id}/reanalyse", status_code=202)
def reanalyse(bank_id: str, background: BackgroundTasks, db: Session = Depends(get_db)) -> dict:
    bank = get_bank(db, bank_id)
    if bank.status in ("queued", "processing"):
        raise AppError("BUSY", 409, "This bank is already being analysed.")
    bank.status, bank.stage, bank.progress, bank.error_message = "queued", "queued", 0, None
    db.commit()
    background.add_task(as_current_user(run_bank_job), bank.id)
    return bank_summary(bank)


@router.delete("/banks/{bank_id}", status_code=204)
def remove_bank(bank_id: str, db: Session = Depends(get_db)) -> Response:
    delete_bank(db, bank_id)
    return Response(status_code=204)


class MockBody(BaseModel):
    bankId: str | None = Field(default=None, min_length=36, max_length=36)
    guideId: str | None = Field(default=None, min_length=36, max_length=36)
    mode: Literal["exam", "practice"] = "exam"
    questionCount: int = Field(default=10, ge=4, le=25)
    durationMinutes: int = Field(default=30, ge=5, le=180)
    topic: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def one_source(self) -> "MockBody":
        if bool(self.bankId) == bool(self.guideId):
            raise ValueError("Provide either bankId or guideId.")
        return self


@router.post("/mocks", status_code=202)
def new_mock(body: MockBody, background: BackgroundTasks, db: Session = Depends(get_db)) -> dict:
    mock = create_mock(
        db,
        bank_id=body.bankId,
        guide_id=body.guideId,
        mode=body.mode,
        question_count=body.questionCount,
        duration_minutes=body.durationMinutes,
        topic=body.topic,
    )
    background.add_task(as_current_user(run_mock_job), mock.id)
    return mock_summary(mock)


@router.get("/mocks")
def mocks(db: Session = Depends(get_db)) -> list[dict]:
    return [mock_summary(m) for m in list_mocks(db)]


@router.get("/mocks/{mock_id}")
def mock(mock_id: str, db: Session = Depends(get_db)) -> dict:
    return mock_detail(get_mock(db, mock_id))


@router.post("/mocks/{mock_id}/start")
def start(mock_id: str, db: Session = Depends(get_db)) -> dict:
    return mock_detail(start_mock(db, mock_id))


@router.get("/mocks/{mock_id}/check/{question_id}")
def check(mock_id: str, question_id: str, db: Session = Depends(get_db)) -> dict:
    return check_answer(db, mock_id, question_id)


class SubmitBody(BaseModel):
    answers: dict[str, int | str | None] = Field(default_factory=dict)


@router.post("/mocks/{mock_id}/submit")
async def submit(mock_id: str, body: SubmitBody, db: Session = Depends(get_db)) -> dict:
    """Marks the exam: multiple choice instantly, written answers by the AI examiner. Returns the breakdown."""
    if len(body.answers) > 50:
        raise AppError("INVALID_REQUEST", 400, "Too many answers.")
    mock = await run_in_threadpool(submit_mock, db, mock_id, body.answers)
    return mock_detail(mock)


@router.delete("/mocks/{mock_id}", status_code=204)
def remove_mock(mock_id: str, db: Session = Depends(get_db)) -> Response:
    delete_mock(db, mock_id)
    return Response(status_code=204)
