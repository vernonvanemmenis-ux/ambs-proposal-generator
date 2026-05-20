"""Publish a new payload for the auto-updater.

Usage:
    python build/publish_update.py <new_version> [--notes "Fixed X"]

Produces (in build/releases/<version>/):
    payload-<version>.zip     — the payload to upload
    manifest.json             — pointer file (version, url, sha256, notes)

Workflow:
    1. Run `npm --prefix frontend run build` first (to refresh frontend/dist).
    2. Run this script with a bumped version, e.g. 0.2.0.
    3. Upload BOTH files to your update host.
    4. Update manifest.json's `url` field to the public URL of payload-<version>.zip.
    5. Installed apps pick up the update on next launch.

Payload contents
----------------
    backend/           (Python source — runs inside the frozen launcher)
    frontend_dist/     (pre-built static frontend, served by FastAPI)
    static/            (logos etc.)
    VERSION            (plain text: new version number)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RELEASES = ROOT / "build" / "releases"
UPDATE_BASE_URL = (
    "https://github.com/vernonvanemmenis-ux/ambs-proposal-generator"
    "/releases/download/v{version}"
)


def _sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _add_tree(zf: zipfile.ZipFile, src: Path, arcroot: str, excludes: tuple[str, ...] = ()):
    for p in src.rglob("*"):
        if p.is_dir():
            continue
        rel = p.relative_to(src)
        if any(part.startswith("__pycache__") or part in excludes for part in rel.parts):
            continue
        zf.write(p, arcname=f"{arcroot}/{rel.as_posix()}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("version", help="Semver, e.g. 0.2.0")
    parser.add_argument("--notes", default="", help="Release notes shown in the UI banner")
    args = parser.parse_args()

    version = args.version
    out_dir = RELEASES / version
    out_dir.mkdir(parents=True, exist_ok=True)

    frontend_dist = ROOT / "frontend" / "dist"
    if not frontend_dist.exists():
        sys.stderr.write(
            "frontend/dist/ not found. Run `npm --prefix frontend install && "
            "npm --prefix frontend run build` first.\n"
        )
        sys.exit(1)

    zip_path = out_dir / f"payload-{version}.zip"
    if zip_path.exists():
        zip_path.unlink()

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        _add_tree(zf, ROOT / "backend", "backend")
        _add_tree(zf, frontend_dist, "frontend/dist")
        zf.writestr("VERSION", version)

    sha = _sha256(zip_path)
    base = UPDATE_BASE_URL.format(version=version)
    manifest = {
        "version": version,
        "url": f"{base}/payload-{version}.zip",
        "sha256": sha,
        "notes": args.notes,
    }
    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print(f"Built  {zip_path}  ({zip_path.stat().st_size // 1024} KB)")
    print(f"SHA256 {sha}")
    print(f"Manifest written to {manifest_path}")
    print()
    print("Next steps:")
    print(f"  1. Upload   {zip_path.name}   to {UPDATE_BASE_URL}/")
    print(f"  2. Upload   manifest.json     to {UPDATE_BASE_URL}/manifest.json")
    print("  3. Installed apps will pick up the update on next launch.")


if __name__ == "__main__":
    main()
