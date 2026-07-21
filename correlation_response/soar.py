"""Mock SOAR executor — simulates isolate, block, and revoke actions.

All actions are simulated (no real infrastructure changes). Each action
writes to the soar_actions table and emits an audit log entry.
"""

from __future__ import annotations

import asyncio
import logging
import random
from datetime import datetime, timezone
from uuid import uuid4

from shared.schemas import AuditEntry, SOARActionResult

logger = logging.getLogger(__name__)


async def _simulate_delay() -> None:
    """Simulate realistic SOAR execution latency (0.5–2s)."""
    delay = random.uniform(0.5, 2.0)
    await asyncio.sleep(delay)


async def isolate_endpoint(
    *,
    anomaly_id: str,
    asset_id: str,
    actor: str = "system",
    user_id: str | None = None,
    client: object = None,
) -> SOARActionResult:
    """Simulate network isolation of a compromised endpoint."""
    from correlation_response.audit import log_action, log_soar_action

    action_id = str(uuid4())
    now = datetime.now(timezone.utc)

    logger.info("SOAR isolate_endpoint: asset=%s anomaly=%s (simulated)", asset_id, anomaly_id)
    await _simulate_delay()

    result = SOARActionResult(
        action_id=action_id,
        action_type="isolate_endpoint",
        target=asset_id,
        status="simulated",
        executed_at=now,
        message=f"Simulated network isolation of endpoint {asset_id}. "
                f"In production, this would trigger EDR agent isolation and VLAN quarantine.",
        simulated=True,
    )

    # Persist SOAR action
    log_soar_action(
        action_id=action_id,
        anomaly_id=anomaly_id,
        action_type="isolate_endpoint",
        target=asset_id,
        status="simulated",
        message=result.message,
        user_id=user_id,
        client=client,
    )

    # Audit trail
    log_action(
        AuditEntry(
            anomaly_id=anomaly_id,
            action_type="isolate_endpoint",
            actor=actor,
            target=asset_id,
            decision="executed",
            status="success",
            details={"action_id": action_id, "simulated": True},
        ),
        user_id=user_id,
        client=client,
    )

    return result


async def block_ip(
    *,
    anomaly_id: str,
    ip_address: str,
    actor: str = "system",
    user_id: str | None = None,
    client: object = None,
) -> SOARActionResult:
    """Simulate firewall block of a malicious IP address."""
    from correlation_response.audit import log_action, log_soar_action

    action_id = str(uuid4())
    now = datetime.now(timezone.utc)

    logger.info("SOAR block_ip: ip=%s anomaly=%s (simulated)", ip_address, anomaly_id)
    await _simulate_delay()

    result = SOARActionResult(
        action_id=action_id,
        action_type="block_ip",
        target=ip_address,
        status="simulated",
        executed_at=now,
        message=f"Simulated firewall rule to block IP {ip_address}. "
                f"In production, this would push a deny rule to perimeter firewall and WAF.",
        simulated=True,
    )

    log_soar_action(
        action_id=action_id,
        anomaly_id=anomaly_id,
        action_type="block_ip",
        target=ip_address,
        status="simulated",
        message=result.message,
        user_id=user_id,
        client=client,
    )

    log_action(
        AuditEntry(
            anomaly_id=anomaly_id,
            action_type="block_ip",
            actor=actor,
            target=ip_address,
            decision="executed",
            status="success",
            details={"action_id": action_id, "simulated": True},
        ),
        user_id=user_id,
        client=client,
    )

    return result


async def revoke_credential(
    *,
    anomaly_id: str,
    asset_id: str,
    actor: str = "system",
    user_id: str | None = None,
    client: object = None,
) -> SOARActionResult:
    """Simulate credential revocation / rotation for a compromised asset."""
    from correlation_response.audit import log_action, log_soar_action

    action_id = str(uuid4())
    now = datetime.now(timezone.utc)

    logger.info("SOAR revoke_credential: asset=%s anomaly=%s (simulated)", asset_id, anomaly_id)
    await _simulate_delay()

    result = SOARActionResult(
        action_id=action_id,
        action_type="revoke_credential",
        target=asset_id,
        status="simulated",
        executed_at=now,
        message=f"Simulated credential revocation for asset {asset_id}. "
                f"In production, this would rotate API keys, revoke TLS certificates, "
                f"and force password reset via IAM.",
        simulated=True,
    )

    log_soar_action(
        action_id=action_id,
        anomaly_id=anomaly_id,
        action_type="revoke_credential",
        target=asset_id,
        status="simulated",
        message=result.message,
        user_id=user_id,
        client=client,
    )

    log_action(
        AuditEntry(
            anomaly_id=anomaly_id,
            action_type="revoke_credential",
            actor=actor,
            target=asset_id,
            decision="executed",
            status="success",
            details={"action_id": action_id, "simulated": True},
        ),
        user_id=user_id,
        client=client,
    )

    return result
