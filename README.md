# AMBS Proposal Generator

A Windows desktop app that lets **AMBS (African Modular Building Solutions)** generate branded, editable proposals offline — no internet, no AI APIs, no third-party tools required.

Built as a demo by **[SolutionsAI](https://www.solutionsai.co.za)**.

## Download

Pick one from the [latest release](../../releases/latest):

| File | What it is |
| --- | --- |
| `AMBSProposalGen-Setup-0.1.0.exe` | **Recommended.** Windows installer with Start-Menu entry + clean uninstaller. |
| `AMBSProposalGen-Portable-v0.1.0.zip` | Portable edition — unzip anywhere, double-click `AMBSProposalGen.exe`. |

Windows SmartScreen may show *"Windows protected your PC"* the first time (the installer is unsigned). Click **More info → Run anyway**.

## What it does

- **Clients, Items catalogue, Opportunities** — full offline CRUD over a local SQLite database
- **Multi-line opportunities** with Quantity + Unit-of-Measure (m², each, hour, km, lump sum, …) and an auto-complete items catalogue
- **Editable proposal templates** — drag-to-reorder sections (header, client info, text blocks, scope, line items, commercial summary, why-us, signature, page break), per-template logo upload, brand colour pickers, variable substitution (`{{client.name}}`, `{{opportunity.title}}`, …)
- **Live A4 preview** of the template before generating
- **One-click `.docx` generation** — rendered locally with `python-docx`, no external APIs
- **Auto-updater** — when connected to the internet, the app checks this repo's latest release for a new `manifest.json`, downloads the payload, verifies SHA-256, and applies on next launch. Your data is never touched by updates.

## Where your data lives

```
C:\Users\<you>\AppData\Roaming\SolutionsAI\AMBSProposalGen\
  data\ambs.db      ← SQLite database
  data\logos\       ← uploaded template logos
  output\           ← generated .docx proposals
```

Accessible in-app from the **Database** card on the home screen ("Open folder").

## System requirements

- Windows 10 or later (64-bit)
- ~100 MB free disk space
- No Python / Node / admin rights needed for the portable build

## License

All rights reserved © SolutionsAI 2026. This repository hosts release binaries only; the source lives in a private SolutionsAI repo.
