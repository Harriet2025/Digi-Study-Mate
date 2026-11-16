"""Study spaces: a guided lesson (text + diagrams) made from document pages, with flashcards, a rated quiz,
learning resources and a tutor chat grounded in the student's own material."""

import logging
import math
import re
from collections import Counter
from typing import Literal
from urllib.parse import quote_plus

import httpx
from pydantic import BaseModel, ConfigDict
from sqlalchemy import update
from sqlalchemy.orm import Session, sessionmaker

from ..ai.groq import groq_json, groq_text
from ..ai.script import LANGUAGES
from ..config import get_settings
from ..db import get_engine
from ..errors import AppError
from ..ingestion.service import load_document_text
from ..models import (
    ChatMessage,
    Document,
    DocumentChunk,
    Episode,
    Flashcard,
    GuideResource,
    GuideSection,
    QuizAttempt,
    QuizQuestion,
    StudyEvent,
    StudyGuide,
    new_uuid,
)
from .prompts import CHAT_SYSTEM_PROMPT, LESSON_SYSTEM_PROMPT, LEVEL_NOTES, PRACTICE_SYSTEM_PROMPT

logger = logging.getLogger("study_mate.guides")

STAGE_LABELS = {
    "queued": "Waiting to start",
    "reading": "Reading your pages",
    "writing": "Writing your lesson and diagrams",
    "practice": "Making flashcards and your quiz",
    "resources": "Finding videos and reading",
    "done": "Ready",
    "failed": "Something went wrong",
}

# --- What the model returns ---------------------------------------------------------------------


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _Term(_Strict):
    term: str
    definition: str


class _Section(_Strict):
    title: str
    explanation: str
    analogy: str
    example: str
    keyTerms: list[_Term]
    diagram: str
    diagramCaption: str
    checkQuestion: str
    checkAnswer: str
    sourcePages: str


class _Lesson(_Strict):
    title: str
    overview: str
    objectives: list[str]
    sections: list[_Section]


class _Card(_Strict):
    front: str
    back: str


class _QuizItem(_Strict):
    question: str
    options: list[str]
    correctIndex: int
    explanation: str
    difficulty: Literal["easy", "medium", "hard"]


class _Search(_Strict):
    title: str
    query: str
    why: str


class _Practice(_Strict):
    flashcards: list[_Card]
    quiz: list[_QuizItem]
    videoSearches: list[_Search]
    readingTopics: list[_Search]


# --- Creating -----------------------------------------------------------------------------------


def queue_guide(
    db: Session, *, document_id: str, page_start: int | None, page_end: int | None, title: str | None, level: str, language: str
) -> StudyGuide:
    document = db.get(Document, document_id)
    if document is None:
        raise AppError("NOT_FOUND", 404, "That document doesn't exist.")
    if language not in LANGUAGES or level not in LEVEL_NOTES:
        raise AppError("INVALID_REQUEST", 400, "Unsupported level or language.")
    guide = StudyGuide(
        id=new_uuid(),
        document_id=document.id,
        title=(title or document.filename.rsplit(".", 1)[0])[:300],
        page_start=page_start,
        page_end=min(page_end, document.page_count) if page_end else None,
        level=level,
        language=language,
        objectives=[],
        status="queued",
        stage="queued",
        progress=0,
        ai_model=get_settings().groq_model,
    )
    db.add(guide)
    db.commit()
    return guide


def run_guide_job(guide_id: str) -> None:
    """Background task with its own session. Failures are recorded on the guide, never raised."""
    db = sessionmaker(bind=get_engine(), expire_on_commit=False)()
    try:
        _run(db, guide_id)
    except Exception as err:
        logger.exception("guide job %s failed", guide_id)
        db.rollback()
        message = err.message if isinstance(err, AppError) else "Something went wrong while making this lesson. Please try again."
        db.execute(update(StudyGuide).where(StudyGuide.id == guide_id).values(status="failed", stage="failed", error_message=message[:500]))
        db.commit()
    finally:
        db.close()


def _run(db: Session, guide_id: str) -> None:
    guide = db.get(StudyGuide, guide_id)
    if guide is None:
        return

    def set_stage(stage: str, progress: int) -> None:
        guide.status, guide.stage, guide.progress = "processing", stage, progress
        db.commit()

    set_stage("reading", 5)
    _, material = load_document_text(db, guide.document_id, guide.page_start, guide.page_end)

    set_stage("writing", 15)
    lesson = groq_json(
        LESSON_SYSTEM_PROMPT,
        _lesson_request(guide, material),
        _Lesson,
        name="guided_lesson",
        max_tokens=24_000,
        effort="medium",
    )
    if not lesson.sections:
        raise AppError("INVALID_OUTPUT", 502, "The lesson came back empty. Please try again.")
    guide.title = (lesson.title.strip() or guide.title)[:300]
    guide.overview = lesson.overview.strip()
    guide.objectives = [o.strip() for o in lesson.objectives if o.strip()][:6]
    sections = []
    for i, s in enumerate(lesson.sections[:8], start=1):
        diagram = clean_mermaid(s.diagram)
        sections.append(
            GuideSection(
                position=i,
                title=s.title.strip()[:300],
                explanation=s.explanation.strip(),
                analogy=s.analogy.strip() or None,
                example=s.example.strip() or None,
                key_terms=[{"term": t.term.strip(), "definition": t.definition.strip()} for t in s.keyTerms if t.term.strip()],
                diagram=diagram,
                diagram_caption=(s.diagramCaption.strip()[:300] or None) if diagram else None,
                check_question=s.checkQuestion.strip() or None,
                check_answer=s.checkAnswer.strip() or None,
                source_pages=s.sourcePages.strip()[:50] or None,
            )
        )
    guide.sections = sections
    set_stage("practice", 65)

    try:
        _build_practice(db, guide)
    except AppError as err:
        # The lesson itself is the main thing; practice can be regenerated later.
        logger.warning("practice pack for %s failed: %s", guide.id, err)
        guide.error_message = "Your flashcards and quiz couldn't be made this time. Use “Make them again” to retry."

    guide.status, guide.stage, guide.progress = "ready", "done", 100
    db.commit()


def _lesson_request(guide: StudyGuide, material: str) -> str:
    language = LANGUAGES.get(guide.language, "English")
    parts = [
        f"Working title: {guide.title}",
        f"Student level: {LEVEL_NOTES[guide.level]}",
        None if guide.language == "en" else f"Write the whole lesson in {language} (keep the JSON keys as specified).",
        "<material>",
        material,
        "</material>",
    ]
    return "\n".join(p for p in parts if p is not None)


def lesson_text(guide: StudyGuide, *, with_answers: bool = True) -> str:
    """The guide as plain text, used as compact input for later AI calls."""
    out = [f"# {guide.title}", guide.overview or ""]
    for s in guide.sections:
        out.append(f"\n## {s.position}. {s.title}\n{s.explanation}")
        if s.example:
            out.append(f"Example: {s.example}")
        if s.key_terms:
            out.append("Key terms: " + "; ".join(f"{t['term']}: {t['definition']}" for t in s.key_terms))
        if with_answers and s.check_question:
            out.append(f"Check: {s.check_question} Answer: {s.check_answer}")
    return "\n".join(out)


def _build_practice(db: Session, guide: StudyGuide) -> None:
    language = LANGUAGES.get(guide.language, "English")
    pack = groq_json(
        PRACTICE_SYSTEM_PROMPT,
        ("" if guide.language == "en" else f"Write everything in {language} (search queries may be in English).\n\n")
        + f"<lesson>\n{lesson_text(guide)}\n</lesson>",
        _Practice,
        name="practice_pack",
        max_tokens=12_000,
        effort="low",
    )

    guide.flashcards = [
        Flashcard(front=c.front.strip(), back=c.back.strip(), source="generated")
        for c in pack.flashcards[:14]
        if c.front.strip() and c.back.strip()
    ]
    questions = []
    for q in pack.quiz:
        options = [o.strip() for o in q.options if o.strip()]
        if len(options) == 4 and 0 <= q.correctIndex < 4 and q.question.strip():
            questions.append(
                QuizQuestion(
                    position=len(questions) + 1,
                    question=q.question.strip(),
                    options=options,
                    correct_index=q.correctIndex,
                    explanation=q.explanation.strip(),
                    difficulty=q.difficulty,
                )
            )
    guide.quiz_questions = questions[:10]

    guide.stage, guide.progress = "resources", 85
    db.commit()
    guide.resources = find_resources(guide.title, pack.videoSearches, pack.readingTopics)
    db.commit()


def regenerate_practice(db: Session, guide_id: str) -> StudyGuide:
    guide = get_guide(db, guide_id)
    if guide.status != "ready":
        raise AppError("NOT_READY", 409, "This lesson isn't ready yet.")
    _build_practice(db, guide)
    guide.error_message = None
    db.commit()
    return guide


# --- Resources ---------------------------------------------------------------------------------


def find_resources(title: str, videos: list[_Search], reading: list[_Search]) -> list[GuideResource]:
    """Real YouTube results when YOUTUBE_API_KEY is set; otherwise YouTube search links.
    Reading links are encyclopedia/scholar searches, so nothing points at an invented page."""
    resources: list[GuideResource] = []

    def add(**kwargs) -> None:
        resources.append(GuideResource(position=len(resources) + 1, **kwargs))

    api_key = get_settings().youtube_api_key
    for search in videos[:4]:
        found = _youtube_search(search.query, api_key) if api_key else []
        if found:
            for video in found:
                add(kind="video", description=search.why, **video)
        else:
            add(
                kind="video_search",
                title=search.title[:300],
                url=f"https://www.youtube.com/results?search_query={quote_plus(search.query)}",
                description=search.why,
                source="YouTube search",
            )
    for topic in reading[:4]:
        add(
            kind="reading",
            title=topic.title[:300],
            url=f"https://en.wikipedia.org/w/index.php?search={quote_plus(topic.query)}",
            description=topic.why,
            source="Wikipedia",
        )
    add(
        kind="reading",
        title=f"Academic papers on {title}"[:300],
        url=f"https://scholar.google.com/scholar?q={quote_plus(title)}",
        description="Peer-reviewed sources for assignments and deeper study.",
        source="Google Scholar",
    )
    return resources


def _youtube_search(query: str, api_key: str, limit: int = 2) -> list[dict]:
    try:
        response = httpx.get(
            "https://www.googleapis.com/youtube/v3/search",
            params={
                "part": "snippet",
                "type": "video",
                "q": query,
                "maxResults": limit,
                "safeSearch": "strict",
                "videoEmbeddable": "true",
                "key": api_key,
            },
            timeout=15,
        )
        response.raise_for_status()
    except httpx.HTTPError as err:
        logger.warning("YouTube search failed for %r: %s", query, err)
        return []
    videos = []
    for item in response.json().get("items", []):
        video_id = item.get("id", {}).get("videoId")
        snippet = item.get("snippet", {})
        if video_id:
            videos.append(
                {
                    "title": _unescape(snippet.get("title", "Video"))[:300],
                    "url": f"https://www.youtube.com/watch?v={video_id}",
                    "source": snippet.get("channelTitle", "YouTube")[:100],
                    "thumbnail_url": snippet.get("thumbnails", {}).get("medium", {}).get("url"),
                }
            )
    return videos


def _unescape(text: str) -> str:
    return text.replace("&#39;", "'").replace("&quot;", '"').replace("&amp;", "&")


# --- Diagrams ----------------------------------------------------------------------------------

_MERMAID_TYPES = ("flowchart", "graph", "sequenceDiagram", "erDiagram", "classDiagram", "stateDiagram")


def clean_mermaid(source: str) -> str | None:
    """Strips code fences and rejects anything that isn't one of the supported diagram types."""
    text = source.strip()
    text = re.sub(r"^```(?:mermaid)?\s*|\s*```$", "", text).strip()
    if not text or not text.split(None, 1)[0].startswith(_MERMAID_TYPES):
        return None
    return text


# --- Reading -----------------------------------------------------------------------------------


def get_guide(db: Session, guide_id: str) -> StudyGuide:
    guide = db.get(StudyGuide, guide_id)
    if guide is None:
        raise AppError("NOT_FOUND", 404, "That study space doesn't exist.")
    return guide


def guide_summary(guide: StudyGuide) -> dict:
    best = max((a.score for a in guide.quiz_attempts), default=None)
    return {
        "guideId": guide.id,
        "documentId": guide.document_id,
        "title": guide.title,
        "status": guide.status,
        "stage": guide.stage,
        "stageLabel": STAGE_LABELS.get(guide.stage, guide.stage),
        "progress": guide.progress,
        "error": guide.error_message,
        "level": guide.level,
        "language": guide.language,
        "pageStart": guide.page_start,
        "pageEnd": guide.page_end,
        "createdAt": guide.created_at.isoformat() if guide.created_at else None,
        "sectionCount": len(guide.sections),
        "flashcardCount": len(guide.flashcards),
        "quizQuestionCount": len(guide.quiz_questions),
        "bestQuizScore": best,
    }


def guide_detail(db: Session, guide: StudyGuide) -> dict:
    episode = next(
        iter(sorted((e for e in _guide_episodes(db, guide.id)), key=lambda e: e.created_at or 0, reverse=True)), None
    )
    return {
        **guide_summary(guide),
        "overview": guide.overview,
        "objectives": guide.objectives,
        "sections": [
            {
                "id": s.id,
                "position": s.position,
                "title": s.title,
                "explanation": s.explanation,
                "analogy": s.analogy,
                "example": s.example,
                "keyTerms": s.key_terms,
                "diagram": s.diagram,
                "diagramCaption": s.diagram_caption,
                "checkQuestion": s.check_question,
                "checkAnswer": s.check_answer,
                "sourcePages": s.source_pages,
            }
            for s in guide.sections
        ],
        # Quiz questions without answers; answers come back after submitting.
        "quiz": [{"position": q.position, "question": q.question, "options": q.options, "difficulty": q.difficulty} for q in guide.quiz_questions],
        "quizAttempts": [
            {"attemptId": a.id, "score": a.score, "rating": a.rating, "createdAt": a.created_at.isoformat()} for a in guide.quiz_attempts
        ],
        "resources": [
            {
                "kind": r.kind,
                "title": r.title,
                "url": r.url,
                "description": r.description,
                "source": r.source,
                "thumbnailUrl": r.thumbnail_url,
            }
            for r in guide.resources
        ],
        "messages": [
            {"id": m.id, "role": m.role, "content": m.content, "pages": m.pages, "createdAt": m.created_at.isoformat()}
            for m in guide.messages
        ],
        "audio": (
            {"scriptId": episode.id, "status": episode.status, "progress": episode.progress, "stageLabel": episode.stage}
            if episode
            else None
        ),
    }


def _guide_episodes(db: Session, guide_id: str) -> list[Episode]:
    return list(db.query(Episode).filter(Episode.guide_id == guide_id))


def delete_guide(db: Session, guide_id: str) -> None:
    guide = get_guide(db, guide_id)
    if guide.status in ("queued", "processing"):
        raise AppError("BUSY", 409, "This lesson is still being made. Wait for it to finish before deleting it.")
    for episode in _guide_episodes(db, guide_id):
        episode.guide_id = None  # keep any audio lesson, just unlink it
    db.delete(guide)
    db.commit()


def fail_interrupted_guides(db: Session) -> int:
    result = db.execute(
        update(StudyGuide)
        .where(StudyGuide.status.in_(("queued", "processing")))
        .values(status="failed", stage="failed", error_message="Interrupted by a server restart. Please create it again.")
    )
    db.commit()
    return result.rowcount or 0


# --- Quiz --------------------------------------------------------------------------------------


def quiz_rating(score: int) -> str:
    if score >= 90:
        return "Excellent"
    if score >= 75:
        return "Strong"
    if score >= 50:
        return "Getting there"
    return "Needs review"


def grade_quiz(db: Session, guide_id: str, answers: list[int]) -> dict:
    guide = get_guide(db, guide_id)
    questions = guide.quiz_questions
    if not questions:
        raise AppError("NOT_READY", 409, "This lesson has no quiz yet.")
    if len(answers) != len(questions):
        raise AppError("INVALID_REQUEST", 400, f"Answer all {len(questions)} questions before submitting.")

    results = []
    correct = 0
    for q, chosen in zip(questions, answers):
        is_correct = chosen == q.correct_index
        correct += is_correct
        results.append(
            {
                "position": q.position,
                "question": q.question,
                "options": q.options,
                "chosenIndex": chosen,
                "correctIndex": q.correct_index,
                "correct": is_correct,
                "explanation": q.explanation,
                "difficulty": q.difficulty,
            }
        )
    score = round(correct / len(questions) * 100)
    rating = quiz_rating(score)
    attempt = QuizAttempt(guide_id=guide.id, answers=answers, score=score, rating=rating)
    db.add(attempt)
    db.flush()
    db.add(StudyEvent(kind="quiz", ref_id=attempt.id, amount=1))
    db.commit()
    return {
        "attemptId": attempt.id,
        "score": score,
        "correct": correct,
        "total": len(questions),
        "rating": rating,
        "previousBest": max((a.score for a in guide.quiz_attempts if a.id != attempt.id), default=None),
        "results": results,
    }


# --- Chat (retrieval over the student's own pages) -----------------------------------------------

_STOPWORDS = set(
    "the a an and or of to in on for is are was were be been it this that with as by at from what why how which who "
    "when where does do did can could would should about into your you their there they them its than then also not "
    "explain tell me please give example".split()
)
MAX_QUESTION_CHARS = 2_000
CONTEXT_CHUNKS = 3
HISTORY_MESSAGES = 6


def _tokens(text: str) -> list[str]:
    return [w for w in re.findall(r"[a-zA-Z][a-zA-Z0-9-]{2,}", text.lower()) if w not in _STOPWORDS]


def retrieve(chunks: list[DocumentChunk], query: str, k: int = CONTEXT_CHUNKS) -> list[DocumentChunk]:
    """TF-IDF ranking of the document's chunks against the question (no embeddings needed)."""
    if len(chunks) <= k:
        return chunks
    docs = [Counter(_tokens(c.content)) for c in chunks]
    df = Counter(term for d in docs for term in d)
    n = len(chunks)
    terms = set(_tokens(query))
    scores = []
    for chunk, counts in zip(chunks, docs):
        length = sum(counts.values()) or 1
        score = sum((counts[t] / length) * math.log(1 + n / df[t]) for t in terms if counts[t])
        scores.append((score, chunk.chunk_index, chunk))
    ranked = [c for score, _, c in sorted(scores, key=lambda x: (-x[0], x[1]))]
    best = ranked[:k]
    if all(s == 0 for s, _, _ in scores):
        best = chunks[:k]  # vague question ("summarise this"): start of the range
    return sorted(best, key=lambda c: c.chunk_index)


def chat(db: Session, guide_id: str, message: str) -> dict:
    guide = get_guide(db, guide_id)
    message = message.strip()
    if not message:
        raise AppError("INVALID_REQUEST", 400, "Type a question first.")
    if len(message) > MAX_QUESTION_CHARS:
        raise AppError("INVALID_REQUEST", 400, f"Keep questions under {MAX_QUESTION_CHARS:,} characters.")

    document = db.get(Document, guide.document_id)
    chunks = [
        c
        for c in (document.chunks if document else [])
        if (guide.page_start is None or c.page_end >= guide.page_start) and (guide.page_end is None or c.page_start <= guide.page_end)
    ]
    history = guide.messages[-HISTORY_MESSAGES:]
    query = " ".join([m.content for m in history if m.role == "user"][-2:] + [message])
    context = retrieve(chunks, query)
    pages = sorted({p for c in context for p in range(c.page_start, c.page_end + 1)})

    unit = "Slide" if document and document.source_type == "pptx" else "Page"
    excerpts = "\n\n".join(
        f"[{unit} {c.page_start}{'' if c.page_start == c.page_end else f'–{c.page_end}'}]\n{c.content}" for c in context
    )
    conversation = "\n".join(f"{'Student' if m.role == 'user' else 'Tutor'}: {m.content[:1500]}" for m in history)
    language = LANGUAGES.get(guide.language, "English")
    user = "\n\n".join(
        part
        for part in [
            f"Lesson: {guide.title}. {LEVEL_NOTES[guide.level]}",
            None if guide.language == "en" else f"Answer in {language}.",
            f"<material_excerpts>\n{excerpts or '(no text found)'}\n</material_excerpts>",
            f"<conversation_so_far>\n{conversation}\n</conversation_so_far>" if conversation else None,
            f"<student_question>\n{message}\n</student_question>",
        ]
        if part
    )
    answer = groq_text(CHAT_SYSTEM_PROMPT, user, max_tokens=4_000, effort="low")
    if not answer:
        raise AppError("ANSWER_FAILED", 502, "I couldn't come up with an answer. Please try asking again.")

    user_msg = ChatMessage(guide_id=guide.id, role="user", content=message, pages=[])
    reply = ChatMessage(guide_id=guide.id, role="assistant", content=answer, pages=pages)
    db.add_all([user_msg, reply, StudyEvent(kind="chat", ref_id=guide.id, amount=1)])
    db.commit()
    return {
        "question": {"id": user_msg.id, "role": "user", "content": message, "pages": [], "createdAt": user_msg.created_at.isoformat()},
        "answer": {"id": reply.id, "role": "assistant", "content": answer, "pages": pages, "createdAt": reply.created_at.isoformat()},
    }
