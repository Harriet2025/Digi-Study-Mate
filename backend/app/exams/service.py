"""Past-paper banks (recurring topics + predicted questions) and mock exams (timed, marked by topic)."""

import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Literal

from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, update
from sqlalchemy.orm import Session, sessionmaker

from ..ai.groq import groq_json
from ..config import get_settings
from ..db import get_engine
from ..errors import AppError
from ..guides.service import lesson_text
from ..models import ExamBank, MockExam, PastPaper, StudyEvent, StudyGuide
from .prompts import ANALYSIS_SYSTEM_PROMPT, MARKING_SYSTEM_PROMPT, MOCK_SYSTEM_PROMPT, PAPER_SYSTEM_PROMPT

logger = logging.getLogger("study_mate.exams")

#: Characters of each paper sent to the AI (keeps each call within Groq's free per-minute limit).
PAPER_CHARS = 14_000
MAX_PAPERS = 8
#: Extra seconds allowed after the timer ends (slow connections, auto-submit).
GRACE_SECONDS = 90

BANK_STAGES = {
    "queued": "Waiting to start",
    "reading": "Reading your past papers",
    "analysing": "Finding topics that keep coming up",
    "done": "Ready",
    "failed": "Something went wrong",
}


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- AI output shapes --------------------------------------------------------------


class _PaperQuestion(_Strict):
    number: str
    text: str
    marks: int
    topic: str


class _Paper(_Strict):
    year: str
    questions: list[_PaperQuestion]


class _Topic(_Strict):
    name: str
    summary: str
    papersAppeared: int
    questionCount: int
    totalMarks: int
    trend: Literal["rising", "steady", "falling", "new"]
    priority: Literal["high", "medium", "low"]
    sampleQuestions: list[str]


class _Predicted(_Strict):
    question: str
    topic: str
    marks: int
    likelihood: Literal["high", "medium"]
    reason: str


class _Analysis(_Strict):
    overview: str
    topics: list[_Topic]
    predicted: list[_Predicted]


class _MockQuestion(_Strict):
    id: str
    type: Literal["mcq", "short"]
    topic: str
    question: str
    marks: int
    options: list[str]
    correctIndex: int
    explanation: str
    modelAnswer: str
    markingPoints: list[str]


class _Mock(_Strict):
    questions: list[_MockQuestion]


class _Mark(_Strict):
    id: str
    awarded: int
    feedback: str


class _Marking(_Strict):
    marks: list[_Mark]


# --- Banks ----------------------------------------------------------------------


def create_bank(db: Session, *, course: str, papers: list[tuple[str, str]], guide_ids: list[str]) -> ExamBank:
    """papers: (filename, extracted text). Analysis runs in the background (run_bank_job)."""
    papers = [(name, text) for name, text in papers if text.strip()]
    if not papers:
        raise AppError("NO_TEXT_CONTENT", 422, "No text was found in those papers. Scanned papers aren't supported yet.")
    if len(papers) > MAX_PAPERS:
        raise AppError("TOO_MANY_FILES", 400, f"Upload up to {MAX_PAPERS} past papers at a time.")
    valid_guides = [g for g in guide_ids if db.get(StudyGuide, g) is not None]
    bank = ExamBank(course=course.strip()[:200], guide_ids=valid_guides, ai_model=get_settings().groq_model)
    bank.papers = [PastPaper(filename=name[:255], text=text) for name, text in papers]
    db.add(bank)
    db.commit()
    return bank


def add_papers(db: Session, bank_id: str, papers: list[tuple[str, str]]) -> ExamBank:
    bank = get_bank(db, bank_id)
    if bank.status in ("queued", "processing"):
        raise AppError("BUSY", 409, "This bank is still being analysed.")
    papers = [(n, t) for n, t in papers if t.strip()]
    if not papers:
        raise AppError("NO_TEXT_CONTENT", 422, "No text was found in that paper.")
    if len(bank.papers) + len(papers) > MAX_PAPERS * 2:
        raise AppError("TOO_MANY_FILES", 400, "This bank already has the maximum number of papers.")
    bank.papers.extend(PastPaper(filename=n[:255], text=t) for n, t in papers)
    bank.status, bank.stage, bank.progress, bank.error_message = "queued", "queued", 0, None
    db.commit()
    return bank


def get_bank(db: Session, bank_id: str) -> ExamBank:
    bank = db.get(ExamBank, bank_id)
    if bank is None:
        raise AppError("NOT_FOUND", 404, "That past-paper bank doesn't exist.")
    return bank


def run_bank_job(bank_id: str) -> None:
    db = sessionmaker(bind=get_engine(), expire_on_commit=False)()
    try:
        _analyse(db, bank_id)
    except Exception as err:
        logger.exception("bank job %s failed", bank_id)
        db.rollback()
        message = err.message if isinstance(err, AppError) else "Something went wrong while analysing your papers. Please try again."
        db.execute(update(ExamBank).where(ExamBank.id == bank_id).values(status="failed", stage="failed", error_message=message[:500]))
        db.commit()
    finally:
        db.close()


def _analyse(db: Session, bank_id: str) -> None:
    bank = db.get(ExamBank, bank_id)
    if bank is None:
        return
    bank.status, bank.stage, bank.progress = "processing", "reading", 5
    db.commit()

    papers = bank.papers
    for i, paper in enumerate(papers):
        if paper.questions is None:
            extracted = groq_json(
                PAPER_SYSTEM_PROMPT,
                f"<paper filename=\"{paper.filename}\">\n{paper.text[:PAPER_CHARS]}\n</paper>",
                _Paper,
                name="past_paper",
                max_tokens=4_000,
                effort="low",
            )
            paper.questions = [q.model_dump() for q in extracted.questions if q.text.strip()][:60]
            paper.year = extracted.year.strip()[:40] or None
        bank.progress = 5 + int(60 * (i + 1) / len(papers))
        db.commit()

    bank.stage, bank.progress = "analysing", 70
    db.commit()
    lines = []
    for paper in papers:
        lines.append(f"## Paper: {paper.year or paper.filename}")
        for q in paper.questions or []:
            lines.append(f"- [{q['topic']}] ({q['marks']} marks) {q['number']}: {q['text']}")
    outlines = []
    for gid in bank.guide_ids:
        guide = db.get(StudyGuide, gid)
        if guide and guide.status == "ready":
            outlines.append(f"# {guide.title}\n" + "\n".join(f"- {s.title}" for s in guide.sections))
    request = f"Course: {bank.course}\n\n<past_papers>\n" + "\n".join(lines)[:20_000] + "\n</past_papers>"
    if outlines:
        request += "\n\n<lecture_slides_outline>\n" + "\n\n".join(outlines)[:5_000] + "\n</lecture_slides_outline>"
    analysis = groq_json(ANALYSIS_SYSTEM_PROMPT, request, _Analysis, name="exam_analysis", max_tokens=6_000, effort="medium")
    data = analysis.model_dump()
    data["topics"] = data["topics"][:12]
    data["predicted"] = data["predicted"][:10]
    bank.analysis = data
    bank.status, bank.stage, bank.progress = "ready", "done", 100
    db.commit()


def bank_summary(bank: ExamBank) -> dict:
    topics = (bank.analysis or {}).get("topics", [])
    return {
        "bankId": bank.id,
        "course": bank.course,
        "status": bank.status,
        "stage": bank.stage,
        "stageLabel": BANK_STAGES.get(bank.stage, bank.stage),
        "progress": bank.progress,
        "error": bank.error_message,
        "paperCount": len(bank.papers),
        "topicCount": len(topics),
        "topTopics": [t["name"] for t in topics[:3]],
        "createdAt": bank.created_at.isoformat() if bank.created_at else None,
    }


def bank_detail(db: Session, bank: ExamBank) -> dict:
    mocks = db.scalars(select(MockExam).where(MockExam.bank_id == bank.id).order_by(MockExam.created_at.desc())).all()
    return {
        **bank_summary(bank),
        "guideIds": bank.guide_ids,
        "papers": [
            {"paperId": p.id, "filename": p.filename, "year": p.year, "questionCount": len(p.questions or [])} for p in bank.papers
        ],
        "overview": (bank.analysis or {}).get("overview"),
        "topics": (bank.analysis or {}).get("topics", []),
        "predicted": (bank.analysis or {}).get("predicted", []),
        "mocks": [mock_summary(m) for m in mocks],
    }


def list_banks(db: Session) -> list[ExamBank]:
    return list(db.scalars(select(ExamBank).order_by(ExamBank.created_at.desc()).limit(50)))


def delete_bank(db: Session, bank_id: str) -> None:
    bank = get_bank(db, bank_id)
    db.delete(bank)
    db.commit()


def fail_interrupted_exams(db: Session) -> int:
    n = db.execute(
        update(ExamBank).where(ExamBank.status.in_(("queued", "processing"))).values(status="failed", stage="failed", error_message="Interrupted. Please try again.")
    ).rowcount
    n += db.execute(
        update(MockExam).where(MockExam.status.in_(("queued", "processing"))).values(status="failed", error_message="Interrupted. Please try again.")
    ).rowcount
    db.commit()
    return n or 0


# --- Mock exams ------------------------------------------------------------------


def create_mock(
    db: Session, *, bank_id: str | None, guide_id: str | None, mode: str, question_count: int, duration_minutes: int, topic: str | None = None
) -> MockExam:
    if bool(bank_id) == bool(guide_id):
        raise AppError("INVALID_REQUEST", 400, "Choose either a past-paper bank or a study space.")
    if bank_id:
        bank = get_bank(db, bank_id)
        if bank.status != "ready":
            raise AppError("NOT_READY", 409, "This bank is still being analysed.")
        title = f"{bank.course}: {'mock exam' if mode == 'exam' else 'practice test'}" + (f" on {topic}" if topic else "")
    else:
        guide = db.get(StudyGuide, guide_id)
        if guide is None:
            raise AppError("NOT_FOUND", 404, "That study space doesn't exist.")
        if guide.status != "ready":
            raise AppError("NOT_READY", 409, "This lesson isn't ready yet.")
        title = f"{guide.title}: {'mock exam' if mode == 'exam' else 'practice test'}"
    mock = MockExam(
        bank_id=bank_id,
        guide_id=guide_id,
        title=title[:300],
        mode=mode,
        question_count=question_count,
        duration_minutes=duration_minutes,
        ai_model=get_settings().groq_model,
        answers={"topic": topic} if topic else None,
    )
    db.add(mock)
    db.commit()
    return mock


def run_mock_job(mock_id: str) -> None:
    db = sessionmaker(bind=get_engine(), expire_on_commit=False)()
    try:
        _generate(db, mock_id)
    except Exception as err:
        logger.exception("mock job %s failed", mock_id)
        db.rollback()
        message = err.message if isinstance(err, AppError) else "Something went wrong while writing your exam. Please try again."
        db.execute(update(MockExam).where(MockExam.id == mock_id).values(status="failed", error_message=message[:500]))
        db.commit()
    finally:
        db.close()


def _generate(db: Session, mock_id: str) -> None:
    mock = db.get(MockExam, mock_id)
    if mock is None:
        return
    mock.status, mock.progress = "processing", 20
    focus = (mock.answers or {}).get("topic")
    mock.answers = None
    db.commit()

    if mock.bank_id:
        bank = db.get(ExamBank, mock.bank_id)
        analysis = bank.analysis or {}
        material = "<topics>\n" + json.dumps(
            [{k: t[k] for k in ("name", "summary", "priority", "papersAppeared", "totalMarks", "sampleQuestions")} for t in analysis.get("topics", [])]
        ) + "\n</topics>\n<past_paper_questions>\n"
        material += "\n".join(f"- [{q['topic']}] ({q['marks']} marks) {q['text']}" for p in bank.papers for q in (p.questions or []))[:9_000]
        material += "\n</past_paper_questions>"
        for gid in bank.guide_ids[:2]:
            guide = db.get(StudyGuide, gid)
            if guide and guide.status == "ready":
                material += f"\n<lesson>\n{lesson_text(guide, with_answers=False)[:6_000]}\n</lesson>"
    else:
        guide = db.get(StudyGuide, mock.guide_id)
        material = f"<lesson>\n{lesson_text(guide)[:16_000]}\n</lesson>"

    request = f"Write {mock.question_count} questions for a {mock.duration_minutes}-minute {'timed mock exam' if mock.mode == 'exam' else 'practice test'}."
    if focus:
        request += f" Focus every question on the topic: {focus}."
    paper = groq_json(MOCK_SYSTEM_PROMPT, f"{request}\n\n{material}", _Mock, name="mock_exam", max_tokens=9_000, effort="medium")

    questions = []
    for q in paper.questions:
        options = [o.strip() for o in q.options if o.strip()]
        if q.type == "mcq" and (len(options) != 4 or not 0 <= q.correctIndex < 4):
            continue
        if not q.question.strip():
            continue
        questions.append(
            {
                "id": f"q{len(questions) + 1}",
                "type": q.type,
                "topic": q.topic.strip() or "General",
                "question": q.question.strip(),
                "marks": max(1, min(q.marks, 20)),
                "options": options if q.type == "mcq" else [],
                "correctIndex": q.correctIndex if q.type == "mcq" else 0,
                "explanation": q.explanation.strip(),
                "modelAnswer": q.modelAnswer.strip(),
                "markingPoints": [m.strip() for m in q.markingPoints if m.strip()][:10],
            }
        )
    if not questions:
        raise AppError("INVALID_OUTPUT", 502, "The AI couldn't write usable questions. Please try again.")
    mock.questions = questions[: mock.question_count]
    mock.status, mock.progress = "ready", 100
    db.commit()


def get_mock(db: Session, mock_id: str) -> MockExam:
    mock = db.get(MockExam, mock_id)
    if mock is None:
        raise AppError("NOT_FOUND", 404, "That exam doesn't exist.")
    return mock


def mock_summary(mock: MockExam) -> dict:
    return {
        "mockId": mock.id,
        "title": mock.title,
        "mode": mock.mode,
        "status": mock.status,
        "progress": mock.progress,
        "error": mock.error_message,
        "bankId": mock.bank_id,
        "guideId": mock.guide_id,
        "questionCount": len(mock.questions or []) or mock.question_count,
        "durationMinutes": mock.duration_minutes,
        "percent": (mock.result or {}).get("percent"),
        "createdAt": mock.created_at.isoformat() if mock.created_at else None,
        "submittedAt": mock.submitted_at.isoformat() if mock.submitted_at else None,
    }


def _public_question(q: dict, *, reveal: bool) -> dict:
    out = {k: q[k] for k in ("id", "type", "topic", "question", "marks", "options")}
    if reveal:
        out.update({k: q[k] for k in ("correctIndex", "explanation", "modelAnswer", "markingPoints")})
    return out


def mock_detail(mock: MockExam) -> dict:
    """Answers are hidden until the exam is submitted (practice mode reveals them per question via check_answer)."""
    submitted = mock.status == "submitted"
    remaining = None
    if mock.status == "in_progress" and mock.started_at:
        end = mock.started_at + timedelta(minutes=mock.duration_minutes)
        remaining = max(0, int((end - _utcnow()).total_seconds()))
    return {
        **mock_summary(mock),
        "questions": [_public_question(q, reveal=submitted) for q in (mock.questions or [])] if mock.status in ("in_progress", "submitted") or mock.mode == "practice" else [],
        "totalMarks": sum(q["marks"] for q in (mock.questions or [])),
        "startedAt": mock.started_at.isoformat() if mock.started_at else None,
        "remainingSeconds": remaining,
        "answers": (mock.answers or {}) if submitted else None,
        "result": mock.result if submitted else None,
    }


def start_mock(db: Session, mock_id: str) -> MockExam:
    mock = get_mock(db, mock_id)
    if mock.status == "in_progress":
        return mock
    if mock.status != "ready":
        raise AppError("NOT_READY", 409, "This exam isn't ready to start.")
    mock.status, mock.started_at = "in_progress", _utcnow()
    db.commit()
    return mock


def check_answer(db: Session, mock_id: str, question_id: str) -> dict:
    """Practice tests only: reveal one question's answer and explanation."""
    mock = get_mock(db, mock_id)
    if mock.mode != "practice":
        raise AppError("NO_HINTS", 403, "Mock exams don't show answers until you submit.")
    q = next((q for q in mock.questions or [] if q["id"] == question_id), None)
    if q is None:
        raise AppError("NOT_FOUND", 404, "That question doesn't exist.")
    return _public_question(q, reveal=True)


def submit_mock(db: Session, mock_id: str, answers: dict[str, int | str | None]) -> MockExam:
    mock = get_mock(db, mock_id)
    if mock.status == "submitted":
        return mock
    if mock.status != "in_progress":
        raise AppError("NOT_STARTED", 409, "Start the exam before submitting it.")
    late = False
    if mock.mode == "exam" and mock.started_at:
        elapsed = (_utcnow() - mock.started_at).total_seconds()
        late = elapsed > mock.duration_minutes * 60 + GRACE_SECONDS

    questions = mock.questions or []
    marks: dict[str, tuple[int, str]] = {}
    written = []
    for q in questions:
        given = answers.get(q["id"])
        if q["type"] == "mcq":
            correct = isinstance(given, int) and given == q["correctIndex"]
            marks[q["id"]] = (q["marks"] if correct else 0, "Correct." if correct else ("No answer given." if given is None else "Not the right option."))
        else:
            text = (given if isinstance(given, str) else "").strip()[:4_000]
            if not text:
                marks[q["id"]] = (0, "No answer given.")
            else:
                written.append({"id": q["id"], "question": q["question"], "marks": q["marks"], "modelAnswer": q["modelAnswer"], "markingPoints": q["markingPoints"], "studentAnswer": text})
    if written:
        marking = groq_json(MARKING_SYSTEM_PROMPT, json.dumps(written), _Marking, name="marking", max_tokens=4_000, effort="low")
        by_id = {m.id: m for m in marking.marks}
        for w in written:
            m = by_id.get(w["id"])
            marks[w["id"]] = (max(0, min(m.awarded, w["marks"])), m.feedback) if m else (0, "Couldn't be marked.")

    topics: dict[str, dict] = {}
    per_question = []
    for q in questions:
        awarded, feedback = marks[q["id"]]
        t = topics.setdefault(q["topic"], {"topic": q["topic"], "awarded": 0, "available": 0})
        t["awarded"] += awarded
        t["available"] += q["marks"]
        per_question.append({"id": q["id"], "awarded": awarded, "marks": q["marks"], "feedback": feedback})
    total = sum(q["marks"] for q in questions)
    score = sum(a for a, _ in marks.values())
    topic_list = sorted(
        ({**t, "lost": t["available"] - t["awarded"], "percent": round(100 * t["awarded"] / t["available"]) if t["available"] else 0} for t in topics.values()),
        key=lambda t: -t["lost"],
    )
    mock.answers = {k: v for k, v in answers.items() if k in {q["id"] for q in questions}}
    mock.result = {
        "score": score,
        "total": total,
        "percent": round(100 * score / total) if total else 0,
        "late": late,
        "topics": topic_list,
        "questions": per_question,
    }
    mock.status, mock.submitted_at = "submitted", _utcnow()
    db.add(StudyEvent(kind="exam", ref_id=mock.id, amount=1))
    db.commit()
    return mock


def list_mocks(db: Session) -> list[MockExam]:
    return list(db.scalars(select(MockExam).order_by(MockExam.created_at.desc()).limit(50)))


def delete_mock(db: Session, mock_id: str) -> None:
    db.delete(get_mock(db, mock_id))
    db.commit()

