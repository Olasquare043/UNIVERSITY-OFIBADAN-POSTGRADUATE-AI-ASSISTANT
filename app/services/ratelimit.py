"""A small in-memory sliding-window limit, so one person cannot use up the shared model quota."""
import threading
import time
from collections import defaultdict, deque

from fastapi import Request

from app import config

_hits: dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()


def client_ip(request: Request) -> str:
    """The visitor's address, without trusting what the visitor writes in X-Forwarded-For."""
    peer = request.client.host if request.client else "unknown"
    hops = config.TRUSTED_PROXY_HOPS
    if hops > 0:
        parts = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
        if len(parts) >= hops:
            return parts[-hops]
    return peer


def allow(key: str, limit: int, window_seconds: float) -> bool:
    """Record a request and return False when `key` has already made `limit` requests in the window."""
    if limit <= 0:
        return True  # 0 turns the limit off
    now = time.monotonic()
    with _lock:
        hits = _hits[key]
        while hits and now - hits[0] > window_seconds:
            hits.popleft()
        if len(hits) >= limit:
            return False
        hits.append(now)
        if len(_hits) > 5000:  # forget visitors that stopped asking
            for stale in [k for k, v in _hits.items() if not v or now - v[-1] > window_seconds]:
                del _hits[stale]
        return True


def retry_after(key: str, window_seconds: float) -> int:
    with _lock:
        hits = _hits.get(key)
        if not hits:
            return 0
        return max(int(window_seconds - (time.monotonic() - hits[0])) + 1, 1)
