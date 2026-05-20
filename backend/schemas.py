from datetime import datetime, date
from pydantic import BaseModel, ConfigDict


class ClientBase(BaseModel):
    name: str
    industry: str = ""
    contact_person: str = ""
    email: str = ""
    phone: str = ""
    site_location: str = ""


class ClientCreate(ClientBase):
    pass


class ClientOut(ClientBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime


# ---------------- Opportunity lines ----------------
class OpportunityLineIn(BaseModel):
    item_code: str = ""
    product_line: str = ""
    structure_type: str = ""
    description: str = ""
    quantity: float = 1.0
    unit_of_measure: str = "each"
    unit_rate: float = 0.0
    sequence: int = 0
    # Sales extras
    discount_pct: float = 0.0
    is_optional: bool = False
    cost_rate: float = 0.0


class OpportunityLineOut(OpportunityLineIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    line_total: float
    margin: float = 0.0


# ---------------- Opportunity ----------------
class OpportunityBase(BaseModel):
    title: str
    client_id: int
    stage: str = "new"
    delivery_weeks: int = 4
    priority: int = 0
    notes: str = ""
    expected_close: datetime | None = None
    valid_until: date | None = None
    salesperson: str = ""
    deposit_pct: float = 0.0


class OpportunityCreate(OpportunityBase):
    lines: list[OpportunityLineIn] = []


class OpportunityUpdate(BaseModel):
    title: str | None = None
    stage: str | None = None
    delivery_weeks: int | None = None
    priority: int | None = None
    notes: str | None = None
    expected_close: datetime | None = None
    valid_until: date | None = None
    salesperson: str | None = None
    deposit_pct: float | None = None


class OpportunityOut(OpportunityBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    amount: float
    optional_amount: float = 0.0
    project_id: int | None = None
    client: ClientOut
    lines: list[OpportunityLineOut]


# ---------------- Items catalogue ----------------
class ItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    category: str
    product_line: str
    structure_type: str
    unit_of_measure: str
    default_rate: float
    description: str
    tags: str = ""


class ItemIn(BaseModel):
    code: str
    name: str
    category: str = "Component"
    product_line: str = ""
    structure_type: str = ""
    unit_of_measure: str = "each"
    default_rate: float = 0.0
    description: str = ""
    tags: str = ""


# ---------------- Opportunity templates ----------------
class TemplateLine(BaseModel):
    item_code: str = ""
    description: str = ""
    quantity: float = 1.0
    unit_of_measure: str = "each"
    unit_rate: float = 0.0
    product_line: str = ""
    structure_type: str = ""
    is_optional: bool = False


class OpportunityTemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str
    icon: str
    industry: str
    title_hint: str
    default_delivery_weeks: int
    default_deposit_pct: float
    default_lines: list[TemplateLine] = []
    is_active: bool
    created_at: datetime


class OpportunityTemplateIn(BaseModel):
    name: str
    description: str = ""
    icon: str = "📋"
    industry: str = ""
    title_hint: str = ""
    default_delivery_weeks: int = 6
    default_deposit_pct: float = 40.0
    default_lines: list[TemplateLine] = []
    is_active: bool = True


# ---------------- Activity / Proposal / Status ----------------
class ActivityCreate(BaseModel):
    kind: str = "message"
    body: str
    author: str = "You"


class ActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    kind: str
    author: str
    body: str
    created_at: datetime


class ProposalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ref: str
    filename: str
    generated_at: datetime
    channel: str
    pandadoc_id: str
    status: str = "draft"
    status_updated_at: datetime | None = None


class ProposalStatusUpdate(BaseModel):
    status: str  # one of constants.PROPOSAL_STATUS_VALUES


# ---------------- Projects / Stages / Tasks / Attachments ----------------
class TaskAttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    filename: str
    content_type: str
    size_bytes: int
    uploaded_at: datetime


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    stage_id: int
    title: str
    assignee: str = ""
    target_date: date | None = None
    notes: str = ""
    sequence: int = 0
    created_at: datetime
    attachments: list[TaskAttachmentOut] = []


class TaskCreate(BaseModel):
    title: str
    stage_id: int | None = None  # if omitted, lands in the first stage
    assignee: str = ""
    target_date: date | None = None
    notes: str = ""


class TaskUpdate(BaseModel):
    title: str | None = None
    assignee: str | None = None
    target_date: date | None = None
    notes: str | None = None
    stage_id: int | None = None
    sequence: int | None = None


class TaskMove(BaseModel):
    stage_id: int
    sequence: int = 0


class ProjectStageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    name: str
    color: str
    sequence: int


class ProjectStageCreate(BaseModel):
    name: str
    color: str = "#64748b"
    sequence: int | None = None


class ProjectStageUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    sequence: int | None = None


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    opportunity_id: int | None = None
    client_id: int | None = None
    status: str
    notes: str
    created_at: datetime
    stages: list[ProjectStageOut] = []
    tasks: list[TaskOut] = []
    client: ClientOut | None = None


class ProjectCreate(BaseModel):
    name: str
    opportunity_id: int | None = None
    client_id: int | None = None
    notes: str = ""


class ProjectUpdate(BaseModel):
    name: str | None = None
    status: str | None = None  # active | archived
    notes: str | None = None


class SectionData(BaseModel):
    kind: str
    enabled: bool = True
    config: dict = {}


class TemplateBase(BaseModel):
    name: str
    description: str = ""
    is_default: bool = False
    brand_company_name: str = "AMBS"
    brand_tagline: str = "African Modular Building Solutions"
    brand_address_line: str = ""
    brand_contact_line: str = ""
    brand_primary_color: str = "#2563B0"
    brand_accent_color: str = "#0B1120"
    logo_filename: str = ""
    sections: list[SectionData] = []


class TemplateCreate(TemplateBase):
    pass


class TemplateOut(TemplateBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime


class StatusOut(BaseModel):
    online: bool
    pandadoc_configured: bool
    app_version: str
    db_path: str


class CatalogueOut(BaseModel):
    product_lines: list[str]
    structure_types: list[str]
    units_of_measure: list[str]
    section_kinds: list[str]
    proposal_status_values: list[str] = []
    default_project_stages: list[dict] = []
