# Changelog

## v0.3.0 — Construction projects + sales upgrades

- Drag-and-drop on the Proposals Pipeline via `@dnd-kit/core` (cards move between stages; click-to-open preserved)
- New Projects module: once an Opportunity is Won a construction project auto-spawns with 5 default stages (Design → Procurement → Site → Commissioning → Handover) and a seed kickoff task
- Project task board: kanban with drag-and-drop, task drawer, chatter, file attachments (25 MB cap, stored under `%APPDATA%`)
- Quotation extras on opportunities: line-level discount %, optional/upsell items (rendered as a separate table in the `.docx`, not summed into the headline total), quotation `valid_until` with Expired badge, salesperson, deposit % shown in the commercial section
- Internal `cost_rate` per line with inline margin display — never printed in the proposal
- Proposal lifecycle: Draft → Sent → Viewed → Signed → Paid with status pills and manual-advance buttons
- `publish-local.py` — one command stages a fresh payload locally so the installed app hot-swaps to new code on next launch (no reinstall, no web host)

## v0.1.0 — Initial public release

- ERP-style UI (app launcher, kanban pipeline, chevron status bar, chatter log) themed with SolutionsAI branding
- Fully offline SQLite database — clients, items catalogue (21 seeded), opportunities, multi-line quotations
- Editable proposal template system with 9 section kinds, drag-to-reorder, variable substitution
- Per-template logo upload + brand colour pickers
- Live A4 preview pane
- Template-driven `.docx` generation via `python-docx` — no third-party APIs
- Auto-updater pointing at this repo's releases
- Payload + launcher split — app updates never touch user data
