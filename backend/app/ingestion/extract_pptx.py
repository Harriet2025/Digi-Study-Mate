"""PowerPoint text extraction with python-pptx: text boxes, tables and speaker notes, in slide order.
Footer, date and slide-number placeholders are skipped; slide titles are protected from boilerplate removal."""

import io

from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE, PP_PLACEHOLDER
from pptx.shapes.base import BaseShape

from ..errors import AppError
from .clean import CleanOptions, clean_pages
from .types import ExtractedDocument, RawLine, RawPage
from .validate import MAX_PAGES

NOISE_PLACEHOLDERS = {
    PP_PLACEHOLDER.SLIDE_NUMBER,
    PP_PLACEHOLDER.FOOTER,
    PP_PLACEHOLDER.DATE,
    PP_PLACEHOLDER.HEADER,
    PP_PLACEHOLDER.SLIDE_IMAGE,
}
TITLE_PLACEHOLDERS = {PP_PLACEHOLDER.TITLE, PP_PLACEHOLDER.CENTER_TITLE, PP_PLACEHOLDER.VERTICAL_TITLE}

# Footer placeholders are already gone. What's left is boilerplate typed into ordinary text boxes
# ("Confidential", a course code), so match exact repeats anywhere on the slide.
PPTX_CLEAN_OPTIONS = CleanOptions(
    join_wrapped_lines=False,
    page_number_edge_lines=1,
    repeat_scope="anywhere",
    fuzzy_repeat_match=False,
)


def extract_pptx(data: bytes) -> ExtractedDocument:
    try:
        presentation = Presentation(io.BytesIO(data))
    except Exception as err:  # bad zip, missing parts, not a presentation
        raise AppError(
            "CORRUPT_FILE", 422, "This PowerPoint file could not be opened. It may be damaged.", detail=repr(err)
        ) from err

    slides = list(presentation.slides)
    if not slides:
        raise AppError("NO_TEXT_CONTENT", 422, "This presentation has no slides.")
    if len(slides) > MAX_PAGES:
        raise AppError("TOO_MANY_PAGES", 413, f"This deck has {len(slides)} slides; the limit is {MAX_PAGES}.")

    raw_pages: list[RawPage] = []
    for number, slide in enumerate(slides, start=1):
        lines: list[RawLine] = []
        for shape in _iter_shapes(slide.shapes):
            lines.extend(_shape_lines(shape))

        if slide.has_notes_slide:
            notes = [p for p in slide.notes_slide.notes_text_frame.text.splitlines() if p.strip()]
            if notes:
                notes[0] = f"Speaker notes: {notes[0]}"
                lines.extend(RawLine(text, break_before=(i == 0)) for i, text in enumerate(notes))

        raw_pages.append(RawPage(number, lines))

    return ExtractedDocument("pptx", len(slides), clean_pages(raw_pages, PPTX_CLEAN_OPTIONS))


def _iter_shapes(shapes):
    """Yields shapes in document order, descending into groups."""
    for shape in shapes:
        if shape.shape_type == MSO_SHAPE_TYPE.GROUP:
            yield from _iter_shapes(shape.shapes)
        else:
            yield shape


def _shape_lines(shape: BaseShape) -> list[RawLine]:
    is_title = False
    if shape.is_placeholder:
        kind = shape.placeholder_format.type
        if kind in NOISE_PLACEHOLDERS:
            return []
        is_title = kind in TITLE_PLACEHOLDERS

    if getattr(shape, "has_table", False) and shape.has_table:
        # One line per row, cells joined with " | ".
        rows = [" | ".join(cell.text.strip() for cell in row.cells) for row in shape.table.rows]
        rows = [r for r in rows if r.replace("|", "").strip()]
        return [RawLine(text, break_before=(i == 0)) for i, text in enumerate(rows)]

    if not shape.has_text_frame:
        return []
    paragraphs = [p.text.replace("\v", " ") for p in shape.text_frame.paragraphs]
    paragraphs = [p for p in paragraphs if p.strip()]
    return [RawLine(text, break_before=(i == 0), protected=is_title) for i, text in enumerate(paragraphs)]
