"""
Neo4j Aura graph loader — seed MITRE technique nodes and create asset relationships.

Usage:
  python -m correlation_response.graph.neo4j_loader          # seed techniques
  python -m correlation_response.graph.neo4j_loader --clear   # wipe and reseed
"""

from __future__ import annotations

import argparse
import logging
from typing import Any

logger = logging.getLogger(__name__)


def _get_driver():
    """Create Neo4j driver from settings. Returns None if neo4j not available."""
    try:
        from neo4j import GraphDatabase
    except ImportError:
        logger.error("neo4j Python driver not installed. Run: pip install neo4j>=5.20")
        return None

    from correlation_response.config import settings

    if not settings.neo4j_enabled:
        logger.warning("Neo4j not configured (set CORR_NEO4J_URI and CORR_NEO4J_PASSWORD)")
        return None

    return GraphDatabase.driver(
        settings.neo4j_uri,
        auth=(settings.neo4j_user, settings.neo4j_password),
    )


def seed_techniques(clear: bool = False) -> int:
    """Load attack_techniques.json into Neo4j as (:Technique) nodes."""
    from correlation_response.correlate import get_techniques

    driver = _get_driver()
    if driver is None:
        return 1

    techniques = get_techniques()
    try:
        with driver.session() as session:
            if clear:
                session.run("MATCH (t:Technique) DETACH DELETE t")
                logger.info("Cleared existing Technique nodes")

            for tech in techniques:
                session.run(
                    """
                    MERGE (t:Technique {technique_id: $technique_id})
                    SET t.name = $name,
                        t.tactic = $tactic,
                        t.description = $description
                    """,
                    technique_id=tech["technique_id"],
                    name=tech["name"],
                    tactic=tech["tactic"],
                    description=tech["description"],
                )

            logger.info("Seeded %d Technique nodes in Neo4j", len(techniques))
        return 0
    except Exception as exc:
        logger.error("Failed to seed techniques: %s", exc)
        return 1
    finally:
        driver.close()


def ensure_asset_node(asset_id: str) -> bool:
    """Create or merge an (:Asset) node for the given asset_id."""
    driver = _get_driver()
    if driver is None:
        return False

    try:
        with driver.session() as session:
            session.run(
                "MERGE (a:Asset {asset_id: $asset_id})",
                asset_id=asset_id,
            )
        return True
    except Exception as exc:
        logger.error("Failed to create Asset node: %s", exc)
        return False
    finally:
        driver.close()


def create_exhibited_relationship(
    asset_id: str,
    technique_id: str,
    *,
    confidence: float = 0.0,
    anomaly_id: str = "",
) -> bool:
    """Create (:Asset)-[:EXHIBITED]->(:Technique) relationship."""
    driver = _get_driver()
    if driver is None:
        return False

    try:
        with driver.session() as session:
            session.run(
                """
                MERGE (a:Asset {asset_id: $asset_id})
                MERGE (t:Technique {technique_id: $technique_id})
                CREATE (a)-[:EXHIBITED {
                    confidence: $confidence,
                    anomaly_id: $anomaly_id
                }]->(t)
                """,
                asset_id=asset_id,
                technique_id=technique_id,
                confidence=confidence,
                anomaly_id=anomaly_id,
            )
        logger.info(
            "Created EXHIBITED: %s -> %s (confidence=%.1f)",
            asset_id, technique_id, confidence,
        )
        return True
    except Exception as exc:
        logger.error("Failed to create relationship: %s", exc)
        return False
    finally:
        driver.close()


def count_connected_assets(technique_id: str) -> int:
    """Count distinct assets connected to a technique via EXHIBITED relationships.

    Used by the decision engine to compute blast radius.
    Returns 0 if Neo4j is unavailable or query fails.
    """
    driver = _get_driver()
    if driver is None:
        return 0

    try:
        with driver.session() as session:
            result = session.run(
                """
                MATCH (a:Asset)-[:EXHIBITED]->(t:Technique {technique_id: $technique_id})
                RETURN count(DISTINCT a) AS asset_count
                """,
                technique_id=technique_id,
            )
            record = result.single()
            count = record["asset_count"] if record else 0
            logger.debug("Blast radius for %s: %d assets", technique_id, count)
            return count
    except Exception as exc:
        logger.error("Failed to count connected assets for %s: %s", technique_id, exc)
        return 0
    finally:
        driver.close()


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Seed MITRE techniques into Neo4j Aura")
    parser.add_argument("--clear", action="store_true", help="Delete existing Technique nodes first")
    args = parser.parse_args(argv)
    return seed_techniques(clear=args.clear)


if __name__ == "__main__":
    raise SystemExit(main())