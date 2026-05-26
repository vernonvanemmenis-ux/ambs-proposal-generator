"""Studio mode — page block registry.

Each customisable page declares the blocks it supports here. The frontend
ships a parallel registry of React component implementations keyed by the
same (page_key, block_key) tuple; together they let users toggle / reorder
named widgets on a page without writing code.

Adding a new block to an existing page:
    1. Register it in PAGE_BLOCKS below with a label, description, and
       `default_enabled` flag.
    2. Implement the React component and add it to the matching frontend
       registry (frontend/src/blocks/<page>.ts).

Blocks are page-scoped — the same block_key can mean different things on
different pages. Decided in Studio §7 Q4 (2026-05-24); revisit if ≥ 30%
of blocks end up duplicated across pages.

User-defined "custom" launcher tiles all share the pseudo-page "custom"
entry below. Their runtime page_key is "custom:<slug>"; `get_page_blocks`
strips the prefix to find the template, while `page_layouts` rows keep
the prefixed key so multiple custom pages don't collide.
"""

from __future__ import annotations


CUSTOM_PAGE_PREFIX = "custom:"


PAGE_BLOCKS: dict[str, dict[str, dict]] = {
    "pipeline": {
        "smart_stats": {
            "label": "Smart stats row",
            "description": "Top-bar tiles showing per-stage opportunity counts and total pipeline value.",
            "default_enabled": True,
        },
        "tip_strip": {
            "label": "Drag-to-move tip",
            "description": 'The thin "drag cards between columns" hint above the kanban board.',
            "default_enabled": True,
        },
        "kanban": {
            "label": "Kanban board",
            "description": "The main drag-and-drop opportunity board, grouped by stage.",
            "default_enabled": True,
        },
    },
    "suppliers": {
        "supplier_list": {
            "label": "Supplier list",
            "description": "Searchable table of all vendors with contact details and links to items they supply.",
            "default_enabled": True,
        },
    },
    "purchase": {
        "po_stats": {
            "label": "PO stats row",
            "description": "Top-bar tiles showing per-status counts and total open committed spend.",
            "default_enabled": True,
        },
        "po_kanban": {
            "label": "PO kanban board",
            "description": "Drag-to-move kanban grouping purchase orders by lifecycle status (draft, confirmed, received, cancelled).",
            "default_enabled": True,
        },
    },
    "inventory": {
        "inventory_stats": {
            "label": "Inventory stats row",
            "description": "Counts of items, warehouses, internal locations, plus active stock-move backlog.",
            "default_enabled": True,
        },
        "low_stock_alerts": {
            "label": "Low-stock alerts",
            "description": "Reorder rules where on-hand is below the min threshold, with a Trigger reorder button.",
            "default_enabled": True,
        },
        "stock_grid": {
            "label": "On-hand stock grid",
            "description": "Computed quants by item and location from done stock moves.",
            "default_enabled": True,
        },
        "recent_moves": {
            "label": "Recent stock moves",
            "description": "Last 25 stock-move events across all items and locations.",
            "default_enabled": True,
        },
    },
    "warehouses": {
        "warehouse_list": {
            "label": "Warehouses & locations",
            "description": "Manage warehouses and their internal locations, plus virtual supplier/customer/scrap/production sinks.",
            "default_enabled": True,
        },
    },
    "stock_transfers": {
        "transfer_kanban": {
            "label": "Transfer kanban",
            "description": "In-flight stock moves grouped by state (draft, confirmed, done, cancelled).",
            "default_enabled": True,
        },
    },
    "reorder_rules": {
        "rule_list": {
            "label": "Reorder rule list",
            "description": "Per-item min/max thresholds at a location, plus a manual trigger that auto-creates draft POs.",
            "default_enabled": True,
        },
    },
    "sales_orders": {
        "so_stats": {
            "label": "SO stats row",
            "description": "Counts and totals across the sales-order lifecycle (open commitment, invoiced YTD, paid YTD).",
            "default_enabled": True,
        },
        "so_kanban": {
            "label": "SO kanban",
            "description": "Sales orders grouped by state (confirmed, delivered, invoiced, paid, cancelled).",
            "default_enabled": True,
        },
    },
    "invoices": {
        "invoice_stats": {
            "label": "Invoice stats row",
            "description": "Outstanding total, overdue count, paid YTD.",
            "default_enabled": True,
        },
        "invoice_list": {
            "label": "Invoice list",
            "description": "Searchable table of all invoices with state, totals, and outstanding balance.",
            "default_enabled": True,
        },
    },
    "manufacturing": {
        "mo_stats": {
            "label": "MO stats row",
            "description": "Draft/confirmed/in-progress/done counts plus throughput.",
            "default_enabled": True,
        },
        "mo_kanban": {
            "label": "MO kanban",
            "description": "Manufacturing orders grouped by state (draft, confirmed, in_progress, done, cancelled).",
            "default_enabled": True,
        },
    },
    "boms": {
        "bom_list": {
            "label": "BoM list",
            "description": "All Bills of Materials with finished item, version, line/operation counts.",
            "default_enabled": True,
        },
    },
    "work_centers": {
        "work_center_list": {
            "label": "Work centers",
            "description": "Stations where BoM operations run. Capacity per hour, cost per hour, calendar.",
            "default_enabled": True,
        },
    },
    "custom": {
        "heading": {
            "label": "Heading",
            "description": "Large title at the top of the page. Click to edit inline.",
            "default_enabled": True,
        },
        "notes": {
            "label": "Notes",
            "description": "Free-text notes block. Click to enter edit mode; blur saves.",
            "default_enabled": True,
        },
        "links": {
            "label": "Links list",
            "description": "Vertical list of label + URL rows the user can add to inline.",
            "default_enabled": False,
        },
    },
}


def get_page_blocks(page_key: str) -> dict | None:
    """Resolve a runtime page_key to its registry template entry.

    For "custom:<slug>" keys, returns the shared "custom" template so
    every user-defined page shares the same block menu. Returns None
    when the key is unknown.
    """
    if page_key.startswith(CUSTOM_PAGE_PREFIX):
        return PAGE_BLOCKS.get("custom")
    return PAGE_BLOCKS.get(page_key)


def is_valid_page(page_key: str) -> bool:
    """Whether a runtime page_key resolves to something we can render.

    Custom keys are valid as long as they carry a non-empty slug after
    the prefix — the actual `custom_tiles` row may not exist yet (the
    layout endpoints don't gate on it, by design).
    """
    if page_key.startswith(CUSTOM_PAGE_PREFIX):
        slug = page_key[len(CUSTOM_PAGE_PREFIX):].strip()
        return bool(slug)
    return page_key in PAGE_BLOCKS


def default_layout(page_key: str) -> list[dict]:
    """Return the default block list for a page in registry order.

    Each entry: ``{"key": str, "enabled": bool, "config": {}}``.
    Returns an empty list for unknown page_keys (callers should validate
    via ``is_valid_page`` first if they need to 404).
    """
    page = get_page_blocks(page_key) or {}
    return [
        {"key": key, "enabled": bool(meta.get("default_enabled", True)), "config": {}}
        for key, meta in page.items()
    ]
