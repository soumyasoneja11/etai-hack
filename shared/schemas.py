"""
Shared API contract — CyberShield NIC aligned.

Source of truth: docs/CyberShield_NIC_API_Schema.xlsx
Conventions: snake_case, *_id UUIDs, *_at ISO-8601 UTC, standard { success, data, error, meta } envelope.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator

try:
    from .enums import AnomalyStatus, Severity
except ImportError:
    from shared.enums import AnomalyStatus, Severity


# ---------------------------------------------------------------------------
# Standard envelope (all REST responses)
# ---------------------------------------------------------------------------


class ApiMeta(BaseModel):
    timestamp: datetime
    request_id: str


class ApiErrorBody(BaseModel):
    code: str
    message: str


# ---------------------------------------------------------------------------
# A — signal ingest (internal; feeds detection before B creates /anomalies)
# ---------------------------------------------------------------------------


class SignalIngestRequest(BaseModel):
    """
    Replay / ingestion adapter.
    Maps entity_id → asset_id for CyberShield asset model.
    """

    signal_id: str | None = Field(default=None, description="UUID; server generates if omitted.")
    asset_id: str | None = Field(
        default=None,
        description="Monitored asset UUID or surrogate (dst-{port}-win-{win}).",
    )
    detected_at: datetime | None = None
    source_file: str
    row_index: int = Field(..., ge=0)
    features: dict[str, float] = Field(..., description="CICIDS2017 flow features by name.")
    ground_truth_label: str | None = Field(
        default=None,
        description="Eval/replay only — not used in production scoring.",
    )

    @field_validator("features")
    @classmethod
    def clean_features(cls, v: dict[str, Any]) -> dict[str, float]:
        if not v:
            raise ValueError("features dict must not be empty")
        cleaned: dict[str, float] = {}
        for key, value in v.items():
            if value is None or (isinstance(value, float) and value != value):
                cleaned[key] = 0.0
            elif isinstance(value, float) and value in (float("inf"), float("-inf")):
                cleaned[key] = 0.0
            else:
                cleaned[key] = float(value)
        return cleaned


class SignalIngestData(BaseModel):
    signal_id: str
    status: Literal["received"] = "received"


# Legacy alias (Day 2) — prefer SignalIngestRequest
class FlowEventIn(BaseModel):
    event_id: str | None = None
    timestamp: datetime | None = None
    entity_id: str | None = None
    source_file: str
    row_index: int = Field(..., ge=0)
    features: dict[str, float]
    ground_truth_label: str | None = None

    def to_signal_request(self) -> SignalIngestRequest:
        return SignalIngestRequest(
            signal_id=self.event_id,
            asset_id=self.entity_id,
            detected_at=self.timestamp,
            source_file=self.source_file,
            row_index=self.row_index,
            features=self.features,
            ground_truth_label=self.ground_truth_label,
        )


class IngestResponse(BaseModel):
    """Legacy flat response — wrapped in envelope at HTTP layer."""

    status: Literal["received"] = "received"
    event_id: str


# ---------------------------------------------------------------------------
# A — POST /api/v1/predict (guide for A §8)
# ---------------------------------------------------------------------------


class PredictRequest(BaseModel):
    features: list[float] = Field(..., min_length=1, description="Ordered feature vector — see feature_order.json")

    @field_validator("features")
    @classmethod
    def sanitize_features(cls, v: list[float]) -> list[float]:
        if not v:
            raise ValueError("features list must not be empty")
        out: list[float] = []
        for x in v:
            if x is None or (isinstance(x, float) and x != x):
                out.append(0.0)
            elif isinstance(x, float) and x in (float("inf"), float("-inf")):
                out.append(0.0)
            else:
                out.append(float(x))
        return out


class PredictData(BaseModel):
    attack: str = Field(..., description="Predicted class label, e.g. PortScan, DDoS, BENIGN.")
    confidence: float = Field(..., ge=0.0, le=100.0)
    predicted_label: str
    anomaly_score: float = Field(..., ge=0.0, le=1.0)


# ---------------------------------------------------------------------------
# CyberShield — anomaly shapes (B persists; A produces drafts)
# ---------------------------------------------------------------------------


class AnomalyListItem(BaseModel):
    """GET /anomalies list item."""

    anomaly_id: str
    title: str
    severity: Severity
    status: AnomalyStatus
    asset_id: str
    detected_at: datetime
    score: float
    reason: str


class AnomalyDetail(BaseModel):
    """GET /anomalies/{anomaly_id} full detail."""

    anomaly_id: str
    title: str
    description: str
    severity: Severity
    status: AnomalyStatus
    asset_id: str
    detected_at: datetime
    score: float
    baseline_deviation: float
    reason: str
    raw_signal_ref: str


class AnomalyCreatedEvent(BaseModel):
    """WebSocket anomaly.created payload."""

    anomaly_id: str
    title: str
    severity: Severity
    asset_id: str
    detected_at: datetime
    score: float


# ---------------------------------------------------------------------------
# A → B handoff (Day 10 wire to correlation_response)
# ---------------------------------------------------------------------------


class DetectionResult(BaseModel):
    """Internal detection output before B maps to /anomalies + /attributions."""

    signal_id: str
    asset_id: str
    detected_at: datetime
    attack: str
    confidence: float = Field(..., ge=0.0, le=100.0)
    anomaly_score: float = Field(..., ge=0.0, le=1.0)
    baseline_deviation: float = Field(..., ge=0.0)
    severity: Severity
    title: str
    reason: str
    top_features: list[dict[str, float]] = Field(default_factory=list)

    def to_anomaly_list_item(self, anomaly_id: str, status: AnomalyStatus = "new") -> AnomalyListItem:
        return AnomalyListItem(
            anomaly_id=anomaly_id,
            title=self.title,
            severity=self.severity,
            status=status,
            asset_id=self.asset_id,
            detected_at=self.detected_at,
            score=self.anomaly_score,
            reason=self.reason,
        )

    def to_anomaly_detail(self, anomaly_id: str, status: AnomalyStatus = "new") -> AnomalyDetail:
        return AnomalyDetail(
            anomaly_id=anomaly_id,
            title=self.title,
            description=f"ML classifier detected {self.attack} with {self.confidence:.1f}% confidence.",
            severity=self.severity,
            status=status,
            asset_id=self.asset_id,
            detected_at=self.detected_at,
            score=self.anomaly_score,
            baseline_deviation=self.baseline_deviation,
            reason=self.reason,
            raw_signal_ref=self.signal_id,
        )


# ---------------------------------------------------------------------------
# Baseline profiling (Day 3)
# ---------------------------------------------------------------------------


class FeatureStats(BaseModel):
    mean: float
    std: float
    count: int


class EntityBaseline(BaseModel):
    entity_id: str
    sample_count: int
    features: dict[str, FeatureStats]


class BaselineManifest(BaseModel):
    version: str = "1"
    built_at: datetime
    primary_scenario: str
    baseline_sources: list[dict[str, Any]]
    entity_count: int
    feature_count: int
    notes: list[str] = Field(default_factory=list)


def new_event_id() -> str:
    return str(uuid4())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)
