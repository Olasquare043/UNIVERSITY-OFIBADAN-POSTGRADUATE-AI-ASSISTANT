"""A small in-memory sliding-window limit, so one person cannot use up the shared model quota."""
import threading
import time
from collections import defaultdict, deque

_hits: dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()


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
