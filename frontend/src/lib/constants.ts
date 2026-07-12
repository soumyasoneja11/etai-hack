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
  Bug,
  Target,
  Zap,
  Eye,
  Radio,
  GitBranch,
  Database,
  BookOpen,
  PlayCircle,
  BarChart3,
  ScrollText,
  Plug,
  Lock,
  Globe,
  Cpu,
  Workflow,
  Clock,
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
    title: "Operational Centers",
    items: [
      { label: "Overview", href: "/dashboard?tab=overview", icon: LayoutDashboard },
      { label: "Alerts Queue", href: "/dashboard?tab=alerts", icon: AlertTriangle, badge: "Live" },
      { label: "Attack Path Graph", href: "/dashboard?tab=topology", icon: Network },
      { label: "Digital Twin", href: "/dashboard?tab=twin", icon: Cpu },
    ],
  },
  {
    title: "Response & Compliance",
    items: [
      { label: "Human Review Queue", href: "/dashboard?tab=incident", icon: Target, badge: "Active" },
      { label: "Audit Logs", href: "/dashboard?tab=audit", icon: ScrollText },
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

// ===== Severity Levels =====
export const SEVERITY_LEVELS = {
  critical: { label: "Critical", color: "#EF4444", bg: "rgba(239, 68, 68, 0.1)" },
  high: { label: "High", color: "#F59E0B", bg: "rgba(245, 158, 11, 0.1)" },
  medium: { label: "Medium", color: "#3B82F6", bg: "rgba(59, 130, 246, 0.1)" },
  low: { label: "Low", color: "#22C55E", bg: "rgba(34, 197, 94, 0.1)" },
  info: { label: "Info", color: "#8B5CF6", bg: "rgba(139, 92, 246, 0.1)" },
} as const;

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
    title: "Modbus & DNP3 Telemetry Profiler",
    description:
      "Decodes industrial control system (ICS) bus telemetry at the kernel layer, tracking register write cycles to flag deviations before they alter physical PLC states.",
    icon: "Brain",
  },
  {
    title: "APT Attribution & MITRE Correlation",
    description:
      "Maps alert sequences against tactical profiles of state-sponsored threat groups, identifying patterns matching active APT adversary campaigns in seconds.",
    icon: "Target",
  },
  {
    title: "Ansible-Powered Playbook SOAR",
    description:
      "Orchestrates zero-trust boundary isolation using automated containment rules, locking down compromised substations at the network switch tier.",
    icon: "Zap",
  },
  {
    title: "ICS Vulnerability Prioritizer",
    description:
      "Evaluates CVEs against live SCADA flow metrics and asset coordinates to triage patching by real physical threat vectors rather than simple static severity scores.",
    icon: "Bug",
  },
  {
    title: "Digital Twin Sandbox Simulator",
    description:
      "Simulates adversarial payload routes across virtualized PLCs and active directory gateways to safely evaluate playbooks without production impact.",
    icon: "Cpu",
  },
] as const;

// ===== Workflow Steps =====
export const WORKFLOW_STEPS = [
  { label: "Ingest", description: "Telemetry parsing from RTUs, PLCs, and eBPF kernel hooks" },
  { label: "Profile", description: "Correlate telemetry deviations against baseline behavioral registers" },
  { label: "Attribute", description: "Track operational milestones against active APT adversary strategies" },
  { label: "Isolate", description: "Trigger playbook containment loops to partition target segments" },
  { label: "Stabilize", description: "Flush buffer states, restore firmware hashes, and align power grids" },
] as const;
