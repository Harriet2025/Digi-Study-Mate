"""Study Mate API. Run from the backend folder:  .venv\\Scripts\\uvicorn app.main:app --reload --port 8010"""

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from .auth.deps import members_only, require_user
from .auth.service import delete_old_guests
from .config import get_settings
from .db import get_engine
from .episodes.service import fail_interrupted_jobs
from .guides.service import fail_interrupted_guides
from .projects.service import fail_interrupted_projects
from .exams.service import fail_interrupted_exams
from .schema import ensure_schema
from .errors import AppError
from .routers import ask, auth, defense, documents, episodes, exams, flashcards, guides, media, projects, social, study

logger = logging.getLogger("study_mate")

settings = get_settings()
settings.media_dir.mkdir(parents=True, exist_ok=True)



@asynccontextmanager
async def lifespan(_: FastAPI):
    """Bring the database up to date and clean up lessons interrupted by a restart."""
    try:
        ensure_schema(get_engine())
        from sqlalchemy.orm import Session

        with Session(get_engine()) as db:
            failed = fail_interrupted_jobs(db) + fail_interrupted_guides(db) + fail_interrupted_projects(db) + fail_interrupted_exams(db)
            if failed:
                logger.warning("Marked %d interrupted lesson(s) as failed", failed)
            removed = delete_old_guests(db)
            if removed:
                logger.info("Removed %d expired guest trial(s)", removed)
    except SQLAlchemyError as err:
        logger.error("Database not ready at startup: %s", err)
    yield


app = FastAPI(title="Study Mate API", version="1.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

app.include_router(auth.router)

# Everything else needs a signed-in user, and only ever sees that user's data (see auth/scoping.py).
# Guests (free trial) can upload once and study it; the library, progress, audio, projects and defence practice need an account.
for module in (documents, guides, flashcards, media):
    app.include_router(module.router, dependencies=[Depends(require_user)])
for module in (study, episodes, projects, ask, defense, exams, social):
    app.include_router(module.router, dependencies=[Depends(require_user), Depends(members_only)])


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


@app.exception_handler(AppError)
async def app_error_handler(_: Request, err: AppError) -> JSONResponse:
    if err.status >= 500:
        logger.error("%s", err)
    return _error(err.status, err.code, err.message)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, err: RequestValidationError) -> JSONResponse:
    first = err.errors()[0] if err.errors() else {}
    field = ".".join(str(p) for p in first.get("loc", [])[1:])
    message = first.get("msg", "Invalid request.")
    return _error(400, "INVALID_REQUEST", f"{field}: {message}" if field else message)


@app.exception_handler(SQLAlchemyError)
async def database_error_handler(_: Request, err: SQLAlchemyError) -> JSONResponse:
    logger.exception("database error", exc_info=err)
    return _error(503, "DATABASE_UNAVAILABLE", "The database isn't reachable right now. Please try again shortly.")


@app.exception_handler(Exception)
async def unexpected_error_handler(_: Request, err: Exception) -> JSONResponse:
    logger.exception("unexpected error", exc_info=err)
    return _error(500, "INTERNAL_ERROR", "Something went wrong. Please try again.")


@app.get("/api/health")
def health() -> dict:
    """Checks the API and the MySQL connection."""
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
        database = "ok"
    except SQLAlchemyError as err:
        database = f"unavailable: {type(err).__name__}"
    return {"status": "ok" if database == "ok" else "degraded", "database": database}
