// ===== Realistic Cybersecurity Dummy Data =====
// Placeholder data for all dashboard components
// TODO: Replace with backend API calls when available

// ===== Dashboard Metrics =====
export const DASHBOARD_METRICS = {
  infrastructure: [
    { label: "Total Assets", value: 12847, change: 2.4, trend: "up" as const, icon: "Server" },
    { label: "Endpoints", value: 8432, change: 1.8, trend: "up" as const, icon: "Monitor" },
    { label: "Servers", value: 1256, change: -0.3, trend: "down" as const, icon: "HardDrive" },
    { label: "Critical Infrastructure", value: 342, change: 0, trend: "neutral" as const, icon: "Shield" },
    { label: "Network Devices", value: 2817, change: 3.1, trend: "up" as const, icon: "Network" },
  ],
  security: [
    { label: "Live Threats", value: 23, change: -12.5, trend: "down" as const, icon: "AlertTriangle", severity: "high" },
    { label: "Blocked Today", value: 1847, change: 8.3, trend: "up" as const, icon: "ShieldCheck" },
    { label: "Suspicious Users", value: 7, change: -28.6, trend: "down" as const, icon: "UserX" },
    { label: "AI Confidence", value: 97.3, change: 0.8, trend: "up" as const, icon: "Brain", suffix: "%" },
    { label: "False Positive Rate", value: 2.1, change: -15.2, trend: "down" as const, icon: "XCircle", suffix: "%" },
    { label: "MTTD", value: 4.2, change: -22.3, trend: "down" as const, icon: "Clock", suffix: "min" },
    { label: "MTTR", value: 12.8, change: -18.7, trend: "down" as const, icon: "Timer", suffix: "min" },
  ],
};

// ===== Sparkline Data (7 days) =====
export const SPARKLINE_DATA = {
  threats: [45, 38, 52, 31, 28, 35, 23],
  blocked: [1200, 1450, 1380, 1520, 1680, 1790, 1847],
  assets: [12500, 12600, 12650, 12700, 12780, 12820, 12847],
  confidence: [96.1, 96.5, 96.8, 97.0, 96.9, 97.1, 97.3],
};

// ===== Threat Severity Distribution =====
export const THREAT_SEVERITY = {
  critical: 8,
  high: 15,
  medium: 42,
  low: 67,
  info: 134,
};

// ===== Behavior Detection Timeline (24 hours) =====
export const BEHAVIOR_TIMELINE = Array.from({ length: 24 }, (_, i) => ({
  hour: `${String(i).padStart(2, "0")}:00`,
  normal: 85 + Math.random() * 10,
  anomaly: i === 3 ? 65 : i === 14 ? 55 : i === 19 ? 70 : 90 + Math.random() * 8,
  baseline: 92,
}));

// ===== Network Activity (Real-time) =====
export const NETWORK_ACTIVITY = Array.from({ length: 30 }, (_, i) => ({
  time: `${String(Math.floor(i / 2) + 8).padStart(2, "0")}:${i % 2 === 0 ? "00" : "30"}`,
  bandwidth: 2400 + Math.random() * 800 + (i > 20 ? 400 : 0),
  packets: 45000 + Math.random() * 15000,
  connections: 1200 + Math.random() * 400,
}));

// ===== World Threat Map Data =====
export const THREAT_ORIGINS = [
  { country: "Russia", code: "RU", lat: 55.7558, lng: 37.6173, attacks: 2847, severity: "critical" as const },
  { country: "China", code: "CN", lat: 39.9042, lng: 116.4074, attacks: 2103, severity: "critical" as const },
  { country: "North Korea", code: "KP", lat: 39.0392, lng: 125.7625, attacks: 876, severity: "high" as const },
  { country: "Iran", code: "IR", lat: 35.6892, lng: 51.389, attacks: 654, severity: "high" as const },
  { country: "United States", code: "US", lat: 38.9072, lng: -77.0369, attacks: 432, severity: "medium" as const },
  { country: "Brazil", code: "BR", lat: -15.7975, lng: -47.8919, attacks: 321, severity: "medium" as const },
  { country: "Nigeria", code: "NG", lat: 9.0579, lng: 7.4951, attacks: 234, severity: "low" as const },
  { country: "India", code: "IN", lat: 28.6139, lng: 77.209, attacks: 189, severity: "low" as const },
  { country: "Turkey", code: "TR", lat: 39.9334, lng: 32.8597, attacks: 156, severity: "low" as const },
  { country: "Vietnam", code: "VN", lat: 21.0278, lng: 105.8342, attacks: 143, severity: "low" as const },
];

// ===== Target Location (India) =====
export const TARGET_LOCATION = { lat: 28.6139, lng: 77.209 };

// ===== Attack Timeline Events =====
export const ATTACK_TIMELINE = [
  {
    id: "EVT-001",
    time: "14:32:18",
    title: "Lateral Movement Detected",
    description: "Unusual RDP session from 10.0.3.42 to domain controller DC-PROD-01",
    severity: "critical" as const,
    mitre: "T1021.001",
    aiAction: "Isolated endpoint, blocked RDP port",
    status: "contained" as const,
  },
  {
    id: "EVT-002",
    time: "14:28:05",
    title: "Credential Dumping Attempt",
    description: "LSASS memory access detected on WRK-FIN-023 by process mimikatz.exe",
    severity: "critical" as const,
    mitre: "T1003.001",
    aiAction: "Process terminated, credentials rotated",
    status: "resolved" as const,
  },
  {
    id: "EVT-003",
    time: "14:15:42",
    title: "Suspicious DNS Query",
    description: "DNS tunneling pattern detected: high-entropy subdomain queries to c2.malware.tk",
    severity: "high" as const,
    mitre: "T1071.004",
    aiAction: "Domain blocked at DNS resolver",
    status: "contained" as const,
  },
  {
    id: "EVT-004",
    time: "13:58:31",
    title: "Brute Force Attack",
    description: "478 failed SSH login attempts from 185.220.101.34 targeting JUMP-SRV-01",
    severity: "high" as const,
    mitre: "T1110.001",
    aiAction: "IP blocked at perimeter firewall",
    status: "resolved" as const,
  },
  {
    id: "EVT-005",
    time: "13:45:19",
    title: "Data Exfiltration Attempt",
    description: "Unusual data transfer (2.3GB) to external IP via encrypted channel",
    severity: "critical" as const,
    mitre: "T1048.001",
    aiAction: "Connection terminated, DLP alert raised",
    status: "investigating" as const,
  },
  {
    id: "EVT-006",
    time: "13:22:08",
    title: "Privilege Escalation",
    description: "Local admin privilege gained through CVE-2024-1086 kernel exploit",
    severity: "high" as const,
    mitre: "T1068",
    aiAction: "Patch deployed, process sandboxed",
    status: "resolved" as const,
  },
  {
    id: "EVT-007",
    time: "12:55:44",
    title: "Phishing Email Detected",
    description: "Spear-phishing with malicious PDF attachment targeting finance department",
    severity: "medium" as const,
    mitre: "T1566.001",
    aiAction: "Email quarantined, user notified",
    status: "resolved" as const,
  },
  {
    id: "EVT-008",
    time: "12:30:12",
    title: "Port Scan Activity",
    description: "Sequential port scan from 203.0.113.42 targeting DMZ subnet",
    severity: "medium" as const,
    mitre: "T1046",
    aiAction: "IP rate-limited, SOC notified",
    status: "monitoring" as const,
  },
];

// ===== Threat Feed Table =====
export const THREAT_FEED = [
  {
    id: "TF-2024-001",
    threat: "APT29 Campaign",
    source: "CERT-In Advisory",
    mitreTechnique: "T1195.002",
    mitreLabel: "Supply Chain Compromise",
    confidence: 94,
    affectedAsset: "SRV-PROD-12",
    status: "active" as const,
    timestamp: "2024-12-15T14:32:00Z",
  },
  {
    id: "TF-2024-002",
    threat: "Log4Shell Exploit",
    source: "Wazuh SIEM",
    mitreTechnique: "T1190",
    mitreLabel: "Exploit Public Application",
    confidence: 98,
    affectedAsset: "WEB-APP-03",
    status: "contained" as const,
    timestamp: "2024-12-15T13:45:00Z",
  },
  {
    id: "TF-2024-003",
    threat: "Ransomware Dropper",
    source: "EDR Agent",
    mitreTechnique: "T1486",
    mitreLabel: "Data Encrypted for Impact",
    confidence: 87,
    affectedAsset: "WRK-HR-015",
    status: "resolved" as const,
    timestamp: "2024-12-15T12:18:00Z",
  },
  {
    id: "TF-2024-004",
    threat: "C2 Beacon Activity",
    source: "Network Sensor",
    mitreTechnique: "T1071.001",
    mitreLabel: "Web Protocols",
    confidence: 91,
    affectedAsset: "WRK-DEV-042",
    status: "active" as const,
    timestamp: "2024-12-15T11:22:00Z",
  },
  {
    id: "TF-2024-005",
    threat: "Insider Data Access",
    source: "UEBA Engine",
    mitreTechnique: "T1530",
    mitreLabel: "Data from Cloud Storage",
    confidence: 76,
    affectedAsset: "CLOUD-S3-PROD",
    status: "investigating" as const,
    timestamp: "2024-12-15T10:55:00Z",
  },
  {
    id: "TF-2024-006",
    threat: "Zero-Day Exploit",
    source: "Threat Intel Feed",
    mitreTechnique: "T1203",
    mitreLabel: "Exploitation for Client Execution",
    confidence: 82,
    affectedAsset: "Multiple",
    status: "monitoring" as const,
    timestamp: "2024-12-15T09:30:00Z",
  },
];

// ===== AI Agent Data =====
export const AI_AGENTS = [
  {
    id: "agent-behavior",
    name: "Behaviour Detection Agent",
    description: "Monitors user and entity behaviour patterns using ML models to detect anomalies",
    status: "running" as const,
    lastAnalysis: "2 minutes ago",
    confidence: 97.3,
    modelsActive: 12,
    eventsProcessed: 2847562,
    recentDecision: "Flagged anomalous login pattern for user jsmith@corp.in",
    icon: "Brain",
  },
  {
    id: "agent-attribution",
    name: "Threat Attribution Agent",
    description: "Correlates IOCs with known threat actors and maps techniques to MITRE ATT&CK",
    status: "running" as const,
    lastAnalysis: "5 minutes ago",
    confidence: 94.1,
    modelsActive: 8,
    eventsProcessed: 1523891,
    recentDecision: "Attributed attack pattern to APT29 with 94% confidence",
    icon: "Target",
  },
  {
    id: "agent-response",
    name: "Autonomous Response Agent",
    description: "Executes automated containment and response actions based on playbook policies",
    status: "running" as const,
    lastAnalysis: "1 minute ago",
    confidence: 99.1,
    modelsActive: 6,
    eventsProcessed: 89432,
    recentDecision: "Isolated endpoint WRK-FIN-023 and blocked lateral movement",
    icon: "Zap",
  },
  {
    id: "agent-vulnerability",
    name: "Vulnerability Prioritization Agent",
    description: "Ranks vulnerabilities by exploitability, asset criticality, and real-world threat data",
    status: "running" as const,
    lastAnalysis: "15 minutes ago",
    confidence: 92.7,
    modelsActive: 4,
    eventsProcessed: 45678,
    recentDecision: "Escalated CVE-2024-1086 to critical priority for 23 affected servers",
    icon: "Bug",
  },
  {
    id: "agent-twin",
    name: "Digital Twin Agent",
    description: "Simulates attack scenarios on virtual infrastructure replica for predictive defence",
    status: "idle" as const,
    lastAnalysis: "1 hour ago",
    confidence: 96.5,
    modelsActive: 3,
    eventsProcessed: 12345,
    recentDecision: "Completed ransomware propagation simulation — 3 critical paths identified",
    icon: "Cpu",
  },
];

// ===== Asset Inventory =====
export const ASSET_INVENTORY = [
  { hostname: "DC-PROD-01", ip: "10.0.1.10", department: "IT Operations", risk: "critical" as const, os: "Windows Server 2022", owner: "Rajesh Kumar", lastSeen: "2 min ago", status: "online" as const },
  { hostname: "SRV-PROD-12", ip: "10.0.2.45", department: "Engineering", risk: "high" as const, os: "Ubuntu 22.04 LTS", owner: "Priya Sharma", lastSeen: "1 min ago", status: "online" as const },
  { hostname: "WEB-APP-03", ip: "10.0.5.20", department: "Web Services", risk: "high" as const, os: "RHEL 9", owner: "Amit Patel", lastSeen: "5 min ago", status: "online" as const },
  { hostname: "WRK-FIN-023", ip: "10.0.8.123", department: "Finance", risk: "critical" as const, os: "Windows 11 Pro", owner: "Sneha Gupta", lastSeen: "Isolated", status: "isolated" as const },
  { hostname: "FW-EDGE-01", ip: "10.0.0.1", department: "Network", risk: "medium" as const, os: "Palo Alto PAN-OS 11", owner: "Network Ops", lastSeen: "30 sec ago", status: "online" as const },
  { hostname: "JUMP-SRV-01", ip: "10.0.1.50", department: "IT Security", risk: "high" as const, os: "Ubuntu 24.04 LTS", owner: "Vikram Singh", lastSeen: "1 min ago", status: "online" as const },
  { hostname: "DB-PROD-01", ip: "10.0.3.10", department: "Database", risk: "critical" as const, os: "Oracle Linux 9", owner: "Database Team", lastSeen: "2 min ago", status: "online" as const },
  { hostname: "MAIL-SRV-01", ip: "10.0.4.15", department: "Communications", risk: "medium" as const, os: "Windows Server 2022", owner: "IT Operations", lastSeen: "3 min ago", status: "online" as const },
  { hostname: "SCADA-PLC-07", ip: "10.100.1.7", department: "Industrial Control", risk: "critical" as const, os: "Embedded RTOS", owner: "OT Security", lastSeen: "10 sec ago", status: "online" as const },
  { hostname: "CLOUD-S3-PROD", ip: "N/A", department: "Cloud Infrastructure", risk: "medium" as const, os: "AWS S3", owner: "Cloud Ops", lastSeen: "Real-time", status: "online" as const },
  { hostname: "GUEST-WIFI-AP", ip: "10.0.9.5", department: "Facilities", risk: "low" as const, os: "Cisco IOS", owner: "Network Ops", lastSeen: "1 min ago", status: "online" as const },
  { hostname: "OLD-PRINTER-01", ip: "10.0.9.15", department: "Facilities", risk: "low" as const, os: "Unknown", owner: "Facilities", lastSeen: "2 days ago", status: "offline" as const },
];

// ===== Vulnerability Data =====
export const VULNERABILITIES = [
  { cve: "CVE-2024-1086", title: "Linux Kernel Use-After-Free", cvss: 9.8, exploitability: "Active", affected: 23, recommendation: "Apply kernel patch immediately", priority: "critical" as const },
  { cve: "CVE-2024-3400", title: "PAN-OS Command Injection", cvss: 10.0, exploitability: "Active", affected: 4, recommendation: "Update to PAN-OS 11.1.3", priority: "critical" as const },
  { cve: "CVE-2024-21762", title: "Fortinet FortiOS Out-of-Bound Write", cvss: 9.6, exploitability: "PoC Available", affected: 8, recommendation: "Upgrade FortiOS to 7.4.3+", priority: "high" as const },
  { cve: "CVE-2024-0012", title: "PAN-OS Auth Bypass", cvss: 9.1, exploitability: "Active", affected: 4, recommendation: "Restrict management interface access", priority: "critical" as const },
  { cve: "CVE-2024-47575", title: "FortiManager Missing Auth", cvss: 9.8, exploitability: "Active", affected: 2, recommendation: "Apply emergency patch", priority: "critical" as const },
  { cve: "CVE-2023-44487", title: "HTTP/2 Rapid Reset Attack", cvss: 7.5, exploitability: "Active", affected: 45, recommendation: "Update web servers and load balancers", priority: "high" as const },
];

// ===== Alert Data =====
export const ALERTS = [
  {
    id: "ALT-001",
    title: "Critical: Active Lateral Movement Detected",
    severity: "critical" as const,
    assignee: "Vikram Singh",
    aiExplanation: "Multiple RDP sessions initiated from compromised endpoint to high-value targets. Pattern matches APT29 TTPs with 94% confidence.",
    timestamp: "2024-12-15T14:32:18Z",
    status: "open" as const,
    source: "Behaviour Detection Agent",
  },
  {
    id: "ALT-002",
    title: "High: Credential Harvesting Tools Detected",
    severity: "critical" as const,
    assignee: "Priya Sharma",
    aiExplanation: "Mimikatz variant detected in memory of WRK-FIN-023. Credentials for 12 service accounts may be compromised.",
    timestamp: "2024-12-15T14:28:05Z",
    status: "investigating" as const,
    source: "EDR Engine",
  },
  {
    id: "ALT-003",
    title: "High: DNS Tunneling Communication",
    severity: "high" as const,
    assignee: "Amit Patel",
    aiExplanation: "High-entropy DNS queries to known C2 domain detected. Estimated 450KB of data exfiltrated via DNS channel.",
    timestamp: "2024-12-15T14:15:42Z",
    status: "contained" as const,
    source: "Network Sensor",
  },
  {
    id: "ALT-004",
    title: "Medium: Unusual After-Hours Access",
    severity: "medium" as const,
    assignee: "Unassigned",
    aiExplanation: "User ravi.mehta@corp.in accessed financial database at 02:47 IST. This deviates from established access patterns.",
    timestamp: "2024-12-15T02:47:00Z",
    status: "open" as const,
    source: "UEBA Engine",
  },
  {
    id: "ALT-005",
    title: "Low: Certificate Expiry Warning",
    severity: "low" as const,
    assignee: "Network Ops",
    aiExplanation: "TLS certificate for api.internal.corp.in expires in 14 days. Automatic renewal recommended.",
    timestamp: "2024-12-15T09:00:00Z",
    status: "acknowledged" as const,
    source: "Certificate Monitor",
  },
];

// ===== Playbook Data =====
export const PLAYBOOKS = [
  { name: "Isolate Endpoint", steps: 5, estimatedTime: "30 seconds", approvalRequired: false, lastRun: "14 min ago", status: "ready" as const },
  { name: "Disable User Account", steps: 3, estimatedTime: "15 seconds", approvalRequired: true, lastRun: "2 hours ago", status: "ready" as const },
  { name: "Block IP Address", steps: 4, estimatedTime: "10 seconds", approvalRequired: false, lastRun: "28 min ago", status: "ready" as const },
  { name: "Collect Memory Dump", steps: 7, estimatedTime: "5 minutes", approvalRequired: true, lastRun: "1 day ago", status: "ready" as const },
  { name: "Notify Admin Team", steps: 2, estimatedTime: "5 seconds", approvalRequired: false, lastRun: "14 min ago", status: "ready" as const },
  { name: "Rotate Credentials", steps: 8, estimatedTime: "2 minutes", approvalRequired: true, lastRun: "3 hours ago", status: "ready" as const },
];

// ===== Audit Log Data =====
export const AUDIT_LOGS = [
  { id: "LOG-001", action: "Endpoint Isolated", user: "AI Response Agent", type: "automated" as const, timestamp: "2024-12-15T14:32:20Z", details: "Isolated WRK-FIN-023 due to credential dumping detection", status: "success" as const },
  { id: "LOG-002", action: "IP Blocked", user: "AI Response Agent", type: "automated" as const, timestamp: "2024-12-15T14:28:10Z", details: "Blocked 185.220.101.34 at perimeter firewall", status: "success" as const },
  { id: "LOG-003", action: "Alert Acknowledged", user: "Vikram Singh", type: "manual" as const, timestamp: "2024-12-15T14:25:00Z", details: "Acknowledged ALT-001 and began investigation", status: "success" as const },
  { id: "LOG-004", action: "Playbook Executed", user: "AI Response Agent", type: "automated" as const, timestamp: "2024-12-15T14:20:15Z", details: "Executed 'Block IP Address' playbook for 203.0.113.42", status: "success" as const },
  { id: "LOG-005", action: "Report Generated", user: "Priya Sharma", type: "manual" as const, timestamp: "2024-12-15T14:00:00Z", details: "Generated weekly threat intelligence report", status: "success" as const },
  { id: "LOG-006", action: "User Login", user: "admin@cybershield.in", type: "manual" as const, timestamp: "2024-12-15T08:30:00Z", details: "Successful MFA authentication from 10.0.1.100", status: "success" as const },
  { id: "LOG-007", action: "Policy Updated", user: "Rajesh Kumar", type: "manual" as const, timestamp: "2024-12-15T07:45:00Z", details: "Updated firewall rules for DMZ subnet", status: "success" as const },
  { id: "LOG-008", action: "Scan Completed", user: "Vulnerability Scanner", type: "automated" as const, timestamp: "2024-12-15T06:00:00Z", details: "Completed weekly vulnerability scan — 156 findings", status: "success" as const },
];

// ===== Landing Page Stats =====
export const LANDING_STATS = [
  { value: 1500000, suffix: "+", label: "Threats Analyzed" },
  { value: 97, suffix: "%", label: "Detection Accuracy" },
  { value: 65, suffix: "%", label: "MTTR Reduction" },
  { value: 99.9, suffix: "%", label: "Platform Uptime" },
];

// ===== Digital Twin Nodes =====
export const DIGITAL_TWIN_NODES = [
  { id: "internet", type: "cloud", label: "Internet", x: 400, y: 50 },
  { id: "fw-edge", type: "firewall", label: "Edge Firewall", x: 400, y: 150 },
  { id: "dmz-web", type: "server", label: "Web Servers", x: 250, y: 250 },
  { id: "dmz-mail", type: "server", label: "Mail Server", x: 550, y: 250 },
  { id: "fw-internal", type: "firewall", label: "Internal FW", x: 400, y: 350 },
  { id: "dc-01", type: "server", label: "DC-PROD-01", x: 200, y: 450 },
  { id: "app-srv", type: "server", label: "App Servers", x: 400, y: 450 },
  { id: "db-prod", type: "database", label: "DB-PROD-01", x: 600, y: 450 },
  { id: "scada", type: "ot", label: "SCADA/ICS", x: 200, y: 570 },
  { id: "endpoints", type: "endpoint", label: "Endpoints", x: 400, y: 570 },
  { id: "cloud-aws", type: "cloud", label: "AWS Cloud", x: 600, y: 570 },
];

export const DIGITAL_TWIN_EDGES = [
  { source: "internet", target: "fw-edge" },
  { source: "fw-edge", target: "dmz-web" },
  { source: "fw-edge", target: "dmz-mail" },
  { source: "dmz-web", target: "fw-internal" },
  { source: "dmz-mail", target: "fw-internal" },
  { source: "fw-internal", target: "dc-01" },
  { source: "fw-internal", target: "app-srv" },
  { source: "fw-internal", target: "db-prod" },
  { source: "dc-01", target: "scada" },
  { source: "app-srv", target: "endpoints" },
  { source: "db-prod", target: "cloud-aws" },
];

// ===== Trusted By Logos =====
export const TRUSTED_BY = [
  "CERT-In",
  "NIC",
  "Power Grid Corp",
  "AIIMS",
  "Indian Railways",
  "Ministry of Defence",
  "RBI",
  "DRDO",
];

// ===== MITRE ATT&CK Techniques (Sample) =====
export const MITRE_TECHNIQUES = [
  { id: "T1190", name: "Exploit Public-Facing Application", tactic: "Initial Access", detected: 12 },
  { id: "T1566.001", name: "Spearphishing Attachment", tactic: "Initial Access", detected: 28 },
  { id: "T1059.001", name: "PowerShell", tactic: "Execution", detected: 45 },
  { id: "T1003.001", name: "LSASS Memory", tactic: "Credential Access", detected: 8 },
  { id: "T1021.001", name: "Remote Desktop Protocol", tactic: "Lateral Movement", detected: 15 },
  { id: "T1048.001", name: "Exfiltration Over Symmetric Encrypted Channel", tactic: "Exfiltration", detected: 3 },
  { id: "T1486", name: "Data Encrypted for Impact", tactic: "Impact", detected: 2 },
  { id: "T1071.004", name: "DNS", tactic: "Command and Control", detected: 19 },
  { id: "T1110.001", name: "Password Guessing", tactic: "Credential Access", detected: 67 },
  { id: "T1068", name: "Exploitation for Privilege Escalation", tactic: "Privilege Escalation", detected: 5 },
  { id: "T1046", name: "Network Service Discovery", tactic: "Discovery", detected: 34 },
  { id: "T1195.002", name: "Compromise Software Supply Chain", tactic: "Initial Access", detected: 1 },
];

// ===== Notifications =====
export const NOTIFICATIONS = [
  { id: 1, title: "Critical Alert", message: "Active lateral movement detected in production network", time: "2 min ago", read: false, severity: "critical" as const },
  { id: 2, title: "AI Agent Update", message: "Behaviour Detection Agent completed analysis cycle", time: "5 min ago", read: false, severity: "info" as const },
  { id: 3, title: "Playbook Executed", message: "Endpoint isolation playbook ran successfully", time: "14 min ago", read: true, severity: "success" as const },
  { id: 4, title: "Threat Intel Update", message: "New CERT-In advisory: CVE-2024-3400 active exploitation", time: "1 hour ago", read: true, severity: "warning" as const },
  { id: 5, title: "System Update", message: "Platform version 1.2.4 deployed successfully", time: "3 hours ago", read: true, severity: "info" as const },
];
