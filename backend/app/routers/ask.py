import json

from fastapi import APIRouter, File, Form, UploadFile
from pydantic import BaseModel, Field, ValidationError

from ..ask.service import MAX_AUDIO_BYTES, ask
from ..errors import AppError

router = APIRouter(prefix="/api", tags=["ask"])


class AskContext(BaseModel):
    lectureTitle: str | None = Field(default=None, max_length=300)
    transcript: str = Field(default="", max_length=20_000)
    currentTimeSec: float | None = Field(default=None, ge=0)


@router.post("/ask")
def interrupt_and_ask(audio: UploadFile = File(...), context: str = Form("{}")) -> dict:
    """The "Interrupt & Ask" flow: spoken question → Whisper → Alex's answer → Alex's voice (MP3, base64)."""
    try:
        ctx = AskContext.model_validate(json.loads(context))
    except (json.JSONDecodeError, ValidationError) as err:
        raise AppError("INVALID_REQUEST", 400, "The playback context was invalid.", detail=repr(err)) from err

    data = audio.file.read(MAX_AUDIO_BYTES + 1)
    return ask(data, audio.content_type, ctx.transcript, ctx.lectureTitle)
