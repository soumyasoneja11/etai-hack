"""
Replay bridge — read detections from A's signal queue, feed into B's correlate.

Usage:
  python -m correlation_response.replay_to_correlate --token <JWT>
  python -m correlation_response.replay_to_correlate --signals-url http://127.0.0.1:8000/api/v1/signals --limit 10
"""

from __future__ import annotations

import argparse
import logging
import os
import time

import httpx

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DEFAULT_SIGNALS_URL = "http://127.0.0.1:8000/api/v1/signals"
DEFAULT_CORRELATE_URL = "http://127.0.0.1:8001/api/v1/correlate"


def _auth_headers(token: str | None) -> dict[str, str]:
    if not token:
        return {}
    return {"Authorization": f"Bearer {token}"}


def fetch_signals(url: str, limit: int, token: str | None = None) -> list[dict]:
    """GET recent signals from A's signal queue."""
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(url, params={"limit": limit}, headers=_auth_headers(token))
        resp.raise_for_status()
        body = resp.json()

    if not body.get("success"):
        logger.error("Signals API returned error: %s", body.get("error"))
        return []

    items = body.get("data", {}).get("items", [])
    logger.info("Fetched %d signals from %s", len(items), url)
    return items


def send_to_correlate(
    correlate_url: str,
    detection: dict,
    token: str | None = None,
) -> dict | None:
    """POST a detection to B's correlate endpoint."""
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            correlate_url,
            json=detection,
            headers=_auth_headers(token),
        )
        resp.raise_for_status()
        body = resp.json()

    if body.get("success"):
        return body.get("data")
    else:
        logger.error("Correlate returned error: %s", body.get("error"))
        return None


def replay(
    *,
    signals_url: str,
    correlate_url: str,
    limit: int,
    delay_sec: float,
    token: str | None = None,
) -> int:
    """Main replay loop: fetch signals from A → correlate via B."""
    signals = fetch_signals(signals_url, limit, token=token)

    if not signals:
        logger.warning("No signals to replay")
        return 0

    sent = skipped = failed = 0

    for sig in signals:
        detection = sig.get("detection")
        if detection is None:
            logger.info("signal=%s has no detection, skipping", sig.get("signal_id"))
            skipped += 1
            continue

        attack = detection.get("attack", "")
        if attack == "BENIGN":
            logger.info("signal=%s is BENIGN, skipping", sig.get("signal_id"))
            skipped += 1
            continue

        try:
            result = send_to_correlate(correlate_url, detection, token=token)
            if result:
                logger.info(
                    "correlated signal=%s attack=%s → %s (%s) anomaly=%s",
                    sig.get("signal_id"),
                    attack,
                    result.get("mitre_technique_id"),
                    result.get("mitre_tactic"),
                    result.get("anomaly_id"),
                )
                sent += 1
            else:
                failed += 1
        except httpx.HTTPError as exc:
            logger.error("Failed to correlate signal=%s: %s", sig.get("signal_id"), exc)
            failed += 1

        if delay_sec > 0:
            time.sleep(delay_sec)

    logger.info(
        "Replay complete: sent=%d skipped=%d failed=%d (total=%d)",
        sent, skipped, failed, len(signals),
    )
    return 0 if failed == 0 else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Replay bridge: A signals → B correlate"
    )
    parser.add_argument(
        "--signals-url", default=DEFAULT_SIGNALS_URL,
        help=f"A's signals endpoint (default: {DEFAULT_SIGNALS_URL})",
    )
    parser.add_argument(
        "--correlate-url", default=DEFAULT_CORRELATE_URL,
        help=f"B's correlate endpoint (default: {DEFAULT_CORRELATE_URL})",
    )
    parser.add_argument("--limit", type=int, default=5, help="Number of signals to fetch")
    parser.add_argument("--delay", type=float, default=0.5, help="Delay between requests (s)")
    parser.add_argument(
        "--token",
        default=os.environ.get("AUTH_TOKEN"),
        help="Supabase JWT (or set AUTH_TOKEN). Required for A signals + B correlate.",
    )
    args = parser.parse_args(argv)

    return replay(
        signals_url=args.signals_url,
        correlate_url=args.correlate_url,
        limit=args.limit,
        delay_sec=args.delay,
        token=args.token,
    )


if __name__ == "__main__":
    raise SystemExit(main())
