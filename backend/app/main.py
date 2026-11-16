"""Study Mate API. Run from the backend folder:  .venv\\Scripts\\uvicorn app.main:app --reload --port 8010"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from .config import get_settings
from .db import get_engine
from .episodes.service import fail_interrupted_jobs
from .schema import ensure_schema
from .errors import AppError
from .routers import ask, defense, documents, episodes, flashcards, study

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
            failed = fail_interrupted_jobs(db)
            if failed:
                logger.warning("Marked %d interrupted lesson(s) as failed", failed)
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

for module in (documents, episodes, ask, defense, flashcards, study):
    app.include_router(module.router)

# Generated MP3s: /media/episodes/<id>/0000-alex.mp3
app.mount("/media", StaticFiles(directory=settings.media_dir), name="media")


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
