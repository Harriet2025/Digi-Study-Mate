"""Converts a script into MP3 segments saved under MEDIA_DIR, with a playback timeline."""

import io
import re
import shutil
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from mutagen.mp3 import MP3

from ..ai.script import ScriptLine
from ..config import get_settings
from ..retry import with_retry
from . import elevenlabs

TURN_GAP_SEC = 0.3  # between two different speakers
QUIZ_PAUSE_SEC = 3.0  # thinking time after a quiz question


@dataclass
class RenderedSegment:
    segment_index: int
    line_index: int
    speaker: str
    line_type: str
    text: str
    file_path: str  # relative to MEDIA_DIR
    start_sec: float
    end_sec: float
    duration_sec: float
    pause_after_sec: float


@dataclass
class _Piece:
    line_index: int
    line: ScriptLine
    text: str
    previous_text: str | None
    next_text: str | None
    is_last_of_line: bool


def episode_dir(episode_id: str) -> Path:
    return get_settings().media_dir / "episodes" / episode_id


def render_episode_audio(
    episode_id: str, script: list[ScriptLine], on_progress: Callable[[int, int], None] | None = None
) -> list[RenderedSegment]:
    """Synthesizes every piece (a few in parallel), saves MP3s, and lays them out on one timeline.
    `on_progress(done, total)` is called from this thread as pieces finish.
    If any piece fails for good, the episode folder is deleted and the error is re-raised."""
    pieces = _plan_pieces(script, elevenlabs.MAX_CHARS_PER_REQUEST)
    out_dir = episode_dir(episode_id)
    out_dir.mkdir(parents=True, exist_ok=True)

    def render(index: int, piece: _Piece) -> tuple[str, float]:
        audio = with_retry(
            lambda: elevenlabs.synthesize(
                piece.text, piece.line.speaker, previous_text=piece.previous_text, next_text=piece.next_text
            )
        )
        name = f"{index:04d}-{piece.line.speaker.lower()}.mp3"
        (out_dir / name).write_bytes(audio)
        return f"episodes/{episode_id}/{name}", _duration(audio)

    results: dict[int, tuple[str, float]] = {}
    try:
        with ThreadPoolExecutor(max_workers=get_settings().tts_concurrency) as pool:
            futures = {pool.submit(render, i, p): i for i, p in enumerate(pieces)}
            for future in as_completed(futures):
                try:
                    results[futures[future]] = future.result()
                    if on_progress:
                        on_progress(len(results), len(pieces))
                except BaseException:
                    for f in futures:
                        f.cancel()  # stop queued work; in-flight requests finish on their own
                    raise
    except BaseException:
        shutil.rmtree(out_dir, ignore_errors=True)  # don't leave half an episode on disk
        raise

    segments: list[RenderedSegment] = []
    cursor = 0.0
    for index, piece in enumerate(pieces):
        path, duration = results[index]
        next_piece = pieces[index + 1] if index + 1 < len(pieces) else None
        if next_piece is None:
            pause = 0.0
        elif piece.is_last_of_line and piece.line.type == "quiz_checkpoint":
            pause = QUIZ_PAUSE_SEC
        elif next_piece.line.speaker != piece.line.speaker:
            pause = TURN_GAP_SEC
        else:
            pause = 0.0
        segments.append(
            RenderedSegment(
                segment_index=index,
                line_index=piece.line_index,
                speaker=piece.line.speaker,
                line_type=piece.line.type,
                text=piece.text,
                file_path=path,
                start_sec=round(cursor, 3),
                end_sec=round(cursor + duration, 3),
                duration_sec=round(duration, 3),
                pause_after_sec=pause,
            )
        )
        cursor += duration + pause
    return segments


def _plan_pieces(script: list[ScriptLine], max_chars: int) -> list[_Piece]:
    pieces: list[_Piece] = []
    for line_index, line in enumerate(script):
        parts = split_text(line.text, max_chars)
        for i, text in enumerate(parts):
            pieces.append(
                _Piece(
                    line_index=line_index,
                    line=line,
                    text=text,
                    previous_text=parts[i - 1] if i > 0 else None,
                    next_text=parts[i + 1] if i + 1 < len(parts) else None,
                    is_last_of_line=i == len(parts) - 1,
                )
            )
    return pieces


def split_text(text: str, max_chars: int) -> list[str]:
    """Splits at sentence ends, then at spaces, so no piece exceeds max_chars."""
    text = text.strip()
    if len(text) <= max_chars:
        return [text]
    sentences = [s.strip() for s in re.findall(r"[^.!?…]+(?:[.!?…]+[\"')\]]*\s*|$)", text) if s.strip()]
    pieces: list[str] = []
    current = ""
    for sentence in sentences:
        if len(sentence) > max_chars:
            for word in sentence.split():
                if current and len(current) + 1 + len(word) > max_chars:
                    pieces.append(current)
                    current = ""
                current = f"{current} {word}" if current else word[:max_chars]
        elif current and len(current) + 1 + len(sentence) > max_chars:
            pieces.append(current)
            current = sentence
        else:
            current = f"{current} {sentence}" if current else sentence
    if current:
        pieces.append(current)
    return pieces


def _duration(mp3: bytes) -> float:
    """Real MP3 duration; falls back to a 128 kbps estimate if the header can't be read."""
    try:
        return float(MP3(io.BytesIO(mp3)).info.length)
    except Exception:
        return len(mp3) * 8 / 128_000


# --- Single-file download ------------------------------------------------------------------------

# A silent MPEG-1 Layer III frame matching ElevenLabs' mp3_44100_128 output: 417 bytes, 1152 samples.
_SILENT_FRAME = bytes([0xFF, 0xFB, 0x90, 0x64]) + bytes(413)
_FRAME_SEC = 1152 / 44100


def silence(seconds: float) -> bytes:
    return _SILENT_FRAME * max(0, round(seconds / _FRAME_SEC))


def _strip_id3(mp3: bytes) -> bytes:
    """Drops a leading ID3v2 tag so files can be joined into one stream."""
    if mp3[:3] == b"ID3" and len(mp3) > 10:
        size = (mp3[6] << 21) | (mp3[7] << 14) | (mp3[8] << 7) | mp3[9]
        return mp3[10 + size :]
    return mp3


def join_episode(paths_and_pauses: list[tuple[Path, float]]) -> bytes:
    """One MP3 for offline listening: every segment in order, with the timeline's pauses as silence."""
    out = bytearray()
    for path, pause in paths_and_pauses:
        out += _strip_id3(path.read_bytes())
        out += silence(pause)
    return bytes(out)
