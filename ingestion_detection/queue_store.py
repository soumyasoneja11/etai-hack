"""In-memory signal queue — swap for Redis on Day 8+ if needed."""

from __future__ import annotations

import threading
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime

from shared.schemas import DetectionResult, SignalIngestRequest, new_event_id, utc_now


@dataclass
class StoredSignal:
    signal_id: str
    received_at: datetime
    payload: SignalIngestRequest
    detection: DetectionResult | None = None


@dataclass
class SignalQueue:
    max_size: int = 10_000
    _items: deque[StoredSignal] = field(default_factory=deque)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def enqueue(
        self,
        signal: SignalIngestRequest,
        detection: DetectionResult | None = None,
    ) -> StoredSignal:
        signal_id = signal.signal_id or new_event_id()
        normalized = signal.model_copy(
            update={
                "signal_id": signal_id,
                "detected_at": signal.detected_at or utc_now(),
            }
        )
        stored = StoredSignal(
            signal_id=signal_id,
            received_at=utc_now(),
            payload=normalized,
            detection=detection,
        )
        with self._lock:
            if len(self._items) >= self.max_size:
                self._items.popleft()
            self._items.append(stored)
        return stored

    def list_recent(self, limit: int = 50) -> list[StoredSignal]:
        with self._lock:
            return list(self._items)[-limit:]

    def get(self, signal_id: str) -> StoredSignal | None:
        with self._lock:
            for item in reversed(self._items):
                if item.signal_id == signal_id:
                    return item
        return None

    def size(self) -> int:
        with self._lock:
            return len(self._items)


signal_queue = SignalQueue()

# Legacy alias
event_queue = signal_queue
