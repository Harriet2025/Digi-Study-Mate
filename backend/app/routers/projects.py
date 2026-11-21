from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Response, UploadFile
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..auth.scoping import as_current_user
from ..db import get_db
from ..errors import AppError
from ..ingestion.validate import MAX_FILE_BYTES
from ..projects.service import (
    brief_text_from_file,
    delete_project,
    get_project,
    list_projects,
    pptx_file,
    project_detail,
    project_summary,
    queue_project,
    run_project_job,
    run_walkthrough_job,
    start_practice,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])

MAX_RESOURCES = 6


@router.post("", status_code=202)
async def create(
    background: BackgroundTasks,
    title: str = Form(..., max_length=300),
    course: str = Form("", max_length=300),
    instructions: str = Form("", max_length=12_000),
    slideCount: int = Form(10, ge=5, le=25),
    durationMinutes: int = Form(10, ge=2, le=60),
    brief: UploadFile | None = File(None),
    resources: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
) -> dict:
    """A presentation from just a topic, or with your points and up to 6 files (brief, notes, articles or photos
    of slides). The deck, presenter script, defence coaching and walkthrough are made in the background."""
    files = [f for f in ([brief] if brief is not None else []) + list(resources) if f is not None and f.filename]
    if len(files) > MAX_RESOURCES:
        raise AppError("TOO_MANY_FILES", 400, f"Add up to {MAX_RESOURCES} files.")
    texts = []
    for f in files:
        data = await f.read(MAX_FILE_BYTES + 1)
        text = await run_in_threadpool(brief_text_from_file, f.filename, data)
        if text.strip():
            texts.append(f"## {f.filename}\n{text.strip()}")
    if files and not texts and not instructions.strip():
        raise AppError("NO_TEXT_CONTENT", 422, "No text was found in those files. Add your points in the box instead.")
    # Keep within the brief limit: share the space between files.
    share = max(2_000, 14_000 // max(1, len(texts)))
    brief_text = "\n\n".join(t[:share] for t in texts)
    filename = ", ".join(f.filename for f in files)[:255] or None
    project = queue_project(
        db,
        title=title,
        course=course,
        instructions=instructions,
        brief_text=brief_text,
        source_filename=filename,
        slide_count=slideCount,
        duration_minutes=durationMinutes,
    )
    background.add_task(as_current_user(run_project_job), project.id)
    return project_summary(project)


@router.post("/{project_id}/walkthrough", status_code=202)
def walkthrough(project_id: str, background: BackgroundTasks, db: Session = Depends(get_db)) -> dict:
    """Write the slide-by-slide walkthrough for a presentation that doesn't have one yet."""
    project = get_project(db, project_id)
    if project.status != "ready":
        raise AppError("NOT_READY", 409, "This presentation isn't ready yet.")
    if not (project.walkthrough and project.walkthrough.get("slides")):
        project.walkthrough = {"pending": True}
        db.commit()
        background.add_task(as_current_user(run_walkthrough_job), project.id)
    return project_detail(project)


@router.get("")
def index(db: Session = Depends(get_db)) -> list[dict]:
    return [project_summary(p) for p in list_projects(db)]


@router.get("/{project_id}")
def show(project_id: str, db: Session = Depends(get_db)) -> dict:
    return project_detail(get_project(db, project_id))


@router.get("/{project_id}/download")
def download(project_id: str, db: Session = Depends(get_db)) -> Response:
    data, filename = pptx_file(db, project_id)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{project_id}/practice")
async def practice(project_id: str, db: Session = Depends(get_db)) -> dict:
    """Create (once) an examiner practice set from the deck."""
    return {"setId": await run_in_threadpool(start_practice, db, project_id)}


@router.delete("/{project_id}", status_code=204)
def delete(project_id: str, db: Session = Depends(get_db)) -> Response:
    delete_project(db, project_id)
    return Response(status_code=204)
