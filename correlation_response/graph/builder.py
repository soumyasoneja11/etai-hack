"""
Attack-path graph for GET /api/v1/graph.

FE contract (GraphViewer / frontend GraphNode|GraphLink):
  nodes: [{ id, label, type: "asset"|"attack"|"mitre", severity?, details? }]
  links: [{ source, target, label, animated? }]
Built from recent anomalies + attributions (asset → attack → technique).
Optional Neo4j EXHIBITED edges preferred when CORR_NEO4J_* is set.
"""

from __future__ import annotations

import logging
from typing import Any

from correlation_response.config import settings
from correlation_response.supabase_store import anomaly_store

logger = logging.getLogger(__name__)

_SEVERITIES = frozenset({"low", "medium", "high", "critical", "nominal"})


def _norm_severity(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    v = value.lower()
    return v if v in _SEVERITIES else None


def _dedupe_links(links: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str, str]] = set()
    out: list[dict[str, Any]] = []
    for link in links:
        key = (str(link["source"]), str(link["target"]), str(link.get("label", "")))
        if key in seen:
            continue
        seen.add(key)
        out.append(link)
    return out


def build_graph_from_store(
    *,
    limit: int = 50,
    user_id: str | None = None,
    client: Any = None,
) -> dict[str, Any]:
    """Approach A — graph from Supabase anomalies + attributions (RLS-scoped)."""
    anomalies = anomaly_store.list_items(limit=limit, offset=0, user_id=user_id, client=client)
    attributions = anomaly_store.list_attributions(limit=limit, offset=0, user_id=user_id, client=client)
    attr_by_anomaly = {
        str(a.get("anomaly_id")): a
        for a in attributions
        if a.get("anomaly_id")
    }

    nodes: dict[str, dict[str, Any]] = {}
    links: list[dict[str, Any]] = []

    for item in anomalies:
        anomaly_id = str(item.get("anomaly_id") or "")
        if not anomaly_id:
            continue

        asset_id = str(item.get("asset_id") or "unknown")
        severity = _norm_severity(item.get("severity")) or "medium"
        reason = str(item.get("reason") or "Unknown")
        title = str(item.get("title") or reason)
        score = item.get("score", 0.0)
        animated = severity in ("high", "critical")

        asset_node_id = f"asset-{asset_id}"
        attack_node_id = f"attack-{anomaly_id}"

        nodes[asset_node_id] = {
            "id": asset_node_id,
            "label": f"Asset ({asset_id})",
            "type": "asset",
            "severity": severity,
            "details": {
                "Asset ID": asset_id,
                "Anomaly": anomaly_id,
            },
        }

        nodes[attack_node_id] = {
            "id": attack_node_id,
            "label": title,
            "type": "attack",
            "severity": severity,
            "details": {
                "Reason": reason,
                "Score": float(score) if score is not None else 0.0,
                "Anomaly": anomaly_id,
            },
        }

        links.append({
            "source": asset_node_id,
            "target": attack_node_id,
            "label": "detected",
            "animated": animated,
        })

        attr = attr_by_anomaly.get(anomaly_id) or {}
        tech_id = str(attr.get("mitre_technique_id") or "").strip()
        if not tech_id:
            continue

        tech_name = str(attr.get("technique_name") or tech_id).strip()
        tactic = str(attr.get("mitre_tactic") or "")
        confidence = attr.get("confidence", 0.0)
        mitre_node_id = f"mitre-{tech_id}"

        nodes[mitre_node_id] = {
            "id": mitre_node_id,
            "label": f"{tech_name} ({tech_id})",
            "type": "mitre",
            "details": {
                "Technique": tech_id,
                "Tactic": tactic,
                "Confidence": float(confidence) if confidence is not None else 0.0,
            },
        }

        # attack → technique, plus direct asset → technique (EXHIBITED semantics)
        links.append({
            "source": attack_node_id,
            "target": mitre_node_id,
            "label": "maps to",
            "animated": animated,
        })
        links.append({
            "source": asset_node_id,
            "target": mitre_node_id,
            "label": "exhibits",
            "animated": animated,
        })

    return {
        "nodes": list(nodes.values()),
        "links": _dedupe_links(links),
    }


def build_graph_from_neo4j(*, limit: int = 50) -> dict[str, Any] | None:
    """Approach B — prefer Neo4j Asset-EXHIBITED->Technique when configured."""
    if not settings.neo4j_enabled:
        return None

    try:
        from correlation_response.graph.neo4j_loader import _get_driver
    except Exception as exc:
        logger.debug("Neo4j loader unavailable: %s", exc)
        return None

    driver = _get_driver()
    if driver is None:
        return None

    try:
        with driver.session() as session:
            result = session.run(
                """
                MATCH (a:Asset)-[r:EXHIBITED]->(t:Technique)
                RETURN a.asset_id AS asset_id,
                       t.technique_id AS technique_id,
                       t.name AS technique_name,
                       t.tactic AS tactic,
                       r.confidence AS confidence,
                       r.anomaly_id AS anomaly_id
                ORDER BY r.confidence DESC
                LIMIT $limit
                """,
                limit=limit,
            )
            rows = list(result)
    except Exception as exc:
        logger.warning("Neo4j graph query failed, falling back to store: %s", exc)
        return None
    finally:
        try:
            driver.close()
        except Exception:
            pass

    if not rows:
        return None

    nodes: dict[str, dict[str, Any]] = {}
    links: list[dict[str, Any]] = []

    for record in rows:
        asset_id = str(record.get("asset_id") or "unknown")
        tech_id = str(record.get("technique_id") or "").strip()
        if not tech_id:
            continue

        tech_name = str(record.get("technique_name") or tech_id)
        tactic = str(record.get("tactic") or "")
        confidence = record.get("confidence") or 0.0
        anomaly_id = str(record.get("anomaly_id") or "")

        asset_node_id = f"asset-{asset_id}"
        mitre_node_id = f"mitre-{tech_id}"

        nodes[asset_node_id] = {
            "id": asset_node_id,
            "label": f"Asset ({asset_id})",
            "type": "asset",
            "severity": "high",
            "details": {"Asset ID": asset_id, "Anomaly": anomaly_id},
        }
        nodes[mitre_node_id] = {
            "id": mitre_node_id,
            "label": f"{tech_name} ({tech_id})",
            "type": "mitre",
            "details": {
                "Technique": tech_id,
                "Tactic": tactic,
                "Confidence": float(confidence),
            },
        }
        links.append({
            "source": asset_node_id,
            "target": mitre_node_id,
            "label": "exhibits",
            "animated": True,
        })

    return {
        "nodes": list(nodes.values()),
        "links": _dedupe_links(links),
    }


def get_attack_graph(
    *,
    limit: int = 50,
    user_id: str | None = None,
    client: Any = None,
) -> dict[str, Any]:
    """
    Return FE-compatible graph data.

    Prefer Neo4j when enabled; on failure/empty fall back to the Supabase store,
    which is scoped to the caller via ``user_id``/``client`` (RLS).
    Empty data → {nodes: [], links: []} (never None).
    """
    neo = build_graph_from_neo4j(limit=limit)
    if neo is not None and (neo["nodes"] or neo["links"]):
        return neo
    return build_graph_from_store(limit=limit, user_id=user_id, client=client)
