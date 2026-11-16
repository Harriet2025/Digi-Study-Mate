"""Turns raw extracted lines into clean page text: removes page numbers, running headers/footers and
boilerplate, fixes glyph artifacts, and rebuilds paragraphs."""

import math
import re
import unicodedata
from dataclasses import dataclass, replace
from typing import Literal

from .types import ExtractedPage, RawLine, RawPage

LIGATURES = {"ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st"}

# Bullet glyphs, including Private Use Area code points that Symbol/Wingdings fonts emit in PDFs.
BULLET_PREFIX = re.compile(
    "^[•‣⁃∙·▪▫■□●○◦►▶➢➔✓✔"
    "]\\s*"
)

PAGE_NUMBER_PATTERNS = [
    re.compile(r"^(page|pg\.?|p\.|slide)?\s*\d{1,4}(\s*(of|/)\s*\d{1,4})?$", re.I),  # "12", "Page 3", "3 of 10"
    re.compile(r"^[-–—]\s*\d{1,4}\s*[-–—]$"),  # "- 3 -"
    re.compile(r"^[(\[]\s*\d{1,4}\s*[)\]]$"),  # "(3)", "[3]"
    re.compile(r"^(x{1,3}|x{0,3}(ix|iv|v?i{1,3}|v))$", re.I),  # roman numerals up to xxxix
]

LIST_ITEM = re.compile(r"^(-\s|\d{1,3}[.)]\s|[a-z][.)]\s|\([a-z0-9]{1,3}\)\s)", re.I)


@dataclass
class CleanOptions:
    #: Join soft-wrapped lines back into paragraphs (PDF). Off for slides, where each line is a bullet.
    join_wrapped_lines: bool
    #: Lines at the top and bottom of each page checked for page numbers.
    page_number_edge_lines: int
    #: Where to look for boilerplate repeated across pages.
    repeat_scope: Literal["edges", "anywhere"]
    #: Lines at the top/bottom checked for repeats when repeat_scope == "edges".
    repeat_edge_lines: int = 2
    #: True: lines differing only in digits match ("p. 12" / "p. 13"), and must sit at the same height.
    #: False: only exact repeats count.
    fuzzy_repeat_match: bool = True


def normalize_line(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    text = "".join(LIGATURES.get(ch, ch) for ch in text)
    text = re.sub("[  -   　]", " ", text)  # exotic spaces
    text = re.sub("[­​-‏⁠﻿]", "", text)  # soft hyphen, zero-width chars
    text = re.sub(r"[\x00-\x08\x0b-\x1f\x7f-\x9f]", "", text)  # control chars
    text = text.replace("\t", " ").strip()
    text = BULLET_PREFIX.sub("- ", text)
    text = re.sub("[-]", "", text)  # leftover private-use glyphs (icon fonts)
    text = re.sub(r"\s*(?:\.\s?){4,}\s*(\d{1,4})$", r" \1", text)  # table-of-contents dot leaders
    return re.sub(r"\s{2,}", " ", text).strip()


def is_decorative(line: str) -> bool:
    """Lines made only of punctuation or rules ("------", "_____", "* * *")."""
    return bool(re.fullmatch(r"[\s\-_=.·*~|•–—]+", line))


def is_page_number(line: str) -> bool:
    t = line.strip()
    return 0 < len(t) <= 20 and any(p.match(t) for p in PAGE_NUMBER_PATTERNS)


def _repeat_key(line: RawLine, fuzzy: bool) -> str:
    text = re.sub(r"\s+", " ", line.text.lower()).strip()
    if not fuzzy:
        return text
    position = f"@{round(line.y / 8)}" if line.y is not None else ""
    return re.sub(r"\d+", "#", text) + position


def _edge_indices(lines: list[RawLine], n: int) -> set[int]:
    order = list(range(len(lines)))
    if lines and all(line.y is not None for line in lines):
        order.sort(key=lambda i: -lines[i].y)  # type: ignore[operator]
    return set(order[:n]) | set(order[-n:] if n else [])


def clean_pages(raw_pages: list[RawPage], options: CleanOptions) -> list[ExtractedPage]:
    # 1. Normalize; carry a dropped line's paragraph break over to the next line.
    pages: list[RawPage] = []
    for page in raw_pages:
        kept: list[RawLine] = []
        pending_break = False
        for line in page.lines:
            text = normalize_line(line.text)
            if not text or is_decorative(text):
                pending_break = pending_break or line.break_before
                continue
            kept.append(replace(line, text=text, break_before=line.break_before or pending_break))
            pending_break = False
        pages.append(RawPage(page.number, kept))

    # 2. Count on how many pages each candidate line appears.
    fuzzy = options.fuzzy_repeat_match
    repeat_candidates = [
        set(range(len(p.lines))) if options.repeat_scope == "anywhere" else _edge_indices(p.lines, options.repeat_edge_lines)
        for p in pages
    ]
    page_number_candidates = [_edge_indices(p.lines, options.page_number_edge_lines) for p in pages]

    frequency: dict[str, int] = {}
    for page, candidates in zip(pages, repeat_candidates):
        for key in {_repeat_key(page.lines[i], fuzzy) for i in candidates}:
            frequency[key] = frequency.get(key, 0) + 1

    # Boilerplate = appears on at least 3 pages and at least 40% of all pages.
    min_repeats = max(3, math.ceil(len(pages) * 0.4))

    result: list[ExtractedPage] = []
    for p, page in enumerate(pages):
        kept = []
        pending_break = False
        for i, line in enumerate(page.lines):
            boilerplate = not line.protected and (
                (i in page_number_candidates[p] and is_page_number(line.text))
                or (i in repeat_candidates[p] and frequency.get(_repeat_key(line, fuzzy), 0) >= min_repeats)
            )
            if boilerplate:
                pending_break = pending_break or line.break_before
                continue
            kept.append(replace(line, break_before=line.break_before or pending_break))
            pending_break = False

        # 3. Group lines into paragraphs.
        paragraphs: list[list[str]] = []
        for line in kept:
            if not paragraphs or line.break_before:
                paragraphs.append([line.text])
            else:
                paragraphs[-1].append(line.text)

        texts = [_join_wrapped(lines) if options.join_wrapped_lines else "\n".join(lines) for lines in paragraphs]
        result.append(ExtractedPage(page.number, "\n\n".join(t for t in texts if t)))
    return result


def _join_wrapped(lines: list[str]) -> str:
    """Re-joins lines a PDF wrapped mid-sentence, keeping list items on their own lines and undoing hyphenation."""
    out = ""
    for line in lines:
        if not out:
            out = line
        elif LIST_ITEM.match(line):
            out += "\n" + line
        elif re.search(r"[a-z]-$", out) and re.match(r"[a-z]", line):
            out = out[:-1] + line  # "infor-" + "mation"
        else:
            out += " " + line
    return out
