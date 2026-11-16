"""ElevenLabs text-to-speech with distinct voice profiles for Alex and Sam."""

import httpx

from ..config import get_settings
from ..errors import AppError

BASE_URL = "https://api.elevenlabs.io/v1/text-to-speech"
TIMEOUT = httpx.Timeout(90.0, connect=10.0)

#: eleven_multilingual_v2 accepts 10,000 characters; stay well under so long lines split at sentences.
MAX_CHARS_PER_REQUEST = 2_500

# Lower stability = more expressive; style exaggerates the voice's character.
VOICE_SETTINGS = {
    # Warm, authoritative tutor: steadier delivery, slightly slower pace.
    "Alex": {"stability": 0.55, "similarity_boost": 0.8, "style": 0.15, "use_speaker_boost": True, "speed": 0.97},
    # Energetic, relatable student: more expressive, slightly quicker.
    "Sam": {"stability": 0.38, "similarity_boost": 0.75, "style": 0.35, "use_speaker_boost": True, "speed": 1.04},
}

PROVIDER_NAME = "elevenlabs"


def synthesize(text: str, speaker: str, *, previous_text: str | None = None, next_text: str | None = None) -> bytes:
    """Returns MP3 bytes for `text` in the speaker's voice."""
    settings = get_settings()
    if not settings.elevenlabs_api_key:
        raise AppError("CONFIGURATION_ERROR", 500, "Voices aren't set up on this server yet.", detail="ELEVENLABS_API_KEY is not set")

    voice_id = settings.elevenlabs_voice_alex if speaker == "Alex" else settings.elevenlabs_voice_sam
    try:
        response = httpx.post(
            f"{BASE_URL}/{voice_id}",
            params={"output_format": "mp3_44100_128"},
            headers={"xi-api-key": settings.elevenlabs_api_key, "accept": "audio/mpeg"},
            json={
                "text": text,
                "model_id": settings.elevenlabs_model_id,
                "voice_settings": VOICE_SETTINGS[speaker],
                # Context for smooth prosody when a long line is split into pieces.
                "previous_text": previous_text,
                "next_text": next_text,
            },
            timeout=TIMEOUT,
        )
    except httpx.HTTPError as err:
        raise AppError("TTS_FAILED", 502, "Couldn't reach the voice service.", retryable=True, detail=repr(err)) from err

    if not response.is_success:
        status = response.status_code
        retry_after = response.headers.get("retry-after")
        raise AppError(
            "TTS_FAILED",
            502,
            "The voice service couldn't generate audio. Please try again.",
            retryable=status == 429 or status >= 500,
            retry_after=float(retry_after) if retry_after and retry_after.replace(".", "", 1).isdigit() else None,
            detail=f"ElevenLabs {status}: {response.text[:300]}",
        )
    if not response.content:
        raise AppError("TTS_FAILED", 502, "The voice service returned empty audio.", retryable=True)
    return response.content
