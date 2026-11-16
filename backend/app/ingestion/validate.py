"""Checks an uploaded file before any parsing: size, extension, MIME type and real file signature."""

import re
import unicodedata

from ..errors import AppError
from .types import SourceType, ValidatedUpload

MAX_FILE_BYTES = 25 * 1024 * 1024  # 25 MB
MAX_PAGES = 500

PDF_MIME = "application/pdf"
PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

# MIME types browsers commonly send for each format (some send nothing useful).
ACCEPTED_MIME: dict[SourceType, set[str]] = {
    "pdf": {PDF_MIME, "application/x-pdf", "application/octet-stream", ""},
    "pptx": {PPTX_MIME, "application/zip", "application/x-zip-compressed", "application/octet-stream", ""},
}

ZIP_SIGNATURE = b"PK\x03\x04"
OLE_SIGNATURE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"  # legacy .ppt and password-protected Office files


def validate_upload(filename: str | None, content_type: str | None, data: bytes) -> ValidatedUpload:
    if not data:
        raise AppError("EMPTY_FILE", 400, "The uploaded file is empty.")
    if len(data) > MAX_FILE_BYTES:
        raise AppError("FILE_TOO_LARGE", 413, f"File exceeds the {MAX_FILE_BYTES // (1024 * 1024)} MB limit.")

    name = sanitize_filename(filename or "")
    source_type = _source_type_from_name(name)
    mime = (content_type or "").split(";")[0].strip().lower()

    if mime not in ACCEPTED_MIME[source_type]:
        raise AppError(
            "UNSUPPORTED_FILE_TYPE", 415, f'File extension says {source_type.upper()} but the content type is "{mime}".'
        )

    if source_type == "pptx" and data.startswith(OLE_SIGNATURE):
        raise AppError(
            "ENCRYPTED_FILE",
            422,
            "This presentation is password-protected or in the old .ppt format. Remove the password or save it as .pptx.",
        )
    # PDFs may have a few junk bytes before the header; the spec allows it within the first 1 KB.
    is_valid = b"%PDF-" in data[:1024] if source_type == "pdf" else data.startswith(ZIP_SIGNATURE)
    if not is_valid:
        raise AppError("UNSUPPORTED_FILE_TYPE", 415, f"The file contents are not a valid {source_type.upper()} file.")

    return ValidatedUpload(
        filename=name, mime_type=PDF_MIME if source_type == "pdf" else PPTX_MIME, source_type=source_type, data=data
    )


def _source_type_from_name(name: str) -> SourceType:
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext == "pdf":
        return "pdf"
    if ext == "pptx":
        return "pptx"
    if ext == "ppt":
        raise AppError(
            "UNSUPPORTED_FILE_TYPE", 415, "Legacy .ppt files are not supported. Save the deck as .pptx and upload it again."
        )
    raise AppError("UNSUPPORTED_FILE_TYPE", 415, "Only PDF (.pdf) and PowerPoint (.pptx) files are supported.")


def sanitize_filename(raw: str) -> str:
    """Removes path components and control characters, and caps the length."""
    base = re.split(r"[\\/]", raw)[-1]
    cleaned = re.sub(r"[\x00-\x1f\x7f]", "", unicodedata.normalize("NFC", base)).strip()[:255]
    if not cleaned or cleaned in {".", ".."}:
        raise AppError("MISSING_FILE", 400, "The uploaded file has no usable filename.")
    return cleaned
