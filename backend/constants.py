"""AMBS catalogue constants — sourced from ambs.co.za."""

PRODUCT_LINES = [
    "Fast Space Mobile Units",
    "Prefabricated Offices & Workspaces",
    "Poultry & Greenhouse Modular Buildings",
    "Modular Classrooms & Education Facilities",
    "Prefabricated Healthcare Clinics & Hospitals",
    "Mining & Remote Site Accommodation",
    "Folding Mobile Units",
    "Converted Containers",
    "Interlocking Panel Systems",
    "Custom Design Systems",
]

STRUCTURE_TYPES = [
    "Interlocking Panel System",
    "Converted Container",
    "Folding Mobile Unit",
    "Fast Space Mobile Unit",
    "Custom Design System",
]

UNITS_OF_MEASURE = [
    "each",
    "m²",
    "m",
    "m³",
    "kg",
    "hour",
    "day",
    "night",
    "km",
    "lump sum",
]

SCHEMA_VERSION = 6  # bumped when DB schema changes — triggers wipe+reseed

# Available section kinds for the proposal template editor. Each kind has its
# own UI form + renderer in proposal_generator.py.
SECTION_KINDS = [
    "header",
    "client_info",
    "text",
    "scope",
    "line_items",
    "commercial",
    "why_us",
    "signature",
    "page_break",
]

# Quotation/Proposal lifecycle: Draft → Sent → Viewed → Signed → Paid.
PROPOSAL_STATUS_VALUES = ["draft", "sent", "viewed", "signed", "paid"]

# Default construction-project task stages, applied when an Opportunity is Won.
# Each project gets its own copy so stages can be renamed/added/removed per project.
DEFAULT_PROJECT_STAGES = [
    {"name": "Design",        "color": "#8b5cf6"},
    {"name": "Procurement",   "color": "#3b82f6"},
    {"name": "Site",          "color": "#f59e0b"},
    {"name": "Commissioning", "color": "#10b981"},
    {"name": "Handover",      "color": "#64748b"},
]
