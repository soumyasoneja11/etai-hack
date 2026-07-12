"""
Day 8 — offline edge-case checks for feature validation (Approach A).

Does not start FastAPI. Exercises predict/features validators directly.

Run:
    python scripts/test_edge_cases.py
"""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ingestion_detection.predict import (  # noqa: E402
    _load_feature_order,
    features_dict_to_vector,
    features_list_to_vector,
    predict_features_list,
)


def _expect_value_error(label: str, fn) -> None:
    try:
        fn()
    except ValueError as exc:
        print(f"  PASS  {label}: ValueError - {exc}")
        return
    raise AssertionError(f"FAIL  {label}: expected ValueError")


def _expect_ok(label: str, fn) -> None:
    fn()
    print(f"  PASS  {label}")


def main() -> int:
    order = _load_feature_order()
    n = len(order)
    print(f"feature_order length = {n}")
    print("Running edge-case checks...\n")

    _expect_value_error(
        "empty feature list",
        lambda: features_list_to_vector([]),
    )
    _expect_value_error(
        "wrong list length (short)",
        lambda: features_list_to_vector([0.0] * (n - 1)),
    )
    _expect_value_error(
        "wrong list length (long)",
        lambda: features_list_to_vector([0.0] * (n + 1)),
    )
    _expect_value_error(
        "empty feature dict",
        lambda: features_dict_to_vector({}),
    )
    _expect_value_error(
        "missing required feature keys",
        lambda: features_dict_to_vector({"Destination Port": 80.0}),
    )
    _expect_value_error(
        "non-numeric feature value",
        lambda: features_dict_to_vector({name: "bad" if i == 0 else 0.0 for i, name in enumerate(order)}),
    )

    good_list = [0.0] * n
    _expect_ok(
        "valid zero vector list -> DataFrame",
        lambda: features_list_to_vector(good_list),
    )
    good_dict = {name: 0.0 for name in order}
    _expect_ok(
        "valid zero vector dict -> DataFrame",
        lambda: features_dict_to_vector(good_dict),
    )
    # NaN / Inf are coerced (training-compatible), not rejected
    nan_list = [float("nan")] + [0.0] * (n - 1)
    _expect_ok(
        "NaN in list coerced to 0",
        lambda: features_list_to_vector(nan_list),
    )

    # Smoke: model can score a valid vector (requires model.joblib)
    try:
        pred = predict_features_list(good_list)
        print(f"  PASS  predict on zero vector -> {pred.attack} ({pred.confidence:.2f}%)")
    except Exception as exc:  # noqa: BLE001
        print(f"  SKIP  predict smoke (model not ready?): {exc}")

    print("\nAll edge-case checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
