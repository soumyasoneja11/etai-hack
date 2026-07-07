"""In-memory anomaly store — thread-safe, matches CyberShield Excel schema."""

from __future__ import annotations

import threading
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any

from shared.schemas import AnomalyDetail, AnomalyListItem


@dataclass
class StoredAnomaly:
    anomaly_id: str
    list_item: AnomalyListItem
    detail: AnomalyDetail
    attribution: dict[str, Any]


class AnomalyStore:
    """Thread-safe in-memory store for anomalies + attributions."""

    def __init__(self, max_size: int = 10_000) -> None:
        self._max_size = max_size
        self._items: OrderedDict[str, StoredAnomaly] = OrderedDict()
        self._lock = threading.Lock()

    def put(self, anomaly: StoredAnomaly) -> None:
        with self._lock:
            self._items[anomaly.anomaly_id] = anomaly
            if len(self._items) > self._max_size:
                self._items.popitem(last=False)

    def get(self, anomaly_id: str) -> StoredAnomaly | None:
        with self._lock:
            return self._items.get(anomaly_id)

    def list_items(self, *, limit: int = 50, offset: int = 0) -> list[AnomalyListItem]:
        with self._lock:
            all_items = list(self._items.values())
        # Return newest first
        all_items.reverse()
        return [s.list_item for s in all_items[offset : offset + limit]]

    def list_attributions(self, *, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
        with self._lock:
            all_items = list(self._items.values())
        all_items.reverse()
        return [s.attribution for s in all_items[offset : offset + limit]]

    def count(self) -> int:
        with self._lock:
            return len(self._items)


anomaly_store = AnomalyStore()
