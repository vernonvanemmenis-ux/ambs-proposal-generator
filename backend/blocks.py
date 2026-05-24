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
"""

from __future__ import annotations


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
}


def default_layout(page_key: str) -> list[dict]:
    """Return the default block list for a page in registry order.

    Each entry: ``{"key": str, "enabled": bool, "config": {}}``.
    Returns an empty list for unknown page_keys (callers should validate
    against ``PAGE_BLOCKS`` first if they need to 404).
    """
    page = PAGE_BLOCKS.get(page_key, {})
    return [
        {"key": key, "enabled": bool(meta.get("default_enabled", True)), "config": {}}
        for key, meta in page.items()
    ]
