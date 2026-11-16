"""MySQL tables (SQLAlchemy 2.0 models). `scripts/init_db.py` creates them; `schema.sql` is generated from them.

documents ─┬─< document_chunks
           ├─< episodes ─< episode_segments
           └─< defense_question_sets ─< defense_questions ─< defense_attempts
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
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


# ---------------------------------------------------------------------------
# Uploaded documents
# ---------------------------------------------------------------------------


class Document(TimestampMixin, Base):
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


class Episode(TimestampMixin, Base):
    __tablename__ = "episodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id", ondelete="SET NULL"), index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    page_start: Mapped[int | None] = mapped_column(Integer)
    page_end: Mapped[int | None] = mapped_column(Integer)
    target_minutes: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    total_duration_sec: Mapped[float] = mapped_column(Float, nullable=False)
    ai_model: Mapped[str] = mapped_column(String(100), nullable=False)
    tts_provider: Mapped[str] = mapped_column(String(50), nullable=False)

    segments: Mapped[list["EpisodeSegment"]] = relationship(
        back_populates="episode", cascade="all, delete-orphan", passive_deletes=True, order_by="EpisodeSegment.segment_index"
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


class DefenseQuestionSet(TimestampMixin, Base):
    __tablename__ = "defense_question_sets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    source_title: Mapped[str | None] = mapped_column(String(300))
    overall_weaknesses: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    ai_model: Mapped[str] = mapped_column(String(100), nullable=False)

    questions: Mapped[list["DefenseQuestion"]] = relationship(
        back_populates="question_set", cascade="all, delete-orphan", passive_deletes=True, order_by="DefenseQuestion.position"
    )


class DefenseQuestion(Base):
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


class DefenseAttempt(TimestampMixin, Base):
    __tablename__ = "defense_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    question_id: Mapped[int] = mapped_column(ForeignKey("defense_questions.id", ondelete="CASCADE"), nullable=False, index=True)
    answer_text: Mapped[str] = mapped_column(Text, nullable=False)
    input_mode: Mapped[str] = mapped_column(Enum("typed", "spoken", name="input_mode"), nullable=False)
    score: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    grade: Mapped[str] = mapped_column(Enum("excellent", "good", "partial", "insufficient", name="grade"), nullable=False)
    evaluation: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)

    question: Mapped[DefenseQuestion] = relationship(back_populates="attempts")
