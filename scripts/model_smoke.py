"""Startup smoke test — fails (exit 1) if the detector model can't load.

Wire this into CI as a gate so a deploy that can't load the LightGBM artifact
never ships as a silent "detects nothing" service:

    python scripts/model_smoke.py

Checks:
  1. Core runtime deps import (lightgbm, joblib) — catches the historical
     requirements.txt/pyproject drift.
  2. The detector artifacts (model.joblib + feature_order + label_mapping)
     actually load via ingestion_detection.predict.

ASCII-only output for Windows cp1252 consoles. Exit code 0 = healthy.
"""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def _check_imports() -> str | None:
    try:
        import joblib  # noqa: F401
        import lightgbm  # noqa: F401
    except Exception as exc:  # noqa: BLE001
        return f"dependency import failed: {exc}"
    return None


def main() -> int:
    print("model smoke: ingestion-detection detector")

    import_err = _check_imports()
    if import_err:
        print(f"  FAIL deps: {import_err}")
        print("  hint: pip install -r requirements.txt")
        return 1
    print("  ok: lightgbm + joblib import")

    from ingestion_detection.predict import model_artifacts_status

    status = model_artifacts_status()
    print(f"  model_path   : {status.get('model_path')}")
    print(f"  model_version: {status.get('model_version')}")
    print(f"  model_loaded : {status.get('model_loaded')}")

    if not status["model_loaded"]:
        print(f"  FAIL model: {status.get('error')}")
        print("  hint: build/restore model.joblib (python -m ingestion_detection.train)")
        return 1

    print(
        f"  ok: features={status.get('feature_count')} "
        f"labels={status.get('label_count')}"
    )
    print("PASS: detector model loads")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
