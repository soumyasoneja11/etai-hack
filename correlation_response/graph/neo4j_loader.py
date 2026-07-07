"""
Loads correlation_response/data/attack_techniques.json into Neo4j Aura as
(:Technique) nodes with MITRE ATT&CK properties.

Environment Variables:
    NEO4J_URI         e.g. neo4j+s://<dbid>.databases.neo4j.io
    NEO4J_USER        usually "neo4j"
    NEO4J_PASSWORD

Usage:
    pip install neo4j
    export NEO4J_URI=...
    export NEO4J_USER=neo4j
    export NEO4J_PASSWORD=...
    python scripts/neo4j_loader.py
"""

import json
import os
from neo4j import GraphDatabase

DATA_PATH = os.path.join(
    os.path.dirname(__file__),
    "..",
    "data",
    "attack_techniques.json"
)

URI = os.environ["neo4j+s://ceb439b3.databases.neo4j.io"]
USER = os.environ["ceb439b3"]
PASSWORD = os.environ["GZW2CsZT33m-mWCokjUJ9IYCAzm4TAtZAjg5QCLlTU8"]

TECHNIQUE_CONSTRAINT = """
CREATE CONSTRAINT technique_mitre_unique IF NOT EXISTS
FOR (t:Technique)
REQUIRE t.mitre_id IS UNIQUE
"""

ASSET_CONSTRAINT = """
CREATE CONSTRAINT asset_id_unique IF NOT EXISTS
FOR (a:Asset)
REQUIRE a.asset_id IS UNIQUE
"""

TECHNIQUE_UPSERT = """
MERGE (t:Technique {mitre_id: $mitre_id})
SET
    t.name = $name,
    t.tactic = $tactic,
    t.description = $description,
    t.mitigation = $mitigation
"""

ASSET_UPSERT = """
MERGE (a:Asset {asset_id: $asset_id})
ON CREATE SET
    a.asset_type = "Unknown",
    a.status = "Healthy",
    a.criticality = "Medium"
"""

OBSERVED_ON_REL = """
MATCH (t:Technique {mitre_id: $mitre_id})
MATCH (a:Asset {asset_id: $asset_id})

MERGE (t)-[r:OBSERVED_ON]->(a)

ON CREATE SET
    r.first_seen = $timestamp,
    r.last_seen = $timestamp,
    r.count = 1

ON MATCH SET
    r.last_seen = $timestamp,
    r.count = coalesce(r.count, 0) + 1
"""


def create_constraints(driver):
    with driver.session() as session:
        session.run(TECHNIQUE_CONSTRAINT)
        session.run(ASSET_CONSTRAINT)


def load_techniques(driver):
    with open(DATA_PATH, "r") as f:
        techniques = json.load(f)

    with driver.session() as session:
        for mitre_id, info in techniques.items():
            session.run(
                TECHNIQUE_UPSERT,
                mitre_id=mitre_id,
                name=info.get("technique"),
                tactic=info.get("tactic"),
                description=info.get("description"),
                mitigation=info.get("mitigation"),
            )

    print(f"Loaded {len(techniques)} Technique nodes into Neo4j Aura.")


def upsert_asset_and_link(driver, mitre_id: str, asset_id: str, timestamp: str):
    """
    Creates Asset nodes lazily and links them to Technique nodes.

    Example graph:

        (Technique)-[:OBSERVED_ON]->(Asset)

    Called whenever a detection is correlated.
    """

    with driver.session() as session:
        session.run(
            ASSET_UPSERT,
            asset_id=asset_id
        )

        session.run(
            OBSERVED_ON_REL,
            mitre_id=mitre_id,
            asset_id=asset_id,
            timestamp=timestamp
        )


if __name__ == "__main__":
    driver = GraphDatabase.driver(
        URI,
        auth=(USER, PASSWORD)
    )

    try:
        driver.verify_connectivity()

        create_constraints(driver)
        load_techniques(driver)

        print("Neo4j Aura initialized successfully.")

    finally:
        driver.close()