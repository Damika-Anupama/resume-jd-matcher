"""Optional, env-gated API-key auth and rate limiting.

Both are **off by default** so the service stays deploy-safe and the test/CI path
needs no configuration (mirroring the mock-LLM default). Turn them on for a
public deployment via env:

- ``API_KEYS`` — comma-separated accepted keys. When set, protected endpoints
  require a matching key in the ``X-API-Key`` header (or
  ``Authorization: Bearer <key>``). When unset, endpoints are open.
- ``RATE_LIMIT_PER_MINUTE`` — max requests per client per rolling 60s window
  (``0``/unset = unlimited). The client is identified by API key when one is
  presented, otherwise by source IP.

The limiter is a simple in-process sliding window: correct for a single replica
and good enough to blunt abuse. For a multi-replica deployment, front it with a
shared limiter (e.g. Redis or the ingress) — the same env contract still holds.
"""
from __future__ import annotations

import os
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

_RATE_WINDOW_SECONDS = 60.0
_hits: dict[str, deque[float]] = defaultdict(deque)
_hits_lock = threading.Lock()


def _configured_keys() -> set[str]:
    raw = os.environ.get("API_KEYS", "")
    return {k.strip() for k in raw.split(",") if k.strip()}


def _presented_key(request: Request) -> str | None:
    key = request.headers.get("X-API-Key")
    if key and key.strip():
        return key.strip()
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        return token or None
    return None


def _client_id(request: Request) -> str:
    key = _presented_key(request)
    if key:
        return f"key:{key}"
    client = request.client
    return f"ip:{client.host if client else 'unknown'}"


def require_api_key(request: Request) -> None:
    """FastAPI dependency: enforce a valid API key when ``API_KEYS`` is set."""
    keys = _configured_keys()
    if not keys:
        return  # auth disabled — deploy-safe default
    presented = _presented_key(request)
    if presented is None or presented not in keys:
        raise HTTPException(
            status_code=401,
            detail={"error": "Missing or invalid API key.", "code": "unauthorized"},
        )


def enforce_rate_limit(request: Request) -> None:
    """FastAPI dependency: sliding-window rate limit when configured."""
    try:
        limit = int(os.environ.get("RATE_LIMIT_PER_MINUTE", "0"))
    except ValueError:
        limit = 0
    if limit <= 0:
        return  # disabled

    now = time.monotonic()
    cutoff = now - _RATE_WINDOW_SECONDS
    cid = _client_id(request)
    with _hits_lock:
        dq = _hits[cid]
        while dq and dq[0] < cutoff:
            dq.popleft()
        if len(dq) >= limit:
            retry_after = max(1, int(_RATE_WINDOW_SECONDS - (now - dq[0])))
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "Rate limit exceeded. Please slow down.",
                    "code": "rate_limited",
                },
                headers={"Retry-After": str(retry_after)},
            )
        dq.append(now)


def reset_rate_limiter() -> None:
    """Test hook: clear all accumulated rate-limit state."""
    with _hits_lock:
        _hits.clear()
