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

No reinstall is required — updates land as a new payload ZIP. From 0.5.0
onwards every manifest must carry an **Ed25519 signature** over the payload's
SHA-256 digest; installs reject any manifest that fails verification.

```bash
# 1. Bump version inside backend/updater.py (APP_VERSION)
# 2. Build the frontend and the payload zip
npm --prefix frontend run build
python build/publish_update.py 0.5.0 --notes "Added bulk proposal export"

# 3. Sign the payload zip — produces a manifest.json next to it.
python scripts/sign_release.py build/releases/0.5.0/payload-0.5.0.zip \
    --version 0.5.0 \
    --notes "Added bulk proposal export"
```

Upload **both** files to your release host (GitHub Releases is the only host
allow-listed by `backend/updater.py`):

```
payload-0.5.0.zip   →  https://github.com/<owner>/<repo>/releases/download/v0.5.0/payload-0.5.0.zip
manifest.json       →  https://github.com/<owner>/<repo>/releases/latest/download/manifest.json
```

Manifest schema (signed):

```jsonc
{
  "version":   "0.5.0",
  "url":       "https://github.com/.../payload-0.5.0.zip",
  "sha256":    "<lowercase hex>",
  "signature": "<base64 Ed25519 sig over the ASCII sha256 hex>",
  "notes":     "..."
}
```

Installed apps poll the manifest on every launch (and every 60 s while open),
verify the signature against `VERIFY_KEYS` in `backend/updater.py`, and only
then show the blue "Update available" banner. Clicking **Apply**:

1. Re-verifies the manifest signature (hard fail if invalid).
2. Refuses any `url` that isn't HTTPS or whose host isn't in
   `{github.com, objects.githubusercontent.com}`.
3. Downloads the zip, checks SHA-256, extracts to `pending/`, writes the
   `APPLY_ON_NEXT_BOOT` marker.

On next launch the launcher swaps `pending → current`. If the new version
crashes three times in a row, the launcher automatically rolls back.

### Signing keys

- Private key: `C:\Users\verno\Secrets\ambs_signing_key.bin` (32 raw bytes,
  Ed25519). **Never commit.** Back this up offline — losing it means losing
  the ability to ship signed updates under the current key.
- Public keys: hard-coded in `backend/updater.py` as `VERIFY_KEYS:
  tuple[bytes, ...]`. To rotate, generate a new keypair, append the new
  public key to the tuple, and ship that as an update *signed with the old
  key*. Once every installed copy has picked up the rotation, you can sign
  subsequent releases with the new key.

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
