"""Generated files (lesson audio, decks), served only to the user who owns them."""

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..errors import AppError
from ..models import Episode, Project

router = APIRouter(tags=["media"])

_OWNERS = {"episodes": Episode, "projects": Project}


@router.get("/media/{path:path}")
def media(path: str, db: Session = Depends(get_db)) -> FileResponse:
    """/media/episodes/<id>/0000-alex.mp3 or /media/projects/<id>/…"""
    kind, _, rest = path.partition("/")
    owner_id = rest.split("/", 1)[0]
    model = _OWNERS.get(kind)
    # db.get is filtered to the signed-in user, so other people's files look like they don't exist.
    if model is None or not owner_id or db.get(model, owner_id) is None:
        raise AppError("NOT_FOUND", 404, "That file doesn't exist.")

    root = get_settings().media_dir.resolve()
    file = (root / path).resolve()
    if not file.is_relative_to(root) or not file.is_file():
        raise AppError("NOT_FOUND", 404, "That file doesn't exist.")
    return FileResponse(file)
