"""OpenAI passthrough for the per-section "Draft with AI" button.

Intentionally tiny + stdlib-only — the frozen .exe ships without the OpenAI
SDK or httpx, so we hit the REST endpoint directly via urllib. If the
OPENAI_API_KEY env var isn't set the /status endpoint reports configured=False
and the frontend hides the button. Generation otherwise remains offline.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

from fastapi import APIRouter, HTTPException

from ..schemas import AIDraftRequest, AIDraftResponse

router = APIRouter(prefix="/api/sections", tags=["ai-draft"])

_OPENAI_URL = "https://api.openai.com/v1/chat/completions"
_MODEL = "gpt-4o-mini"
_REQUEST_TIMEOUT_S = 60


@router.get("/draft/status")
def draft_status():
    return {"configured": bool(os.getenv("OPENAI_API_KEY")), "provider": "openai", "model": _MODEL}


@router.post("/draft", response_model=AIDraftResponse)
def draft(req: AIDraftRequest):
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise HTTPException(503, "OPENAI_API_KEY not configured. Paste the section text manually instead.")
    if not (req.prompt or "").strip():
        raise HTTPException(400, "Prompt is empty.")

    body = json.dumps({
        "model": _MODEL,
        "messages": [{"role": "user", "content": req.prompt}],
        "temperature": 0.7,
    }).encode("utf-8")
    request = urllib.request.Request(
        _OPENAI_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=_REQUEST_TIMEOUT_S) as resp:
            payload = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace") if hasattr(e, "read") else str(e)
        raise HTTPException(e.code, f"OpenAI error: {detail}") from e
    except urllib.error.URLError as e:
        raise HTTPException(502, f"OpenAI unreachable: {e.reason}") from e

    try:
        text = payload["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError) as e:
        raise HTTPException(502, f"Unexpected OpenAI response shape: {payload!r}") from e
    return AIDraftResponse(text=text, configured=True)
