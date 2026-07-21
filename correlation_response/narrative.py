"""RAG narrative engine — LLM + retrieval for analyst-style incident narratives.

Uses the threat intel corpus (corpus.json) as the retrieval source and
Google Gemini as the LLM. Falls back to a template-only narrative if
Gemini is unavailable.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from shared.schemas import AuditEntry, NarrativeResponse

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Fixed prompt template (team plan: "consistent story format in the UI")
# ---------------------------------------------------------------------------

NARRATIVE_PROMPT_TEMPLATE = """\
You are a senior SOC analyst writing an incident narrative for a security \
operations dashboard. Write in professional, concise SOC language.

## Anomaly Details
- **Attack Type**: {attack}
- **MITRE Technique**: {mitre_technique_id} — {technique_name} ({mitre_tactic})
- **Confidence**: {confidence:.1f}%
- **Asset**: {asset_id}
- **Detected At**: {detected_at}

## Threat Intelligence Context
{threat_intel_context}

## Instructions
Write a 3–5 paragraph analyst narrative covering:
1. **Detection summary** — What happened, key indicators, why this was flagged.
2. **MITRE ATT&CK context** — What this technique means, how adversaries use it.
3. **Relevant CVEs / Advisories** — Reference specific CVE IDs and CERT-In advisories from the threat intel above.
4. **Recommended immediate actions** — Concrete steps for the SOC team.
5. **Follow-up investigation** — What to look for next.

Cite CVE IDs and CERT-In references where available. Be specific and actionable.\
"""


def _format_threat_intel_context(docs: list[dict[str, Any]]) -> str:
    """Format threat intel documents into prompt-ready text."""
    if not docs:
        return "No matching threat intelligence documents found."

    sections = []
    for doc in docs[:5]:  # Cap at 5 docs to stay within token budget
        section = (
            f"### {doc.get('title', 'Unknown')}\n"
            f"- **ID**: {doc.get('doc_id', 'N/A')}\n"
            f"- **Type**: {doc.get('type', 'N/A')}\n"
            f"- **Severity**: {doc.get('severity', 'N/A')}\n"
        )
        if doc.get("cvss_score"):
            section += f"- **CVSS**: {doc['cvss_score']}\n"
        if doc.get("description"):
            section += f"- **Description**: {doc['description'][:300]}\n"
        if doc.get("remediation"):
            section += f"- **Remediation**: {doc['remediation'][:200]}\n"
        if doc.get("cert_in_ref"):
            section += f"- **CERT-In Ref**: {doc['cert_in_ref']}\n"
        sections.append(section)

    return "\n".join(sections)


def _build_prompt(
    *,
    attack: str,
    mitre_technique_id: str,
    technique_name: str,
    mitre_tactic: str,
    confidence: float,
    asset_id: str,
    detected_at: str,
    threat_docs: list[dict[str, Any]],
) -> str:
    """Fill the fixed prompt template with anomaly + threat intel data."""
    return NARRATIVE_PROMPT_TEMPLATE.format(
        attack=attack,
        mitre_technique_id=mitre_technique_id,
        technique_name=technique_name,
        mitre_tactic=mitre_tactic,
        confidence=confidence,
        asset_id=asset_id,
        detected_at=detected_at,
        threat_intel_context=_format_threat_intel_context(threat_docs),
    )


def _call_gemini(prompt: str) -> str | None:
    """Call Gemini API. Returns generated text or None on failure."""
    from correlation_response.config import settings

    if not settings.gemini_enabled:
        logger.info("Gemini not configured — skipping LLM call")
        return None

    try:
        import google.generativeai as genai

        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel(settings.gemini_model)
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=settings.narrative_max_tokens,
                temperature=0.3,  # Deterministic-ish for consistent reports
            ),
        )
        return response.text
    except Exception as exc:
        logger.error("Gemini API call failed: %s", exc)
        return None


def _template_fallback(
    *,
    attack: str,
    mitre_technique_id: str,
    technique_name: str,
    mitre_tactic: str,
    confidence: float,
    asset_id: str,
    threat_docs: list[dict[str, Any]],
) -> str:
    """Generate a structured narrative without LLM — pure template."""
    cve_refs = [d["doc_id"] for d in threat_docs if d.get("type") == "CVE"]
    cert_refs = [d["doc_id"] for d in threat_docs if d.get("type") == "CERT-In"]
    remediation = next(
        (d.get("remediation", "") for d in threat_docs if d.get("remediation")), ""
    )

    paragraphs = [
        f"**Detection Summary**: The ML detection pipeline identified "
        f"**{attack}** activity on asset `{asset_id}` with "
        f"**{confidence:.1f}%** confidence. This anomaly was flagged based on "
        f"statistical deviation from established baseline behavior patterns.",

        f"**MITRE ATT&CK Context**: This activity maps to technique "
        f"**{mitre_technique_id} — {technique_name}** under the "
        f"**{mitre_tactic}** tactic. "
        f"Adversaries use this technique as part of broader attack campaigns "
        f"targeting enterprise infrastructure.",
    ]

    if cve_refs:
        paragraphs.append(
            f"**Related Vulnerabilities**: The following CVEs are associated "
            f"with this attack pattern: {', '.join(cve_refs)}. "
            f"Security teams should verify that affected systems are patched."
        )

    if cert_refs:
        paragraphs.append(
            f"**CERT-In Advisories**: Relevant Indian CERT advisories: "
            f"{', '.join(cert_refs)}. Organizations should review these "
            f"advisories for sector-specific guidance."
        )

    if remediation:
        paragraphs.append(
            f"**Recommended Actions**: {remediation}"
        )
    else:
        paragraphs.append(
            f"**Recommended Actions**: Investigate the affected asset, review "
            f"network logs for lateral movement, and consider isolating the "
            f"endpoint pending further analysis."
        )

    return "\n\n".join(paragraphs)


def generate_narrative(
    *,
    anomaly_id: str,
    attack: str,
    mitre_technique_id: str,
    technique_name: str,
    mitre_tactic: str,
    confidence: float,
    asset_id: str,
    detected_at: str,
    threat_docs: list[dict[str, Any]],
    user_id: str | None = None,
    client: Any = None,
) -> NarrativeResponse:
    """Generate an analyst narrative using LLM + retrieved threat intel.

    Falls back to template-only if Gemini is unavailable.
    """
    from correlation_response.audit import log_action

    # Build prompt
    prompt = _build_prompt(
        attack=attack,
        mitre_technique_id=mitre_technique_id,
        technique_name=technique_name,
        mitre_tactic=mitre_tactic,
        confidence=confidence,
        asset_id=asset_id,
        detected_at=detected_at,
        threat_docs=threat_docs,
    )

    # Try LLM
    narrative_text = _call_gemini(prompt)
    source = "gemini"

    # Fallback
    if narrative_text is None:
        narrative_text = _template_fallback(
            attack=attack,
            mitre_technique_id=mitre_technique_id,
            technique_name=technique_name,
            mitre_tactic=mitre_tactic,
            confidence=confidence,
            asset_id=asset_id,
            threat_docs=threat_docs,
        )
        source = "template"

    logger.info(
        "Generated narrative for anomaly=%s attack=%s source=%s (%d chars)",
        anomaly_id, attack, source, len(narrative_text),
    )

    doc_ids = [d.get("doc_id", "") for d in threat_docs if d.get("doc_id")]

    # Audit trail
    log_action(
        AuditEntry(
            anomaly_id=anomaly_id,
            action_type="narrative_generated",
            actor="system",
            target=asset_id,
            decision=source,
            status="success",
            details={
                "source": source,
                "doc_count": len(threat_docs),
                "narrative_length": len(narrative_text),
            },
        ),
        user_id=user_id,
        client=client,
    )

    return NarrativeResponse(
        anomaly_id=anomaly_id,
        narrative=narrative_text,
        sources=doc_ids,
    )
