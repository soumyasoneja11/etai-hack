import { NextResponse } from "next/server";
import type { AnomalyListItem } from "@/types/api";

// Re-export so existing imports from this module continue to work
export type { AnomalyListItem } from "@/types/api";

const ATTACK_TEMPLATES = [
  {
    title: "Port Scan Activity Detected",
    reason: "PortScan",
    severities: ["high", "critical"] as const,
    assets: ["dst-80-win-255", "srv-iis-dmz-01", "gw-external-01"],
    baseScore: 0.88,
  },
  {
    title: "DDoS Inbound Traffic Flooding",
    reason: "DDoS",
    severities: ["critical"] as const,
    assets: ["edge-router-primary", "srv-nginx-loadbalancer"],
    baseScore: 0.96,
  },
  {
    title: "Repeated SSH Brute Force Failures",
    reason: "BruteForce",
    severities: ["medium", "high"] as const,
    assets: ["srv-linux-ssh-01", "srv-linux-git-02"],
    baseScore: 0.74,
  },
  {
    title: "SQL Injection Attempt on API",
    reason: "SQLInjection",
    severities: ["high", "critical"] as const,
    assets: ["srv-mysql-db-01", "srv-node-api-01"],
    baseScore: 0.85,
  },
  {
    title: "Botnet C2 Beaconing Activity",
    reason: "Botnet",
    severities: ["medium", "high"] as const,
    assets: ["workstation-sales-12", "workstation-hr-05", "workstation-dev-44"],
    baseScore: 0.68,
  },
  {
    title: "Large Outbound Data Exfiltration",
    reason: "Exfiltration",
    severities: ["critical"] as const,
    assets: ["srv-backup-s3", "srv-file-share"],
    baseScore: 0.98,
  },
  {
    title: "Suspicious Kerberos Ticket Request",
    reason: "CredentialUse",
    severities: ["high"] as const,
    assets: ["win-active-directory-01", "win-domain-controller-02"],
    baseScore: 0.79,
  },
  {
    title: "Local Privilege Escalation Attempt",
    reason: "PrivEscalation",
    severities: ["high"] as const,
    assets: ["srv-linux-git-02", "workstation-dev-44"],
    baseScore: 0.81,
  },
  {
    title: "Ransomware File Encryption Signature",
    reason: "Ransomware",
    severities: ["critical"] as const,
    assets: ["workstation-finance-01", "srv-file-share"],
    baseScore: 0.99,
  },
  {
    title: "Phishing Link Click Callback",
    reason: "Phishing",
    severities: ["low", "medium"] as const,
    assets: ["workstation-sales-15", "workstation-hr-09"],
    baseScore: 0.42,
  },
  {
    title: "Anomalous Internal Port Sweep",
    reason: "InternalScan",
    severities: ["low", "medium"] as const,
    assets: ["workstation-dev-12", "srv-print-01"],
    baseScore: 0.35,
  }
];

function generateMockAlerts(): AnomalyListItem[] {
  const alerts: AnomalyListItem[] = [];
  const now = new Date("2026-07-07T23:29:36Z");
  
  let seed = 42;
  function random() {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  }

  for (let i = 0; i < 80; i++) {
    const templateIdx = Math.floor(random() * ATTACK_TEMPLATES.length);
    const template = ATTACK_TEMPLATES[templateIdx];
    
    const assetIdx = Math.floor(random() * template.assets.length);
    const assetId = template.assets[assetIdx];
    
    const severityIdx = Math.floor(random() * template.severities.length);
    const severity = template.severities[severityIdx];
    
    const scoreOffset = (random() - 0.5) * 0.15;
    const score = Math.max(0.01, Math.min(1.0, parseFloat((template.baseScore + scoreOffset).toFixed(2))));
    
    let status: AnomalyListItem["status"] = "new";
    const statusRand = random();
    if (statusRand < 0.35) {
      status = "new";
    } else if (statusRand < 0.6) {
      status = "investigating";
    } else if (statusRand < 0.8) {
      status = "acknowledged";
    } else if (statusRand < 0.95) {
      status = "contained";
    } else {
      status = "false_positive";
    }

    const timeBackMs = (i * 30 + Math.floor(random() * 20)) * 60 * 1000;
    const detectedAt = new Date(now.getTime() - timeBackMs);

    const guid = () => {
      const s4 = () => Math.floor((1 + random()) * 0x10000).toString(16).substring(1);
      return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
    };

    alerts.push({
      anomaly_id: guid(),
      title: template.title,
      severity,
      status,
      asset_id: assetId,
      detected_at: detectedAt.toISOString(),
      score,
      reason: template.reason,
    });
  }

  return alerts.sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime());
}

const MOCK_ALERTS = generateMockAlerts();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : null;
    const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!) : 0;
    
    let filtered = [...MOCK_ALERTS];

    if (limit !== null) {
      filtered = filtered.slice(offset, offset + limit);
    }

    const requestId = crypto.randomUUID();
    
    return NextResponse.json({
      success: true,
      data: filtered,
      error: null,
      meta: {
        timestamp: new Date().toISOString(),
        request_id: requestId,
        total_count: MOCK_ALERTS.length,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "INTERNAL_ERROR",
          message: error.message || "An unexpected error occurred",
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: crypto.randomUUID(),
        },
      },
      { status: 500 }
    );
  }
}
