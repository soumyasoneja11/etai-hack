export const FALLBACK_GRAPH_DATA = {
  nodes: [
    {
      id: "asset-gw-external",
      label: "External Gateway (gw-external-01)",
      type: "asset",
      severity: "high",
      details: { IP: "192.168.1.1", OS: "VyOS Firewall", Criticality: "High", Area: "Edge Network" },
    },
    {
      id: "attack-portscan",
      label: "Port Scan Activity",
      type: "attack",
      severity: "high",
      details: { Reason: "PortScan", Confidence: "94.2%", DetectedBy: "ML Engine", Status: "Investigating" },
    },
    {
      id: "mitre-t1046",
      label: "T1046: Network Service Scanning",
      type: "mitre",
      details: { Tactic: "Discovery", SubTechniques: "None", Framework: "MITRE ATT&CK v13" },
    },
    {
      id: "asset-web-dmz",
      label: "DMZ Web Server (srv-iis-dmz-01)",
      type: "asset",
      severity: "critical",
      details: { IP: "192.168.2.10", OS: "Windows Server 2019 / IIS", Criticality: "High", Area: "DMZ Zone" },
    },
    {
      id: "attack-sqli",
      label: "SQL Injection Attack",
      type: "attack",
      severity: "critical",
      details: { Reason: "SQLInjection", Confidence: "98.7%", DetectedBy: "WAF + ML Engine", Status: "New" },
    },
    {
      id: "mitre-t1190",
      label: "T1190: Exploit Public-Facing App",
      type: "mitre",
      details: { Tactic: "Initial Access", SubTechniques: "None", Framework: "MITRE ATT&CK v13" },
    },
  ],
  links: [
    { source: "mitre-t1046", target: "attack-portscan", label: "Implements", animated: false },
    { source: "attack-portscan", target: "asset-gw-external", label: "Scans", animated: true },
    { source: "mitre-t1190", target: "attack-sqli", label: "Implements", animated: false },
    { source: "attack-sqli", target: "asset-web-dmz", label: "Exploits", animated: true },
    { source: "asset-gw-external", target: "asset-web-dmz", label: "Forwards Traffic", animated: true },
  ],
} as const;