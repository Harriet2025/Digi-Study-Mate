"""Builds a designed 16:9 PowerPoint deck from the generated slide content (python-pptx, no template file).

Warm editorial look: cream background, charcoal text, terracotta accents, Georgia headings.
Layouts: title, section, bullets, two_column, process, stats, timeline, quote, closing.
Every slide gets the presenter's speaker notes.
"""

from io import BytesIO

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt

PAPER = RGBColor(0xF7, 0xF8, 0xFA)
MUTED = RGBColor(0xF0, 0xF2, 0xF5)
LINE = RGBColor(0xE2, 0xE5, 0xEA)
ACCENT = RGBColor(0x1E, 0x3A, 0x5F)
ACCENT_SOFT = RGBColor(0xE7, 0xED, 0xF5)
INK = RGBColor(0x11, 0x18, 0x27)
SUBTLE = RGBColor(0x4B, 0x55, 0x63)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

HEADING_FONT = "Georgia"
BODY_FONT = "Calibri"

W, H = Inches(13.333), Inches(7.5)
MARGIN = Inches(0.8)


def build_deck(deck: dict, *, course: str | None, presenter_note: str | None = None) -> bytes:
    prs = Presentation()
    prs.slide_width, prs.slide_height = W, H
    blank = prs.slide_layouts[6]

    slides = deck.get("slides", [])
    total = len(slides) + 2

    _title_slide(prs.slides.add_slide(blank), deck.get("title", ""), deck.get("subtitle", ""), course, deck.get("titleNotes", ""))
    for number, spec in enumerate(slides, start=2):
        slide = prs.slides.add_slide(blank)
        layout = spec.get("layout", "bullets")
        builder = LAYOUTS.get(layout, _bullets)
        if layout == "section":
            builder(slide, spec)
        else:
            _background(slide, PAPER)
            _header(slide, spec.get("title", ""), course)
            builder(slide, spec)
            _footer(slide, number, total)
        _notes(slide, spec.get("speakerNotes", ""))
    _closing_slide(prs.slides.add_slide(blank), deck.get("closingMessage", ""), deck.get("closingNotes", ""))

    out = BytesIO()
    prs.save(out)
    return out.getvalue()


# --- Shared pieces ----------------------------------------------------------------------------------


def _background(slide, color: RGBColor) -> None:
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = color


def _box(slide, left, top, width, height, color: RGBColor, shape=MSO_SHAPE.RECTANGLE, line: RGBColor | None = None):
    s = slide.shapes.add_shape(shape, left, top, width, height)
    s.fill.solid()
    s.fill.fore_color.rgb = color
    if line is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = line
        s.line.width = Pt(1)
    s.shadow.inherit = False
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        s.adjustments[0] = 0.08
    return s


def _text(
    slide,
    left,
    top,
    width,
    height,
    text: str,
    *,
    size: int = 18,
    color: RGBColor = INK,
    font: str = BODY_FONT,
    bold: bool = False,
    italic: bool = False,
    align=PP_ALIGN.LEFT,
    anchor=MSO_ANCHOR.TOP,
):
    tb = slide.shapes.add_textbox(left, top, width, height)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = Inches(0.05)
    for i, line in enumerate(text.split("\n")):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        run = p.add_run()
        run.text = line
        f = run.font
        f.size, f.name, f.bold, f.italic = Pt(size), font, bold, italic
        f.color.rgb = color
    return tb


def _bullet_list(slide, left, top, width, height, items: list[str], *, size: int, color: RGBColor = INK, marker=ACCENT):
    tb = slide.shapes.add_textbox(left, top, width, height)
    tf = tb.text_frame
    tf.word_wrap = True
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(size * 0.6)
        bullet = p.add_run()
        bullet.text = "●  "
        bullet.font.size, bullet.font.color.rgb, bullet.font.name = Pt(size * 0.6), marker, BODY_FONT
        run = p.add_run()
        run.text = item
        run.font.size, run.font.color.rgb, run.font.name = Pt(size), color, BODY_FONT
    return tb


def _fit(items: list[str], base: int, *, roomy: int = 4) -> int:
    """Smaller text for longer lists so it stays on the slide."""
    chars = sum(len(i) for i in items)
    if len(items) <= roomy and chars < 260:
        return base
    if chars < 420:
        return base - 2
    return base - 4


def _header(slide, title: str, course: str | None) -> None:
    _box(slide, 0, 0, Inches(0.22), H, ACCENT)  # spine
    if course:
        _text(slide, MARGIN, Inches(0.45), Inches(9), Inches(0.35), course.upper(), size=11, color=ACCENT, bold=True)
    _text(slide, MARGIN, Inches(0.75), W - 2 * MARGIN, Inches(1.0), title, size=32, font=HEADING_FONT, bold=True)


def _footer(slide, number: int, total: int) -> None:
    _text(
        slide, W - Inches(2.3), H - Inches(0.6), Inches(1.6), Inches(0.35), f"{number} / {total}", size=11, color=SUBTLE, align=PP_ALIGN.RIGHT
    )


def _notes(slide, notes: str) -> None:
    if notes:
        slide.notes_slide.notes_text_frame.text = notes


BODY_TOP = Inches(2.05)
BODY_HEIGHT = H - BODY_TOP - Inches(0.9)


# --- Layouts ---------------------------------------------------------------------------------------


def _title_slide(slide, title: str, subtitle: str, course: str | None, notes: str) -> None:
    _background(slide, INK)
    _box(slide, MARGIN, Inches(2.2), Inches(1.2), Inches(0.12), ACCENT)
    if course:
        _text(slide, MARGIN, Inches(1.5), Inches(10), Inches(0.5), course.upper(), size=14, color=ACCENT_SOFT, bold=True)
    _text(slide, MARGIN, Inches(2.6), W - 2 * MARGIN, Inches(2.2), title, size=46, font=HEADING_FONT, bold=True, color=PAPER)
    if subtitle:
        _text(slide, MARGIN, Inches(4.9), W - 2 * MARGIN, Inches(1.2), subtitle, size=22, color=LINE)
    _box(slide, W - Inches(3.2), H - Inches(2.6), Inches(2.4), Inches(2.4), ACCENT, shape=MSO_SHAPE.OVAL)
    _notes(slide, notes)


def _section(slide, spec: dict) -> None:
    _background(slide, ACCENT)
    _text(slide, MARGIN, Inches(2.4), W - 2 * MARGIN, Inches(1.6), spec.get("title", ""), size=44, font=HEADING_FONT, bold=True, color=WHITE)
    if spec.get("subtitle"):
        _text(slide, MARGIN, Inches(4.1), W - 2 * MARGIN, Inches(1.2), spec["subtitle"], size=22, color=PAPER)


def _bullets(slide, spec: dict) -> None:
    items = [b for b in spec.get("bullets", []) if b.strip()][:7]
    if spec.get("subtitle"):
        _text(slide, MARGIN, Inches(1.6), W - 2 * MARGIN, Inches(0.5), spec["subtitle"], size=18, color=SUBTLE, italic=True)
    _bullet_list(slide, MARGIN, BODY_TOP + Inches(0.15), Inches(11.2), BODY_HEIGHT, items, size=_fit(items, 22))


def _two_column(slide, spec: dict) -> None:
    columns = (spec.get("columns") or [])[:2]
    if len(columns) < 2:
        return _bullets(slide, spec)
    col_w = (W - 2 * MARGIN - Inches(0.4)) / 2
    for i, col in enumerate(columns):
        left = MARGIN + i * (col_w + Inches(0.4))
        _box(slide, left, BODY_TOP, col_w, BODY_HEIGHT, MUTED if i == 0 else ACCENT_SOFT, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
        _text(slide, left + Inches(0.35), BODY_TOP + Inches(0.3), col_w - Inches(0.7), Inches(0.6), col.get("heading", ""), size=22, font=HEADING_FONT, bold=True)
        items = [b for b in col.get("bullets", []) if b.strip()][:6]
        _bullet_list(slide, left + Inches(0.35), BODY_TOP + Inches(1.05), col_w - Inches(0.7), BODY_HEIGHT - Inches(1.3), items, size=_fit(items, 18, roomy=3))


def _process(slide, spec: dict) -> None:
    steps = (spec.get("steps") or [])[:5]
    if not steps:
        return _bullets(slide, spec)
    gap = Inches(0.35)
    box_w = (W - 2 * MARGIN - gap * (len(steps) - 1)) / len(steps)
    top = BODY_TOP + Inches(0.4)
    for i, step in enumerate(steps):
        left = MARGIN + i * (box_w + gap)
        _box(slide, left, top, box_w, Inches(3.6), MUTED, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
        circle = _box(slide, left + Inches(0.3), top + Inches(0.3), Inches(0.7), Inches(0.7), ACCENT, shape=MSO_SHAPE.OVAL)
        tf = circle.text_frame
        tf.text = str(i + 1)
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        p.runs[0].font.size, p.runs[0].font.bold, p.runs[0].font.color.rgb = Pt(20), True, WHITE
        tf.vertical_anchor = MSO_ANCHOR.MIDDLE
        _text(slide, left + Inches(0.3), top + Inches(1.2), box_w - Inches(0.5), Inches(0.9), step.get("label", ""), size=18, font=HEADING_FONT, bold=True)
        _text(slide, left + Inches(0.3), top + Inches(2.05), box_w - Inches(0.5), Inches(1.5), step.get("detail", ""), size=14, color=SUBTLE)
        if i < len(steps) - 1:
            arrow = slide.shapes.add_connector(
                MSO_CONNECTOR.STRAIGHT, left + box_w + Emu(20000), top + Inches(1.8), left + box_w + gap - Emu(20000), top + Inches(1.8)
            )
            arrow.line.color.rgb, arrow.line.width = ACCENT, Pt(2.5)


def _stats(slide, spec: dict) -> None:
    stats = (spec.get("stats") or [])[:4]
    if not stats:
        return _bullets(slide, spec)
    gap = Inches(0.35)
    card_w = (W - 2 * MARGIN - gap * (len(stats) - 1)) / len(stats)
    for i, stat in enumerate(stats):
        left = MARGIN + i * (card_w + gap)
        _box(slide, left, BODY_TOP + Inches(0.4), card_w, Inches(3.2), MUTED, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
        _text(slide, left + Inches(0.3), BODY_TOP + Inches(0.8), card_w - Inches(0.6), Inches(1.3), stat.get("value", ""), size=44, font=HEADING_FONT, bold=True, color=ACCENT)
        _text(slide, left + Inches(0.3), BODY_TOP + Inches(2.2), card_w - Inches(0.6), Inches(1.3), stat.get("label", ""), size=16, color=INK)
    if spec.get("bullets"):
        _text(slide, MARGIN, BODY_TOP + Inches(3.9), W - 2 * MARGIN, Inches(0.8), " · ".join(spec["bullets"][:3]), size=14, color=SUBTLE)


def _timeline(slide, spec: dict) -> None:
    steps = (spec.get("steps") or [])[:6]
    if not steps:
        return _bullets(slide, spec)
    line_y = BODY_TOP + Inches(1.6)
    _box(slide, MARGIN, line_y, W - 2 * MARGIN, Inches(0.06), LINE)
    span = (W - 2 * MARGIN) / len(steps)
    for i, step in enumerate(steps):
        center = MARGIN + span * i + span / 2
        _box(slide, center - Inches(0.22), line_y - Inches(0.19), Inches(0.44), Inches(0.44), ACCENT, shape=MSO_SHAPE.OVAL)
        _text(slide, center - span / 2 + Inches(0.1), line_y - Inches(1.1), span - Inches(0.2), Inches(0.8), step.get("label", ""), size=16, font=HEADING_FONT, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.BOTTOM)
        _text(slide, center - span / 2 + Inches(0.1), line_y + Inches(0.5), span - Inches(0.2), Inches(2), step.get("detail", ""), size=13, color=SUBTLE, align=PP_ALIGN.CENTER)


def _quote(slide, spec: dict) -> None:
    _text(slide, MARGIN, BODY_TOP - Inches(0.2), Inches(1), Inches(1.2), "“", size=96, font=HEADING_FONT, color=ACCENT)
    _text(slide, MARGIN + Inches(1), BODY_TOP + Inches(0.3), Inches(10.4), Inches(2.6), spec.get("quote", "") or " ".join(spec.get("bullets", [])), size=28, font=HEADING_FONT, italic=True)
    if spec.get("subtitle"):
        _text(slide, MARGIN + Inches(1), BODY_TOP + Inches(3.1), Inches(10), Inches(0.6), f"— {spec['subtitle']}", size=16, color=SUBTLE)


def _closing_slide(slide, message: str, notes: str) -> None:
    _background(slide, INK)
    _text(slide, MARGIN, Inches(2.3), W - 2 * MARGIN, Inches(1.4), "Thank you", size=54, font=HEADING_FONT, bold=True, color=PAPER)
    _box(slide, MARGIN, Inches(3.75), Inches(1.2), Inches(0.12), ACCENT)
    _text(slide, MARGIN, Inches(4.1), W - 2 * MARGIN, Inches(1.2), message or "Questions and discussion", size=24, color=LINE)
    _notes(slide, notes)


LAYOUTS = {
    "section": _section,
    "bullets": _bullets,
    "two_column": _two_column,
    "process": _process,
    "stats": _stats,
    "timeline": _timeline,
    "quote": _quote,
}
