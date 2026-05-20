"""PandaDoc integration stub.

Online features light up only when:
  1. The host has internet connectivity (quick TCP probe, no DNS wait).
  2. PANDADOC_API_KEY env var is set.

For the demo we don't actually hit PandaDoc in offline mode. When the key is
present and the network is up, we'd POST the generated docx to
https://api.pandadoc.com/public/v1/documents. We return a fake doc id for the
demo so the flow is visible end to end without charging a real account.
"""

from __future__ import annotations

import os
import socket
from pathlib import Path


def is_online(host: str = "8.8.8.8", port: int = 53, timeout: float = 1.5) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def pandadoc_configured() -> bool:
    return bool(os.getenv("PANDADOC_API_KEY"))


def send_to_pandadoc(opportunity, filepath: Path, ref: str) -> str:
    """Stub: returns a mock PandaDoc document id.

    In production this would use httpx to POST multipart/form-data to
    https://api.pandadoc.com/public/v1/documents with an Authorization header.
    """
    return f"PD-DEMO-{ref}"
