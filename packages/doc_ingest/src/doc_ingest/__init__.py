from __future__ import annotations

import base64
from typing import Any, Dict

DOCSTRANGE_AVAILABLE = False


async def extract_text_async(
    *,
    payload_base64: str | None,
    text: str | None,
    content_type: str | None,
    filename: str,
) -> Dict[str, Any]:
    if text:
        content = text
    elif payload_base64:
        try:
            content = base64.b64decode(payload_base64).decode("utf-8", errors="ignore")
        except Exception:  # pragma: no cover - best effort
            content = ""
    else:
        content = ""
    return {
        "content": content,
        "metadata": {
            "content_type": content_type,
            "filename": filename,
        },
    }


__all__ = ["DOCSTRANGE_AVAILABLE", "extract_text_async"]
