# AMBS Proposal Generator

An offline-first, Windows-installable business tool for **African Modular Building Solutions (AMBS)** — built as a demo of what SolutionsAI can deliver.

- **UI:** ERP-style layout (app launcher, kanban pipeline, chevron form view, chatter log) wrapped in the SolutionsAI brand.
- **Runs offline:** SQLite database, local proposal generation via `python-docx`.
- **Online extras:** PandaDoc send flow and auto-updates light up when the host is connected.
- **Upgradable:** a payload/launcher split means bug fixes and improvements roll out automatically — no reinstall.

## Architecture

```
installer (Inno Setup)   →  C:\Program Files\SolutionsAI\AMBSProposalGen\
                              AMBSProposalGen.exe        ← thin PyInstaller launcher
                              runtime\                     (bundled Python)

per-user                 →  %APPDATA%\SolutionsAI\AMBSProposalGen\
                              payload\current\            ← backend + frontend (UPDATES LAND HERE)
                              payload\previous\           ← auto-rollback target
                              data\ambs.db                ← SQLite — never touched by updates
                              output\                     ← generated .docx proposals
```

## Dev

```
run-dev.bat
```

Spawns the FastAPI backend on :8765 and the Vite frontend on :5173. Open <http://localhost:5173>.

Manually:

```bash
# backend
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
python -m backend.main        # http://127.0.0.1:8765

# frontend (separate shell)
cd frontend
npm install
npm run dev                   # http://localhost:5173 (proxies /api and /static)
```

## Packaging a release

```
build-release.bat
```

Runs: `npm run build` → PyInstaller (`build/AMBSProposalGen.spec`) → Inno Setup
(`build/installer.iss`). Output: `build/installer_out/AMBSProposalGen-Setup-<v>.exe`.

Prerequisites:
- Node 18+ and npm
- Python 3.11+
- Inno Setup 6 (`iscc.exe` on PATH) — <https://jrsoftware.org/isdl.php>

## Publishing an update

No reinstall is required — updates land as a new payload ZIP.

```bash
# Bump version inside backend/updater.py (APP_VERSION)
npm --prefix frontend run build
python build/publish_update.py 0.2.0 --notes "Added bulk proposal export"
```

Upload both files from `build/releases/0.2.0/` to your update host:

```
payload-0.2.0.zip   →  https://updates.solutionsai.co.za/ambs-proposal-gen/payload-0.2.0.zip
manifest.json       →  https://updates.solutionsai.co.za/ambs-proposal-gen/manifest.json
```

Installed apps poll the manifest on every launch (and every 60 s while open) and
show a blue "Update available" banner. Clicking Apply downloads + verifies the
SHA-256 + stages it for the next launch; if the new version crashes three times
in a row, the launcher automatically rolls back to the previous payload.

### Update host

Anything that serves static files will do:
- GitHub Releases (public)
- Cloudflare R2 / Backblaze B2 with a public bucket
- Your own subdomain on any CDN

Override the default URL per-install via `AMBS_UPDATE_MANIFEST_URL` env var.

## Online vs offline features

| Feature                     | Offline | Online |
| --------------------------- | :-----: | :----: |
| Create / edit clients       |   ✓     |   ✓    |
| Create / edit opportunities |   ✓     |   ✓    |
| Move cards through pipeline |   ✓     |   ✓    |
| Generate .docx proposal     |   ✓     |   ✓    |
| Send via PandaDoc           |         |   ✓    |
| Download app updates        |         |   ✓    |

## Project layout

```
backend/                 FastAPI + SQLAlchemy + SQLite + python-docx generator
  main.py                app entry, mounts routers + built frontend
  db.py / models.py      schema (Client, Opportunity, Proposal, Activity)
  seed.py                demo data (AMBS-flavoured clients)
  proposal_generator.py  AMBS-voiced .docx generator
  updater.py             manifest check / download / verify / swap
  pandadoc.py            online detection + send stub
  routers/*              /api/clients /api/opportunities /api/proposals /api/status /api/update
  static/                SolutionsAI logos

frontend/                Vite + React + TypeScript + Tailwind
  src/pages/             Launcher, Pipeline, OpportunityForm
  src/components/        TopNav, UpdateBanner
  src/api.ts             typed client

launcher/launcher.py     PyInstaller entry — manages payload dir, rollback

build/
  AMBSProposalGen.spec   PyInstaller config
  installer.iss          Inno Setup installer
  publish_update.py      zips payload + writes manifest.json
```
