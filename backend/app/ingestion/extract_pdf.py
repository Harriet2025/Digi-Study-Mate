"""PDF text extraction with PyMuPDF. Its layout analysis groups lines into blocks (paragraphs),
which gives us paragraph breaks and positions for header/footer detection."""

import pymupdf

from ..errors import AppError
from .clean import CleanOptions, clean_pages
from .types import ExtractedDocument, RawLine, RawPage
from .validate import MAX_PAGES

PDF_CLEAN_OPTIONS = CleanOptions(
    join_wrapped_lines=True,
    page_number_edge_lines=2,
    repeat_scope="edges",
    repeat_edge_lines=2,
    fuzzy_repeat_match=True,
)


def extract_pdf(data: bytes) -> ExtractedDocument:
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception as err:  # PyMuPDF raises several types for damaged files
        raise AppError("CORRUPT_FILE", 422, "This PDF could not be read. It may be damaged.", detail=repr(err)) from err

    with doc:
        if doc.needs_pass:
            raise AppError("ENCRYPTED_FILE", 422, "This PDF is password-protected. Remove the password and try again.")
        if doc.page_count > MAX_PAGES:
            raise AppError("TOO_MANY_PAGES", 413, f"This PDF has {doc.page_count} pages; the limit is {MAX_PAGES}.")

        try:
            raw_pages = [RawPage(i + 1, _page_lines(page)) for i, page in enumerate(doc)]
        except Exception as err:
            raise AppError("CORRUPT_FILE", 422, "Text could not be extracted from this PDF.", detail=repr(err)) from err

        return ExtractedDocument("pdf", doc.page_count, clean_pages(raw_pages, PDF_CLEAN_OPTIONS))


def _page_lines(page: pymupdf.Page) -> list[RawLine]:
    height = page.rect.height
    lines: list[RawLine] = []
    previous_size: float | None = None

    for block in page.get_text("dict", sort=False)["blocks"]:
        if block.get("type") != 0:  # 0 = text, 1 = image
            continue
        first_in_block = True
        for line in block["lines"]:
            if abs(line["dir"][1]) > 0.5:  # vertical text is almost always margin decoration
                continue
            text = "".join(span["text"] for span in line["spans"])
            if not text.strip():
                continue
            size = max(span["size"] for span in line["spans"])
            # A font-size jump inside a block marks a heading boundary.
            size_changed = previous_size is not None and abs(size - previous_size) > previous_size * 0.15
            lines.append(
                RawLine(
                    text=text,
                    break_before=first_in_block or size_changed,
                    y=height - line["bbox"][1],  # flip so larger = higher on the page
                )
            )
            previous_size = size
            first_in_block = False
    return lines
