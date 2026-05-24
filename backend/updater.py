"""Auto-updater for the AMBS Proposal Generator.

Architecture: the frozen .exe launcher boots a "payload" directory located under
%APPDATA%\\SolutionsAI\\AMBSProposalGen\\payload\\current. That directory holds
backend/, frontend_dist/, and static/. Updates are delivered by replacing it.

Update flow
-----------
1. GET <UPDATE_MANIFEST_URL> (a JSON file with {version, url, sha256, notes}).
2. If remote.version > local VERSION, mark an update as "available".
3. On /api/update/apply:
     - Download the zip to <appdata>/payload/pending.zip
     - Verify SHA-256
     - Extract to <appdata>/payload/pending/
     - Write a marker file <appdata>/payload/APPLY_ON_NEXT_BOOT
     - Return success
4. On next launch the launcher script sees the marker:
     - Rename current → previous (removing any existing previous first)
     - Rename pending → current
     - Remove marker & zip
     - Launch the new backend
5. If the new backend exits non-zero 3× in a row, launcher rolls back.

Dev mode
--------
When running from source (not frozen), payload_dir() returns the repo root and
the updater reports "no updates configured" — updates are a no-op during dev.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import os
import shutil
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import httpx

try:
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
except ImportError:
    InvalidSignature = None
    Ed25519PublicKey = None

# --------------------------------------------------------------------- config
DEFAULT_MANIFEST_URL = (
    "https://github.com/vernonvanemmenis-ux/ambs-proposal-generator"
    "/releases/latest/download/manifest.json"
)
APP_VERSION = "0.4.11"  # bumped at each release; also written to payload VERSION file

# Ed25519 verification keys, in priority order. To rotate: append the new
# public key; never reorder or remove an entry until every release signed by
# that key is out of service.
# Generated 2026-05-21; private key at C:\Users\verno\Secrets\ambs_signing_key.bin.
VERIFY_KEYS: tuple[bytes, ...] = (
    bytes.fromhex(
        "303f3933b75229dd294f574dae5ff9b038f1fd0b994f97d249309d6e127af1bc"
    ),
)

# Payload zips may only be downloaded from these hosts over HTTPS.
ALLOWED_PAYLOAD_HOSTS: frozenset[str] = frozenset({
    "github.com",
    "objects.githubusercontent.com",
})


def _verify_signature(sha256_hex: str, signature_b64: str) -> bool:
    """Return True iff signature_b64 is a valid Ed25519 signature of the
    ASCII sha256 hex digest under at least one key in VERIFY_KEYS."""
    if InvalidSignature is None or Ed25519PublicKey is None:
        return False
    if not signature_b64:
        return False
    try:
        sig = base64.b64decode(signature_b64, validate=True)
    except (binascii.Error, ValueError):
        return False
    message = sha256_hex.encode("ascii")
    for raw_pub in VERIFY_KEYS:
        try:
            Ed25519PublicKey.from_public_bytes(raw_pub).verify(sig, message)
            return True
        except InvalidSignature:
            continue
        except Exception:
            continue
    return False


def _payload_url_allowed(url: str) -> bool:
    try:
        u = urlparse(url)
    except Exception:
        return False
    if u.scheme != "https":
        return False
    host = (u.hostname or "").lower()
    return host in ALLOWED_PAYLOAD_HOSTS


# ----------------------------------------------------------------- dataclasses
@dataclass
class Manifest:
    version: str
    url: str
    sha256: str
    signature: str = ""  # base64-encoded Ed25519 sig over the sha256 hex digest
    notes: str = ""

    @classmethod
    def from_json(cls, data: dict) -> "Manifest":
        return cls(
            version=str(data["version"]),
            url=str(data["url"]),
            sha256=str(data["sha256"]).lower(),
            signature=str(data.get("signature", "")),
            notes=str(data.get("notes", "")),
        )


# ------------------------------------------------------------------ path logic
def is_frozen() -> bool:
    return getattr(sys, "frozen", False)


def appdata_root() -> Path:
    base = Path(os.getenv("APPDATA") or (Path.home() / ".local" / "share"))
    root = base / "SolutionsAI" / "AMBSProposalGen"
    root.mkdir(parents=True, exist_ok=True)
    return root


def payload_dir() -> Path:
    """Where the active backend+frontend live."""
    if is_frozen():
        return appdata_root() / "payload" / "current"
    # dev mode: repo root
    return Path(__file__).resolve().parent.parent


def pending_dir() -> Path:
    return appdata_root() / "payload" / "pending"


def previous_dir() -> Path:
    return appdata_root() / "payload" / "previous"


def apply_marker() -> Path:
    return appdata_root() / "payload" / "APPLY_ON_NEXT_BOOT"


def version_file() -> Path:
    return payload_dir() / "VERSION"


def manifest_url() -> str:
    return os.getenv("AMBS_UPDATE_MANIFEST_URL", DEFAULT_MANIFEST_URL)


def current_version() -> str:
    vf = version_file()
    if vf.exists():
        try:
            return vf.read_text(encoding="utf-8").strip() or APP_VERSION
        except OSError:
            pass
    return APP_VERSION


# ---------------------------------------------------------------- version cmp
def _vtuple(v: str) -> tuple:
    out = []
    for part in v.split("."):
        try:
            out.append(int(part))
        except ValueError:
            out.append(0)
    return tuple(out)


def is_newer(remote: str, local: str) -> bool:
    return _vtuple(remote) > _vtuple(local)


# -------------------------------------------------------------- public API
def check_for_update() -> dict:
    """Return {available, current_version, latest_version?, notes?, ready_to_apply}."""
    local = current_version()
    ready = apply_marker().exists()
    base = {
        "available": False,
        "current_version": local,
        "ready_to_apply": ready,
    }
    if not is_frozen():
        return base  # dev mode: silent no-op
    try:
        with httpx.Client(timeout=3.0) as client:
            r = client.get(manifest_url())
            if r.status_code != 200:
                return base
            m = Manifest.from_json(r.json())
    except Exception:
        return base
    # Treat any signature failure as "no update available" — silent so a
    # tampered manifest never produces a banner asking the user to apply it.
    if not _verify_signature(m.sha256, m.signature):
        return base
    if is_newer(m.version, local):
        base.update({
            "available": True,
            "latest_version": m.version,
            "notes": m.notes,
        })
    return base


def apply_update() -> dict:
    """Download, verify, extract — stage for swap on next launch."""
    if not is_frozen():
        raise RuntimeError("Updates disabled in dev mode.")

    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        r = client.get(manifest_url())
        r.raise_for_status()
        m = Manifest.from_json(r.json())

    if not _verify_signature(m.sha256, m.signature):
        raise RuntimeError("Update manifest signature is invalid or missing.")

    if not _payload_url_allowed(m.url):
        raise RuntimeError(
            f"Refusing to download payload from disallowed URL: {m.url!r}"
        )

    if not is_newer(m.version, current_version()):
        return {"applied": False, "reason": "Already on latest version."}

    appdata_root().mkdir(parents=True, exist_ok=True)
    zip_path = appdata_root() / "payload" / "pending.zip"
    zip_path.parent.mkdir(parents=True, exist_ok=True)

    with httpx.Client(timeout=None, follow_redirects=True) as client:
        with client.stream("GET", m.url) as r:
            r.raise_for_status()
            with open(zip_path, "wb") as f:
                for chunk in r.iter_bytes(chunk_size=65536):
                    f.write(chunk)

    actual = _sha256(zip_path)
    if actual.lower() != m.sha256:
        zip_path.unlink(missing_ok=True)
        raise RuntimeError(f"SHA-256 mismatch (expected {m.sha256}, got {actual}).")

    if pending_dir().exists():
        shutil.rmtree(pending_dir())
    pending_dir().mkdir(parents=True)
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(pending_dir())
    (pending_dir() / "VERSION").write_text(m.version, encoding="utf-8")

    apply_marker().write_text(m.version, encoding="utf-8")
    zip_path.unlink(missing_ok=True)

    return {"applied": True, "staged_version": m.version, "restart_required": True}


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------- called by launcher only
def swap_pending_if_marked() -> Optional[str]:
    """Invoked by the launcher BEFORE importing backend code.

    If an update is staged, rotate dirs: current→previous, pending→current.
    Returns the new version if a swap happened, else None.
    """
    if not apply_marker().exists():
        return None
    if not pending_dir().exists():
        apply_marker().unlink(missing_ok=True)
        return None

    cur = payload_dir()
    prv = previous_dir()

    if prv.exists():
        shutil.rmtree(prv, ignore_errors=True)
    if cur.exists():
        cur.rename(prv)
    pending_dir().rename(cur)

    new_version = apply_marker().read_text(encoding="utf-8").strip()
    apply_marker().unlink(missing_ok=True)
    return new_version


def rollback() -> bool:
    """Restore previous payload (used when the new one crashes on boot)."""
    if not previous_dir().exists():
        return False
    cur = payload_dir()
    if cur.exists():
        shutil.rmtree(cur, ignore_errors=True)
    previous_dir().rename(cur)
    return True
