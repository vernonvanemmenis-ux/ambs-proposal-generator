from datetime import datetime, date
from sqlalchemy import String, Integer, Float, DateTime, Date, ForeignKey, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base


class Client(Base):
    __tablename__ = "clients"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    industry: Mapped[str] = mapped_column(String(80), default="")
    contact_person: Mapped[str] = mapped_column(String(200), default="")
    email: Mapped[str] = mapped_column(String(200), default="")
    phone: Mapped[str] = mapped_column(String(60), default="")
    site_location: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    opportunities: Mapped[list["Opportunity"]] = relationship(back_populates="client", cascade="all,delete")


class Opportunity(Base):
    __tablename__ = "opportunities"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    stage: Mapped[str] = mapped_column(String(30), default="new")
    delivery_weeks: Mapped[int] = mapped_column(Integer, default=4)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str] = mapped_column(Text, default="")
    expected_close: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Sales / quotation extras
    valid_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    salesperson: Mapped[str] = mapped_column(String(120), default="")
    deposit_pct: Mapped[float] = mapped_column(Float, default=0.0)

    # Per-opportunity overrides for the template-level defaults. Empty string
    # means "use the template default". Stored on the Opportunity (not the
    # Proposal) so the user can iterate the docx without losing edits.
    hero_filename: Mapped[str] = mapped_column(String(300), default="")  # file in DATA_ROOT/opp_heroes/{id}/
    warranty_override: Mapped[str] = mapped_column(Text, default="")
    site_logistics_override: Mapped[str] = mapped_column(Text, default="")
    risks_override_json: Mapped[str] = mapped_column(Text, default="")  # "" means use template default
    # Per-section paste-back store: {"<paste_key>": "<markdown body>"}.
    # Section bodies with a non-empty draft win over the template's static body
    # at render time. Filled by the user (or by the optional /api/sections/draft
    # endpoint) and never auto-cleared.
    section_drafts_json: Mapped[str] = mapped_column(Text, default="{}")

    client: Mapped[Client] = relationship(back_populates="opportunities")
    lines: Mapped[list["OpportunityLine"]] = relationship(
        back_populates="opportunity",
        cascade="all,delete",
        order_by="OpportunityLine.sequence",
    )
    proposals: Mapped[list["Proposal"]] = relationship(back_populates="opportunity", cascade="all,delete")
    activities: Mapped[list["Activity"]] = relationship(back_populates="opportunity", cascade="all,delete")
    project: Mapped["Project | None"] = relationship(back_populates="opportunity", uselist=False, cascade="all,delete")
    assets: Mapped[list["OpportunityAsset"]] = relationship(
        back_populates="opportunity",
        cascade="all,delete",
        order_by="OpportunityAsset.uploaded_at",
    )

    @property
    def amount(self) -> float:
        # Only mandatory lines count toward the headline total.
        # Optional lines are shown as upsells but never auto-summed.
        return sum((ln.line_total for ln in self.lines if not ln.is_optional), 0.0)

    @property
    def optional_amount(self) -> float:
        return sum((ln.line_total for ln in self.lines if ln.is_optional), 0.0)

    @property
    def project_id(self) -> int | None:
        return self.project.id if self.project else None


class OpportunityLine(Base):
    __tablename__ = "opportunity_lines"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    opportunity_id: Mapped[int] = mapped_column(ForeignKey("opportunities.id"))
    sequence: Mapped[int] = mapped_column(Integer, default=0)
    item_code: Mapped[str] = mapped_column(String(60), default="")  # optional ref to items.code
    product_line: Mapped[str] = mapped_column(String(120), default="")
    structure_type: Mapped[str] = mapped_column(String(120), default="")
    description: Mapped[str] = mapped_column(String(300), default="")
    quantity: Mapped[float] = mapped_column(Float, default=1.0)
    unit_of_measure: Mapped[str] = mapped_column(String(20), default="each")
    unit_rate: Mapped[float] = mapped_column(Float, default=0.0)

    # Sales extras
    discount_pct: Mapped[float] = mapped_column(Float, default=0.0)
    is_optional: Mapped[bool] = mapped_column(Boolean, default=False)
    cost_rate: Mapped[float] = mapped_column(Float, default=0.0)  # internal margin tracking; never rendered

    # Bundle grouping — set when a line came from an opportunity template; "" means ungrouped.
    # Multiple templates can be applied to one opportunity; each application stamps its name
    # here so the editor and proposal can render the lines under a module subheading.
    bundle_label: Mapped[str] = mapped_column(String(120), default="")

    opportunity: Mapped[Opportunity] = relationship(back_populates="lines")

    @property
    def line_total(self) -> float:
        qty = float(self.quantity or 0.0)
        rate = float(self.unit_rate or 0.0)
        disc = float(self.discount_pct or 0.0)
        return qty * rate * (1.0 - disc / 100.0)

    @property
    def margin(self) -> float:
        """Gross margin (internal only). Returns 0 when cost_rate is unset."""
        cost = float(self.cost_rate or 0.0)
        if cost <= 0:
            return 0.0
        qty = float(self.quantity or 0.0)
        return self.line_total - qty * cost


class Salesperson(Base):
    """AMBS sales team directory.

    Used to populate the Salesperson dropdown on opportunities. Soft-deleted
    via `active=False` so historical opportunities can still show the person
    who originally owned them.
    """
    __tablename__ = "salespeople"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(200), default="")
    phone: Mapped[str] = mapped_column(String(60), default="")
    role: Mapped[str] = mapped_column(String(120), default="")
    initials: Mapped[str] = mapped_column(String(8), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Item(Base):
    """Catalogue of priceable items (structures, components, accessories, services).

    Selecting an item while editing a proposal line auto-fills description,
    unit_of_measure, and unit_rate — the rate can still be overridden manually
    per proposal. This is the table AMBS would populate and keep up-to-date.
    """
    __tablename__ = "items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(60), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(50), default="Component")  # Structure / Component / Service
    product_line: Mapped[str] = mapped_column(String(120), default="")
    structure_type: Mapped[str] = mapped_column(String(120), default="")
    unit_of_measure: Mapped[str] = mapped_column(String(20), default="each")
    default_rate: Mapped[float] = mapped_column(Float, default=0.0)
    description: Mapped[str] = mapped_column(String(300), default="")
    # Comma-separated tags for the catalogue picker filter (e.g. "Modular,Mining,HVAC")
    tags: Mapped[str] = mapped_column(String(400), default="")
    # Path (relative to DATA_ROOT/item_images/) to the canonical product photo.
    # Empty string means no image — rendered with a placeholder in the UI.
    image_path: Mapped[str] = mapped_column(String(400), default="")


class OpportunityTemplate(Base):
    """Quick-start template for new opportunities.

    Picking a template in the New Opportunity drawer auto-fills the title hint,
    header defaults (delivery weeks, deposit %), and a pre-built list of line
    items. Each line is stored as JSON so we don't need a join table.
    """
    __tablename__ = "opportunity_templates"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(String(500), default="")
    icon: Mapped[str] = mapped_column(String(20), default="📋")
    industry: Mapped[str] = mapped_column(String(80), default="")
    title_hint: Mapped[str] = mapped_column(String(200), default="")
    default_delivery_weeks: Mapped[int] = mapped_column(Integer, default=6)
    default_deposit_pct: Mapped[float] = mapped_column(Float, default=40.0)
    default_lines_json: Mapped[str] = mapped_column(Text, default="[]")
    is_active: Mapped[int] = mapped_column(Integer, default=1)  # bool-as-int
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ProposalTemplate(Base):
    """Editable proposal layout. Sections are stored as a JSON array so the
    user can reorder / add / remove them without schema changes. See
    backend/constants.py :: SECTION_KINDS for the supported kinds.
    """
    __tablename__ = "proposal_templates"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(String(500), default="")
    is_default: Mapped[int] = mapped_column(Integer, default=0)  # bool-as-int for sqlite simplicity

    # Brand bar / header defaults
    brand_company_name: Mapped[str] = mapped_column(String(200), default="AMBS")
    brand_tagline: Mapped[str] = mapped_column(String(300), default="African Modular Building Solutions")
    brand_address_line: Mapped[str] = mapped_column(String(300), default="")
    brand_contact_line: Mapped[str] = mapped_column(String(300), default="")
    brand_primary_color: Mapped[str] = mapped_column(String(20), default="#2563B0")
    brand_accent_color: Mapped[str] = mapped_column(String(20), default="#0B1120")
    logo_filename: Mapped[str] = mapped_column(String(200), default="")  # file in data/logos/
    hero_filename: Mapped[str] = mapped_column(String(200), default="")  # file in data/heroes/, used by the 'hero' section

    # Default body content for the new structured sections. Per-opportunity
    # overrides on the Opportunity model win at render time when non-empty.
    default_warranty_md: Mapped[str] = mapped_column(Text, default="")
    default_site_logistics_md: Mapped[str] = mapped_column(Text, default="")
    # JSON array of {"risk": str, "likelihood": str, "impact": str, "mitigation": str}
    default_risks_json: Mapped[str] = mapped_column(Text, default="[]")

    # Tax / company-registration / B-BBEE block — structured fields rendered
    # as a key-value table by the 'compliance' section. Template-only (no
    # per-opportunity override; this rarely changes per deal).
    tax_company_reg: Mapped[str] = mapped_column(String(120), default="")
    tax_vat_number: Mapped[str] = mapped_column(String(120), default="")
    tax_bbbee_level: Mapped[str] = mapped_column(String(40), default="")
    tax_bbbee_cert_expiry: Mapped[str] = mapped_column(String(40), default="")  # ISO date or free text
    tax_address: Mapped[str] = mapped_column(String(400), default="")
    tax_directors: Mapped[str] = mapped_column(String(400), default="")

    # Ordered list of sections, each: {"kind": str, "enabled": bool, "config": {...}}
    sections_json: Mapped[str] = mapped_column(Text, default="[]")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Proposal(Base):
    __tablename__ = "proposals"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    opportunity_id: Mapped[int] = mapped_column(ForeignKey("opportunities.id"))
    template_id: Mapped[int | None] = mapped_column(ForeignKey("proposal_templates.id"), nullable=True)
    ref: Mapped[str] = mapped_column(String(40))
    filename: Mapped[str] = mapped_column(String(500))
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    channel: Mapped[str] = mapped_column(String(20), default="offline")
    pandadoc_id: Mapped[str] = mapped_column(String(120), default="")
    # Lifecycle: draft → sent → viewed → signed → paid (see constants.PROPOSAL_STATUS_VALUES)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    status_updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    opportunity: Mapped[Opportunity] = relationship(back_populates="proposals")


class Activity(Base):
    __tablename__ = "activities"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Either opportunity_id OR task_id is populated. Both nullable so chatter can attach to either.
    opportunity_id: Mapped[int | None] = mapped_column(ForeignKey("opportunities.id"), nullable=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String(30), default="note")
    author: Mapped[str] = mapped_column(String(100), default="You")
    body: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    opportunity: Mapped[Opportunity | None] = relationship(back_populates="activities")
    task: Mapped["Task | None"] = relationship(back_populates="activities")


# ============================================================================
# Construction projects (post-Won lifecycle)
# ============================================================================
class Project(Base):
    """A construction project — created automatically when an Opportunity is Won."""
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    opportunity_id: Mapped[int | None] = mapped_column(ForeignKey("opportunities.id"), nullable=True)
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | archived
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    opportunity: Mapped[Opportunity | None] = relationship(back_populates="project")
    client: Mapped[Client | None] = relationship()
    stages: Mapped[list["ProjectStage"]] = relationship(
        back_populates="project",
        cascade="all,delete",
        order_by="ProjectStage.sequence",
    )
    tasks: Mapped[list["Task"]] = relationship(
        back_populates="project",
        cascade="all,delete",
        order_by="Task.sequence",
    )


class ProjectStage(Base):
    __tablename__ = "project_stages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    name: Mapped[str] = mapped_column(String(80))
    color: Mapped[str] = mapped_column(String(20), default="#64748b")
    sequence: Mapped[int] = mapped_column(Integer, default=0)

    project: Mapped[Project] = relationship(back_populates="stages")
    tasks: Mapped[list["Task"]] = relationship(back_populates="stage", order_by="Task.sequence")


class Task(Base):
    __tablename__ = "tasks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    stage_id: Mapped[int] = mapped_column(ForeignKey("project_stages.id"))
    title: Mapped[str] = mapped_column(String(200))
    assignee: Mapped[str] = mapped_column(String(120), default="")
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    sequence: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    project: Mapped[Project] = relationship(back_populates="tasks")
    stage: Mapped[ProjectStage] = relationship(back_populates="tasks")
    activities: Mapped[list[Activity]] = relationship(
        back_populates="task",
        cascade="all,delete",
        order_by="Activity.created_at.desc()",
    )
    attachments: Mapped[list["Attachment"]] = relationship(
        back_populates="task",
        cascade="all,delete",
    )


class Attachment(Base):
    __tablename__ = "attachments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"))
    filename: Mapped[str] = mapped_column(String(300))
    content_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    stored_path: Mapped[str] = mapped_column(String(600))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    task: Mapped[Task] = relationship(back_populates="attachments")


class OpportunityAsset(Base):
    """Per-opportunity uploaded files used by the Appendix section.

    Images get embedded inline; other file types (PDF, DWG, DOCX) render as a
    referenced filename in the appendix list. Caption is optional and rendered
    next to the file when present.
    """
    __tablename__ = "opportunity_assets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    opportunity_id: Mapped[int] = mapped_column(ForeignKey("opportunities.id"))
    filename: Mapped[str] = mapped_column(String(300))
    content_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    stored_path: Mapped[str] = mapped_column(String(600))
    caption: Mapped[str] = mapped_column(String(400), default="")
    sequence: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    opportunity: Mapped[Opportunity] = relationship(back_populates="assets")
