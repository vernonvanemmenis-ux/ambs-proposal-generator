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


class PageLayout(Base):
    """Studio mode — per-page block layout.

    One row per customisable page (page_key = 'pipeline', 'opportunity_form',
    'clients', etc). `blocks_json` is an ordered JSON array of
        {"key": "<block_key>", "enabled": bool, "config": {...}}
    The frontend's PageRenderer walks this list and renders each block from
    the page-scoped component registry. Rows that don't yet exist resolve
    to a code-defined default at GET time so the table can stay empty until
    the user customises a page.
    """
    __tablename__ = "page_layouts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    page_key: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    blocks_json: Mapped[str] = mapped_column(Text, default="[]")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Supplier(Base):
    """M1 — vendor/supplier directory.

    Separate from Client (which is buy-side). Each supplier can offer
    multiple Items via the ItemSupplier join (with their own code/price/
    lead time). Soft-delete via `active=False` so historical purchase
    orders still resolve their supplier name.
    """
    __tablename__ = "suppliers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    contact_person: Mapped[str] = mapped_column(String(200), default="")
    email: Mapped[str] = mapped_column(String(200), default="")
    phone: Mapped[str] = mapped_column(String(60), default="")
    address: Mapped[str] = mapped_column(String(400), default="")
    payment_terms: Mapped[str] = mapped_column(String(120), default="")
    lead_time_days: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    item_links: Mapped[list["ItemSupplier"]] = relationship(
        back_populates="supplier",
        cascade="all,delete",
    )


class BoM(Base):
    """M5 — Bill of Materials.

    A versioned recipe for producing `qty_produced` units of `item_id`
    (the finished good). One item can have multiple BoMs (e.g.
    different versions) but only one is active at a time per
    (item_id, version). The MO planner picks the latest active BoM
    when an explicit one isn't supplied.
    """
    __tablename__ = "boms"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"))
    code: Mapped[str] = mapped_column(String(60), default="")
    version: Mapped[str] = mapped_column(String(20), default="1.0")
    qty_produced: Mapped[float] = mapped_column(Float, default=1.0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    lines: Mapped[list["BoMLine"]] = relationship(
        back_populates="bom",
        cascade="all,delete",
        order_by="BoMLine.sequence",
    )
    operations: Mapped[list["BoMOperation"]] = relationship(
        back_populates="bom",
        cascade="all,delete",
        order_by="BoMOperation.sequence",
    )


class BoMLine(Base):
    """M5 — one component required by a BoM.

    `qty_required` is the qty needed to produce one batch of the BoM
    (i.e. for `qty_produced` finished units). MO consumption scales
    by qty_to_produce / bom.qty_produced.
    `scrap_pct` adds a per-line wastage buffer at MO-creation time.
    """
    __tablename__ = "bom_lines"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bom_id: Mapped[int] = mapped_column(ForeignKey("boms.id"))
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"))
    sequence: Mapped[int] = mapped_column(Integer, default=0)
    qty_required: Mapped[float] = mapped_column(Float, default=1.0)
    unit_of_measure: Mapped[str] = mapped_column(String(20), default="each")
    scrap_pct: Mapped[float] = mapped_column(Float, default=0.0)

    bom: Mapped[BoM] = relationship(back_populates="lines")


class BoMOperation(Base):
    """M5 — manufacturing step inside a BoM.

    Each operation runs at a `work_center_id`. WorkOrders are spawned
    from operations when an MO is confirmed.
    """
    __tablename__ = "bom_operations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bom_id: Mapped[int] = mapped_column(ForeignKey("boms.id"))
    work_center_id: Mapped[int] = mapped_column(ForeignKey("work_centers.id"))
    name: Mapped[str] = mapped_column(String(120))
    sequence: Mapped[int] = mapped_column(Integer, default=0)
    duration_min: Mapped[float] = mapped_column(Float, default=0.0)
    notes: Mapped[str] = mapped_column(Text, default="")

    bom: Mapped[BoM] = relationship(back_populates="operations")


class WorkCenter(Base):
    """M5 — physical or virtual workstation.

    `capacity_units_per_hour` informs throughput estimates (M6 will
    use this for scheduling charts). `calendar_json` reserved for
    per-weekday working hours; flat for now.
    """
    __tablename__ = "work_centers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    code: Mapped[str] = mapped_column(String(20), default="")
    capacity_units_per_hour: Mapped[float] = mapped_column(Float, default=1.0)
    cost_per_hour: Mapped[float] = mapped_column(Float, default=0.0)
    calendar_json: Mapped[str] = mapped_column(Text, default="{}")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ManufacturingOrder(Base):
    """M5 — production order.

    Lifecycle: draft → confirmed → in_progress → done (terminal:
    cancelled). On confirm, reserves component StockMoves
    (internal → production loc, state=confirmed). On done, those
    reservations are completed AND a production output move is
    created (production → internal, state=done).
    """
    __tablename__ = "manufacturing_orders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ref: Mapped[str] = mapped_column(String(40), default="")
    bom_id: Mapped[int] = mapped_column(ForeignKey("boms.id"))
    qty_to_produce: Mapped[float] = mapped_column(Float, default=1.0)
    state: Mapped[str] = mapped_column(String(20), default="draft")
    source_location_id: Mapped[int | None] = mapped_column(ForeignKey("stock_locations.id"), nullable=True)
    dest_location_id: Mapped[int | None] = mapped_column(ForeignKey("stock_locations.id"), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    scheduled_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    bom: Mapped[BoM] = relationship()
    work_orders: Mapped[list["WorkOrder"]] = relationship(
        back_populates="mo",
        cascade="all,delete",
        order_by="WorkOrder.sequence",
    )
    quality_checks: Mapped[list["QualityCheck"]] = relationship(
        back_populates="mo",
        cascade="all,delete",
        order_by="QualityCheck.created_at",
    )


class WorkOrder(Base):
    """M5 — one execution step on an MO.

    Spawned from a BoMOperation when the MO is confirmed. State machine:
    pending → in_progress → done (terminal: cancelled).
    """
    __tablename__ = "work_orders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mo_id: Mapped[int] = mapped_column(ForeignKey("manufacturing_orders.id"))
    operation_id: Mapped[int | None] = mapped_column(ForeignKey("bom_operations.id"), nullable=True)
    work_center_id: Mapped[int] = mapped_column(ForeignKey("work_centers.id"))
    name: Mapped[str] = mapped_column(String(120))
    sequence: Mapped[int] = mapped_column(Integer, default=0)
    state: Mapped[str] = mapped_column(String(20), default="pending")
    operator: Mapped[str] = mapped_column(String(120), default="")
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    actual_duration_min: Mapped[float] = mapped_column(Float, default=0.0)
    notes: Mapped[str] = mapped_column(Text, default="")

    mo: Mapped[ManufacturingOrder] = relationship(back_populates="work_orders")


class QualityCheck(Base):
    """M5 — a quality control check attached to an MO (and optionally a WO).

    `kind`: pass_fail | measure | visual.
    `result`: "pass" | "fail" | "" (pending).
    Failing checks block MO completion.
    """
    __tablename__ = "quality_checks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mo_id: Mapped[int] = mapped_column(ForeignKey("manufacturing_orders.id"))
    work_order_id: Mapped[int | None] = mapped_column(ForeignKey("work_orders.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(20), default="pass_fail")
    result: Mapped[str] = mapped_column(String(20), default="")
    measured_value: Mapped[str] = mapped_column(String(120), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    performed_by: Mapped[str] = mapped_column(String(120), default="")
    performed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    mo: Mapped[ManufacturingOrder] = relationship(back_populates="quality_checks")


class SalesOrder(Base):
    """M4 — confirmed sales order.

    Created when an Opportunity is "confirmed". Carries the quote into
    a structured lifecycle that produces stock reservations, deliveries,
    invoices, and payments. The opportunity stays around as the upstream
    proposal artefact; the sales order is the source of truth for what
    was actually agreed.

    State machine: draft → confirmed → delivered → invoiced → paid.
    `cancelled` is the terminal escape from any non-paid state.
    """
    __tablename__ = "sales_orders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ref: Mapped[str] = mapped_column(String(40), default="")
    opportunity_id: Mapped[int] = mapped_column(ForeignKey("opportunities.id"), unique=True)
    state: Mapped[str] = mapped_column(String(20), default="confirmed")
    currency: Mapped[str] = mapped_column(String(8), default="ZAR")
    deposit_pct: Mapped[float] = mapped_column(Float, default=0.0)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    opportunity: Mapped["Opportunity"] = relationship()
    invoices: Mapped[list["Invoice"]] = relationship(
        back_populates="sales_order",
        cascade="all,delete",
        order_by="Invoice.created_at",
    )

    @property
    def total(self) -> float:
        """Total = opportunity's mandatory-line subtotal. Optional lines stay optional."""
        return float(self.opportunity.amount or 0.0) if self.opportunity else 0.0

    @property
    def invoiced_total(self) -> float:
        return sum(float(inv.total or 0.0) for inv in self.invoices if inv.state != "cancelled")

    @property
    def paid_total(self) -> float:
        return sum(float(inv.paid_total) for inv in self.invoices if inv.state != "cancelled")


class Invoice(Base):
    """M4 — invoice issued against a sales order.

    Two kinds: `regular` (full balance) and `down_payment` (deposit %).
    A typical M4 flow on a 40% deposit SO is: create down-payment invoice
    on confirm, mark paid, deliver, create balance invoice (kind=regular,
    auto-amount = SO total - paid down-payment), mark paid → SO paid.
    """
    __tablename__ = "invoices"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ref: Mapped[str] = mapped_column(String(40), default="")
    sales_order_id: Mapped[int] = mapped_column(ForeignKey("sales_orders.id"))
    kind: Mapped[str] = mapped_column(String(20), default="regular")
    state: Mapped[str] = mapped_column(String(20), default="draft")
    total: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), default="ZAR")
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    sales_order: Mapped[SalesOrder] = relationship(back_populates="invoices")
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="invoice",
        cascade="all,delete",
        order_by="Payment.received_at",
    )

    @property
    def paid_total(self) -> float:
        return sum(float(p.amount or 0.0) for p in self.payments)

    @property
    def outstanding(self) -> float:
        return max(0.0, float(self.total or 0.0) - self.paid_total)


class Payment(Base):
    """M4 — a single payment recorded against an invoice."""
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"))
    amount: Mapped[float] = mapped_column(Float, default=0.0)
    method: Mapped[str] = mapped_column(String(20), default="eft")
    reference: Mapped[str] = mapped_column(String(120), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    received_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    invoice: Mapped[Invoice] = relationship(back_populates="payments")


class Warehouse(Base):
    """M3 — physical or logical warehouse.

    Every internal location belongs to exactly one warehouse.
    `code` is a short identifier used in stock-move references.
    """
    __tablename__ = "warehouses"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    code: Mapped[str] = mapped_column(String(20), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    locations: Mapped[list["Location"]] = relationship(
        back_populates="warehouse",
        cascade="all,delete",
        order_by="Location.id",
    )


class Location(Base):
    """M3 — logical stock location.

    `kind` controls behaviour at move time:
      internal   — your own storage (any internal-only move is a transfer)
      supplier   — virtual source for goods arriving on a PO
      customer   — virtual sink for goods delivered to a sales customer
      production — virtual sink/source for MO consumption/output (M5)
      scrap      — virtual sink for written-off stock

    Non-internal locations have no warehouse_id (NULL) — they live
    outside the company's physical footprint. parent_id is reserved
    for future zone/bin nesting; currently flat.
    """
    __tablename__ = "stock_locations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(20), default="internal")
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("stock_locations.id"), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    warehouse: Mapped["Warehouse | None"] = relationship(back_populates="locations")


class Lot(Base):
    """M3 — lot / serial / batch number.

    Optional per-move. When set, quants are broken down by lot so the
    user can trace which production batch a delivery came from.
    """
    __tablename__ = "stock_lots"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"))
    name: Mapped[str] = mapped_column(String(120))
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class StockMove(Base):
    """M3 — the source of truth for inventory state.

    Every change to on-hand stock is a StockMove. Quants are computed
    by summing done moves per (item, location). A move's lifecycle is
    draft → confirmed → done, with `cancelled` as the terminal escape.
    Done moves are immutable.

    `reference_kind` + `reference_id` link back to the originating
    document (PO receipt, sales delivery, manufacturing order). Free-form
    so M3/M5/etc. can use the same column without a join table.
    """
    __tablename__ = "stock_moves"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"))
    qty: Mapped[float] = mapped_column(Float, default=0.0)
    source_location_id: Mapped[int] = mapped_column(ForeignKey("stock_locations.id"))
    dest_location_id: Mapped[int] = mapped_column(ForeignKey("stock_locations.id"))
    state: Mapped[str] = mapped_column(String(20), default="draft")
    reference_kind: Mapped[str] = mapped_column(String(20), default="")
    reference_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lot_id: Mapped[int | None] = mapped_column(ForeignKey("stock_lots.id"), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    done_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ReorderRule(Base):
    """M3 — auto-reorder threshold for an item at a location.

    When on-hand at `location_id` drops below `min_qty`, the trigger
    endpoint creates a draft PO with enough quantity to refill toward
    `max_qty`, rounded UP to `qty_multiple` (default 1, i.e. no rounding).
    Picks the cheapest active ItemSupplier as the supplier.
    """
    __tablename__ = "reorder_rules"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"))
    location_id: Mapped[int] = mapped_column(ForeignKey("stock_locations.id"))
    min_qty: Mapped[float] = mapped_column(Float, default=0.0)
    max_qty: Mapped[float] = mapped_column(Float, default=0.0)
    qty_multiple: Mapped[float] = mapped_column(Float, default=1.0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Scrap(Base):
    """M3 — write-off event.

    Always paired with a StockMove (internal → scrap location). This
    table just stores the human-facing reason / metadata so we can list
    scraps separately from regular transfers.
    """
    __tablename__ = "scraps"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    stock_move_id: Mapped[int] = mapped_column(ForeignKey("stock_moves.id"))
    reason: Mapped[str] = mapped_column(String(400), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PurchaseOrder(Base):
    """M2 — outbound purchase order to a supplier.

    Lifecycle: draft → confirmed → received → (optionally) cancelled.
    M3 will wire `received` to actual stock moves; for now the receipt
    only updates the per-line received_qty so we have a paper trail.
    """
    __tablename__ = "purchase_orders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ref: Mapped[str] = mapped_column(String(40), default="")
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"))
    status: Mapped[str] = mapped_column(String(20), default="draft")
    expected_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    currency: Mapped[str] = mapped_column(String(8), default="ZAR")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    received_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    supplier: Mapped["Supplier"] = relationship()
    lines: Mapped[list["PurchaseLine"]] = relationship(
        back_populates="po",
        cascade="all,delete",
        order_by="PurchaseLine.sequence",
    )
    receipts: Mapped[list["Receipt"]] = relationship(
        back_populates="po",
        cascade="all,delete",
        order_by="Receipt.received_at",
    )

    @property
    def total(self) -> float:
        return sum(ln.line_total for ln in self.lines)


class PurchaseLine(Base):
    """M2 — single line on a purchase order.

    `received_qty` is the running total of what the supplier has actually
    delivered (across one or more Receipts). M3 will replace the simple
    counter with StockMove records, but the API shape stays the same.
    """
    __tablename__ = "purchase_lines"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    po_id: Mapped[int] = mapped_column(ForeignKey("purchase_orders.id"))
    item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id"), nullable=True)
    sequence: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str] = mapped_column(String(300), default="")
    quantity: Mapped[float] = mapped_column(Float, default=1.0)
    unit_of_measure: Mapped[str] = mapped_column(String(20), default="each")
    unit_cost: Mapped[float] = mapped_column(Float, default=0.0)
    received_qty: Mapped[float] = mapped_column(Float, default=0.0)
    supplier_code: Mapped[str] = mapped_column(String(60), default="")

    po: Mapped[PurchaseOrder] = relationship(back_populates="lines")

    @property
    def line_total(self) -> float:
        return float(self.quantity or 0.0) * float(self.unit_cost or 0.0)


class Receipt(Base):
    """M2 — a single delivery event against a purchase order.

    A PO can have multiple receipts if the supplier splits the delivery.
    `lines_json` stores per-line received_qty for this event so the audit
    trail survives a line being deleted from the PO later.
    """
    __tablename__ = "po_receipts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    po_id: Mapped[int] = mapped_column(ForeignKey("purchase_orders.id"))
    received_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    notes: Mapped[str] = mapped_column(Text, default="")
    lines_json: Mapped[str] = mapped_column(Text, default="[]")

    po: Mapped[PurchaseOrder] = relationship(back_populates="receipts")


class ItemSupplier(Base):
    """M1 — many-to-many between Item and Supplier with per-link metadata.

    Lets the same item have multiple suppliers (with different prices /
    lead times); the purchase planner in M2 will pick the cheapest active
    link by default. Per-link `lead_time_days` overrides the supplier's
    default when non-zero.
    """
    __tablename__ = "item_suppliers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"))
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"))
    supplier_code: Mapped[str] = mapped_column(String(60), default="")
    supplier_price: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), default="ZAR")
    min_qty: Mapped[float] = mapped_column(Float, default=0.0)
    lead_time_days: Mapped[int] = mapped_column(Integer, default=0)

    supplier: Mapped[Supplier] = relationship(back_populates="item_links")


class CustomTile(Base):
    """Studio mode — user-defined launcher tile.

    Click → /p/<slug> → PageRenderer reads a `page_layouts` row keyed
    "custom:<slug>" and renders the generic block set (heading / notes /
    links). Deleting the tile cascades to wipe the matching page_layouts row.
    """
    __tablename__ = "custom_tiles"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(120))
    icon: Mapped[str] = mapped_column(String(20), default="🧩")
    color: Mapped[str] = mapped_column(String(20), default="#64748b")
    sequence: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


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
