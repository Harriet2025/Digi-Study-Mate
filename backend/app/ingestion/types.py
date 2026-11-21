from dataclasses import dataclass, field
from typing import Literal

SourceType = Literal["pdf", "pptx", "images"]


@dataclass
class RawLine:
    """One visual line as it came out of the extractor."""

    text: str
    #: True when this line starts a new block (paragraph, text box, heading).
    break_before: bool
    #: Vertical position, larger = higher on the page. Used to find header/footer lines.
    y: float | None = None
    #: Never remove as boilerplate (e.g. slide titles).
    protected: bool = False


@dataclass
class RawPage:
    number: int
    lines: list[RawLine] = field(default_factory=list)


@dataclass
class ExtractedPage:
    """Cleaned text for one PDF page or slide. Paragraphs are separated by blank lines."""

    number: int
    text: str


@dataclass
class ExtractedDocument:
    source_type: SourceType
    page_count: int
    pages: list[ExtractedPage]


@dataclass
class TextChunk:
    index: int
    content: str
    token_count: int
    page_start: int
    page_end: int


@dataclass
class ValidatedUpload:
    filename: str
    mime_type: str
    source_type: SourceType
    data: bytes
