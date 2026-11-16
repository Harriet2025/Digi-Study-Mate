"""Exam & defense practice: generate questions with hidden rubrics, then grade answers against them."""

import math
from typing import Literal

from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..ai.groq import MAX_INPUT_CHARS, groq_json
from ..config import get_settings
from ..errors import AppError
from ..ingestion.service import load_document_text
from ..models import DefenseAttempt, DefenseQuestion, DefenseQuestionSet
from .prompts import (
    EVALUATION_SYSTEM_PROMPT,
    QUESTION_GENERATION_SYSTEM_PROMPT,
    QUESTIONS_PER_SET,
    build_evaluation_message,
    build_question_generation_message,
)

MAX_ANSWER_CHARS = 10_000

Category = Literal["logical_gap", "methodology", "assumption", "evidence", "limitations", "technical_depth"]
Importance = Literal["core", "important", "supporting"]
Status = Literal["covered", "partial", "missing"]

# --- What the model must return (Groq strict structured outputs) -----------------------------


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class GenKeyPoint(_Strict):
    point: str
    importance: Importance
    technicalDetail: str


class GenRubric(_Strict):
    idealAnswerSummary: str
    keyPoints: list[GenKeyPoint]
    redFlags: list[str]
    followUpQuestion: str


class GenQuestion(_Strict):
    question: str
    category: Category
    targetsWeakness: str
    sourceReference: str
    rubric: GenRubric


class GenQuestionSet(_Strict):
    overallWeaknesses: list[str]
    questions: list[GenQuestion]


class GenKeyPointResult(_Strict):
    keyPointId: str
    status: Status
    evidence: str | None
    comment: str


class GenEvaluation(_Strict):
    keyPointResults: list[GenKeyPointResult]
    missingTechnicalDetails: list[str]
    misconceptions: list[str]
    strengths: list[str]
    feedback: str
    improvedAnswerOutline: list[str]


# --- Question generation ---------------------------------------------------------------------


def public_question(q: DefenseQuestion) -> dict:
    """A question as shown before answering (no rubric)."""
    return {
        "id": q.question_key,
        "question": q.question,
        "category": q.category,
        "targetsWeakness": q.targets_weakness,
        "sourceReference": q.source_reference,
    }


def generate_question_set(
    db: Session,
    *,
    document_id: str | None,
    text: str | None,
    title: str | None,
    page_start: int | None = None,
    page_end: int | None = None,
) -> dict:
    if document_id:
        document, material = load_document_text(db, document_id, page_start, page_end)
        title = title or document.filename.rsplit(".", 1)[0]
    else:
        material = (text or "").strip()

    if not material:
        raise AppError("EMPTY_INPUT", 422, "There's no text in this material to generate questions from.")
    if len(material) > MAX_INPUT_CHARS:
        raise AppError("INPUT_TOO_LARGE", 413, "This material is too long. Try a single chapter or slide deck.")

    # Medium reasoning effort: "high" finds slightly sharper weak points but uses ~14k tokens, more than
    # Groq's free tier allows per minute. Raise it if you upgrade (see GROQ_TPM_LIMIT).
    generated = groq_json(
        QUESTION_GENERATION_SYSTEM_PROMPT,
        build_question_generation_message(material, title),
        GenQuestionSet,
        name="defense_question_set",
        max_tokens=32_000,
        effort="medium",
    )
    if len(generated.questions) < QUESTIONS_PER_SET or any(not q.rubric.keyPoints for q in generated.questions):
        raise AppError("INVALID_OUTPUT", 502, "The questions couldn't be generated properly. Please try again.")

    question_set = DefenseQuestionSet(
        document_id=document_id,
        source_title=title,
        overall_weaknesses=generated.overallWeaknesses,
        ai_model=get_settings().groq_model,
    )
    for position, q in enumerate(generated.questions[:QUESTIONS_PER_SET], start=1):
        key = f"q{position}"
        rubric = q.rubric.model_dump()
        rubric["keyPoints"] = [{"id": f"{key}-k{i}", **k} for i, k in enumerate(rubric["keyPoints"], start=1)]
        question_set.questions.append(
            DefenseQuestion(
                question_key=key,
                position=position,
                question=q.question.strip(),
                category=q.category,
                targets_weakness=q.targetsWeakness.strip(),
                source_reference=q.sourceReference.strip()[:200],
                rubric=rubric,
            )
        )
    db.add(question_set)
    db.commit()

    return {
        "setId": question_set.id,
        "documentId": document_id,
        "createdAt": question_set.created_at.isoformat(),
        "overallWeaknesses": question_set.overall_weaknesses,
        "questions": [public_question(q) for q in question_set.questions],
    }


# --- Grading -----------------------------------------------------------------------------------

IMPORTANCE_WEIGHT = {"core": 3, "important": 2, "supporting": 1}
STATUS_CREDIT = {"covered": 1.0, "partial": 0.5, "missing": 0.0}


def score_answer(results: list[dict]) -> tuple[int, str]:
    """Importance-weighted share of key points covered (partial = half credit), computed by us, not the
    model, so grading is consistent. Missing a core point caps the grade at "partial"."""
    total = sum(IMPORTANCE_WEIGHT[r["importance"]] for r in results)
    earned = sum(IMPORTANCE_WEIGHT[r["importance"]] * STATUS_CREDIT[r["status"]] for r in results)
    # Round halves up (Python's round() would turn 62.5 into 62).
    score = math.floor(earned / total * 100 + 0.5) if total else 0
    grade = "excellent" if score >= 85 else "good" if score >= 65 else "partial" if score >= 40 else "insufficient"
    if grade in ("excellent", "good") and any(r["importance"] == "core" and r["status"] == "missing" for r in results):
        grade = "partial"
    return score, grade


def evaluate_answer(db: Session, *, set_id: str, question_key: str, answer: str, input_mode: str) -> dict:
    answer = answer.strip()
    if len(answer.split()) < 3:
        raise AppError("EMPTY_INPUT", 422, "Your answer is too short to grade. Try explaining your reasoning.")
    if len(answer) > MAX_ANSWER_CHARS:
        raise AppError("INPUT_TOO_LARGE", 413, f"Answers are limited to {MAX_ANSWER_CHARS:,} characters.")

    question = db.scalar(
        select(DefenseQuestion).where(DefenseQuestion.set_id == set_id, DefenseQuestion.question_key == question_key)
    )
    if question is None:
        raise AppError("NOT_FOUND", 404, "That question doesn't exist.")
    rubric = question.rubric

    generated = groq_json(
        EVALUATION_SYSTEM_PROMPT,
        build_evaluation_message(question.question, rubric, answer, input_mode),
        GenEvaluation,
        name="answer_evaluation",
        max_tokens=16_000,
        effort="medium",
    )

    # One result per rubric key point, in rubric order. A point the model skipped counts as missing.
    by_id = {r.keyPointId: r for r in generated.keyPointResults}
    key_point_results = []
    for k in rubric["keyPoints"]:
        r = by_id.get(k["id"])
        status = r.status if r else "missing"
        key_point_results.append(
            {
                "keyPointId": k["id"],
                "point": k["point"],
                "importance": k["importance"],
                "status": status,
                "evidence": None if status == "missing" or r is None else r.evidence,
                "comment": r.comment if r else "Not addressed in the answer.",
            }
        )
    score, grade = score_answer(key_point_results)

    evaluation = {
        "setId": set_id,
        "questionId": question_key,
        "inputMode": input_mode,
        "answer": answer,
        "score": score,
        "grade": grade,
        "keyPointResults": key_point_results,
        "missingTechnicalDetails": generated.missingTechnicalDetails,
        "misconceptions": generated.misconceptions,
        "strengths": generated.strengths,
        "feedback": generated.feedback,
        "improvedAnswerOutline": generated.improvedAnswerOutline,
        "followUpQuestion": rubric["followUpQuestion"],
        "rubric": rubric,
    }
    attempt = DefenseAttempt(
        question_id=question.id, answer_text=answer, input_mode=input_mode, score=score, grade=grade, evaluation=evaluation
    )
    db.add(attempt)
    db.commit()
    return {"attemptId": attempt.id, **evaluation}
