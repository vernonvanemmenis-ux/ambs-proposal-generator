import json
import shutil
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy.orm import Session
from .constants import DEFAULT_PROJECT_STAGES
from .db import engine, SessionLocal, Base, ensure_schema_version, LOGOS_DIR
from .models import (
    Activity,
    Client,
    Item,
    Opportunity,
    OpportunityLine,
    Project,
    ProjectStage,
    ProposalTemplate,
    Task,
)

STATIC_DIR = Path(__file__).resolve().parent / "static"


# --- Items catalogue (would be maintained by AMBS internally) -----------------
ITEMS = [
    # Structures (area-based)
    {"code": "STR-OFF-PF", "name": "Prefabricated Office Module",
     "category": "Structure", "product_line": "Prefabricated Offices & Workspaces",
     "structure_type": "Interlocking Panel System",
     "unit_of_measure": "m²", "default_rate": 9200,
     "description": "Standard office module with insulated panels, DB-ready"},
    {"code": "STR-CLS-IP", "name": "Modular Classroom (IPS)",
     "category": "Structure", "product_line": "Modular Classrooms & Education Facilities",
     "structure_type": "Interlocking Panel System",
     "unit_of_measure": "m²", "default_rate": 7950,
     "description": "DBE-spec 60 m² classroom, pre-wired, chalkboard-ready"},
    {"code": "STR-CLN-IP", "name": "Clinic Module (SANS 10400)",
     "category": "Structure", "product_line": "Prefabricated Healthcare Clinics & Hospitals",
     "structure_type": "Interlocking Panel System",
     "unit_of_measure": "m²", "default_rate": 11200,
     "description": "SANS 10400 compliant consulting / treatment module"},
    {"code": "STR-SLP-IP", "name": "Sleeping Quarters Module",
     "category": "Structure", "product_line": "Mining & Remote Site Accommodation",
     "structure_type": "Interlocking Panel System",
     "unit_of_measure": "m²", "default_rate": 8750,
     "description": "En-suite sleeping quarters, insulated, solar-ready"},
    {"code": "STR-PLT-IP", "name": "Poultry Layer House",
     "category": "Structure", "product_line": "Poultry & Greenhouse Modular Buildings",
     "structure_type": "Interlocking Panel System",
     "unit_of_measure": "m²", "default_rate": 6400,
     "description": "Climate-controlled layer house for 10k birds"},
    # Containers (per-unit)
    {"code": "CNT-6M-OFF", "name": "Container Office — 6m converted",
     "category": "Structure", "product_line": "Converted Containers",
     "structure_type": "Converted Container",
     "unit_of_measure": "each", "default_rate": 85000,
     "description": "6 m container fitted as office — door, 2× windows, DB"},
    {"code": "CNT-12M-OFF", "name": "Container Office — 12m converted",
     "category": "Structure", "product_line": "Converted Containers",
     "structure_type": "Converted Container",
     "unit_of_measure": "each", "default_rate": 160000,
     "description": "12 m container as double office with meeting area"},
    {"code": "STR-FSM-OFF", "name": "Fast Space Mobile Office",
     "category": "Structure", "product_line": "Fast Space Mobile Units",
     "structure_type": "Fast Space Mobile Unit",
     "unit_of_measure": "each", "default_rate": 120000,
     "description": "Relocatable mobile office unit on skid base"},
    # Components / accessories
    {"code": "CMP-AC-9K", "name": "Air-conditioning unit (9 000 BTU)",
     "category": "Component", "unit_of_measure": "each", "default_rate": 8500,
     "description": "Split AC, supply + install"},
    {"code": "CMP-AC-18K", "name": "Air-conditioning unit (18 000 BTU)",
     "category": "Component", "unit_of_measure": "each", "default_rate": 14500,
     "description": "Split AC for larger rooms"},
    {"code": "CMP-DB-STD", "name": "DB board + internal wiring",
     "category": "Component", "unit_of_measure": "each", "default_rate": 12000,
     "description": "COC-compliant distribution board with internal wiring"},
    {"code": "CMP-NET-CAT6", "name": "Network cabling (Cat 6, installed)",
     "category": "Component", "unit_of_measure": "m", "default_rate": 180,
     "description": "Cat 6 cable, conduits, terminated"},
    {"code": "CMP-PLB-STD", "name": "Plumbing stub-out kit",
     "category": "Component", "unit_of_measure": "each", "default_rate": 4500,
     "description": "Hot & cold water, waste, basin rough-in"},
    {"code": "CMP-WND-ALU", "name": "Window upgrade — aluminium",
     "category": "Component", "unit_of_measure": "each", "default_rate": 3200,
     "description": "Aluminium-frame window upgrade (per opening)"},
    {"code": "CMP-DR-SEC", "name": "Door upgrade — steel security",
     "category": "Component", "unit_of_measure": "each", "default_rate": 5800,
     "description": "Steel security door with lever lockset"},
    {"code": "CMP-INS-THK", "name": "Insulation upgrade — 50 mm foil",
     "category": "Component", "unit_of_measure": "m²", "default_rate": 450,
     "description": "Foil-backed insulation upgrade for roof/walls"},
    {"code": "CMP-RF-HVAC", "name": "HVAC-ready roofing",
     "category": "Component", "unit_of_measure": "m²", "default_rate": 820,
     "description": "Reinforced roofing prepared for HVAC units"},
    # Services
    {"code": "SVC-DLV-KM", "name": "Delivery & transport",
     "category": "Service", "unit_of_measure": "km", "default_rate": 65,
     "description": "Truck + offload coordination"},
    {"code": "SVC-CRN-DY", "name": "Crane lift coordination",
     "category": "Service", "unit_of_measure": "day", "default_rate": 3500,
     "description": "Crane + rigger for site placement"},
    {"code": "SVC-CRW-NGT", "name": "Installation crew accommodation",
     "category": "Service", "unit_of_measure": "night", "default_rate": 1500,
     "description": "On-site crew accommodation per person-night"},
    {"code": "SVC-COM-LS", "name": "Commissioning & handover",
     "category": "Service", "unit_of_measure": "lump sum", "default_rate": 15000,
     "description": "Final snag, compliance certs, handover pack"},
]


# --- Demo clients + opportunities --------------------------------------------
DEMO_CLIENTS = [
    {
        "client": {
            "name": "Northam Platinum - Zondereinde",
            "industry": "Mining",
            "contact_person": "Thabo Mokoena",
            "email": "thabo.mokoena@northam.co.za",
            "phone": "+27 14 784 0000",
            "site_location": "Thabazimbi, Limpopo",
        },
        "opp": {
            "title": "80-bed Remote Site Accommodation",
            "stage": "proposal",
            "delivery_weeks": 10,
            "priority": 3,
            "notes": "Phase 1 of a 3-phase camp rollout. On-site handover before Q3 shaft expansion.",
        },
        "lines": [
            {"item_code": "STR-SLP-IP", "description": "Sleeping quarters — 80 bed, en-suite", "quantity": 960, "unit_of_measure": "m²", "unit_rate": 8750, "product_line": "Mining & Remote Site Accommodation", "structure_type": "Interlocking Panel System"},
            {"item_code": "STR-OFF-PF", "description": "Camp management office block", "quantity": 120, "unit_of_measure": "m²", "unit_rate": 9200, "product_line": "Prefabricated Offices & Workspaces", "structure_type": "Interlocking Panel System"},
            {"item_code": "", "description": "Communal dining + ablution block (custom)", "quantity": 120, "unit_of_measure": "m²", "unit_rate": 10400, "product_line": "Custom Design Systems", "structure_type": "Custom Design System"},
            {"item_code": "CMP-AC-18K", "description": "Split AC for common areas", "quantity": 6, "unit_of_measure": "each", "unit_rate": 14500},
            {"item_code": "SVC-DLV-KM", "description": "Transport — Jhb to Thabazimbi", "quantity": 280, "unit_of_measure": "km", "unit_rate": 65},
            {"item_code": "SVC-CRW-NGT", "description": "Crew accommodation during install", "quantity": 200, "unit_of_measure": "night", "unit_rate": 1500},
            {"item_code": "SVC-COM-LS", "description": "Commissioning & handover", "quantity": 1, "unit_of_measure": "lump sum", "unit_rate": 15000},
        ],
    },
    {
        "client": {
            "name": "Steve Biko Academic Hospital",
            "industry": "Healthcare",
            "contact_person": "Dr. Precious Ndlovu",
            "email": "p.ndlovu@sbah.gov.za",
            "phone": "+27 12 354 1000",
            "site_location": "Pretoria, Gauteng",
        },
        "opp": {
            "title": "Modular Outpatient Clinic Extension",
            "stage": "qualified",
            "delivery_weeks": 8,
            "priority": 2,
            "notes": "Needs SANS 10400 compliance and HVAC-ready roofing. Waiting on signed scoping doc.",
        },
        "lines": [
            {"item_code": "STR-CLN-IP", "description": "Consult rooms × 6 + waiting area", "quantity": 240, "unit_of_measure": "m²", "unit_rate": 11200, "product_line": "Prefabricated Healthcare Clinics & Hospitals", "structure_type": "Interlocking Panel System"},
            {"item_code": "STR-CLN-IP", "description": "Treatment / minor-procedure room", "quantity": 100, "unit_of_measure": "m²", "unit_rate": 12400, "product_line": "Prefabricated Healthcare Clinics & Hospitals", "structure_type": "Interlocking Panel System"},
            {"item_code": "CMP-RF-HVAC", "description": "HVAC-ready reinforced roofing", "quantity": 340, "unit_of_measure": "m²", "unit_rate": 820},
            {"item_code": "CMP-INS-THK", "description": "Foil-backed insulation upgrade", "quantity": 340, "unit_of_measure": "m²", "unit_rate": 450},
            {"item_code": "CMP-AC-18K", "description": "Split AC units", "quantity": 8, "unit_of_measure": "each", "unit_rate": 14500},
        ],
    },
    {
        "client": {
            "name": "Sasol Secunda Operations",
            "industry": "Petrochemical",
            "contact_person": "Willem Fourie",
            "email": "willem.fourie@sasol.com",
            "phone": "+27 17 610 0000",
            "site_location": "Secunda, Mpumalanga",
        },
        "opp": {
            "title": "Site Offices - Shutdown 2026",
            "stage": "new",
            "delivery_weeks": 4,
            "priority": 1,
            "notes": "Six container offices for shutdown contractor team. Air-con + network-ready.",
        },
        "lines": [
            {"item_code": "CNT-6M-OFF", "description": "6 m container office", "quantity": 6, "unit_of_measure": "each", "unit_rate": 85000, "product_line": "Converted Containers", "structure_type": "Converted Container"},
            {"item_code": "CMP-AC-9K", "description": "9 000 BTU split AC (one per container)", "quantity": 6, "unit_of_measure": "each", "unit_rate": 8500},
            {"item_code": "CMP-NET-CAT6", "description": "Network cabling between containers", "quantity": 120, "unit_of_measure": "m", "unit_rate": 180},
            {"item_code": "SVC-CRN-DY", "description": "Crane lift — set-down day", "quantity": 1, "unit_of_measure": "day", "unit_rate": 3500},
        ],
    },
    {
        "client": {
            "name": "Department of Basic Education - Limpopo",
            "industry": "Education",
            "contact_person": "Ms. Refilwe Masango",
            "email": "r.masango@dbe.gov.za",
            "phone": "+27 15 290 7600",
            "site_location": "Polokwane, Limpopo",
        },
        "opp": {
            "title": "12 Modular Classrooms - Capricorn District",
            "stage": "won",
            "delivery_weeks": 6,
            "priority": 3,
            "notes": "Awarded on Tender DBE-LP-2026/14. Rollout begins first week of May.",
        },
        "lines": [
            {"item_code": "STR-CLS-IP", "description": "Classroom module — 60 m²", "quantity": 720, "unit_of_measure": "m²", "unit_rate": 7950, "product_line": "Modular Classrooms & Education Facilities", "structure_type": "Interlocking Panel System"},
            {"item_code": "CMP-WND-ALU", "description": "Window upgrades — aluminium", "quantity": 48, "unit_of_measure": "each", "unit_rate": 3200},
            {"item_code": "SVC-DLV-KM", "description": "Transport — Jhb to Polokwane", "quantity": 320, "unit_of_measure": "km", "unit_rate": 65},
            {"item_code": "SVC-COM-LS", "description": "Commissioning & handover", "quantity": 1, "unit_of_measure": "lump sum", "unit_rate": 15000},
        ],
    },
    {
        "client": {
            "name": "Karoo Fresh Eggs (Pty) Ltd",
            "industry": "Agriculture",
            "contact_person": "Jan van Wyk",
            "email": "jan@karoofresheggs.co.za",
            "phone": "+27 23 415 2200",
            "site_location": "Oudtshoorn, Western Cape",
        },
        "opp": {
            "title": "Layer House Expansion - 40,000 Bird Capacity",
            "stage": "lost",
            "delivery_weeks": 8,
            "priority": 1,
            "notes": "Lost on price. Keep warm for Phase 2 in 2027.",
        },
        "lines": [
            {"item_code": "STR-PLT-IP", "description": "20 000-bird layer house", "quantity": 980, "unit_of_measure": "m²", "unit_rate": 6400, "product_line": "Poultry & Greenhouse Modular Buildings", "structure_type": "Interlocking Panel System"},
        ],
    },
]


DEFAULT_TEMPLATE_SECTIONS = [
    {"kind": "header", "enabled": True, "config": {
        "title": "PROJECT PROPOSAL",
        "show_reference": True,
    }},
    {"kind": "client_info", "enabled": True, "config": {
        "heading": "Prepared For",
    }},
    {"kind": "text", "enabled": True, "config": {
        "heading": "Executive Summary",
        "body": (
            "Thank you for the opportunity to propose on the {{opportunity.title}} for "
            "{{client.name}}. This proposal covers {{n_items}} line item(s) — "
            "{{total_area_m2}} m² of modular structures plus supporting components and "
            "services — delivered in {{opportunity.delivery_weeks}} weeks from deposit.\n\n"
            "AMBS panels are ready in 3 days, erected at 12.5 m² per day, and all works "
            "are executed under our ISO 9001:2015 quality system with on-time, on-budget "
            "delivery as a contractual commitment."
        ),
    }},
    {"kind": "scope", "enabled": True, "config": {
        "heading": "Scope of Work",
        "auto_include_lines": True,
        "items": [
            "Site establishment, foundations prep review, crane-lift coordination and snag-list close-out.",
            "Electrical first fix (DB ready), plumbing stub-outs, standard interior fit-out.",
            "Handover documentation pack including as-builts, compliance certificates and 12-month structural warranty.",
        ],
    }},
    {"kind": "line_items", "enabled": True, "config": {"heading": "Line Items"}},
    {"kind": "commercial", "enabled": True, "config": {
        "heading": "Commercial Summary",
        "vat_percent": 15.0,
        "payment_terms": "40% deposit  ·  40% on panel delivery  ·  20% on handover",
        "validity_days": 30,
    }},
    {"kind": "why_us", "enabled": True, "config": {
        "heading": "Why AMBS",
        "bullets": [
            "ISO 9001:2015 certified — every build audited against our quality system.",
            "Proven on-site in mining, healthcare, education, and agriculture across Southern Africa.",
            "Panels ready in 3 days  ·  erection at 12.5 m² per day  ·  minimal site disruption.",
            "Referenced on Northam Platinum, Steve Biko Academic Hospital, Mopani, Kansanshi, and dozens more.",
        ],
    }},
    {"kind": "signature", "enabled": True, "config": {
        "heading": "Acceptance",
        "preface": (
            "Acceptance of this proposal may be indicated by signature below and an official "
            "purchase order. On receipt we will issue a pro-forma invoice for the deposit and "
            "release panels into production."
        ),
        "client_label": "Signed for the Client",
        "company_label": "Signed for AMBS",
    }},
]


def seed():
    ensure_schema_version()
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()
    try:
        # Seed items if empty
        if db.query(Item).count() == 0:
            for it in ITEMS:
                db.add(Item(**it))
            db.commit()

        # Seed default proposal template if empty
        if db.query(ProposalTemplate).count() == 0:
            # Pre-populate a stock SolutionsAI logo so the first generated proposal
            # already has a logo in the header. User can replace via the editor.
            stock_logo = ""
            src_logo = STATIC_DIR / "logo-primary.png"
            if src_logo.exists():
                stock_logo = "default-solutionsai.png"
                shutil.copy2(src_logo, LOGOS_DIR / stock_logo)
            tpl = ProposalTemplate(
                name="AMBS Standard Proposal",
                description="Default AMBS-branded proposal layout. Edit to customise.",
                is_default=1,
                brand_company_name="AMBS",
                brand_tagline="African Modular Building Solutions",
                brand_address_line="Ext 5, African Park, 10-12 Jockey St, Stormill, Johannesburg",
                brand_contact_line="sales@ambs.co.za  ·  011 474 2701  ·  www.ambs.co.za  ·  ISO 9001:2015 Certified",
                brand_primary_color="#2563B0",
                brand_accent_color="#0B1120",
                logo_filename=stock_logo,
                sections_json=json.dumps(DEFAULT_TEMPLATE_SECTIONS),
            )
            db.add(tpl)
            db.commit()

        if db.query(Client).count() > 0:
            return
        for entry in DEMO_CLIENTS:
            client = Client(**entry["client"])
            db.add(client)
            db.flush()
            opp = Opportunity(
                client_id=client.id,
                expected_close=datetime.utcnow() + timedelta(days=30),
                **entry["opp"],
            )
            db.add(opp)
            db.flush()
            for i, line_data in enumerate(entry["lines"]):
                db.add(OpportunityLine(opportunity_id=opp.id, sequence=i, **line_data))
            db.add(Activity(opportunity_id=opp.id, kind="log", author="System",
                            body=f"Opportunity created for {client.name}."))
            db.add(Activity(opportunity_id=opp.id, kind="note", author="Vernon",
                            body=entry["opp"]["notes"]))
            # Seeded Won opportunities also get a construction project so the demo
            # has something to drag tasks around in.
            if entry["opp"].get("stage") == "won":
                proj = Project(
                    name=opp.title,
                    opportunity_id=opp.id,
                    client_id=client.id,
                    status="active",
                    notes="Auto-created from seeded Won opportunity.",
                )
                db.add(proj)
                db.flush()
                stages: list[ProjectStage] = []
                for i, st in enumerate(DEFAULT_PROJECT_STAGES):
                    s = ProjectStage(project_id=proj.id, name=st["name"], color=st["color"], sequence=i)
                    db.add(s)
                    stages.append(s)
                db.flush()
                if stages:
                    db.add(Task(
                        project_id=proj.id,
                        stage_id=stages[0].id,
                        title="Kickoff meeting",
                        notes="Confirm scope, deliverables, and key dates with the client.",
                        sequence=0,
                    ))
                    db.add(Task(
                        project_id=proj.id,
                        stage_id=stages[0].id,
                        title="Architectural drawings review",
                        notes="Confirm layout and structural specs.",
                        sequence=1,
                    ))
                    if len(stages) > 1:
                        db.add(Task(
                            project_id=proj.id,
                            stage_id=stages[1].id,
                            title="Source steel & insulation panels",
                            sequence=0,
                        ))
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    seed()
    print("Seed complete.")
