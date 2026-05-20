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
from docx.shared import Pt, RGBColor, Cm
from sqlalchemy.orm import Session

from .db import LOGOS_DIR
from .models import Proposal, ProposalTemplate


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
    p = doc.add_paragraph()
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


def _render_text(doc, section, ctx, accent):
    cfg = section.get("config", {})
    heading = cfg.get("heading", "")
    if heading:
        _add_heading(doc, _substitute(heading, ctx), 12, accent)
    body = cfg.get("body", "")
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


def _render_line_items_table(doc, lines, accent, subtotal_label: str):
    """Helper: render a line-item table with a discount column and a subtotal row."""
    headers = ["#", "Description", "Category", "Qty", "UoM", "Unit Rate", "Disc %", "Line Total"]
    table = doc.add_table(rows=1 + len(lines) + 1, cols=len(headers))
    table.style = "Light Grid Accent 1"
    for j, h in enumerate(headers):
        cell = table.cell(0, j); cell.paragraphs[0].clear()
        r = cell.paragraphs[0].add_run(h); r.bold = True; r.font.size = Pt(9); r.font.color.rgb = accent
    subtotal = 0.0
    for i, ln in enumerate(lines, start=1):
        subtotal += ln.line_total
        if ln.product_line and ln.description:
            desc = f"{ln.product_line}\n{ln.description}"
        else:
            desc = ln.description or ln.product_line or "—"
        qty = f"{ln.quantity:,.2f}".rstrip("0").rstrip(".")
        disc = f"{(ln.discount_pct or 0):g}%" if (ln.discount_pct or 0) else "—"
        values = [
            str(i),
            desc,
            ln.structure_type or ln.product_line or "—",
            qty,
            ln.unit_of_measure or "each",
            _money(ln.unit_rate),
            disc,
            _money(ln.line_total),
        ]
        for j, v in enumerate(values):
            cell = table.cell(i, j); cell.paragraphs[0].clear()
            r = cell.paragraphs[0].add_run(v); r.font.size = Pt(9)
    sub_row = 1 + len(lines)
    cell = table.cell(sub_row, 0); cell.merge(table.cell(sub_row, len(headers) - 2))
    cell.paragraphs[0].clear()
    r = cell.paragraphs[0].add_run(subtotal_label); r.bold = True; r.font.size = Pt(9); r.font.color.rgb = accent
    last = table.cell(sub_row, len(headers) - 1); last.paragraphs[0].clear()
    r = last.paragraphs[0].add_run(_money(subtotal)); r.bold = True; r.font.size = Pt(9); r.font.color.rgb = accent


def _render_line_items(doc, section, opp, accent):
    cfg = section.get("config", {})
    _add_heading(doc, cfg.get("heading", "Line Items"), 12, accent)
    all_lines = sorted(opp.lines, key=lambda x: x.sequence)
    mandatory = [ln for ln in all_lines if not ln.is_optional]
    optional = [ln for ln in all_lines if ln.is_optional]

    if mandatory:
        _render_line_items_table(doc, mandatory, accent, "Subtotal (excl. VAT)")
    else:
        _add_small(doc, "No line items.")
    doc.add_paragraph()

    if optional:
        _add_heading(doc, cfg.get("optional_heading", "Optional Add-ons"), 11, accent)
        _add_small(doc, "Pricing for items the client can choose to include. Not part of the headline total.")
        _render_line_items_table(doc, optional, accent, "Optional add-ons subtotal")
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


_RENDERERS = {
    "header": lambda doc, s, opp, tpl, ctx, pri, acc: _render_header(doc, s, tpl, ctx, pri, acc),
    "client_info": lambda doc, s, opp, tpl, ctx, pri, acc: _render_client_info(doc, s, ctx, acc),
    "text": lambda doc, s, opp, tpl, ctx, pri, acc: _render_text(doc, s, ctx, acc),
    "scope": lambda doc, s, opp, tpl, ctx, pri, acc: _render_scope(doc, s, opp, ctx, acc),
    "line_items": lambda doc, s, opp, tpl, ctx, pri, acc: _render_line_items(doc, s, opp, acc),
    "commercial": lambda doc, s, opp, tpl, ctx, pri, acc: _render_commercial(doc, s, opp, ctx, acc),
    "why_us": lambda doc, s, opp, tpl, ctx, pri, acc: _render_why_us(doc, s, ctx, acc),
    "signature": lambda doc, s, opp, tpl, ctx, pri, acc: _render_signature(doc, s, acc),
    "page_break": lambda doc, s, opp, tpl, ctx, pri, acc: _render_page_break(doc),
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

    filepath.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(filepath))
    return filepath
