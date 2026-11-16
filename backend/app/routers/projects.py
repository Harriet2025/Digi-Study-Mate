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
    start_practice,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("", status_code=202)
async def create(
    background: BackgroundTasks,
    title: str = Form(..., max_length=300),
    course: str = Form("", max_length=300),
    instructions: str = Form("", max_length=12_000),
    slideCount: int = Form(10, ge=5, le=25),
    durationMinutes: int = Form(10, ge=2, le=60),
    brief: UploadFile | None = File(None),
    db: Session = Depends(get_db),
) -> dict:
    """Upload the presentation brief (PDF/DOCX/PPTX/TXT, optional) plus instructions; the deck, presenter
    script and defense coaching are made in the background."""
    brief_text, filename = "", None
    if brief is not None and brief.filename:
        data = await brief.read(MAX_FILE_BYTES + 1)
        brief_text = await run_in_threadpool(brief_text_from_file, brief.filename, data)
        filename = brief.filename[:255]
        if not brief_text.strip() and not instructions.strip():
            raise AppError("NO_TEXT_CONTENT", 422, "No text was found in that file. Paste the requirements instead.")
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
