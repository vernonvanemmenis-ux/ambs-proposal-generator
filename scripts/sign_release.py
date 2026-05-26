"""Sign a release payload zip and emit a manifest.json ready to upload.

Usage:
    python scripts/sign_release.py <payload.zip> --version 0.5.0 \\
        [--notes "Fixed X"] \\
        [--url https://github.com/<owner>/<repo>/releases/download/v0.5.0/<zip>] \\
        [--key C:\\Users\\verno\\Secrets\\ambs_signing_key.bin]

Writes <payload.zip>.manifest.json (or --out path) containing:
    version    semver string
    url        public download URL of the payload
    sha256     lowercase hex digest of the payload bytes
    signature  base64 Ed25519 signature over the ASCII sha256 hex string
    notes      free-form release notes

The signature is verified at runtime by backend/updater.py against
VERIFY_KEYS. Keep the private key OUT of the repo.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

DEFAULT_KEY_PATH = Path(r"C:\Users\verno\Secrets\ambs_signing_key.bin")
DEFAULT_URL_TEMPLATE = (
    "https://github.com/vernonvanemmenis-ux/ambs-proposal-generator"
    "/releases/download/v{version}/{filename}"
)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def load_private_key(path: Path) -> Ed25519PrivateKey:
    raw = path.read_bytes()
    if len(raw) != 32:
        raise SystemExit(
            f"Expected 32-byte raw Ed25519 private key at {path}, got {len(raw)} bytes."
        )
    return Ed25519PrivateKey.from_private_bytes(raw)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("zip", type=Path, help="Path to the payload .zip to sign")
    p.add_argument("--version", required=True, help="Semver, e.g. 0.5.0")
    p.add_argument("--notes", default="", help="Release notes shown in the UI banner")
    p.add_argument(
        "--url",
        default=None,
        help="Public download URL for the zip (default: GitHub Releases pattern)",
    )
    p.add_argument(
        "--key",
        type=Path,
        default=DEFAULT_KEY_PATH,
        help=f"Path to raw 32-byte Ed25519 private key (default: {DEFAULT_KEY_PATH})",
    )
    p.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output manifest path (default: <zip>.manifest.json next to the zip)",
    )
    args = p.parse_args()

    zip_path: Path = args.zip
    if not zip_path.is_file():
        raise SystemExit(f"Payload zip not found: {zip_path}")
    if not args.key.is_file():
        raise SystemExit(f"Private key not found: {args.key}")

    sk = load_private_key(args.key)
    digest = sha256_file(zip_path)
    sig = sk.sign(digest.encode("ascii"))
    signature_b64 = base64.b64encode(sig).decode("ascii")

    url = args.url or DEFAULT_URL_TEMPLATE.format(
        version=args.version, filename=zip_path.name
    )

    manifest = {
        "version": args.version,
        "url": url,
        "sha256": digest,
        "signature": signature_b64,
        "notes": args.notes,
    }

    out_path: Path = args.out or zip_path.with_suffix(zip_path.suffix + ".manifest.json")
    out_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(f"Signed   {zip_path}")
    print(f"SHA-256  {digest}")
    print(f"Sig      {signature_b64}")
    print(f"Manifest {out_path}")
    print()
    print("Upload BOTH the zip and the manifest.json to the release host.")


if __name__ == "__main__":
    main()
