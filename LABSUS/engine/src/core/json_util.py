"""JSON sanitization utility for API responses.

F-25: Recursively wash non-finite floating point values (NaN, Inf, -Inf) into None.
FastAPI's default json.dumps(allow_nan=True) serializes non-finite floats as NaN/Infinity
literal tokens, which violates the JSON standard (RFC 8259) and causes SyntaxError
when parsed by standard JSON.parse() on the web client.
"""
from __future__ import annotations

import math
from typing import Any


def wash_json(obj: Any) -> Any:
    """Recursively sanitize data structures, replacing non-finite floats with None.

    Args:
        obj: Any Python object (dict, list, tuple, float, int, str, etc.)

    Returns:
        The sanitized object with NaN/Inf/-Inf replaced by None.
    """
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: wash_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [wash_json(v) for v in obj]
    return obj


# Alias for backward compatibility with existing internal references
_wash_json = wash_json
