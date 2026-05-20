# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for AMBSProposalGen.exe (the launcher).

Bundles the initial payload (backend + frontend_dist + static) INSIDE the .exe.
On first run, the launcher extracts it to %APPDATA%\\SolutionsAI\\AMBSProposalGen\\payload\\current.
After that, updates land directly in payload\\current and the .exe itself is
only touched if we change the launcher (rare).

Build from repo root:
    pyinstaller build/AMBSProposalGen.spec

The Vite frontend must be built first:
    npm --prefix frontend install
    npm --prefix frontend run build
"""

from pathlib import Path

block_cipher = None

ROOT = Path(SPECPATH).parent

datas = [
    (str(ROOT / "backend"),           "payload/backend"),
    (str(ROOT / "frontend" / "dist"), "payload/frontend/dist"),
]

hiddenimports = [
    "backend.main", "backend.db", "backend.models", "backend.schemas",
    "backend.seed", "backend.updater", "backend.proposal_generator",
    "backend.pandadoc",
    "backend.routers.clients", "backend.routers.opportunities",
    "backend.routers.proposals", "backend.routers.status",
    "backend.routers.updates",
    "uvicorn.logging", "uvicorn.loops", "uvicorn.loops.auto",
    "uvicorn.protocols", "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets", "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan", "uvicorn.lifespan.on",
]

a = Analysis(
    [str(ROOT / "launcher" / "launcher.py")],
    pathex=[str(ROOT)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name="AMBSProposalGen",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    icon=str(ROOT / "backend" / "static" / "logo-icon.png") if (ROOT / "backend" / "static" / "logo-icon.png").exists() else None,
)

coll = COLLECT(
    exe, a.binaries, a.zipfiles, a.datas,
    strip=False, upx=True,
    name="AMBSProposalGen",
)
