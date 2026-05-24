"""Template-driven .docx proposal generator.

A ProposalTemplate holds an ordered list of sections. Each section has a kind
(header, client_info, text, scope, line_items, commercial, why_us, signature,
page_break) plus a per-kind config dict. This module renders each section
into a python-docx document, with {{variable}} substitution on text bodies.

Pipeline:  Opportunity + Template  →  .docx file on disk.

No internet, no APIs, no AI — entirely local. Users edit templates in the UI.
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor, Cm
from sqlalchemy.orm import Session

from .db import ITEM_IMAGES_DIR, LOGOS_DIR, OPP_ATTACHMENTS_DIR, OPP_HEROES_DIR, TEMPLATE_HEROES_DIR
from .models import Item, Proposal, ProposalTemplate


GREY_600 = RGBColor(0x6B, 0x72, 0x80)


# --------------------------------------------------------------------- utils
def next_ref(db: Session) -> str:
    year = datetime.utcnow().year
    count = db.query(Proposal).count() + 1
    return f"AMBS-{year}-{count:04d}"


def _money(v: float) -> str:
    return f"R {v:,.2f}"


def _hex(h: str) -> RGBColor:
    h = (h or "#2563B0").lstrip("#")
    if len(h) != 6:
        h = "2563B0"
    return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def _build_context(opp, ref: str) -> dict:
    lines = sorted(opp.lines, key=lambda x: x.sequence)
    mandatory = [ln for ln in lines if not ln.is_optional]
    optional = [ln for ln in lines if ln.is_optional]
    subtotal = sum(ln.line_total for ln in mandatory)
    optional_total = sum(ln.line_total for ln in optional)
    total_area = sum(ln.quantity for ln in mandatory if ln.unit_of_measure == "m²")
    deposit_pct = float(opp.deposit_pct or 0.0)
    deposit_amount = subtotal * deposit_pct / 100.0
    return {
        "client": {
            "name": opp.client.name or "",
            "industry": opp.client.industry or "",
            "contact_person": opp.client.contact_person or "",
            "email": opp.client.email or "",
            "phone": opp.client.phone or "",
            "site_location": opp.client.site_location or "",
        },
        "opportunity": {
            "title": opp.title or "",
            "delivery_weeks": opp.delivery_weeks or 0,
            "priority": opp.priority or 0,
            "notes": opp.notes or "",
            "salesperson": opp.salesperson or "",
            "valid_until": opp.valid_until.strftime("%d %B %Y") if opp.valid_until else "",
            "deposit_pct": deposit_pct,
        },
        "ref": ref,
        "date": datetime.utcnow().strftime("%d %B %Y"),
        "amount": _money(subtotal),
        "subtotal": _money(subtotal),
        "optional_total": _money(optional_total),
        "deposit_amount": _money(deposit_amount),
        "total_area_m2": f"{total_area:,.0f}",
        "n_items": str(len(mandatory)),
        "n_optional": str(len(optional)),
    }


_VAR_RE = re.compile(r"\{\{\s*([a-zA-Z_][\w\.]*)\s*\}\}")


def _substitute(text: str, ctx: dict) -> str:
    def resolve(path: str) -> str:
        cur: object = ctx
        for part in path.split("."):
            if isinstance(cur, dict) and part in cur:
                cur = cur[part]
            else:
                return "{{" + path + "}}"
        return str(cur)
    return _VAR_RE.sub(lambda m: resolve(m.group(1)), text or "")


# --------------------------------------------------------------------- blocks
def _add_heading(doc, text: str, size: int, color: RGBColor):
    """Section heading paragraph styled as Word's Heading 1.

    Applying the built-in "Heading 1" style is what makes Word's TOC field
    discover the paragraph. Visual styling (size, colour, bold) is overridden
    at the run level so the AMBS aesthetic survives the style assignment.
    """
    p = doc.add_paragraph(style="Heading 1")
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(text)
    r.bold = True
    r.font.size = Pt(size)
    r.font.color.rgb = color


def _add_para(doc, text: str, size: int = 10, bold: bool = False):
    p = doc.add_paragraph()
    r = p.add_run(text)
    r.font.size = Pt(size)
    r.bold = bold


def _add_small(doc, text: str):
    p = doc.add_paragraph()
    r = p.add_run(text)
    r.font.size = Pt(9)
    r.font.color.rgb = GREY_600


def _kv_table(doc, rows: list[tuple[str, str]], accent: RGBColor):
    table = doc.add_table(rows=len(rows), cols=2)
    table.autofit = True
    for i, (k, v) in enumerate(rows):
        c0, c1 = table.cell(i, 0), table.cell(i, 1)
        c0.width = Cm(5); c1.width = Cm(11)
        c0.paragraphs[0].clear(); c1.paragraphs[0].clear()
        r0 = c0.paragraphs[0].add_run(k); r0.bold = True; r0.font.size = Pt(10); r0.font.color.rgb = accent
        r1 = c1.paragraphs[0].add_run(v); r1.font.size = Pt(10)


def _render_header(doc, section, template: ProposalTemplate, ctx: dict, primary: RGBColor, accent: RGBColor):
    cfg = section.get("config", {})

    # Logo (if set and file exists)
    logo_path = None
    if template.logo_filename:
        candidate = LOGOS_DIR / template.logo_filename
        if candidate.exists():
            logo_path = candidate

    if logo_path:
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        run = p.add_run()
        try:
            run.add_picture(str(logo_path), width=Cm(4.5))
        except Exception:
            pass  # If the image can't be read, skip silently.

    p = doc.add_paragraph()
    r = p.add_run(template.brand_company_name or "AMBS")
    r.bold = True; r.font.size = Pt(22); r.font.color.rgb = accent
    if template.brand_tagline:
        r2 = p.add_run(f"   {template.brand_tagline}")
        r2.font.size = Pt(11); r2.font.color.rgb = GREY_600
    if template.brand_address_line:
        _add_small(doc, template.brand_address_line)
    if template.brand_contact_line:
        _add_small(doc, template.brand_contact_line)
    doc.add_paragraph()
    title = cfg.get("title", "PROJECT PROPOSAL")
    p = doc.add_paragraph()
    r = p.add_run(_substitute(title, ctx))
    r.bold = True; r.font.size = Pt(18); r.font.color.rgb = primary
    if cfg.get("show_reference", True):
        _add_small(doc, f"Reference: {ctx['ref']}   ·   Issued: {ctx['date']}")
    doc.add_paragraph()


def _render_client_info(doc, section, ctx, accent):
    cfg = section.get("config", {})
    _add_heading(doc, cfg.get("heading", "Prepared For"), 12, accent)
    c = ctx["client"]
    _kv_table(doc, [
        ("Client", c["name"] or "—"),
        ("Industry", c["industry"] or "—"),
        ("Contact", c["contact_person"] or "—"),
        ("Email", c["email"] or "—"),
        ("Phone", c["phone"] or "—"),
        ("Site Location", c["site_location"] or "—"),
    ], accent)
    doc.add_paragraph()


def _paste(opp, key: str) -> str:
    """Return the per-section paste-back body for `key`, or empty string.

    Reads `Opportunity.section_drafts_json`, a JSON object whose keys are the
    `paste_key` of each section in the template and whose values are the body
    the user pasted from ChatGPT (or that came back from /api/sections/draft).
    Non-empty values win over the template's static `config.body` at render
    time. Defensively swallows malformed JSON so a single bad entry doesn't
    break the rest of the proposal.
    """
    if not key or opp is None:
        return ""
    try:
        drafts = json.loads(getattr(opp, "section_drafts_json", "") or "{}")
    except (ValueError, TypeError):
        drafts = {}
    if not isinstance(drafts, dict):
        return ""
    val = drafts.get(key)
    return val.strip() if isinstance(val, str) else ""


def _render_text(doc, section, opp, ctx, accent):
    cfg = section.get("config", {})
    heading = cfg.get("heading", "")
    if heading:
        _add_heading(doc, _substitute(heading, ctx), 12, accent)
    body = _paste(opp, cfg.get("paste_key", "")) or cfg.get("body", "")
    # Treat blank lines as paragraph breaks; collapse single newlines into a single paragraph block.
    for para in (body or "").split("\n"):
        _add_para(doc, _substitute(para, ctx), size=10)
    doc.add_paragraph()


def _render_scope(doc, section, opp, ctx, accent):
    cfg = section.get("config", {})
    _add_heading(doc, cfg.get("heading", "Scope of Work"), 12, accent)
    lines = sorted(opp.lines, key=lambda x: x.sequence)
    if cfg.get("auto_include_lines", True):
        product_lines = []
        seen = set()
        for ln in lines:
            if ln.product_line and ln.product_line not in seen:
                product_lines.append(ln.product_line); seen.add(ln.product_line)
        for pl in product_lines:
            p = doc.add_paragraph(style="List Bullet")
            r = p.add_run(pl); r.font.size = Pt(10); r.bold = True
            for ln in lines:
                if ln.product_line == pl and ln.description:
                    p2 = doc.add_paragraph(style="List Bullet 2")
                    qty = f"{ln.quantity:,.2f}".rstrip("0").rstrip(".")
                    r2 = p2.add_run(f"{ln.description} ({qty} {ln.unit_of_measure})")
                    r2.font.size = Pt(10)
    for item in cfg.get("items", []):
        if not item: continue
        p = doc.add_paragraph(style="List Bullet")
        r = p.add_run(_substitute(item, ctx)); r.font.size = Pt(10)
    doc.add_paragraph()


def _render_line_items_table(doc, lines, accent, subtotal_label: str, item_images: dict[str, Path] | None = None):
    """Helper: render a line-item table with a discount column and a subtotal row.

    Lines sharing a ``bundle_label`` (set when applying an Opportunity Template
    in the New Opportunity drawer) render under a merged sub-heading row so the
    client sees each module as a self-contained bundle while the headline
    subtotal stays combined. When ``item_images`` maps an item code to an
    on-disk path, the first line in each bundle that has an image causes a
    hero-image row to be inserted before the bundle heading.
    """
    headers = ["#", "Description", "Category", "Qty", "UoM", "Unit Rate", "Disc %", "Line Total"]
    images = item_images or {}

    groups: list[tuple[str, list]] = []
    for ln in lines:
        label = (getattr(ln, "bundle_label", "") or "").strip()
        if groups and groups[-1][0] == label:
            groups[-1][1].append(ln)
        else:
            groups.append((label, [ln]))
    bundle_header_count = sum(1 for label, _ in groups if label)

    # For each bundle, find the first line whose item has a usable image.
    bundle_images: list[Path | None] = []
    for label, group_lines in groups:
        chosen: Path | None = None
        if label:
            for ln in group_lines:
                code = (getattr(ln, "item_code", "") or "").strip()
                p = images.get(code)
                if p and p.exists():
                    chosen = p
                    break
        bundle_images.append(chosen)
    image_row_count = sum(1 for p in bundle_images if p is not None)

    total_rows = 1 + image_row_count + bundle_header_count + len(lines) + 1
    table = doc.add_table(rows=total_rows, cols=len(headers))
    table.style = "Light Grid Accent 1"
    for j, h in enumerate(headers):
        cell = table.cell(0, j); cell.paragraphs[0].clear()
        r = cell.paragraphs[0].add_run(h); r.bold = True; r.font.size = Pt(9); r.font.color.rgb = accent

    subtotal = 0.0
    row = 1
    line_index = 0
    for (label, group_lines), hero_path in zip(groups, bundle_images):
        if label:
            if hero_path is not None:
                img_cell = table.cell(row, 0)
                img_cell.merge(table.cell(row, len(headers) - 1))
                img_cell.paragraphs[0].clear()
                img_cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
                try:
                    img_cell.paragraphs[0].add_run().add_picture(str(hero_path), width=Cm(6.5))
                except Exception:
                    pass  # If the image can't be read, fall back to no hero.
                row += 1
            group_total = sum(ln.line_total for ln in group_lines)
            head = table.cell(row, 0)
            head.merge(table.cell(row, len(headers) - 2))
            head.paragraphs[0].clear()
            r = head.paragraphs[0].add_run(f"▸ {label}"); r.bold = True; r.font.size = Pt(9); r.font.color.rgb = accent
            tot = table.cell(row, len(headers) - 1); tot.paragraphs[0].clear()
            r = tot.paragraphs[0].add_run(_money(group_total)); r.bold = True; r.font.size = Pt(9); r.font.color.rgb = accent
            row += 1
        for ln in group_lines:
            line_index += 1
            subtotal += ln.line_total
            if ln.product_line and ln.description:
                desc = f"{ln.product_line}\n{ln.description}"
            else:
                desc = ln.description or ln.product_line or "—"
            qty = f"{ln.quantity:,.2f}".rstrip("0").rstrip(".")
            disc = f"{(ln.discount_pct or 0):g}%" if (ln.discount_pct or 0) else "—"
            values = [
                str(line_index),
                desc,
                ln.structure_type or ln.product_line or "—",
                qty,
                ln.unit_of_measure or "each",
                _money(ln.unit_rate),
                disc,
                _money(ln.line_total),
            ]
            for j, v in enumerate(values):
                cell = table.cell(row, j); cell.paragraphs[0].clear()
                r = cell.paragraphs[0].add_run(v); r.font.size = Pt(9)
            row += 1

    sub_row = total_rows - 1
    cell = table.cell(sub_row, 0); cell.merge(table.cell(sub_row, len(headers) - 2))
    cell.paragraphs[0].clear()
    r = cell.paragraphs[0].add_run(subtotal_label); r.bold = True; r.font.size = Pt(9); r.font.color.rgb = accent
    last = table.cell(sub_row, len(headers) - 1); last.paragraphs[0].clear()
    r = last.paragraphs[0].add_run(_money(subtotal)); r.bold = True; r.font.size = Pt(9); r.font.color.rgb = accent


def _resolve_item_images(opp) -> dict[str, Path]:
    """Look up the catalogue image for every item_code referenced by the
    opportunity's lines. Returns an empty dict when the opportunity isn't
    attached to a session (e.g. unit tests) — the caller treats that as
    "no images" and falls back to text-only rendering.
    """
    codes = {(getattr(ln, "item_code", "") or "").strip() for ln in opp.lines}
    codes.discard("")
    if not codes:
        return {}
    session = Session.object_session(opp)
    if session is None:
        return {}
    rows = (
        session.query(Item.code, Item.image_path)
        .filter(Item.code.in_(codes))
        .all()
    )
    out: dict[str, Path] = {}
    for code, rel in rows:
        if rel:
            out[code] = ITEM_IMAGES_DIR / rel
    return out


def _render_line_items(doc, section, opp, accent):
    cfg = section.get("config", {})
    _add_heading(doc, cfg.get("heading", "Line Items"), 12, accent)
    all_lines = sorted(opp.lines, key=lambda x: x.sequence)
    mandatory = [ln for ln in all_lines if not ln.is_optional]
    optional = [ln for ln in all_lines if ln.is_optional]
    item_images = _resolve_item_images(opp)

    if mandatory:
        _render_line_items_table(doc, mandatory, accent, "Subtotal (excl. VAT)", item_images=item_images)
    else:
        _add_small(doc, "No line items.")
    doc.add_paragraph()

    if optional:
        _add_heading(doc, cfg.get("optional_heading", "Optional Add-ons"), 11, accent)
        _add_small(doc, "Pricing for items the client can choose to include. Not part of the headline total.")
        _render_line_items_table(doc, optional, accent, "Optional add-ons subtotal", item_images=item_images)
        doc.add_paragraph()


def _render_commercial(doc, section, opp, ctx, accent):
    cfg = section.get("config", {})
    _add_heading(doc, cfg.get("heading", "Commercial Summary"), 12, accent)
    mandatory = [ln for ln in opp.lines if not ln.is_optional]
    optional = [ln for ln in opp.lines if ln.is_optional]
    subtotal = sum(ln.line_total for ln in mandatory)
    optional_total = sum(ln.line_total for ln in optional)
    vat_pct = float(cfg.get("vat_percent", 15.0))
    vat = subtotal * vat_pct / 100.0
    total_area = sum(ln.quantity for ln in mandatory if ln.unit_of_measure == "m²")
    deposit_pct = float(opp.deposit_pct or 0.0)
    deposit_amount = subtotal * deposit_pct / 100.0

    rows = [("Line items", str(len(mandatory)))]
    if optional:
        rows.append(("Optional add-ons", f"{len(optional)} item(s)  ·  {_money(optional_total)}"))
    if total_area:
        rows.append(("Total area (m²)", f"{total_area:,.0f} m²"))
    rows += [
        ("Subtotal (ex VAT)", _money(subtotal)),
        (f"VAT ({vat_pct:g}%)", _money(vat)),
        ("Total (incl VAT)", _money(subtotal + vat)),
        ("Payment terms", _substitute(cfg.get("payment_terms", "40% deposit · 40% on delivery · 20% on handover"), ctx)),
        ("Delivery", f"{opp.delivery_weeks} weeks from signed order & cleared deposit"),
    ]
    if deposit_pct > 0:
        rows.append(("Deposit on signature", f"{deposit_pct:g}%  ·  {_money(deposit_amount)}"))
    if opp.valid_until:
        rows.append(("Quotation valid until", opp.valid_until.strftime("%d %B %Y")))
    else:
        rows.append(("Validity", f"{int(cfg.get('validity_days', 30))} days from issue date"))
    if opp.salesperson:
        rows.append(("Salesperson", opp.salesperson))

    _kv_table(doc, rows, accent)
    doc.add_paragraph()


def _render_why_us(doc, section, ctx, accent):
    cfg = section.get("config", {})
    _add_heading(doc, cfg.get("heading", "Why Us"), 12, accent)
    for bullet in cfg.get("bullets", []):
        if not bullet: continue
        p = doc.add_paragraph(style="List Bullet")
        r = p.add_run(_substitute(bullet, ctx)); r.font.size = Pt(10)
    doc.add_paragraph()


def _render_signature(doc, section, accent):
    cfg = section.get("config", {})
    _add_heading(doc, cfg.get("heading", "Acceptance"), 12, accent)
    preface = cfg.get("preface",
        "Acceptance of this proposal may be indicated by signature below and an official purchase order. "
        "On receipt we will issue a pro-forma invoice for the deposit and release production.")
    _add_para(doc, preface, size=10)
    doc.add_paragraph()
    _add_para(doc, f"{cfg.get('client_label', 'Signed for the Client')}: ____________________________   Date: ____________", size=10)
    doc.add_paragraph()
    _add_para(doc, f"{cfg.get('company_label', 'Signed for AMBS')}: _______________________________   Date: ____________", size=10)
    doc.add_paragraph()


def _render_page_break(doc, *_):
    p = doc.add_paragraph()
    p.add_run().add_break(WD_BREAK.PAGE)


# --------------------------------------------------------------------- v0.4.1 sections
_LIKELIHOOD_COLORS = {
    "low": RGBColor(0x16, 0xA3, 0x4A),     # green-600
    "medium": RGBColor(0xCA, 0x8A, 0x04),  # amber-600
    "high": RGBColor(0xDC, 0x26, 0x26),    # red-600
}


def _section_title(section: dict, default: str) -> str:
    """Pick the user-facing heading for a section. Honours `heading` first,
    then falls back to a sensible per-kind default."""
    cfg = section.get("config", {}) if isinstance(section, dict) else {}
    return (cfg.get("heading") or default).strip()


def _render_hero(doc, section, opp, tpl, accent):
    """Big hero image at the top of the proposal. Per-opp override wins."""
    candidate: Path | None = None
    if opp is not None and getattr(opp, "hero_filename", ""):
        p = OPP_HEROES_DIR / str(opp.id) / opp.hero_filename
        if p.exists():
            candidate = p
    if candidate is None and tpl is not None and getattr(tpl, "hero_filename", ""):
        p = TEMPLATE_HEROES_DIR / tpl.hero_filename
        if p.exists():
            candidate = p
    if candidate is None:
        return  # No image configured — emit nothing rather than a placeholder.
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    try:
        p.add_run().add_picture(str(candidate), width=Cm(16))
    except Exception:
        return
    doc.add_paragraph()


def _add_toc_field(doc, fallback_lines: list[str]):
    """Insert a real Word TOC field that picks up Heading-1 paragraphs.

    Field instruction: ``TOC \\o "1-1" \\h \\z \\u``
        ``\\o "1-1"``  include heading levels 1..1
        ``\\h``        each entry is a hyperlink to its heading
        ``\\z``        hide tab leaders in web layout view
        ``\\u``        also use paragraph outline level (defensive)

    The ``separator`` half of the field holds a pre-computed static list as
    the cached placeholder. Word/LibreOffice show that text until the field
    is refreshed — which we trigger automatically via
    ``_set_update_fields_on_open()``. Viewers that ignore the auto-update
    setting still see the readable numbered list.
    """
    p = doc.add_paragraph()
    run = p.add_run()
    r_elem = run._r

    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    r_elem.append(fld_begin)

    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = 'TOC \\o "1-1" \\h \\z \\u'
    r_elem.append(instr)

    fld_sep = OxmlElement("w:fldChar")
    fld_sep.set(qn("w:fldCharType"), "separate")
    r_elem.append(fld_sep)

    # Cached placeholder — readable as-is if the user dismisses the
    # update prompt or opens the docx in a viewer without field support.
    for i, line in enumerate(fallback_lines):
        if i > 0:
            br = OxmlElement("w:br")
            r_elem.append(br)
        t = OxmlElement("w:t")
        t.set(qn("xml:space"), "preserve")
        t.text = line
        r_elem.append(t)

    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    r_elem.append(fld_end)


def _render_toc(doc, section, ctx, accent):
    """Real Word TOC field — auto-updates on open, headings are hyperlinks.

    The "Contents" title itself is a plain bold paragraph (not Heading 1) so
    the TOC doesn't list itself. Every other section heading uses
    ``_add_heading``, which applies Heading 1 style; the TOC field picks
    them up and renders them as clickable links.

    For viewers that don't auto-update fields, ``_add_toc_field`` stuffs a
    static numbered list into the field's cached value so the document is
    still readable as-is.
    """
    sections = ctx.get("_sections") or []
    cfg = section.get("config", {})

    # Plain bold heading — NOT styled as Heading 1, to keep the TOC out of itself.
    title_para = doc.add_paragraph()
    title_run = title_para.add_run(cfg.get("heading", "Contents"))
    title_run.bold = True
    title_run.font.size = Pt(12)
    title_run.font.color.rgb = accent

    skip_kinds = {"toc", "page_break", "hero"}
    defaults = {
        "header": "",          # The brand header isn't a section heading; omit.
        "client_info": "Prepared For",
        "text": "",
        "scope": "Scope of Work",
        "line_items": "Line Items",
        "image_gallery": "Gallery",
        "commercial": "Commercial Summary",
        "why_us": "Why Us",
        "risks": "Risks & Mitigations",
        "warranty": "Warranty",
        "site_logistics": "Site & Logistics",
        "compliance": "Company Information & Compliance",
        "appendix": "Appendix",
        "signature": "Acceptance",
    }
    fallback_lines: list[str] = []
    seen = 0
    for s in sections:
        if not s.get("enabled", True):
            continue
        kind = s.get("kind", "")
        if kind in skip_kinds:
            continue
        title = _section_title(s, defaults.get(kind, kind.title()))
        if not title:
            continue
        seen += 1
        fallback_lines.append(f"{seen}.  {title}")

    _add_toc_field(doc, fallback_lines)
    doc.add_paragraph()


def _set_update_fields_on_open(doc):
    """Write ``<w:updateFields w:val="true"/>`` to ``word/settings.xml``.

    With this flag set, Word prompts the user to refresh fields on first
    open. They click Yes and the TOC field populates from the document's
    Heading 1 paragraphs — fully linked, page-numbered, no manual right-click.
    LibreOffice honours the same flag.
    """
    settings = doc.settings.element
    tag = qn("w:updateFields")
    existing = settings.find(tag)
    if existing is None:
        elem = OxmlElement("w:updateFields")
        elem.set(qn("w:val"), "true")
        settings.append(elem)
    else:
        existing.set(qn("w:val"), "true")


def _render_image_gallery(doc, section, opp, accent):
    """Two-column grid of every line-item photo, alternating image and label."""
    cfg = section.get("config", {})
    item_images = _resolve_item_images(opp)
    # Preserve line ordering and de-dupe by item_code so each product shows once.
    ordered: list[tuple[str, Path, str]] = []
    seen: set[str] = set()
    for ln in sorted(opp.lines, key=lambda x: x.sequence):
        code = (getattr(ln, "item_code", "") or "").strip()
        if not code or code in seen:
            continue
        p = item_images.get(code)
        if p and p.exists():
            label = (ln.description or ln.product_line or code).strip()
            ordered.append((code, p, label))
            seen.add(code)
    if not ordered:
        return  # Skip the section entirely when there's nothing to show.

    _add_heading(doc, cfg.get("heading", "Gallery"), 12, accent)
    cols = 2
    rows = (len(ordered) + cols - 1) // cols
    table = doc.add_table(rows=rows * 2, cols=cols)  # image row + caption row per visual row
    table.autofit = True
    for idx, (_, img_path, label) in enumerate(ordered):
        r = (idx // cols) * 2
        c = idx % cols
        img_cell = table.cell(r, c)
        img_cell.paragraphs[0].clear()
        img_cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        try:
            img_cell.paragraphs[0].add_run().add_picture(str(img_path), width=Cm(7.5))
        except Exception:
            pass
        cap_cell = table.cell(r + 1, c)
        cap_cell.paragraphs[0].clear()
        cap_cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = cap_cell.paragraphs[0].add_run(label)
        run.font.size = Pt(9); run.bold = True; run.font.color.rgb = accent
    doc.add_paragraph()


def _parse_risks(raw: str) -> list[dict]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return []
    if not isinstance(data, list):
        return []
    out: list[dict] = []
    for entry in data:
        if not isinstance(entry, dict):
            continue
        out.append({
            "risk": str(entry.get("risk", "")).strip(),
            "likelihood": str(entry.get("likelihood", "Medium")).strip() or "Medium",
            "impact": str(entry.get("impact", "Medium")).strip() or "Medium",
            "mitigation": str(entry.get("mitigation", "")).strip(),
        })
    return [r for r in out if r["risk"]]


def _render_risks(doc, section, opp, tpl, accent):
    cfg = section.get("config", {})
    rows = _parse_risks(getattr(opp, "risks_override_json", "")) if opp is not None else []
    if not rows:
        rows = _parse_risks(getattr(tpl, "default_risks_json", "")) if tpl is not None else []
    _add_heading(doc, cfg.get("heading", "Risks & Mitigations"), 12, accent)
    if not rows:
        _add_small(doc, "No risks identified for this engagement.")
        doc.add_paragraph()
        return
    headers = ["Risk", "Likelihood", "Impact", "Mitigation"]
    table = doc.add_table(rows=len(rows) + 1, cols=len(headers))
    table.style = "Light Grid Accent 1"
    for j, h in enumerate(headers):
        cell = table.cell(0, j); cell.paragraphs[0].clear()
        r = cell.paragraphs[0].add_run(h); r.bold = True; r.font.size = Pt(9); r.font.color.rgb = accent
    for i, row in enumerate(rows, start=1):
        for j, val in enumerate([row["risk"], row["likelihood"], row["impact"], row["mitigation"]]):
            cell = table.cell(i, j); cell.paragraphs[0].clear()
            run = cell.paragraphs[0].add_run(val); run.font.size = Pt(9)
            if j in (1, 2):
                colour = _LIKELIHOOD_COLORS.get(val.lower())
                if colour is not None:
                    run.bold = True
                    run.font.color.rgb = colour
    doc.add_paragraph()


def _render_text_block(doc, heading: str, body: str, ctx: dict, accent: RGBColor):
    if heading:
        _add_heading(doc, _substitute(heading, ctx), 12, accent)
    for para in (body or "").split("\n"):
        _add_para(doc, _substitute(para, ctx), size=10)
    doc.add_paragraph()


def _render_warranty(doc, section, opp, tpl, ctx, accent):
    cfg = section.get("config", {})
    body = (
        _paste(opp, cfg.get("paste_key", ""))
        or (getattr(opp, "warranty_override", "") or "").strip()
        or (getattr(tpl, "default_warranty_md", "") or "").strip()
        or cfg.get("body", "")
    )
    if not body:
        return  # Nothing configured — quietly skip rather than emit an empty heading.
    _render_text_block(doc, cfg.get("heading", "Warranty"), body, ctx, accent)


def _render_site_logistics(doc, section, opp, tpl, ctx, accent):
    cfg = section.get("config", {})
    body = (
        _paste(opp, cfg.get("paste_key", ""))
        or (getattr(opp, "site_logistics_override", "") or "").strip()
        or (getattr(tpl, "default_site_logistics_md", "") or "").strip()
        or cfg.get("body", "")
    )
    if not body:
        return
    _render_text_block(doc, cfg.get("heading", "Site & Logistics"), body, ctx, accent)


def _render_compliance(doc, section, tpl, accent):
    cfg = section.get("config", {})
    rows: list[tuple[str, str]] = []
    fields = [
        ("Company Registration", "tax_company_reg"),
        ("VAT Number", "tax_vat_number"),
        ("B-BBEE Level", "tax_bbbee_level"),
        ("B-BBEE Cert Expiry", "tax_bbbee_cert_expiry"),
        ("Registered Address", "tax_address"),
        ("Directors", "tax_directors"),
    ]
    for label, attr in fields:
        val = (getattr(tpl, attr, "") or "").strip()
        if val:
            rows.append((label, val))
    if not rows:
        return
    _add_heading(doc, cfg.get("heading", "Company Information & Compliance"), 12, accent)
    _kv_table(doc, rows, accent)
    doc.add_paragraph()


def _render_appendix(doc, section, opp, accent):
    """Embeds image assets inline, lists non-image attachments by filename.

    Captions render under embedded images and after the filename for bullets.
    Skips the section entirely when no assets are attached so we never emit a
    naked heading + empty body.
    """
    assets = list(getattr(opp, "assets", []) or [])
    if not assets:
        return
    cfg = section.get("config", {})
    _add_heading(doc, cfg.get("heading", "Appendix — Drawings & Supporting Documents"), 12, accent)
    assets.sort(key=lambda a: (a.sequence, a.uploaded_at))
    for asset in assets:
        path = Path(asset.stored_path) if asset.stored_path else (OPP_ATTACHMENTS_DIR / str(opp.id) / asset.filename)
        is_image = (asset.content_type or "").lower().startswith("image/")
        if is_image and path.exists():
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            try:
                p.add_run().add_picture(str(path), width=Cm(14))
            except Exception:
                _add_small(doc, f"[Could not embed image: {asset.filename}]")
            if asset.caption:
                cap = doc.add_paragraph()
                cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
                r = cap.add_run(asset.caption)
                r.font.size = Pt(9); r.italic = True; r.font.color.rgb = GREY_600
        else:
            label = asset.filename
            if asset.caption:
                label = f"{label} — {asset.caption}"
            p = doc.add_paragraph(style="List Bullet")
            r = p.add_run(f"📎 {label}"); r.font.size = Pt(10)
    doc.add_paragraph()


_RENDERERS = {
    "header": lambda doc, s, opp, tpl, ctx, pri, acc: _render_header(doc, s, tpl, ctx, pri, acc),
    "client_info": lambda doc, s, opp, tpl, ctx, pri, acc: _render_client_info(doc, s, ctx, acc),
    "text": lambda doc, s, opp, tpl, ctx, pri, acc: _render_text(doc, s, opp, ctx, acc),
    "scope": lambda doc, s, opp, tpl, ctx, pri, acc: _render_scope(doc, s, opp, ctx, acc),
    "line_items": lambda doc, s, opp, tpl, ctx, pri, acc: _render_line_items(doc, s, opp, acc),
    "commercial": lambda doc, s, opp, tpl, ctx, pri, acc: _render_commercial(doc, s, opp, ctx, acc),
    "why_us": lambda doc, s, opp, tpl, ctx, pri, acc: _render_why_us(doc, s, ctx, acc),
    "signature": lambda doc, s, opp, tpl, ctx, pri, acc: _render_signature(doc, s, acc),
    "page_break": lambda doc, s, opp, tpl, ctx, pri, acc: _render_page_break(doc),
    # v0.4.1 additions
    "hero": lambda doc, s, opp, tpl, ctx, pri, acc: _render_hero(doc, s, opp, tpl, acc),
    "toc": lambda doc, s, opp, tpl, ctx, pri, acc: _render_toc(doc, s, ctx, acc),
    "image_gallery": lambda doc, s, opp, tpl, ctx, pri, acc: _render_image_gallery(doc, s, opp, acc),
    "risks": lambda doc, s, opp, tpl, ctx, pri, acc: _render_risks(doc, s, opp, tpl, acc),
    "warranty": lambda doc, s, opp, tpl, ctx, pri, acc: _render_warranty(doc, s, opp, tpl, ctx, acc),
    "site_logistics": lambda doc, s, opp, tpl, ctx, pri, acc: _render_site_logistics(doc, s, opp, tpl, ctx, acc),
    "compliance": lambda doc, s, opp, tpl, ctx, pri, acc: _render_compliance(doc, s, tpl, acc),
    "appendix": lambda doc, s, opp, tpl, ctx, pri, acc: _render_appendix(doc, s, opp, acc),
}


def generate_proposal_docx(opportunity, filepath: Path, ref: str, template: ProposalTemplate) -> Path:
    doc = Document()
    for section in doc.sections:
        section.top_margin = Cm(1.8); section.bottom_margin = Cm(1.8)
        section.left_margin = Cm(2.0); section.right_margin = Cm(2.0)

    primary = _hex(template.brand_primary_color)
    accent = _hex(template.brand_accent_color)
    ctx = _build_context(opportunity, ref)

    try:
        sections = json.loads(template.sections_json or "[]")
    except (ValueError, TypeError):
        sections = []

    # Stash the section list in ctx so the TOC renderer can walk it without
    # having to thread the list through every renderer's signature.
    ctx["_sections"] = sections

    for section in sections:
        if not section.get("enabled", True):
            continue
        kind = section.get("kind")
        renderer = _RENDERERS.get(kind)
        if not renderer:
            continue
        try:
            renderer(doc, section, opportunity, template, ctx, primary, accent)
        except Exception as e:
            _add_small(doc, f"[Error rendering {kind} section: {e}]")

    _add_small(doc, f"Generated by SolutionsAI Proposal Generator · Template: {template.name} · {ctx['date']}")

    # Tells Word/LibreOffice to refresh fields (incl. the TOC) on open.
    _set_update_fields_on_open(doc)

    filepath.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(filepath))
    return filepath
