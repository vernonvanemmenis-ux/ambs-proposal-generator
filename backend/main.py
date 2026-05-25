"""FastAPI entry point. Runs the offline-first AMBS Proposal Generator.

When launched:
  1. Creates the SQLite DB + tables if missing and seeds demo data.
  2. Starts the API on a free localhost port IN A BACKGROUND THREAD.
  3. Mounts the built Vite frontend at "/".
  4. Opens a chromeless app window via Edge/Chrome --app mode.
  5. When the app window is closed, shuts down the server and exits.
"""

from __future__ import annotations

import logging
import os
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .db import Base, engine, LOGOS_DIR, _ensure_columns
from .routers import (
    ai_draft,
    catalogue,
    clients,
    database,
    items,
    launcher_tiles,
    layouts,
    opp_assets,
    opportunities,
    opportunity_templates,
    projects,
    proposals,
    purchase_orders,
    salespeople,
    status,
    suppliers,
    templates,
    updates,
)
from .seed import seed


APP_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIST = APP_DIR / "frontend" / "dist"
STATIC_DIR = APP_DIR / "backend" / "static"
STATIC_DIR.mkdir(exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _ensure_columns()
    seed()
    yield


app = FastAPI(title="AMBS Proposal Generator", version="0.1.0-demo", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(clients.router)
app.include_router(opportunities.router)
app.include_router(proposals.router)
app.include_router(status.router)
app.include_router(updates.router)
app.include_router(catalogue.router)
app.include_router(items.router)
app.include_router(database.router)
app.include_router(templates.router)
app.include_router(projects.router)
app.include_router(opportunity_templates.router)
app.include_router(salespeople.router)
app.include_router(suppliers.router)
app.include_router(purchase_orders.router)
app.include_router(opp_assets.router)
app.include_router(ai_draft.router)
app.include_router(layouts.router)
app.include_router(launcher_tiles.router)

# Brand assets (logos) — accessible at /static/*
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Uploaded template logos, served to both the frontend preview and the .docx generator
app.mount("/logos", StaticFiles(directory=LOGOS_DIR), name="logos")


# Frontend — only mount if the Vite build exists. During dev the frontend runs
# on port 5173 and talks to the API via CORS.
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="fe-assets")

    @app.get("/{full_path:path}")
    def spa_root(full_path: str):
        target = FRONTEND_DIST / full_path
        if full_path and target.exists() and target.is_file():
            return FileResponse(target)
        return FileResponse(FRONTEND_DIST / "index.html")
else:
    @app.get("/")
    def dev_hint():
        return {
            "message": "Frontend dist not built yet. Run 'npm run dev' in frontend/ or 'npm run build' before packaging.",
            "api_docs": "/docs",
        }


log = logging.getLogger("ambs.main")


def _free_port(default: int = 8765) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", default))
            return default
        except OSError:
            s.bind(("127.0.0.1", 0))
            return s.getsockname()[1]


def _find_browser_for_app_mode() -> str | None:
    """Locate a Chromium-based browser that supports --app mode.

    Edge ships with every Windows 10+ install, so it's the first preference.
    Falling back to Chrome covers the few machines without Edge."""
    candidates = [
        Path(os.getenv("ProgramFiles(x86)", "")) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
        Path(os.getenv("ProgramFiles", "")) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
        Path(os.getenv("ProgramFiles", "")) / "Google" / "Chrome" / "Application" / "chrome.exe",
        Path(os.getenv("ProgramFiles(x86)", "")) / "Google" / "Chrome" / "Application" / "chrome.exe",
        Path(os.getenv("LOCALAPPDATA", "")) / "Google" / "Chrome" / "Application" / "chrome.exe",
    ]
    for p in candidates:
        try:
            if p.exists():
                return str(p)
        except OSError:
            continue
    return None


def _wait_for_port(port: int, timeout: float = 20.0) -> bool:
    """Poll until the server is accepting connections on the port."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.3):
                return True
        except OSError:
            time.sleep(0.1)
    return False


def _webview_profile_dir() -> Path:
    """Dedicated profile dir so --app mode doesn't share state with the user's
    regular Edge/Chrome profile (history, logins, etc.)."""
    base = Path(os.getenv("APPDATA") or (Path.home() / ".local" / "share"))
    d = base / "SolutionsAI" / "AMBSProposalGen" / "webview-profile"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _launch_app_window(url: str) -> subprocess.Popen | None:
    """Spawn Edge/Chrome in --app mode: chromeless window, own taskbar icon,
    no address bar, no tabs. Returns the process so we can monitor it."""
    browser = _find_browser_for_app_mode()
    if not browser:
        log.warning("No Edge or Chrome found — falling back to default browser (will run as a regular tab).")
        webbrowser.open(url)
        return None

    log.info(f"Launching app window via: {browser}")
    args = [
        browser,
        f"--app={url}",
        f"--user-data-dir={_webview_profile_dir()}",
        "--window-size=1280,820",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-features=InfiniteSessionRestore,Translate",
    ]
    try:
        # Detach from console so a terminal close doesn't kill the window.
        creationflags = 0x00000008 if sys.platform == "win32" else 0  # DETACHED_PROCESS
        return subprocess.Popen(args, creationflags=creationflags)
    except OSError as e:
        log.error(f"Failed to spawn browser app window: {e}. Falling back to default browser.")
        webbrowser.open(url)
        return None


def run():
    port = int(os.getenv("AMBS_PORT", "0")) or _free_port()
    url = f"http://127.0.0.1:{port}"
    log.info(f"Starting uvicorn on {url}")

    # Uvicorn Server object (not uvicorn.run) so we can shut it down cleanly.
    config = uvicorn.Config(
        app, host="127.0.0.1", port=port,
        log_level="info",
        log_config=None,  # inherit launcher's file-logging
    )
    server = uvicorn.Server(config)

    server_thread = threading.Thread(target=server.run, daemon=True, name="uvicorn")
    server_thread.start()

    # Wait for uvicorn to be ready before opening the window.
    if not _wait_for_port(port):
        log.error("Server failed to come up within 20s.")
        server.should_exit = True
        sys.exit(3)
    log.info("Server is accepting connections.")

    # AMBS_NO_BROWSER=1 → headless mode (dev / CI / testing). Block forever.
    # Otherwise open the app window and tie its lifecycle to ours.
    if os.getenv("AMBS_NO_BROWSER") == "1" or not FRONTEND_DIST.exists():
        log.info("Headless mode — Ctrl+C to stop.")
        try:
            server_thread.join()
        except KeyboardInterrupt:
            pass
        return

    browser_proc = _launch_app_window(url)

    if browser_proc is None:
        # Fell back to default browser — no process to monitor. Keep backend up
        # until the user stops it (taskbar icon exit / Task Manager).
        log.info("Running in browser-tab fallback mode; server will stay up.")
        try:
            server_thread.join()
        except KeyboardInterrupt:
            pass
        return

    # App-window mode: block until the window process exits, then shut down.
    try:
        browser_proc.wait()
    except KeyboardInterrupt:
        pass
    log.info("App window closed, shutting down server.")
    server.should_exit = True
    server_thread.join(timeout=5)
    log.info("Clean exit.")


if __name__ == "__main__":
    run()
