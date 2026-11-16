"""MySQL tables (SQLAlchemy 2.0 models). `scripts/init_db.py` creates them; `schema.sql` is generated from them.

documents ─┬─< document_chunks
           ├─< episodes ─┬─< episode_segments
           │             ├── listening_progress (1:1)
           │             └─< flashcards
           └─< defense_question_sets ─< defense_questions ─< defense_attempts
users ─< user_sessions; every top-level row has a user_id (OwnedMixin).
study_events: one row per study action (listening time, card review, defense answer) for streaks.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

# MEDIUMTEXT (16 MB) on MySQL; plain TEXT elsewhere (e.g. SQLite in tests).
LongText = Text().with_variant(mysql.MEDIUMTEXT(), "mysql")


def new_uuid() -> str:
    return str(uuid.uuid4())


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class OwnedMixin:
    """Rows that belong to one user. `auth.scoping` fills user_id on insert and filters every query by it."""

    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    #: scrypt hash; empty for accounts that only sign in with Google.
    password_hash: Mapped[str | None] = mapped_column(String(255))
    #: Google's stable account ID ("sub"), when the user has signed in with Google.
    google_sub: Mapped[str | None] = mapped_column(String(64), unique=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500))


class UserSession(TimestampMixin, Base):
    """A signed-in browser. The cookie holds a random token; only its SHA-256 is stored."""

    __tablename__ = "user_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


# ---------------------------------------------------------------------------
# Uploaded documents
# ---------------------------------------------------------------------------


class Document(OwnedMixin, TimestampMixin, Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(127), nullable=False)
    source_type: Mapped[str] = mapped_column(Enum("pdf", "pptx", name="source_type"), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    page_count: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    chunks: Mapped[list["DocumentChunk"]] = relationship(
        back_populates="document", cascade="all, delete-orphan", passive_deletes=True, order_by="DocumentChunk.chunk_index"
    )


class DocumentChunk(TimestampMixin, Base):
    __tablename__ = "document_chunks"
    __table_args__ = (UniqueConstraint("document_id", "chunk_index", name="uq_chunk_position"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(LongText, nullable=False)
    token_count: Mapped[int] = mapped_column(Integer, nullable=False)
    #: 1-based page (PDF) or slide (PPTX) range this chunk covers.
    page_start: Mapped[int] = mapped_column(Integer, nullable=False)
    page_end: Mapped[int] = mapped_column(Integer, nullable=False)

    document: Mapped[Document] = relationship(back_populates="chunks")


# ---------------------------------------------------------------------------
# Audio episodes (Alex & Sam)
# ---------------------------------------------------------------------------

LESSON_STYLES = ("standard", "recap", "deep_dive", "exam_cram")
LESSON_LEVELS = ("beginner", "intermediate", "advanced")
EPISODE_STATUSES = ("queued", "processing", "ready", "failed")


class Episode(OwnedMixin, TimestampMixin, Base):
    __tablename__ = "episodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id", ondelete="SET NULL"), index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    page_start: Mapped[int | None] = mapped_column(Integer)
    page_end: Mapped[int | None] = mapped_column(Integer)
    target_minutes: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    total_duration_sec: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    ai_model: Mapped[str] = mapped_column(String(100), nullable=False)
    tts_provider: Mapped[str] = mapped_column(String(50), nullable=False)

    # Lesson options
    style: Mapped[str] = mapped_column(
        Enum(*LESSON_STYLES, name="lesson_style"), nullable=False, default="standard", server_default="standard"
    )
    level: Mapped[str] = mapped_column(
        Enum(*LESSON_LEVELS, name="lesson_level"), nullable=False, default="intermediate", server_default="intermediate"
    )
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="en", server_default="en")
    #: The study space this audio lesson belongs to, if any.
    guide_id: Mapped[str | None] = mapped_column(ForeignKey("study_guides.id", ondelete="SET NULL"), index=True)

    # Background generation: queued → processing (stage + progress %) → ready | failed
    status: Mapped[str] = mapped_column(
        Enum(*EPISODE_STATUSES, name="episode_status"), nullable=False, default="queued", server_default="ready"
    )
    stage: Mapped[str] = mapped_column(String(30), nullable=False, default="queued", server_default="done")
    progress: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0, server_default="100")
    error_message: Mapped[str | None] = mapped_column(String(500))

    segments: Mapped[list["EpisodeSegment"]] = relationship(
        back_populates="episode", cascade="all, delete-orphan", passive_deletes=True, order_by="EpisodeSegment.segment_index"
    )
    listening: Mapped["ListeningProgress | None"] = relationship(
        back_populates="episode", cascade="all, delete-orphan", passive_deletes=True, uselist=False
    )
    flashcards: Mapped[list["Flashcard"]] = relationship(
        back_populates="episode", cascade="all, delete-orphan", passive_deletes=True, order_by="Flashcard.id"
    )


class EpisodeSegment(Base):
    """One MP3 file. A long script line may be split across several segments (same line_index)."""

    __tablename__ = "episode_segments"
    __table_args__ = (UniqueConstraint("episode_id", "segment_index", name="uq_segment_position"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    episode_id: Mapped[str] = mapped_column(ForeignKey("episodes.id", ondelete="CASCADE"), nullable=False, index=True)
    segment_index: Mapped[int] = mapped_column(Integer, nullable=False)
    line_index: Mapped[int] = mapped_column(Integer, nullable=False)
    speaker: Mapped[str] = mapped_column(Enum("Alex", "Sam", name="speaker"), nullable=False)
    line_type: Mapped[str] = mapped_column(Enum("dialogue", "quiz_checkpoint", name="line_type"), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    #: Path under MEDIA_DIR, e.g. "episodes/<id>/0003-alex.mp3".
    file_path: Mapped[str] = mapped_column(String(255), nullable=False)
    start_sec: Mapped[float] = mapped_column(Float, nullable=False)
    end_sec: Mapped[float] = mapped_column(Float, nullable=False)
    duration_sec: Mapped[float] = mapped_column(Float, nullable=False)
    pause_after_sec: Mapped[float] = mapped_column(Float, nullable=False, default=0)

    episode: Mapped[Episode] = relationship(back_populates="segments")


# ---------------------------------------------------------------------------
# Exam & defense practice
# ---------------------------------------------------------------------------

QUESTION_CATEGORIES = ("logical_gap", "methodology", "assumption", "evidence", "limitations", "technical_depth")


class DefenseQuestionSet(OwnedMixin, TimestampMixin, Base):
    __tablename__ = "defense_question_sets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    source_title: Mapped[str | None] = mapped_column(String(300))
    overall_weaknesses: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    ai_model: Mapped[str] = mapped_column(String(100), nullable=False)

    questions: Mapped[list["DefenseQuestion"]] = relationship(
        back_populates="question_set", cascade="all, delete-orphan", passive_deletes=True, order_by="DefenseQuestion.position"
    )


class DefenseQuestion(OwnedMixin, Base):
    __tablename__ = "defense_questions"
    __table_args__ = (UniqueConstraint("set_id", "question_key", name="uq_question_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    set_id: Mapped[str] = mapped_column(ForeignKey("defense_question_sets.id", ondelete="CASCADE"), nullable=False, index=True)
    #: "q1" … "q5": the ID the API and frontend use.
    question_key: Mapped[str] = mapped_column(String(8), nullable=False)
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Enum(*QUESTION_CATEGORIES, name="question_category"), nullable=False)
    targets_weakness: Mapped[str] = mapped_column(Text, nullable=False)
    source_reference: Mapped[str] = mapped_column(String(200), nullable=False)
    #: Marking rubric (kept server-side until the student has answered).
    rubric: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)

    question_set: Mapped[DefenseQuestionSet] = relationship(back_populates="questions")
    attempts: Mapped[list["DefenseAttempt"]] = relationship(
        back_populates="question", cascade="all, delete-orphan", passive_deletes=True
    )


class DefenseAttempt(OwnedMixin, TimestampMixin, Base):
    __tablename__ = "defense_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    question_id: Mapped[int] = mapped_column(ForeignKey("defense_questions.id", ondelete="CASCADE"), nullable=False, index=True)
    answer_text: Mapped[str] = mapped_column(Text, nullable=False)
    input_mode: Mapped[str] = mapped_column(Enum("typed", "spoken", name="input_mode"), nullable=False)
    score: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    grade: Mapped[str] = mapped_column(Enum("excellent", "good", "partial", "insufficient", name="grade"), nullable=False)
    evaluation: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)

    question: Mapped[DefenseQuestion] = relationship(back_populates="attempts")


# ---------------------------------------------------------------------------
# Listening progress, flashcards, study activity
# ---------------------------------------------------------------------------


class ListeningProgress(OwnedMixin, Base):
    """Where the student is in an episode, for "continue where you left off"."""

    __tablename__ = "listening_progress"

    episode_id: Mapped[str] = mapped_column(ForeignKey("episodes.id", ondelete="CASCADE"), primary_key=True)
    position_sec: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    listened_sec: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.now, onupdate=datetime.now)

    episode: Mapped[Episode] = relationship(back_populates="listening")


class Flashcard(OwnedMixin, TimestampMixin, Base):
    """A spaced-repetition card made from a lesson (SM-2 style scheduling)."""

    __tablename__ = "flashcards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    #: Exactly one of episode_id / guide_id is set.
    episode_id: Mapped[str | None] = mapped_column(ForeignKey("episodes.id", ondelete="CASCADE"), index=True)
    guide_id: Mapped[str | None] = mapped_column(ForeignKey("study_guides.id", ondelete="CASCADE"), index=True)
    front: Mapped[str] = mapped_column(Text, nullable=False)
    back: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(Enum("checkpoint", "generated", name="flashcard_source"), nullable=False)
    ease: Mapped[float] = mapped_column(Float, nullable=False, default=2.5)
    interval_days: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    repetitions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lapses: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    due_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.now, index=True)
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)

    episode: Mapped[Episode | None] = relationship(back_populates="flashcards")
    guide: Mapped["StudyGuide | None"] = relationship(back_populates="flashcards")


STUDY_EVENT_KINDS = ("listen", "review", "defense", "upload", "quiz", "chat")


class StudyEvent(OwnedMixin, Base):
    """One study action, used for streaks, the activity calendar and totals."""

    __tablename__ = "study_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(Enum(*STUDY_EVENT_KINDS, name="study_event_kind"), nullable=False)
    #: ID of the episode, flashcard, defense attempt or document involved.
    ref_id: Mapped[str | None] = mapped_column(String(64))
    #: Seconds for "listen" events, 1 otherwise.
    amount: Mapped[float] = mapped_column(Float, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.now, index=True)


# ---------------------------------------------------------------------------
# Study spaces: guided lesson (text + diagrams), quiz, resources, chat
# ---------------------------------------------------------------------------

JOB_STATUSES = ("queued", "processing", "ready", "failed")


class StudyGuide(OwnedMixin, TimestampMixin, Base):
    __tablename__ = "study_guides"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    page_start: Mapped[int | None] = mapped_column(Integer)
    page_end: Mapped[int | None] = mapped_column(Integer)
    level: Mapped[str] = mapped_column(Enum(*LESSON_LEVELS, name="guide_level"), nullable=False, default="intermediate")
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="en")
    #: One-paragraph overview and the learning goals, shown at the top of the lesson.
    overview: Mapped[str | None] = mapped_column(Text)
    objectives: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    status: Mapped[str] = mapped_column(Enum(*JOB_STATUSES, name="guide_status"), nullable=False, default="queued")
    stage: Mapped[str] = mapped_column(String(30), nullable=False, default="queued")
    progress: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(String(500))
    ai_model: Mapped[str] = mapped_column(String(100), nullable=False)

    sections: Mapped[list["GuideSection"]] = relationship(
        back_populates="guide", cascade="all, delete-orphan", passive_deletes=True, order_by="GuideSection.position"
    )
    quiz_questions: Mapped[list["QuizQuestion"]] = relationship(
        back_populates="guide", cascade="all, delete-orphan", passive_deletes=True, order_by="QuizQuestion.position"
    )
    quiz_attempts: Mapped[list["QuizAttempt"]] = relationship(
        back_populates="guide", cascade="all, delete-orphan", passive_deletes=True, order_by="QuizAttempt.created_at"
    )
    resources: Mapped[list["GuideResource"]] = relationship(
        back_populates="guide", cascade="all, delete-orphan", passive_deletes=True, order_by="GuideResource.position"
    )
    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="guide", cascade="all, delete-orphan", passive_deletes=True, order_by="ChatMessage.id"
    )
    flashcards: Mapped[list[Flashcard]] = relationship(
        back_populates="guide", cascade="all, delete-orphan", passive_deletes=True, order_by="Flashcard.id"
    )


class GuideSection(Base):
    """One step of the guided lesson: explanation, analogy, key terms, worked example and an optional diagram."""

    __tablename__ = "guide_sections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    guide_id: Mapped[str] = mapped_column(ForeignKey("study_guides.id", ondelete="CASCADE"), nullable=False, index=True)
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    #: Markdown.
    explanation: Mapped[str] = mapped_column(LongText, nullable=False)
    analogy: Mapped[str | None] = mapped_column(Text)
    example: Mapped[str | None] = mapped_column(Text)
    key_terms: Mapped[list[dict[str, str]]] = mapped_column(JSON, nullable=False, default=list)
    #: Mermaid diagram source, rendered in the browser.
    diagram: Mapped[str | None] = mapped_column(Text)
    diagram_caption: Mapped[str | None] = mapped_column(String(300))
    #: A quick self-check question shown at the end of the section.
    check_question: Mapped[str | None] = mapped_column(Text)
    check_answer: Mapped[str | None] = mapped_column(Text)
    source_pages: Mapped[str | None] = mapped_column(String(50))

    guide: Mapped[StudyGuide] = relationship(back_populates="sections")


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    guide_id: Mapped[str] = mapped_column(ForeignKey("study_guides.id", ondelete="CASCADE"), nullable=False, index=True)
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    correct_index: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    difficulty: Mapped[str] = mapped_column(Enum("easy", "medium", "hard", name="quiz_difficulty"), nullable=False)

    guide: Mapped[StudyGuide] = relationship(back_populates="quiz_questions")


class QuizAttempt(OwnedMixin, TimestampMixin, Base):
    __tablename__ = "quiz_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    guide_id: Mapped[str] = mapped_column(ForeignKey("study_guides.id", ondelete="CASCADE"), nullable=False, index=True)
    #: Chosen option index per question position.
    answers: Mapped[list[int]] = mapped_column(JSON, nullable=False)
    score: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    rating: Mapped[str] = mapped_column(String(30), nullable=False)

    guide: Mapped[StudyGuide] = relationship(back_populates="quiz_attempts")


class GuideResource(Base):
    """A video or reading suggestion. URLs are real search results or search links, never invented pages."""

    __tablename__ = "guide_resources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    guide_id: Mapped[str] = mapped_column(ForeignKey("study_guides.id", ondelete="CASCADE"), nullable=False, index=True)
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    kind: Mapped[str] = mapped_column(Enum("video", "video_search", "reading", name="resource_kind"), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    url: Mapped[str] = mapped_column(String(600), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str | None] = mapped_column(String(100))
    thumbnail_url: Mapped[str | None] = mapped_column(String(600))

    guide: Mapped[StudyGuide] = relationship(back_populates="resources")


class ChatMessage(OwnedMixin, TimestampMixin, Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    guide_id: Mapped[str] = mapped_column(ForeignKey("study_guides.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(Enum("user", "assistant", name="chat_role"), nullable=False)
    content: Mapped[str] = mapped_column(LongText, nullable=False)
    #: Pages the answer drew on, e.g. [5, 6].
    pages: Mapped[list[int]] = mapped_column(JSON, nullable=False, default=list)

    guide: Mapped[StudyGuide] = relationship(back_populates="messages")


# ---------------------------------------------------------------------------
# Projects: requirements → PowerPoint deck → presenter script and defense coaching
# ---------------------------------------------------------------------------


class Project(OwnedMixin, TimestampMixin, Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    course: Mapped[str | None] = mapped_column(String(300))
    #: The brief: extracted text of the uploaded requirements plus the student's own instructions.
    requirements: Mapped[str] = mapped_column(LongText, nullable=False)
    source_filename: Mapped[str | None] = mapped_column(String(255))
    slide_count: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    #: Generated deck: {"title", "subtitle", "slides": [...]} (see projects/service.py).
    deck: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    #: Generated defense pack: presenter script, strategy, likely questions with model answers.
    defense: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    #: Path of the .pptx under MEDIA_DIR.
    pptx_path: Mapped[str | None] = mapped_column(String(255))
    #: Practice set made from the deck (created on demand).
    question_set_id: Mapped[str | None] = mapped_column(ForeignKey("defense_question_sets.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(Enum(*JOB_STATUSES, name="project_status"), nullable=False, default="queued")
    stage: Mapped[str] = mapped_column(String(30), nullable=False, default="queued")
    progress: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(String(500))
    ai_model: Mapped[str] = mapped_column(String(100), nullable=False)


#: Tables whose rows belong to a user.
OWNED_MODELS = (Document, Episode, DefenseQuestionSet, DefenseQuestion, DefenseAttempt, ListeningProgress, Flashcard, StudyEvent, StudyGuide, QuizAttempt, ChatMessage, Project)
