import { NextResponse } from "next/server";

export interface GraphNode {
  id: string;
  label: string;
  type: "asset" | "attack" | "mitre";
  severity?: "low" | "medium" | "high" | "critical" | "nominal";
  details?: Record<string, string | number>;
}

export interface GraphLink {
  source: string;
  target: string;
  label: string;
  animated?: boolean;
}

const GRAPH_NODES: GraphNode[] = [
  // Asset Nodes (Teal / Blue / Green)
  {
    id: "asset-gw-external",
    label: "External Gateway (gw-external-01)",
    type: "asset",
    severity: "high",
    details: { IP: "192.168.1.1", OS: "VyOS Firewall", Criticality: "High", Area: "Edge Network" },
  },
  {
    id: "asset-web-dmz",
    label: "DMZ Web Server (srv-iis-dmz-01)",
    type: "asset",
    severity: "critical",
    details: { IP: "192.168.2.10", OS: "Windows Server 2019 / IIS", Criticality: "High", Area: "DMZ Zone" },
  },
  {
    id: "asset-mysql-db",
    label: "Database Server (srv-mysql-db-01)",
    type: "asset",
    severity: "critical",
    details: { IP: "10.0.3.15", OS: "Ubuntu 22.04 LTS / MySQL", Criticality: "Critical", Area: "Data Zone" },
  },
  {
    id: "asset-git-repo",
    label: "Internal Git Repo (srv-linux-git-02)",
    type: "asset",
    severity: "high",
    details: { IP: "10.0.3.22", OS: "Ubuntu 20.04 LTS / Gitea", Criticality: "High", Area: "Dev Zone" },
  },
  {
    id: "asset-active-directory",
    label: "Primary AD (win-active-directory-01)",
    type: "asset",
    severity: "critical",
    details: { IP: "10.0.1.100", OS: "Windows Server 2022 / Active Directory", Criticality: "Critical", Area: "Management Zone" },
  },
  {
    id: "asset-backup-s3",
    label: "S3 Backup Store (srv-backup-s3)",
    type: "asset",
    severity: "critical",
    details: { IP: "AWS S3 Endpoint", OS: "Cloud Storage", Criticality: "High", Area: "Cloud Infrastructure" },
  },
  {
    id: "asset-workstation-dev",
    label: "Dev Machine (workstation-dev-44)",
    type: "asset",
    severity: "medium",
    details: { IP: "10.0.5.44", OS: "macOS Sonoma", Criticality: "Medium", User: "snigdha (Developer)", Area: "Office LAN" },
  },
  {
    id: "asset-workstation-finance",
    label: "Finance Machine (workstation-finance-01)",
    type: "asset",
    severity: "low",
    details: { IP: "10.0.5.101", OS: "Windows 11 Enterprise", Criticality: "Medium", User: "rahul (Finance Lead)", Area: "Office LAN" },
  },

  // Attack Nodes (Red / Crimson)
  {
    id: "attack-portscan",
    label: "Port Scan Activity",
    type: "attack",
    severity: "high",
    details: { Reason: "PortScan", Confidence: "94.2%", DetectedBy: "ML Engine", Status: "Investigating" },
  },
  {
    id: "attack-sqli",
    label: "SQL Injection Attack",
    type: "attack",
    severity: "critical",
    details: { Reason: "SQLInjection", Confidence: "98.7%", DetectedBy: "WAF + ML Engine", Status: "New" },
  },
  {
    id: "attack-ssh-brute",
    label: "SSH Brute Force Attempt",
    type: "attack",
    severity: "medium",
    details: { Reason: "BruteForce", Confidence: "87.4%", DetectedBy: "Fail2Ban Baseline", Status: "Contained" },
  },
  {
    id: "attack-kerberos",
    label: "Kerberos Golden Ticket Abuse",
    type: "attack",
    severity: "critical",
    details: { Reason: "CredentialUse", Confidence: "99.1%", DetectedBy: "Orchestrator AD Auditor", Status: "New" },
  },
  {
    id: "attack-exfil",
    label: "Large Data Exfiltration",
    type: "attack",
    severity: "critical",
    details: { Reason: "Exfiltration", Confidence: "95.5%", DetectedBy: "NetFlow Baseline Deviation", Status: "New" },
  },
  {
    id: "attack-priv-esc",
    label: "Local Privilege Escalation",
    type: "attack",
    severity: "high",
    details: { Reason: "PrivEscalation", Confidence: "91.0%", DetectedBy: "Host IDS", Status: "Investigating" },
  },

  // MITRE Techniques (Purple / Indigo)
  {
    id: "mitre-t1046",
    label: "T1046: Network Service Scanning",
    type: "mitre",
    details: { Tactic: "Discovery", SubTechniques: "None", Framework: "MITRE ATT&CK v13" },
  },
  {
    id: "mitre-t1190",
    label: "T1190: Exploit Public-Facing App",
    type: "mitre",
    details: { Tactic: "Initial Access", SubTechniques: "None", Framework: "MITRE ATT&CK v13" },
  },
  {
    id: "mitre-t1110",
    label: "T1110: Brute Force",
    type: "mitre",
    details: { Tactic: "Credential Access", SubTechniques: "T1110.001 (Password Guessing)", Framework: "MITRE ATT&CK v13" },
  },
  {
    id: "mitre-t1558",
    label: "T1558: Steal or Modify Kerberos Ticket",
    type: "mitre",
    details: { Tactic: "Credential Access", SubTechniques: "T1558.001 (Golden Ticket)", Framework: "MITRE ATT&CK v13" },
  },
  {
    id: "mitre-t1020",
    label: "T1020: Automated Exfiltration",
    type: "mitre",
    details: { Tactic: "Exfiltration", SubTechniques: "None", Framework: "MITRE ATT&CK v13" },
  },
  {
    id: "mitre-t1068",
    label: "T1068: Exploitation for Privilege Escalation",
    type: "mitre",
    details: { Tactic: "Privilege Escalation", SubTechniques: "None", Framework: "MITRE ATT&CK v13" },
  }
];

const GRAPH_LINKS: GraphLink[] = [
  // MITRE to Attack mappings
  { source: "mitre-t1046", target: "attack-portscan", label: "Implements", animated: false },
  { source: "mitre-t1190", target: "attack-sqli", label: "Implements", animated: false },
  { source: "mitre-t1110", target: "attack-ssh-brute", label: "Implements", animated: false },
  { source: "mitre-t1558", target: "attack-kerberos", label: "Implements", animated: false },
  { source: "mitre-t1020", target: "attack-exfil", label: "Implements", animated: false },
  { source: "mitre-t1068", target: "attack-priv-esc", label: "Implements", animated: false },

  // Attack to Targeted Asset mappings
  { source: "attack-portscan", target: "asset-gw-external", label: "Scans", animated: true },
  { source: "attack-sqli", target: "asset-web-dmz", label: "Exploits", animated: true },
  { source: "attack-ssh-brute", target: "asset-mysql-db", label: "Brutes SSH", animated: true },
  { source: "attack-priv-esc", target: "asset-git-repo", label: "Escalates Privs", animated: true },
  { source: "attack-kerberos", target: "asset-active-directory", label: "Compromises AD", animated: true },
  { source: "attack-exfil", target: "asset-backup-s3", label: "Exfiltrates to", animated: true },

  // Lateral Movement & Pivoting between assets
  { source: "asset-gw-external", target: "asset-web-dmz", label: "Forwards Traffic", animated: true },
  { source: "asset-web-dmz", target: "asset-mysql-db", label: "Database Pivot", animated: true },
  { source: "asset-mysql-db", target: "asset-git-repo", label: "SSH Pivoting", animated: true },
  { source: "asset-git-repo", target: "asset-workstation-dev", label: "Clones SSH Keys", animated: true },
  { source: "asset-workstation-dev", target: "asset-active-directory", label: "Pivots to Domain Controller", animated: true },
  { source: "asset-active-directory", target: "asset-backup-s3", label: "Acquires Admin Access & Exfiltrates", animated: true },
  { source: "asset-workstation-dev", target: "asset-workstation-finance", label: "Lateral SMB Scan", animated: false }
];

export async function GET() {
  try {
    const requestId = crypto.randomUUID();
    return NextResponse.json({
      success: true,
      data: {
        nodes: GRAPH_NODES,
        links: GRAPH_LINKS,
      },
      error: null,
      meta: {
        timestamp: new Date().toISOString(),
        request_id: requestId,
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
