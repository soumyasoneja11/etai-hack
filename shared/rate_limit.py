"""Tiny in-process sliding-window rate limiter.

Used to throttle sensitive unauthenticated endpoints (e.g. signup) per key
(client IP and/or normalized email). This is intentionally simple and
process-local — adequate for a single-process internal SOC tool. For a
multi-replica deployment, back it with Redis instead.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class SlidingWindowRateLimiter:
    """Allow at most ``max_hits`` events per ``window_sec`` for a given key."""

    def __init__(self, *, max_hits: int, window_sec: float) -> None:
        self.max_hits = max_hits
        self.window_sec = window_sec
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> None:
        bucket = self._hits[key]
        cutoff = now - self.window_sec
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()

    def check(self, key: str) -> bool:
        """Return True without recording — is a hit currently allowed?"""
        now = time.monotonic()
        with self._lock:
            self._prune(key, now)
            return len(self._hits[key]) < self.max_hits

    def hit(self, key: str) -> bool:
        """Record an attempt for ``key``. Returns False if over the limit."""
        now = time.monotonic()
        with self._lock:
            self._prune(key, now)
            bucket = self._hits[key]
            if len(bucket) >= self.max_hits:
                return False
            bucket.append(now)
            return True

    def reset(self, key: str | None = None) -> None:
        """Clear state for a key (or everything). Primarily for tests."""
        with self._lock:
            if key is None:
                self._hits.clear()
            else:
                self._hits.pop(key, None)
