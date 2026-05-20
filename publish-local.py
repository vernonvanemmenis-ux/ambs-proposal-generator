"""Publish a new payload directly to the installed app on this machine.

The app already has an auto-updater that swaps
`%APPDATA%\\SolutionsAI\\AMBSProposalGen\\payload\\pending\\` into
`payload\\current\\` on the next launch when an `APPLY_ON_NEXT_BOOT` marker is
present. This script stages that locally — no GitHub release, no network.

Usage:
    python publish-local.py                    # auto-bumps patch (0.3.0 -> 0.3.1)
    python publish-local.py 0.4.0              # explicit version
    python publish-local.py 0.4.0 --no-build   # skip `npm run build` (faster)

What it stages
--------------
    %APPDATA%\\SolutionsAI\\AMBSProposalGen\\payload\\pending\\
      backend\\           (current source tree)
      frontend\\dist\\    (just-built static frontend)
      VERSION             (new version string)
    %APPDATA%\\SolutionsAI\\AMBSProposalGen\\payload\\APPLY_ON_NEXT_BOOT

Heads up
--------
* If SCHEMA_VERSION in backend/constants.py changed, the installed app's
  SQLite DB will be wiped + reseeded on next boot (existing behaviour,
  backend/db.py:_ensure_schema_version). Generated .docx proposals under
  %APPDATA%\\...\\output\\ are NOT touched.
* If the new payload crashes 3x in a row the launcher auto-rolls back.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND_DIST = ROOT / "frontend" / "dist"


def appdata_payload_root() -> Path:
    base = Path(os.getenv("APPDATA") or (Path.home() / ".local" / "share"))
    p = base / "SolutionsAI" / "AMBSProposalGen" / "payload"
    p.mkdir(parents=True, exist_ok=True)
    return p


def current_installed_version() -> str | None:
    vf = appdata_payload_root() / "current" / "VERSION"
    if not vf.exists():
        return None
    try:
        return vf.read_text(encoding="utf-8").strip() or None
    except OSError:
        return None


def updater_default_version() -> str:
    text = (BACKEND / "updater.py").read_text(encoding="utf-8")
    for line in text.splitlines():
        if line.strip().startswith("APP_VERSION"):
            return line.split("=", 1)[1].strip().strip('"').strip("'").split("#")[0].strip().strip('"').strip("'")
    return "0.0.0"


def bump_patch(v: str) -> str:
    parts = v.split(".")
    while len(parts) < 3:
        parts.append("0")
    try:
        parts[-1] = str(int(parts[-1]) + 1)
    except ValueError:
        parts[-1] = "1"
    return ".".join(parts)


def npm_build():
    npm = "npm.cmd" if os.name == "nt" else "npm"
    cmd = [npm, "--prefix", str(ROOT / "frontend"), "run", "build"]
    print(f"$ {' '.join(cmd)}")
    res = subprocess.run(cmd, check=False)
    if res.returncode != 0:
        sys.stderr.write("Frontend build failed.\n")
        sys.exit(res.returncode)


def _ignore_pyc(_dir, names):
    return [n for n in names if n == "__pycache__" or n.endswith(".pyc")]


def stage_pending(version: str) -> Path:
    root = appdata_payload_root()
    pending = root / "pending"
    if pending.exists():
        shutil.rmtree(pending)
    pending.mkdir(parents=True)

    shutil.copytree(BACKEND, pending / "backend", ignore=_ignore_pyc)

    if not FRONTEND_DIST.exists():
        sys.stderr.write(
            "frontend/dist/ not found. Drop --no-build to let this script "
            "run `npm run build`, or build it yourself first.\n"
        )
        sys.exit(1)
    shutil.copytree(FRONTEND_DIST, pending / "frontend" / "dist")

    (pending / "VERSION").write_text(version, encoding="utf-8")
    return pending


def write_marker(version: str) -> Path:
    marker = appdata_payload_root() / "APPLY_ON_NEXT_BOOT"
    marker.write_text(version, encoding="utf-8")
    return marker


def maybe_bump_updater_version(new_version: str):
    """Keep backend/updater.py:APP_VERSION in sync so the in-app banner shows
    the right number when the payload boots."""
    path = BACKEND / "updater.py"
    text = path.read_text(encoding="utf-8")
    out_lines = []
    changed = False
    for line in text.splitlines(keepends=True):
        stripped = line.strip()
        if stripped.startswith("APP_VERSION") and "=" in stripped:
            indent = line[: len(line) - len(line.lstrip())]
            out_lines.append(f'{indent}APP_VERSION = "{new_version}"  # bumped at each release; also written to payload VERSION file\n')
            changed = True
        else:
            out_lines.append(line)
    if changed:
        path.write_text("".join(out_lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("version", nargs="?", default=None,
                        help="Semver, e.g. 0.3.0. Defaults to installed_version + 1 patch.")
    parser.add_argument("--no-build", action="store_true",
                        help="Skip `npm run build`; reuse existing frontend/dist.")
    args = parser.parse_args()

    base_version = current_installed_version() or updater_default_version()
    new_version = args.version or bump_patch(base_version)

    print(f"Installed version: {base_version}")
    print(f"Publishing locally: {new_version}")

    if not args.no_build:
        npm_build()
    else:
        print("Skipping frontend build (--no-build).")

    pending = stage_pending(new_version)
    marker = write_marker(new_version)
    maybe_bump_updater_version(new_version)

    print()
    print(f"Staged payload : {pending}")
    print(f"Marker dropped : {marker}")
    print()
    print("Next step: CLOSE the AMBS Proposal Generator app, then reopen it.")
    print("The launcher swaps pending/ -> current/ on boot and runs the new code.")
    print()
    print("Crash rollback: if the new payload fails 3x in a row, the launcher")
    print("restores the previous payload automatically.")
    print(r"Logs: %APPDATA%\SolutionsAI\AMBSProposalGen\logs\app.log")


if __name__ == "__main__":
    main()
