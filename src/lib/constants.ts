// ===== Application Constants =====
// Central configuration for navigation, sidebar items, and app-wide settings

import {
  LayoutDashboard,
  Shield,
  Activity,
  Brain,
  Network,
  Server,
  AlertTriangle,
  FileText,
  Settings,
  Users,
  Bug,
  Target,
  Zap,
  Eye,
  Radio,
  GitBranch,
  Database,
  BookOpen,
  ClipboardList,
  PlayCircle,
  BarChart3,
  ScrollText,
  UserCog,
  Plug,
  Lock,
  Info,
  Globe,
  Cpu,
  Workflow,
  type LucideIcon,
} from "lucide-react";

// ===== Platform Info =====
export const PLATFORM = {
  name: "CyberShield AI",
  tagline: "AI-Powered Cyber Resilience Platform",
  version: "1.0.0",
  org: "National Cyber Resilience Centre",
} as const;

// ===== Landing Navigation =====
export const LANDING_NAV_ITEMS = [
  { label: "Home", href: "/" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "AI Agents", href: "/dashboard/ai-agents" },
  { label: "Threat Intelligence", href: "/dashboard/threat-feed" },
  { label: "Digital Twin", href: "/dashboard/digital-twin" },
  { label: "Architecture", href: "#architecture" },
  { label: "Reports", href: "/dashboard/reports" },
] as const;

// ===== Sidebar Navigation =====
export interface SidebarItem {
  label: string;
  href: string;
  icon: LucideIcon;
  children?: SidebarItem[];
  badge?: string;
}

export interface SidebarSection {
  title: string;
  items: SidebarItem[];
}

export const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    title: "",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "Monitoring",
    items: [
      { label: "Live Threat Monitor", href: "/dashboard/threat-monitor", icon: Radio, badge: "Live" },
      { label: "Network Activity", href: "/dashboard/network-activity", icon: Activity },
      { label: "Behaviour Analytics", href: "/dashboard/behavior-analytics", icon: Eye },
      { label: "Attack Surface", href: "/dashboard/attack-surface", icon: Globe },
    ],
  },
  {
    title: "AI Intelligence",
    items: [
      { label: "Behaviour Detection", href: "/dashboard/ai-agents", icon: Brain },
      { label: "Threat Attribution", href: "/dashboard/ai-agents#attribution", icon: Target },
      { label: "Autonomous Response", href: "/dashboard/ai-agents#response", icon: Zap },
      { label: "Vulnerability Priority", href: "/dashboard/ai-agents#vulnerability", icon: Bug },
      { label: "Digital Twin Agent", href: "/dashboard/digital-twin", icon: Cpu },
    ],
  },
  {
    title: "Threat Intelligence",
    items: [
      { label: "MITRE ATT&CK Map", href: "/dashboard/mitre-attack", icon: GitBranch },
      { label: "CVE Database", href: "/dashboard/cve-database", icon: Database },
      { label: "CERT-In Advisories", href: "/dashboard/cert-advisories", icon: BookOpen },
      { label: "Threat Feed", href: "/dashboard/threat-feed", icon: Shield },
    ],
  },
  {
    title: "Infrastructure",
    items: [
      { label: "Asset Inventory", href: "/dashboard/assets", icon: Server },
      { label: "Network Topology", href: "/dashboard/topology", icon: Network },
      { label: "Critical Systems", href: "/dashboard/critical-systems", icon: Workflow },
    ],
  },
  {
    title: "Incident Response",
    items: [
      { label: "Active Incidents", href: "/dashboard/incidents", icon: AlertTriangle, badge: "3" },
      { label: "Response Playbooks", href: "/dashboard/playbooks", icon: PlayCircle },
      { label: "Automated Actions", href: "/dashboard/automated-actions", icon: ClipboardList },
      { label: "Recovery Timeline", href: "/dashboard/recovery", icon: ScrollText },
    ],
  },
  {
    title: "Analytics",
    items: [
      { label: "Reports", href: "/dashboard/reports", icon: BarChart3 },
      { label: "Audit Logs", href: "/dashboard/audit-logs", icon: FileText },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "User Management", href: "/dashboard/users", icon: UserCog },
      { label: "Integrations", href: "/dashboard/settings#integrations", icon: Plug },
      { label: "System Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

// ===== Critical Sectors =====
export const CRITICAL_SECTORS = [
  "Healthcare",
  "Energy",
  "Railways",
  "Defence",
  "Smart Cities",
  "Financial",
  "Education",
  "Government",
] as const;

// ===== Tech Stack =====
export const TECH_STACK = [
  { name: "LangGraph", category: "AI Orchestration" },
  { name: "Neo4j", category: "Graph Database" },
  { name: "Qdrant", category: "Vector Database" },
  { name: "FastAPI", category: "API Framework" },
  { name: "React", category: "Frontend" },
  { name: "Wazuh", category: "SIEM" },
  { name: "eBPF", category: "Kernel Monitoring" },
  { name: "OpenSOAR", category: "Orchestration" },
  { name: "Ansible", category: "Automation" },
  { name: "MITRE ATT&CK", category: "Threat Framework" },
] as const;

// ===== Feature Cards =====
export const FEATURE_CARDS = [
  {
    title: "Behaviour Detection",
    description:
      "AI-powered behavioural anomaly detection engine that learns normal patterns and identifies deviations in real-time across endpoints, users, and network traffic.",
    icon: "Brain",
  },
  {
    title: "Threat Attribution",
    description:
      "Automated threat attribution using MITRE ATT&CK mapping, campaign correlation, and adversary profiling to identify the source and intent of attacks.",
    icon: "Target",
  },
  {
    title: "AI Response",
    description:
      "Autonomous incident response powered by SOAR playbooks that contain threats, isolate compromised systems, and orchestrate recovery in seconds.",
    icon: "Zap",
  },
  {
    title: "Risk Prioritization",
    description:
      "Intelligent vulnerability prioritization that ranks risks by exploitability, asset criticality, and business impact rather than just CVSS scores.",
    icon: "Bug",
  },
  {
    title: "Digital Twin",
    description:
      "Virtual replica of your critical infrastructure for attack simulation, resilience testing, and predictive analysis without impacting production systems.",
    icon: "Cpu",
  },
] as const;

// ===== Workflow Steps =====
export const WORKFLOW_STEPS = [
  { label: "Collect", description: "Ingest telemetry from endpoints, networks, and cloud" },
  { label: "Analyze", description: "AI agents process and correlate threat signals" },
  { label: "Predict", description: "Forecast attack progression using knowledge graphs" },
  { label: "Respond", description: "Execute automated containment and mitigation" },
  { label: "Recover", description: "Orchestrate system restoration and hardening" },
] as const;

// ===== Severity Levels =====
export const SEVERITY_LEVELS = {
  critical: { label: "Critical", color: "#EF4444", bg: "rgba(239, 68, 68, 0.1)" },
  high: { label: "High", color: "#F59E0B", bg: "rgba(245, 158, 11, 0.1)" },
  medium: { label: "Medium", color: "#3B82F6", bg: "rgba(59, 130, 246, 0.1)" },
  low: { label: "Low", color: "#22C55E", bg: "rgba(34, 197, 94, 0.1)" },
  info: { label: "Info", color: "#8B5CF6", bg: "rgba(139, 92, 246, 0.1)" },
} as const;

// ===== Threat Level Config =====
export const THREAT_LEVELS = {
  critical: { label: "CRITICAL", color: "#EF4444", description: "Immediate action required" },
  high: { label: "HIGH", color: "#F59E0B", description: "Active threats detected" },
  elevated: { label: "ELEVATED", color: "#3B82F6", description: "Increased monitoring" },
  guarded: { label: "GUARDED", color: "#22C55E", description: "Normal operations" },
  low: { label: "LOW", color: "#22C55E", description: "Minimal threat activity" },
} as const;
