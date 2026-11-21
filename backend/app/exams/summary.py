"""One-page revision sheets: made once per study space with AI, then rendered to an A4 PDF."""

import html
import io
import logging
import time

import pymupdf
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session, sessionmaker

from ..ai.groq import groq_json
from ..ai.script import LANGUAGES
from ..db import get_engine
from ..errors import AppError
from ..guides.service import get_guide, lesson_text
from ..models import StudyGuide
from .prompts import SUMMARY_SYSTEM_PROMPT

logger = logging.getLogger("study_mate.summary")


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _Section(_Strict):
    heading: str
    points: list[str]


class _Term(_Strict):
    term: str
    definition: str


class _QA(_Strict):
    question: str
    answer: str


class _Sheet(_Strict):
    bigIdea: str
    sections: list[_Section]
    keyTerms: list[_Term]
    rules: list[str]
    mistakes: list[str]
    quickCheck: list[_QA]


#: If a sheet has been "in progress" this long, the job died (e.g. a restart); start again.
STALE_SECONDS = 240


def summary_status(db: Session, guide_id: str) -> tuple[str, dict | None]:
    """("ready", sheet) | ("processing", None) | ("failed", {"error": ...}) | ("missing", None)."""
    guide = get_guide(db, guide_id)
    if guide.status != "ready":
        raise AppError("NOT_READY", 409, "This lesson isn't ready yet.")
    s = guide.summary or {}
    if s.get("_status") == "processing":
        if time.time() - s.get("started", 0) < STALE_SECONDS:
            return "processing", None
        return "missing", None
    if s.get("_status") == "failed":
        return "failed", {"error": s.get("error") or "The summary couldn't be written."}
    if s.get("bigIdea"):
        return "ready", _with_meta(guide)
    return "missing", None


def mark_summary_started(db: Session, guide_id: str) -> None:
    guide = get_guide(db, guide_id)
    guide.summary = {"_status": "processing", "started": time.time()}
    db.commit()


def run_summary_job(guide_id: str) -> None:
    """Writes the sheet in the background (about 20 to 45 seconds), so no request has to wait for the AI."""
    db = sessionmaker(bind=get_engine(), expire_on_commit=False)()
    try:
        guide = db.get(StudyGuide, guide_id)
        if guide is None:
            return
        guide.summary = _write_sheet(guide)
        db.commit()
    except Exception as err:
        logger.exception("summary job %s failed", guide_id)
        db.rollback()
        guide = db.get(StudyGuide, guide_id)
        if guide is not None:
            message = err.message if isinstance(err, AppError) else "The summary couldn't be written. Please try again."
            guide.summary = {"_status": "failed", "error": message[:300]}
            db.commit()
    finally:
        db.close()


def get_summary(db: Session, guide_id: str) -> dict:
    """The sheet, writing it now if needed (used by tests and the PDF when the sheet already exists)."""
    status, data = summary_status(db, guide_id)
    if status == "ready":
        return data
    guide = get_guide(db, guide_id)
    guide.summary = _write_sheet(guide)
    db.commit()
    return _with_meta(guide)


def _write_sheet(guide: StudyGuide) -> dict:
    language = LANGUAGES.get(guide.language, "English")
    sheet = groq_json(
        SUMMARY_SYSTEM_PROMPT,
        ("" if guide.language == "en" else f"Write everything in {language}.\n\n") + f"<lesson>\n{lesson_text(guide)}\n</lesson>",
        _Sheet,
        name="summary_sheet",
        max_tokens=6_000,
        effort="low",
    )
    data = sheet.model_dump()
    data["sections"] = [s for s in data["sections"] if s["heading"].strip()][:7]
    for s in data["sections"]:
        s["points"] = [p for p in s["points"] if p.strip()][:3]
    data["keyTerms"] = data["keyTerms"][:10]
    data["rules"] = data["rules"][:5]
    data["mistakes"] = data["mistakes"][:4]
    data["quickCheck"] = data["quickCheck"][:5]
    return data


def _with_meta(guide: StudyGuide) -> dict:
    pages = f"Pages {guide.page_start}–{guide.page_end}" if guide.page_start else None
    return {"guideId": guide.id, "title": guide.title, "pages": pages, **(guide.summary or {})}


# --- PDF -----------------------------------------------------------------------

_CSS = """
* { font-family: sans-serif; }
body { font-size: 8.6pt; line-height: 1.32; color: #111827; }
h2 { font-size: 9.6pt; color: #1e3a5f; margin: 7pt 0 2pt 0; text-transform: uppercase; letter-spacing: 0.5pt; }
h3 { font-size: 9pt; margin: 6pt 0 1pt 0; color: #111827; }
p { margin: 0 0 2pt 0; }
ul { margin: 0 0 2pt 0; padding-left: 10pt; }
li { margin: 0 0 1pt 0; }
.term { font-weight: bold; }
.muted { color: #4b5563; }
.box { background-color: #e7edf5; padding: 5pt; }
"""

A4 = pymupdf.paper_rect("a4")
MARGIN = 34
HEADER_H = 64
GAP = 16


def _e(text: str) -> str:
    return html.escape(text or "", quote=False)


def _body_html(sheet: dict) -> str:
    parts = [f'<div class="box"><p><b>Big idea.</b> {_e(sheet.get("bigIdea", ""))}</p></div>']
    for s in sheet.get("sections", []):
        parts.append(f"<h3>{_e(s['heading'])}</h3><ul>" + "".join(f"<li>{_e(p)}</li>" for p in s["points"]) + "</ul>")
    if sheet.get("keyTerms"):
        parts.append("<h2>Key terms</h2>" + "".join(f'<p><span class="term">{_e(t["term"])}:</span> {_e(t["definition"])}</p>' for t in sheet["keyTerms"]))
    if sheet.get("rules"):
        parts.append("<h2>Remember</h2><ul>" + "".join(f"<li>{_e(r)}</li>" for r in sheet["rules"]) + "</ul>")
    if sheet.get("mistakes"):
        parts.append("<h2>Common mistakes</h2><ul>" + "".join(f"<li>{_e(m)}</li>" for m in sheet["mistakes"]) + "</ul>")
    if sheet.get("quickCheck"):
        parts.append(
            "<h2>Quick check</h2>"
            + "".join(f'<p><b>Q.</b> {_e(q["question"])}<br/><span class="muted"><b>A.</b> {_e(q["answer"])}</span></p>' for q in sheet["quickCheck"])
        )
    return "".join(parts)


def render_summary_pdf(sheet: dict) -> bytes:
    """A4, two columns. Spills onto a second page only if the content really doesn't fit."""
    # 1. Flow the content into two columns per page.
    story = pymupdf.Story(html=_body_html(sheet), user_css=_CSS)
    col_w = (A4.width - 2 * MARGIN - GAP) / 2
    buffer = io.BytesIO()
    writer = pymupdf.DocumentWriter(buffer)
    more, page_no = True, 0
    while more:
        device = writer.begin_page(A4)
        top = MARGIN + (HEADER_H if page_no == 0 else 0)
        for col in range(2):
            x0 = MARGIN + col * (col_w + GAP)
            more, _ = story.place(pymupdf.Rect(x0, top, x0 + col_w, A4.height - MARGIN - 8))
            story.draw(device)
            if not more:
                break
        writer.end_page()
        page_no += 1
    writer.close()

    # 2. Add the header band and footer.
    doc = pymupdf.open(stream=buffer.getvalue(), filetype="pdf")
    navy = (0.118, 0.227, 0.373)
    first = doc[0]
    first.draw_rect(pymupdf.Rect(0, 0, A4.width, 6), color=None, fill=navy)
    first.insert_text((MARGIN, MARGIN + 4), "STUDY MATE  ·  REVISION SHEET", fontsize=7, color=navy)
    first.insert_htmlbox(
        pymupdf.Rect(MARGIN, MARGIN + 10, A4.width - MARGIN, MARGIN + HEADER_H - 4),
        f"<p style='font-size:15pt;font-weight:bold;margin:0'>{_e(sheet.get('title', 'Summary'))}</p>"
        + (f"<p style='font-size:8pt;color:#4b5563;margin:0'>{_e(sheet['pages'])}</p>" if sheet.get("pages") else ""),
        css="* { font-family: sans-serif; }",
    )
    for page in doc:
        page.insert_text(
            (MARGIN, A4.height - 16),
            "Made with Study Mate from your own notes. Check key facts against your lecture material.",
            fontsize=6.5,
            color=(0.45, 0.47, 0.5),
        )
    out = io.BytesIO()
    doc.save(out, garbage=3, deflate=True)
    return out.getvalue()
