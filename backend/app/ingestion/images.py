"""Photos of slides or notes: straighten, shrink, then read the text with the vision model."""

import io
from concurrent.futures import ThreadPoolExecutor

from PIL import Image, ImageOps, UnidentifiedImageError

from ..ai.groq import groq_read_image
from ..errors import AppError
from .types import ExtractedDocument, ExtractedPage

IMAGE_EXTENSIONS = ("jpg", "jpeg", "png", "webp")
MAX_IMAGE_BYTES = 15 * 1024 * 1024
MAX_IMAGES = 20
LONGEST_SIDE = 1600

READ_PROMPT = (
    "This is a photo of a university lecture slide, handout or notes page. Transcribe all the readable text "
    "exactly, in reading order, keeping headings, bullet points and numbering on separate lines. "
    "If there is a diagram, chart or table, add one line starting with 'Diagram:' that describes what it shows. "
    "Do not add commentary. If nothing is readable, reply with the single word EMPTY."
)


def is_image_name(filename: str | None) -> bool:
    return bool(filename) and filename.rsplit(".", 1)[-1].lower() in IMAGE_EXTENSIONS


def prepare_image(data: bytes) -> bytes:
    """A right-way-up JPEG no larger than LONGEST_SIDE pixels (phone photos are often sideways and huge)."""
    if len(data) > MAX_IMAGE_BYTES:
        raise AppError("FILE_TOO_LARGE", 413, "A photo is larger than 15 MB.")
    try:
        with Image.open(io.BytesIO(data)) as img:
            img = ImageOps.exif_transpose(img).convert("RGB")
            img.thumbnail((LONGEST_SIDE, LONGEST_SIDE))
            out = io.BytesIO()
            img.save(out, "JPEG", quality=85)
            return out.getvalue()
    except (UnidentifiedImageError, OSError) as err:
        raise AppError("UNSUPPORTED_FILE_TYPE", 415, "One of the files isn't a photo we can read (use JPG, PNG or WebP).") from err


def _clean(text: str) -> str:
    return "" if text.strip().upper() == "EMPTY" else text


def read_image(data: bytes) -> str:
    """Text of one photo (used for presentation resources)."""
    return _clean(groq_read_image(prepare_image(data), READ_PROMPT))


def read_images(images: list[bytes]) -> ExtractedDocument:
    """Reads up to MAX_IMAGES photos (three at a time); each photo becomes one page."""
    if not images:
        raise AppError("EMPTY_FILE", 400, "Choose at least one photo.")
    if len(images) > MAX_IMAGES:
        raise AppError("TOO_MANY_FILES", 400, f"Upload up to {MAX_IMAGES} photos at a time.")
    prepared = [prepare_image(d) for d in images]  # fail fast on a bad file before calling the AI
    with ThreadPoolExecutor(max_workers=3) as pool:
        texts = list(pool.map(lambda jpeg: groq_read_image(jpeg, READ_PROMPT), prepared))
    pages = [ExtractedPage(number=i + 1, text=_clean(t)) for i, t in enumerate(texts)]
    return ExtractedDocument(source_type="images", page_count=len(pages), pages=pages)
