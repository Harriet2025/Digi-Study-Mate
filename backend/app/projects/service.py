"""Projects: a student uploads a presentation brief → we write and design the PowerPoint, then coach them
to present and defend it (presenter script, strategy, likely questions with model answers, and practice)."""

import io
import logging
from typing import Literal

from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, update
from sqlalchemy.orm import Session, sessionmaker

from ..ai.groq import groq_json
from ..config import get_settings
from ..db import get_engine
from ..defense.service import generate_question_set
from ..errors import AppError
from ..ingestion.images import is_image_name, read_image
from ..ingestion.extract_pdf import extract_pdf
from ..ingestion.extract_pptx import extract_pptx
from ..ingestion.validate import MAX_FILE_BYTES, OLE_SIGNATURE, ZIP_SIGNATURE, sanitize_filename
from ..models import Project, new_uuid
from .pptx_builder import build_deck
from .prompts import DECK_SYSTEM_PROMPT, DEFENSE_SYSTEM_PROMPT, WALKTHROUGH_SYSTEM_PROMPT

logger = logging.getLogger("study_mate.projects")

#: Keeps one request within the AI's per-minute budget on the free tier.
MAX_BRIEF_CHARS = 16_000

STAGE_LABELS = {
    "queued": "Waiting to start",
    "reading": "Reading your brief",
    "writing": "Writing your slides",
    "designing": "Designing the PowerPoint",
    "coaching": "Preparing your presentation script and defence",
    "explaining": "Writing your slide-by-slide walkthrough",
    "done": "Ready",
    "failed": "Something went wrong",
}

Layout = Literal["bullets", "two_column", "process", "timeline", "stats", "quote", "section"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _Column(_Strict):
    heading: str
    bullets: list[str]


class _Step(_Strict):
    label: str
    detail: str


class _Stat(_Strict):
    value: str
    label: str


class _Slide(_Strict):
    layout: Layout
    title: str
    subtitle: str
    bullets: list[str]
    columns: list[_Column]
    steps: list[_Step]
    stats: list[_Stat]
    quote: str
    speakerNotes: str


class _Deck(_Strict):
    title: str
    subtitle: str
    titleNotes: str
    slides: list[_Slide]
    closingMessage: str
    closingNotes: str


class _ScriptItem(_Strict):
    slideNumber: int
    title: str
    talkingPoints: str
    seconds: int
    transition: str


class _LikelyQuestion(_Strict):
    question: str
    why: str
    modelAnswer: str
    tip: str


class _Defense(_Strict):
    openingLine: str
    script: list[_ScriptItem]
    closingLine: str
    strategy: list[str]
    likelyQuestions: list[_LikelyQuestion]
    weakSpots: list[str]


# --- Reading the brief ------------------------------------------------------------------------------


def brief_text_from_file(filename: str | None, data: bytes) -> str:
    """Text of an uploaded brief: PDF, PowerPoint, Word or plain text."""
    if not data:
        return ""
    if len(data) > MAX_FILE_BYTES:
        raise AppError("FILE_TOO_LARGE", 413, "That file is larger than 25 MB.")
    name = sanitize_filename(filename or "brief.txt")
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""

    if is_image_name(name):
        return read_image(data)
    if ext == "pdf":
        if b"%PDF-" not in data[:1024]:
            raise AppError("UNSUPPORTED_FILE_TYPE", 415, "That file isn't a valid PDF.")
        doc = extract_pdf(data)
        return "\n\n".join(p.text for p in doc.pages if p.text)
    if ext == "pptx":
        if data.startswith(OLE_SIGNATURE) or not data.startswith(ZIP_SIGNATURE):
            raise AppError("UNSUPPORTED_FILE_TYPE", 415, "That file isn't a valid .pptx presentation.")
        doc = extract_pptx(data)
        return "\n\n".join(p.text for p in doc.pages if p.text)
    if ext == "docx":
        if not data.startswith(ZIP_SIGNATURE):
            raise AppError("UNSUPPORTED_FILE_TYPE", 415, "That file isn't a valid Word (.docx) document.")
        try:
            import docx  # python-docx

            document = docx.Document(io.BytesIO(data))
        except Exception as err:
            raise AppError("CORRUPT_FILE", 422, "That Word document couldn't be opened.", detail=repr(err)) from err
        parts = [p.text for p in document.paragraphs if p.text.strip()]
        for table in document.tables:
            parts += [" | ".join(c.text.strip() for c in row.cells) for row in table.rows]
        return "\n".join(parts)
    if ext in ("txt", "md"):
        return data.decode("utf-8", errors="replace")
    raise AppError("UNSUPPORTED_FILE_TYPE", 415, "Upload the brief as PDF, Word (.docx), PowerPoint (.pptx) or a text file.")


# --- Creating ---------------------------------------------------------------------------------------


def queue_project(
    db: Session,
    *,
    title: str,
    course: str | None,
    instructions: str,
    brief_text: str,
    source_filename: str | None,
    slide_count: int,
    duration_minutes: int,
) -> Project:
    parts = []
    if brief_text.strip():
        parts.append(f"<brief_document>\n{brief_text.strip()}\n</brief_document>")
    if instructions.strip():
        parts.append(f"<student_instructions>\n{instructions.strip()}\n</student_instructions>")
    if not parts:
        # Just a topic: write a complete, accurate presentation on it.
        parts.append(
            f"<topic>\n{title.strip()}\n</topic>\n"
            "The student gave only the topic. Write a complete, accurate, well-structured presentation on it for a "
            "university audience, covering the key ideas, evidence, examples and implications."
        )
    requirements = "\n\n".join(parts)
    if len(requirements) > MAX_BRIEF_CHARS:
        raise AppError(
            "INPUT_TOO_LARGE",
            413,
            f"The brief is too long ({len(requirements):,} characters; the limit is {MAX_BRIEF_CHARS:,}). "
            "Upload just the requirements and marking criteria, or paste the key parts.",
        )
    project = Project(
        id=new_uuid(),
        title=title.strip()[:300] or "My presentation",
        course=(course or "").strip()[:300] or None,
        requirements=requirements,
        source_filename=source_filename,
        slide_count=slide_count,
        duration_minutes=duration_minutes,
        status="queued",
        stage="queued",
        progress=0,
        ai_model=get_settings().groq_model,
    )
    db.add(project)
    db.commit()
    return project


def run_project_job(project_id: str) -> None:
    db = sessionmaker(bind=get_engine(), expire_on_commit=False)()
    try:
        _run(db, project_id)
    except Exception as err:
        logger.exception("project job %s failed", project_id)
        db.rollback()
        message = err.message if isinstance(err, AppError) else "Something went wrong while making your presentation. Please try again."
        db.execute(update(Project).where(Project.id == project_id).values(status="failed", stage="failed", error_message=message[:500]))
        db.commit()
    finally:
        db.close()


def _run(db: Session, project_id: str) -> None:
    project = db.get(Project, project_id)
    if project is None:
        return

    def set_stage(stage: str, progress: int) -> None:
        project.status, project.stage, project.progress = "processing", stage, progress
        db.commit()

    set_stage("reading", 5)
    content_slides = max(3, project.slide_count - 2)
    header = (
        f"Presentation title (working): {project.title}\n"
        f"Course: {project.course or 'not specified'}\n"
        f"Speaking time: {project.duration_minutes} minutes\n"
        f"Number of content slides to write: {content_slides}\n\n"
    )

    set_stage("writing", 15)
    deck = groq_json(DECK_SYSTEM_PROMPT, header + project.requirements, _Deck, name="slide_deck", max_tokens=24_000, effort="medium")
    if not deck.slides:
        raise AppError("INVALID_OUTPUT", 502, "The slides came back empty. Please try again.")
    deck_data = deck.model_dump()
    deck_data["slides"] = deck_data["slides"][: content_slides + 2]
    project.deck = deck_data
    project.title = deck.title.strip()[:300] or project.title

    set_stage("designing", 50)
    pptx_bytes = build_deck(deck_data, course=project.course)
    folder = get_settings().media_dir / "projects" / project.id
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "presentation.pptx").write_bytes(pptx_bytes)
    project.pptx_path = f"projects/{project.id}/presentation.pptx"

    set_stage("coaching", 60)
    defense = groq_json(
        DEFENSE_SYSTEM_PROMPT,
        f"Speaking time: {project.duration_minutes} minutes\n\n<brief>\n{project.requirements[:6000]}\n</brief>\n\n<slides>\n{deck_text(deck_data)}\n</slides>",
        _Defense,
        name="defense_pack",
        max_tokens=24_000,
        effort="medium",
    )
    project.defense = defense.model_dump()

    set_stage("explaining", 85)
    project.walkthrough = write_walkthrough(project)

    project.status, project.stage, project.progress = "ready", "done", 100
    db.commit()


class _Term(_Strict):
    term: str
    definition: str


class _IfAsked(_Strict):
    question: str
    answer: str


class _WalkSlide(_Strict):
    number: int
    title: str
    explanation: str
    sayItLikeThis: str
    keyTerms: list[_Term]
    ifAsked: _IfAsked


class _Walkthrough(_Strict):
    overview: str
    slides: list[_WalkSlide]
    beforeYouPresent: list[str]


def write_walkthrough(project: Project) -> dict:
    """Slide-by-slide explanation so the student understands (and can defend) everything they present."""
    walk = groq_json(
        WALKTHROUGH_SYSTEM_PROMPT,
        f"<brief>\n{project.requirements[:4000]}\n</brief>\n\n<slides>\n{deck_text(project.deck or {})}\n</slides>",
        _Walkthrough,
        name="walkthrough",
        max_tokens=8_000,
        effort="low",
    )
    return walk.model_dump()


def run_walkthrough_job(project_id: str) -> None:
    """For presentations made before walkthroughs existed: write one now, in the background."""
    db = sessionmaker(bind=get_engine(), expire_on_commit=False)()
    try:
        project = db.get(Project, project_id)
        if project is None or project.deck is None:
            return
        project.walkthrough = write_walkthrough(project)
        db.commit()
    except Exception:
        logger.exception("walkthrough job %s failed", project_id)
        db.rollback()
        project = db.get(Project, project_id)
        if project is not None:
            project.walkthrough = {"failed": True}
            db.commit()
    finally:
        db.close()


def deck_text(deck: dict) -> str:
    """The deck as readable text (for the coaching prompt and the practice examiner)."""
    lines = [f"Slide 1 (title): {deck.get('title', '')} — {deck.get('subtitle', '')}"]
    for n, s in enumerate(deck.get("slides", []), start=2):
        lines.append(f"\nSlide {n} [{s['layout']}]: {s['title']}" + (f" — {s['subtitle']}" if s.get("subtitle") else ""))
        lines += [f"- {b}" for b in s.get("bullets", [])]
        for c in s.get("columns", []):
            lines.append(f"{c['heading']}: " + "; ".join(c["bullets"]))
        lines += [f"{i}. {st['label']}: {st['detail']}" for i, st in enumerate(s.get("steps", []), start=1)]
        lines += [f"{st['value']} {st['label']}" for st in s.get("stats", [])]
        if s.get("quote"):
            lines.append(f'"{s["quote"]}"')
        if s.get("speakerNotes"):
            lines.append(f"(Notes: {s['speakerNotes']})")
    lines.append(f"\nSlide {len(deck.get('slides', [])) + 2} (closing): {deck.get('closingMessage', '')}")
    return "\n".join(lines)


def fail_interrupted_projects(db: Session) -> int:
    result = db.execute(
        update(Project)
        .where(Project.status.in_(("queued", "processing")))
        .values(status="failed", stage="failed", error_message="Interrupted by a server restart. Please create it again.")
    )
    db.commit()
    return result.rowcount or 0


# --- Reading ----------------------------------------------------------------------------------------


def get_project(db: Session, project_id: str) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise AppError("NOT_FOUND", 404, "That project doesn't exist.")
    return project


def project_summary(p: Project) -> dict:
    return {
        "projectId": p.id,
        "title": p.title,
        "course": p.course,
        "status": p.status,
        "stage": p.stage,
        "stageLabel": STAGE_LABELS.get(p.stage, p.stage),
        "progress": p.progress,
        "error": p.error_message,
        "slideCount": p.slide_count,
        "durationMinutes": p.duration_minutes,
        "sourceFilename": p.source_filename,
        "createdAt": p.created_at.isoformat() if p.created_at else None,
        "questionSetId": p.question_set_id,
    }


def project_detail(p: Project) -> dict:
    return {
        **project_summary(p),
        "deck": p.deck,
        "defense": p.defense,
        "walkthrough": p.walkthrough if p.walkthrough and not p.walkthrough.get("failed") and not p.walkthrough.get("pending") else None,
        "walkthroughStatus": "ready"
        if p.walkthrough and p.walkthrough.get("slides")
        else "failed"
        if p.walkthrough and p.walkthrough.get("failed")
        else "processing"
        if (p.walkthrough and p.walkthrough.get("pending")) or p.status in ("queued", "processing")
        else "missing",
        "downloadUrl": f"/api/projects/{p.id}/download" if p.pptx_path else None,
    }


def list_projects(db: Session) -> list[Project]:
    return list(db.scalars(select(Project).order_by(Project.created_at.desc()).limit(100)))


def pptx_file(db: Session, project_id: str) -> tuple[bytes, str]:
    project = get_project(db, project_id)
    if not project.pptx_path:
        raise AppError("NOT_READY", 409, "The presentation isn't ready yet.")
    path = get_settings().media_dir / project.pptx_path
    if not path.exists():
        raise AppError("NOT_FOUND", 404, "The presentation file is missing. Create the project again.")
    safe = "".join(ch if ch.isalnum() or ch in " -_" else "-" for ch in project.title).strip()[:80] or "presentation"
    return path.read_bytes(), f"{safe}.pptx"


def start_practice(db: Session, project_id: str) -> str:
    """Creates (once) a defense practice set from the deck and returns its ID."""
    project = get_project(db, project_id)
    if project.status != "ready" or not project.deck:
        raise AppError("NOT_READY", 409, "The presentation isn't ready yet.")
    if project.question_set_id:
        return project.question_set_id
    result = generate_question_set(db, document_id=None, text=deck_text(project.deck), title=project.title)
    project.question_set_id = result["setId"]
    db.commit()
    return project.question_set_id


def delete_project(db: Session, project_id: str) -> None:
    import shutil

    project = get_project(db, project_id)
    if project.status in ("queued", "processing"):
        raise AppError("BUSY", 409, "This project is still being made. Wait for it to finish before deleting it.")
    db.delete(project)
    db.commit()
    shutil.rmtree(get_settings().media_dir / "projects" / project_id, ignore_errors=True)
