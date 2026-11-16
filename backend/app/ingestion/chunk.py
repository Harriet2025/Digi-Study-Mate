"""Splits page text into ~500–1000-token chunks, breaking at paragraph boundaries and section headings."""

import math
import re
from dataclasses import dataclass

from .types import ExtractedPage, TextChunk

MIN_TOKENS = 500
TARGET_TOKENS = 800
MAX_TOKENS = 1000


def estimate_tokens(text: str) -> int:
    """About 4 characters per token for English prose: good enough for sizing chunks."""
    return math.ceil(len(text) / 4)


@dataclass
class _Block:
    text: str
    page: int
    tokens: int
    is_heading: bool


def chunk_pages(
    pages: list[ExtractedPage],
    min_tokens: int = MIN_TOKENS,
    target_tokens: int = TARGET_TOKENS,
    max_tokens: int = MAX_TOKENS,
) -> list[TextChunk]:
    if not (0 < min_tokens <= target_tokens <= max_tokens):
        raise ValueError("Chunk sizes must satisfy 0 < min <= target <= max.")

    blocks = [
        _Block(text, page.number, estimate_tokens(text), _looks_like_heading(text))
        for page in pages
        for para in (p.strip() for p in re.split(r"\n{2,}", page.text))
        if para
        for text in _split_oversized(para, max_tokens)
    ]

    groups: list[list[_Block]] = []
    current: list[_Block] = []
    current_tokens = 0

    def flush() -> None:
        nonlocal current, current_tokens
        if not current:
            return
        # Don't end a chunk on a heading; move it to the start of the next chunk.
        carry: list[_Block] = []
        while len(current) > 1 and current[-1].is_heading:
            carry.insert(0, current.pop())
        groups.append(current)
        current = carry
        current_tokens = _sum_tokens(carry)

    for block in blocks:
        if current and (
            current_tokens + 1 + block.tokens > max_tokens
            or current_tokens >= target_tokens
            or (block.is_heading and current_tokens >= min_tokens)
        ):
            flush()
            if current and current_tokens + block.tokens + 1 > max_tokens:
                groups.append(current)
                current, current_tokens = [], 0
        current.append(block)
        current_tokens += (1 if len(current) > 1 else 0) + block.tokens
    if current:
        groups.append(current)

    # Merge a short final chunk into the one before it if they fit together.
    if len(groups) >= 2 and _sum_tokens(groups[-1]) < min_tokens:
        if _sum_tokens(groups[-2]) + _sum_tokens(groups[-1]) + 1 <= max_tokens:
            groups[-2].extend(groups.pop())

    chunks = []
    for index, group in enumerate(g for g in groups if g):
        content = "\n\n".join(b.text for b in group)
        chunks.append(
            TextChunk(
                index=index,
                content=content,
                token_count=estimate_tokens(content),
                page_start=min(b.page for b in group),
                page_end=max(b.page for b in group),
            )
        )
    return chunks


def _sum_tokens(blocks: list[_Block]) -> int:
    return sum(b.tokens for b in blocks) + max(0, len(blocks) - 1)


def _looks_like_heading(text: str) -> bool:
    """Short single line with no sentence-ending punctuation, e.g. "2.3 Cellular Respiration"."""
    return (
        "\n" not in text
        and len(text) <= 100
        and not re.search(r"[.,;:!?]$", text)
        and not text.startswith("- ")
        and bool(re.match(r"[A-Z0-9]", text))
    )


def _split_oversized(paragraph: str, max_tokens: int) -> list[str]:
    """Splits a paragraph bigger than max_tokens at sentence boundaries, then at word boundaries."""
    if estimate_tokens(paragraph) <= max_tokens:
        return [paragraph]
    sentences = re.split(r"(?<=[.!?])\s+(?=[\"“(\[]?[A-Z0-9])|\n", paragraph)
    pieces = [p for s in sentences for p in ([s] if estimate_tokens(s) <= max_tokens else _split_words(s, max_tokens))]

    out: list[str] = []
    buf = ""
    for piece in pieces:
        candidate = f"{buf} {piece}" if buf else piece
        if estimate_tokens(candidate) > max_tokens and buf:
            out.append(buf)
            buf = piece
        else:
            buf = candidate
    if buf:
        out.append(buf)
    return out


def _split_words(text: str, max_tokens: int) -> list[str]:
    max_chars = max_tokens * 4
    out: list[str] = []
    buf = ""
    for word in text.split():
        # A single "word" longer than the limit (e.g. a base64 blob) is cut outright.
        for start in range(0, len(word), max_chars):
            part = word[start : start + max_chars]
            candidate = f"{buf} {part}" if buf else part
            if len(candidate) > max_chars and buf:
                out.append(buf)
                buf = part
            else:
                buf = candidate
    if buf:
        out.append(buf)
    return out
