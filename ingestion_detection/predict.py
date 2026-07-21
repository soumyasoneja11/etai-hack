"""Model inference — loads model.joblib and returns CyberShield-aligned predictions."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from ingestion_detection.baseline.builder import load_baseline_profiles, z_score_anomaly
from ingestion_detection.features import (
    derive_entity_id,
    validate_feature_dict,
    validate_feature_list,
)
from shared.enums import ATTACK_TITLES, severity_from_confidence
from shared.schemas import DetectionResult, PredictData, new_event_id, utc_now

MODELS_DIR = Path(__file__).resolve().parent / "models"
MODEL_PATH = MODELS_DIR / "model.joblib"
FEATURE_ORDER_PATH = MODELS_DIR / "feature_order.json"
LABEL_MAP_PATH = MODELS_DIR / "label_mapping.json"


class ModelNotReadyError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _load_model():
    if not MODEL_PATH.exists():
        raise ModelNotReadyError(
            "model.joblib not found - run: python -m ingestion_detection.train"
        )
    return joblib.load(MODEL_PATH)


@lru_cache(maxsize=1)
def _load_feature_order() -> list[str]:
    if not FEATURE_ORDER_PATH.exists():
        raise ModelNotReadyError("feature_order.json missing - run preprocess")
    return json.loads(FEATURE_ORDER_PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _load_id_to_label() -> dict[int, str]:
    if not LABEL_MAP_PATH.exists():
        raise ModelNotReadyError("label_mapping.json missing - run preprocess")
    data = json.loads(LABEL_MAP_PATH.read_text(encoding="utf-8"))
    return {int(k): v for k, v in data["id_to_label"].items()}


def _model_version() -> str | None:
    """Cheap, deterministic version tag derived from the artifact on disk."""
    if not MODEL_PATH.exists():
        return None
    stat = MODEL_PATH.stat()
    return f"{stat.st_size}-{int(stat.st_mtime)}"


def model_artifacts_status() -> dict:
    """Report whether the detector's artifacts are loadable.

    Never raises — intended for health checks and startup diagnostics. Returns a
    dict with ``model_loaded`` and, on failure, a human-readable ``error``.
    """
    status: dict = {
        "model_loaded": False,
        "model_path": str(MODEL_PATH),
        "model_version": _model_version(),
        "error": None,
    }
    try:
        _load_model()
    except Exception as exc:  # noqa: BLE001 — surface any load failure verbatim
        status["error"] = f"model.joblib: {exc}"
        return status

    try:
        order = _load_feature_order()
        status["feature_count"] = len(order)
    except Exception as exc:  # noqa: BLE001
        status["error"] = f"feature_order.json: {exc}"
        return status

    try:
        labels = _load_id_to_label()
        status["label_count"] = len(labels)
    except Exception as exc:  # noqa: BLE001
        status["error"] = f"label_mapping.json: {exc}"
        return status

    status["model_loaded"] = True
    return status


def ensure_model_ready() -> dict:
    """Load all detector artifacts, raising ModelNotReadyError if any fail.

    Used at startup so a missing/corrupt model is a loud, visible failure.
    """
    status = model_artifacts_status()
    if not status["model_loaded"]:
        raise ModelNotReadyError(status["error"] or "model artifacts not loadable")
    return status


def features_dict_to_vector(features: dict[str, float]) -> pd.DataFrame:
    order = _load_feature_order()
    cleaned = validate_feature_dict(features, order)
    return pd.DataFrame([cleaned], columns=order)


def features_list_to_vector(features: list[float]) -> pd.DataFrame:
    order = _load_feature_order()
    cleaned = validate_feature_list(features, order)
    return pd.DataFrame([cleaned], columns=order)


def predict_vector(X: pd.DataFrame) -> PredictData:
    model = _load_model()
    id_to_label = _load_id_to_label()

    pred_id = int(model.predict(X)[0])
    label = id_to_label.get(pred_id, "UNKNOWN")

    confidence = 50.0
    if hasattr(model, "predict_proba"):
        proba = model.predict_proba(X)[0]
        confidence = float(np.max(proba) * 100.0)

    anomaly_score = 0.0 if label == "BENIGN" else min(confidence / 100.0, 1.0)

    return PredictData(
        attack=label,
        confidence=confidence,
        predicted_label=label,
        anomaly_score=anomaly_score,
    )


def predict_features_list(features: list[float]) -> PredictData:
    return predict_vector(features_list_to_vector(features))


def predict_features_dict(features: dict[str, float]) -> PredictData:
    return predict_vector(features_dict_to_vector(features))


def detect_signal(
    *,
    signal_id: str | None,
    asset_id: str | None,
    features: dict[str, float],
    detected_at=None,
    use_baseline: bool = True,
) -> DetectionResult:
    # Validate/align first so entity_id and baseline use the cleaned map.
    order = _load_feature_order()
    cleaned = validate_feature_dict(features, order)

    pred = predict_features_dict(cleaned)
    entity = asset_id or derive_entity_id(cleaned)
    sid = signal_id or new_event_id()
    ts = detected_at or utc_now()

    baseline_deviation = 0.0
    if use_baseline:
        profiles = load_baseline_profiles()
        baseline_deviation = z_score_anomaly(entity, cleaned, profiles)

    anomaly_score = (
        max(pred.anomaly_score, baseline_deviation)
        if pred.attack != "BENIGN"
        else baseline_deviation
    )

    title = ATTACK_TITLES.get(pred.attack, pred.attack)
    severity = severity_from_confidence(pred.confidence, pred.attack)

    return DetectionResult(
        signal_id=sid,
        asset_id=entity,
        detected_at=ts,
        attack=pred.attack,
        confidence=pred.confidence,
        anomaly_score=anomaly_score,
        baseline_deviation=baseline_deviation,
        severity=severity,
        title=title,
        reason=pred.attack,
    )
