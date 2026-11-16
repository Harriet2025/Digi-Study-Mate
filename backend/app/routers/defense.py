import re

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field, ValidationError, model_validator
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..ask.service import MAX_AUDIO_BYTES, transcribe
from ..db import get_db
from ..defense.service import MAX_ANSWER_CHARS, evaluate_answer, generate_question_set, get_set, list_sets
from ..errors import AppError

router = APIRouter(prefix="/api/defense", tags=["defense"])

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
QUESTION_KEY_RE = re.compile(r"^q\d{1,2}$")


class QuestionsBody(BaseModel):
    documentId: str | None = Field(default=None, min_length=36, max_length=36)
    text: str | None = Field(default=None, max_length=400_000)
    title: str | None = Field(default=None, max_length=300)
    pageStart: int | None = Field(default=None, ge=1)
    pageEnd: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def one_source(self) -> "QuestionsBody":
        if bool(self.documentId) == bool((self.text or "").strip()):
            raise ValueError("Provide either documentId or text, not both.")
        return self


@router.post("/questions", status_code=201)
def questions(body: QuestionsBody, db: Session = Depends(get_db)) -> dict:
    """5 rigorous panel questions for a document (or raw text). Rubrics stay server-side until answered."""
    return generate_question_set(
        db, document_id=body.documentId, text=body.text, title=body.title, page_start=body.pageStart, page_end=body.pageEnd
    )


@router.get("/sets")
def sets(db: Session = Depends(get_db)) -> list[dict]:
    return list_sets(db)


@router.get("/sets/{set_id}")
def set_detail(set_id: str, db: Session = Depends(get_db)) -> dict:
    """Questions (no rubrics) with each question's attempts; the latest evaluation includes the rubric."""
    return get_set(db, set_id)


class TypedAnswerBody(BaseModel):
    setId: str = Field(pattern=UUID_RE.pattern)
    questionId: str = Field(pattern=QUESTION_KEY_RE.pattern)
    answer: str = Field(min_length=1, max_length=MAX_ANSWER_CHARS)


@router.post("/evaluate")
async def evaluate(request: Request, db: Session = Depends(get_db)) -> dict:
    """Typed answer: JSON {setId, questionId, answer}. Spoken answer: multipart {setId, questionId, audio}."""
    content_type = request.headers.get("content-type", "").lower()

    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        set_id, question_id, audio = form.get("setId"), form.get("questionId"), form.get("audio")
        if not isinstance(set_id, str) or not UUID_RE.match(set_id) or not isinstance(question_id, str) or not QUESTION_KEY_RE.match(question_id):
            raise AppError("INVALID_REQUEST", 400, "setId and questionId are required.")
        if audio is None or isinstance(audio, str):
            raise AppError("INVALID_REQUEST", 400, "No recording was received.")
        data = await audio.read(MAX_AUDIO_BYTES + 1)
        # Groq calls block, so run them in a worker thread instead of the event loop.
        transcript = await run_in_threadpool(transcribe, data, audio.content_type)
        if not transcript:
            raise AppError("EMPTY_INPUT", 422, "We couldn't hear an answer. Try recording again.")
        return await run_in_threadpool(
            evaluate_answer, db, set_id=set_id, question_key=question_id, answer=transcript, input_mode="spoken"
        )

    if content_type.startswith("application/json"):
        try:
            body = TypedAnswerBody.model_validate(await request.json())
        except (ValueError, ValidationError) as err:
            raise AppError("INVALID_REQUEST", 400, "Send JSON with setId, questionId and answer.", detail=repr(err)) from err
        return await run_in_threadpool(
            evaluate_answer, db, set_id=body.setId, question_key=body.questionId, answer=body.answer, input_mode="typed"
        )

    raise AppError("INVALID_REQUEST", 415, "Send JSON for typed answers or multipart/form-data for spoken ones.")
