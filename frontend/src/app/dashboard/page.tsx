"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  AlertTriangle,
  Activity,
  Search,
  CheckCircle,
  User,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { IS_MOCK_MODE, apiGet, apiPost, ApiError, getToken } from "@/lib/api-client";
import dynamic from "next/dynamic";
import { MetricCard } from "@/components/shared/MetricCard";
import { AUDIT_LOGS } from "@/lib/dummy-data";
import type { AnomalyListItem, AnomalyListResponse, NarrativeResponse } from "@/types/api";
import { GraphNode, GraphLink } from "../api/graph/route";
import { FALLBACK_GRAPH_DATA } from "@/lib/graph-data";

interface RawAuditLog {
  audit_id?: string;
  id?: string;
  action_type?: string;
  action?: string;
  actor?: string;
  user?: string;
  type?: string;
  created_at?: string;
  timestamp?: string;
  details?: string | Record<string, unknown>;
  status?: string;
}

// Lazy load heavy chart components
const ThreatSeverityGauges = dynamic(
  () => import("@/components/dashboard/charts/ThreatSeverityGauges"),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

// Dynamically import the Force Graph component to disable SSR
const GraphViewer = dynamic(() => import("@/components/dashboard/GraphViewer"), {
  ssr: false,
  loading: () => (
    <div className="relative flex-1 min-h-[480px] bg-[#0c0d10] border border-border rounded-[16px] flex items-center justify-center text-muted-foreground">
      <div className="flex flex-col items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Initializing Topology Graph Engine...
        </span>
      </div>
    </div>
  ),
});

function ChartSkeleton({ height = 300 }: { height?: number }) {
  return (
    <div
      className="rounded-[20px] border border-border bg-card animate-pulse"
      style={{ height }}
    />
  );
}

interface Incident {
  id: string;
  title: string;
  severity: string;
  tactic: string;
  asset_id: string;
  reason: string;
  impact: string;
  status: string;
  detected_at: string;
}

interface UIAuditLog {
  id: string;
  action: string;
  user: string;
  type: string;
  timestamp: string;
  details: string;
  status: string;
}

interface FeatureWeight {
  name: string;
  weight: number;
}

interface CveRecord {
  doc_id: string;
  title: string;
  description: string;
  source_url?: string;
  cvss_score?: number | null;
  remediation?: string;
}

interface CertInAdvisory {
  doc_id: string;
  title: string;
  description: string;
  source_url?: string;
  remediation?: string;
}

interface ThreatIntel {
  total: number;
  related_cves?: CveRecord[];
  cert_in_advisories?: CertInAdvisory[];
  mitre_info?: {
    technique?: string;
    mitre_id?: string;
    description?: string;
    orchestration?: {
      blast_radius?: string;
      playbook_id?: string;
    };
    telemetry_indicators?: string[];
  };
}

const MOCK_INCIDENTS = [
  {
    id: "INC-904",
    title: "Isolate Outbound Gateway Feeder-101",
    severity: "critical",
    tactic: "Impact / Denial of Service",
    asset_id: "dst-80-win-255",
    reason: "DDoS",
    impact: "Prevents complete subnet phase drift. Limits attack velocity.",
    status: "pending",
    detected_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  {
    id: "INC-302",
    title: "Revoke Session token on SCADA Router RTU-1",
    severity: "high",
    tactic: "Command and Control / Botnet",
    asset_id: "src-telnet-iot-node",
    reason: "Bot",
    impact: "Disconnects C2 relay node beacon loops. Restores local switch control.",
    status: "pending",
    detected_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: "INC-122",
    title: "Block Inbound Scanner Route 198.51.100.74",
    severity: "medium",
    tactic: "Reconnaissance / Port Sweep",
    asset_id: "dst-80-win-255",
    reason: "PortScan",
    impact: "Halts remote mapping probes. Mitigates enumeration scans.",
    status: "pending",
    detected_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
];

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "overview";

  // Share alerts & graph state across views
  const [alerts, setAlerts] = useState<AnomalyListItem[]>([]);
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  // Dynamic Audit Logs state so we can add logs in real-time
  const [auditLogs, setAuditLogs] = useState<UIAuditLog[]>([]);

  // Interactive Incident Response Review Queue state
  const [incidents, setIncidents] = useState<Incident[]>(IS_MOCK_MODE ? MOCK_INCIDENTS : []);

  const mapQueueToIncidents = (items: AnomalyListItem[]) =>
    (items ?? []).map((item) => ({
      id: item.anomaly_id,
      title: item.title,
      severity: item.severity,
      tactic: item.reason || "Unknown",
      asset_id: item.asset_id,
      reason: item.reason,
      impact: `Review required for ${item.reason || "anomaly"} on ${item.asset_id}`,
      status: item.status === "new" || item.status === "investigating" ? "pending" : item.status,
      detected_at: item.detected_at,
    }));

  const refreshReviewQueue = useCallback(async () => {
    if (IS_MOCK_MODE) return;
    try {
      const queue = await apiGet<{ items: AnomalyListItem[] }>("/review/queue", {
        queryParams: { status: "new" },
      });
      setIncidents(mapQueueToIncidents(queue.items ?? []));
    } catch (err) {
      console.error("Failed to load review queue", err);
    }
  }, []);

  // Fetch initial alerts & graph data
  const mapAuditRows = (items: RawAuditLog[]): UIAuditLog[] =>
    items.map((row: RawAuditLog) => ({
      id: row.audit_id ?? row.id ?? "",
      action: row.action_type ?? row.action ?? "unknown",
      user: row.actor ?? row.user ?? "system",
      type: row.actor === "system" || row.type === "automated" ? "automated" : "manual",
      timestamp: row.created_at ?? row.timestamp ?? new Date().toISOString(),
      details: typeof row.details === "object" ? JSON.stringify(row.details) : (row.details ?? ""),
      status: row.status ?? "success",
    }));

  const refreshAuditLogs = useCallback(async () => {
    if (IS_MOCK_MODE) return;
    try {
      const auditRes = await apiGet<{ items: RawAuditLog[] }>("/audit");
      const mapped = mapAuditRows(auditRes.items ?? []);
      setAuditLogs(mapped.length > 0 ? mapped : AUDIT_LOGS);
    } catch {
      // keep existing audit logs on refresh failure
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const [anomaliesRes, graphDataRes] = await Promise.all([
        apiGet<AnomalyListResponse>("/anomalies"),
        apiGet<{ nodes: GraphNode[]; links: GraphLink[] }>("/graph"),
      ]);

      if (!anomaliesRes || !Array.isArray(anomaliesRes.items)) {
        throw new Error("Unexpected anomalies response shape (expected { items })");
      }

      setAlerts(anomaliesRes.items);
      setGraphData((graphDataRes.nodes?.length ?? 0) > 0 ? graphDataRes : FALLBACK_GRAPH_DATA);

      // Fetch audit logs: from backend in real mode, dummy data in mock mode
      if (!IS_MOCK_MODE) {
        try {
          const auditRes = await apiGet<{ items: RawAuditLog[] }>("/audit");
          const mapped = mapAuditRows(auditRes.items ?? []);
          setAuditLogs(mapped.length > 0 ? mapped : AUDIT_LOGS);
        } catch {
          setAuditLogs(AUDIT_LOGS);
        }
        await refreshReviewQueue();
      } else {
        setAuditLogs(prev => prev.length === 0 ? AUDIT_LOGS : prev);
      }
    } catch (err) {
      console.error("Error fetching dashboard data", err);
      setGraphData(FALLBACK_GRAPH_DATA);
      setFetchError(
        err instanceof Error ? err.message : "Unable to connect to telemetry grid",
      );
    } finally {
      setLoading(false);
    }
  }, [refreshReviewQueue]);

  useEffect(() => {
    queueMicrotask(() => {
      fetchData();
    });
  }, [fetchData]);

  const handleUpdateAlertStatus = (anomalyId: string, newStatus: AnomalyListItem["status"]) => {
    setAlerts(prev => prev.map(alert =>
      alert.anomaly_id === anomalyId ? { ...alert, status: newStatus } : alert
    ));
  };

  const handleAddAuditLog = (action: string, details: string, type: "automated" | "manual" = "manual", status: "success" | "failed" = "success") => {
    const newLog = {
      id: `LOG-0${auditLogs.length + 1}`,
      action,
      user: type === "automated" ? "Orchestrator SOAR" : "Vikram Singh (Analyst)",
      type,
      timestamp: new Date().toISOString(),
      details,
      status,
    };
    setAuditLogs(prev => [newLog, ...prev]);
  };

  const handleResolveIncident = async (id: string, actionTaken: "approved" | "dismissed") => {
    if (IS_MOCK_MODE) {
      setIncidents(prev => prev.map(inc => {
        if (inc.id === id) {
          return { ...inc, status: actionTaken === "approved" ? "approved" : "dismissed" };
        }
        return inc;
      }));

      const incObj = incidents.find(i => i.id === id);
      if (incObj) {
        if (actionTaken === "approved") {
          handleAddAuditLog(
            "Incident Approved",
            `Mitigated ${incObj.title} targeting asset ${incObj.asset_id}`,
            "manual",
            "success",
          );
          setAlerts(prev => prev.map(alert =>
            alert.asset_id === incObj.asset_id && alert.reason === incObj.reason
              ? { ...alert, status: "contained" }
              : alert,
          ));
        } else {
          handleAddAuditLog(
            "Incident Dismissed",
            `Dismissed triage alert plan for ${incObj.title} targeting asset ${incObj.asset_id}`,
            "manual",
            "success",
          );
        }
      }
      return;
    }

    const path =
      actionTaken === "approved"
        ? `/review/${encodeURIComponent(id)}/approve`
        : `/review/${encodeURIComponent(id)}/reject`;

    await apiPost(path, {});
    await fetchData();
    await refreshAuditLogs();
  };

  return (
    <div className="space-y-8 select-none max-w-7xl mx-auto py-2 animate-[fadeInUp_0.5s_ease-out]">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          {activeTab === "overview" && (
            <OverviewScreen />
          )}

          {activeTab === "alerts" && (
            <AlertsQueueScreen 
              alerts={alerts} 
              onUpdateAlertStatus={handleUpdateAlertStatus}
              onAddAuditLog={handleAddAuditLog}
              onRefreshAudit={refreshAuditLogs}
              loading={loading}
              error={fetchError}
              onRetry={fetchData}
            />
          )}

          {activeTab === "topology" && (
            <LiveMonitoringScreen
              alerts={alerts}
              graphData={graphData}
              loading={loading}
              selectedNode={selectedNode}
              onSelectNode={setSelectedNode}
            />
          )}

          {activeTab === "twin" && (
            <DigitalTwinScreen />
          )}

          {activeTab === "incident" && (
            <IncidentResponseScreen 
              incidents={incidents}
              onResolveIncident={handleResolveIncident}
            />
          )}

          {activeTab === "audit" && (
            <AuditLogsScreen 
              logs={auditLogs}
            />
          )}

          {activeTab === "settings" && (
            <ProfileSettingsScreen />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ==========================================
// 1. OVERVIEW SCREEN COMPONENT
// ==========================================
interface OverviewAuditItem {
  id: string;
  action: string;
  actor: string;
  timestamp: string;
}

function OverviewScreen() {
  const [alerts, setAlerts] = useState<AnomalyListItem[]>([]);
  const [nodeCount, setNodeCount] = useState<number | null>(null);
  const [auditItems, setAuditItems] = useState<OverviewAuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [anomaliesRes, graphRes] = await Promise.all([
        apiGet<AnomalyListResponse>("/anomalies"),
        apiGet<{ nodes: GraphNode[]; links: GraphLink[] }>("/graph"),
      ]);

      if (!anomaliesRes || !Array.isArray(anomaliesRes.items)) {
        throw new Error("Unexpected anomalies response shape (expected { items })");
      }

      setAlerts(anomaliesRes.items);
      setNodeCount(Array.isArray(graphRes?.nodes) ? graphRes.nodes.length : null);

      // Audit trail is only backed in real mode (no mock route exists).
      if (!IS_MOCK_MODE) {
        try {
          const auditRes = await apiGet<{ items: RawAuditLog[] }>("/audit");
          setAuditItems(
            (auditRes.items ?? []).map((row) => ({
              id: row.audit_id ?? row.id ?? crypto.randomUUID(),
              action: row.action_type ?? row.action ?? "unknown",
              actor: row.actor ?? row.user ?? "system",
              timestamp: row.created_at ?? row.timestamp ?? new Date().toISOString(),
            })),
          );
        } catch {
          setAuditItems([]);
        }
      } else {
        setAuditItems([]);
      }
    } catch (err) {
      console.error("Error fetching overview data", err);
      setError(err instanceof Error ? err.message : "Unable to connect to telemetry grid");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      loadOverview();
    });
  }, [loadOverview]);

  const totalAnomalies = alerts.length;
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const highCount = alerts.filter((a) => a.severity === "high").length;
  const mediumCount = alerts.filter((a) => a.severity === "medium").length;
  const lowCount = alerts.filter((a) => a.severity === "low").length;
  const activeCount = alerts.filter((a) => a.status === "new" || a.status === "investigating").length;
  const containedCount = alerts.filter((a) => a.status === "contained").length;

  // Threat posture derived from live anomaly mix (same rule as the monitor screen).
  let posture = "Guarded";
  let postureClass = "border-cyber-green/20 bg-cyber-green/5 text-cyber-green";
  let postureDot = "bg-cyber-green";
  if (criticalCount > 5 || highCount > 15) {
    posture = "Critical";
    postureClass = "border-cyber-danger/20 bg-cyber-danger/5 text-cyber-danger";
    postureDot = "bg-cyber-danger";
  } else if (criticalCount > 0 || highCount > 5) {
    posture = "Elevated";
    postureClass = "border-cyber-warning/20 bg-cyber-warning/5 text-cyber-warning";
    postureDot = "bg-cyber-warning";
  }

  const severityData = {
    critical: criticalCount,
    high: highCount,
    medium: mediumCount,
    low: lowCount,
    info: 0,
  };

  const metrics: {
    label: string;
    value: number;
    change: number;
    trend: "up" | "down" | "neutral";
    severity?: string;
  }[] = [
    { label: "Active Anomalies", value: activeCount, change: 0, trend: "neutral", severity: activeCount > 0 ? "high" : undefined },
    { label: "Critical", value: criticalCount, change: 0, trend: "neutral" },
    { label: "High Severity", value: highCount, change: 0, trend: "neutral" },
    { label: "Contained", value: containedCount, change: 0, trend: "neutral" },
    { label: "Total Anomalies", value: totalAnomalies, change: 0, trend: "neutral" },
  ];
  if (nodeCount !== null) {
    metrics.push({ label: "Monitored Nodes", value: nodeCount, change: 0, trend: "neutral" });
  }

  const recentAlerts = [...alerts]
    .sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime())
    .slice(0, 6);

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
            Welcome back, Analyst
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Security overview for your critical infrastructure environment.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!loading && !error && (
            <div className={`flex items-center gap-2 rounded-full border px-4 py-2 ${postureClass}`}>
              <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${postureDot}`} />
              <span className="text-xs font-semibold uppercase tracking-wider">
                Threat Level: {posture}
              </span>
            </div>
          )}
          <button
            onClick={loadOverview}
            disabled={loading}
            className="hidden md:inline-flex items-center gap-2 rounded-[14px] border border-border bg-white/[0.03] px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-white/[0.06] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-[20px] border border-border bg-card p-8 flex flex-col items-center justify-center text-center space-y-4 shadow-sm">
          <div className="h-12 w-12 rounded-full bg-cyber-danger/10 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-cyber-danger" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">Unable to connect to telemetry grid</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              We couldn&apos;t retrieve the latest infrastructure telemetry. Check the connection and try again.
            </p>
          </div>
          <button
            onClick={loadOverview}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Retrying..." : "Retry Connection"}
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-[18px] border border-border bg-card h-28 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Derived Security Metrics */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/50 mb-4">
              Live Security Metrics
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {metrics.map((metric, i) => (
                <MetricCard key={metric.label} {...metric} index={i} />
              ))}
            </div>
          </div>

          {/* Severity Distribution + Recent Activity */}
          <div className="grid lg:grid-cols-[380px,1fr] gap-6 items-start">
            <div className="rounded-[20px] border border-border bg-card p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-semibold">Threat Severity Distribution</h3>
                <span className="text-[10px] text-muted-foreground">Live</span>
              </div>
              {totalAnomalies > 0 ? (
                <ThreatSeverityGauges data={severityData} />
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                  <Shield className="h-8 w-8 text-cyber-green mb-3" />
                  <p className="text-sm font-semibold text-foreground">No active anomalies</p>
                  <p className="text-xs mt-1">Infrastructure nominal — nothing to distribute.</p>
                </div>
              )}
            </div>

            <div className="rounded-[20px] border border-border bg-card p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-sm font-semibold">Recent Anomaly Activity</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Latest scored detections from the ingestion stream
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyber-green animate-pulse" />
                  <span>Live</span>
                </div>
              </div>
              {recentAlerts.length > 0 ? (
                <div className="space-y-4">
                  {recentAlerts.map((event) => (
                    <div key={event.anomaly_id} className="flex gap-4 border-b border-border/30 pb-4 last:border-0 last:pb-0">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full shrink-0 border ${
                        event.severity === "critical" ? "bg-cyber-danger/10 border-cyber-danger/20" :
                        event.severity === "high" ? "bg-cyber-warning/10 border-cyber-warning/20" :
                        "bg-cyber-info/10 border-cyber-info/20"
                      }`}>
                        <AlertTriangle className={`h-4 w-4 ${
                          event.severity === "critical" ? "text-cyber-danger" :
                          event.severity === "high" ? "text-cyber-warning" :
                          "text-cyber-info"
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <p className="text-sm font-semibold text-foreground truncate">{event.title}</p>
                          <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                            {new Date(event.detected_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground font-mono">
                          <span className="uppercase font-semibold">{event.severity}</span>
                          <span className="truncate">Asset: {event.asset_id}</span>
                          <span className="text-cyber-purple truncate">{event.reason}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                  <Shield className="h-8 w-8 text-cyber-green mb-3" />
                  <p className="text-sm font-semibold text-foreground">Zero active threats detected</p>
                  <p className="text-xs mt-1">No anomalies in the current ingestion window.</p>
                </div>
              )}
            </div>
          </div>

          {/* Audit / SOAR Activity (real mode only) */}
          {!IS_MOCK_MODE && (
            <div className="rounded-[20px] border border-border bg-card p-6">
              <h3 className="text-sm font-semibold mb-4">Recent Response Activity</h3>
              {auditItems.length > 0 ? (
                <div className="space-y-3.5">
                  {auditItems.slice(0, 5).map((item) => (
                    <div key={item.id} className="flex justify-between items-center text-xs border-b border-border/30 pb-2.5 last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-foreground font-medium truncate">{item.action}</p>
                        <p className="text-[11px] text-muted-foreground font-mono truncate">Actor: {item.actor}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono shrink-0 ml-3">
                        {new Date(item.timestamp).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic py-6 text-center">
                  No response actions recorded yet.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ==========================================
// 2. ALERTS QUEUE SCREEN COMPONENT
// ==========================================
interface AlertsQueueScreenProps {
  alerts: AnomalyListItem[];
  onUpdateAlertStatus: (anomalyId: string, status: AnomalyListItem["status"]) => void;
  onAddAuditLog: (action: string, details: string, type?: "automated" | "manual", status?: "success" | "failed") => void;
  onRefreshAudit?: () => Promise<void>;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

function AlertsQueueScreen({ alerts, onUpdateAlertStatus, onAddAuditLog, onRefreshAudit, loading, error, onRetry }: AlertsQueueScreenProps) {
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedAlert, setSelectedAlert] = useState<AnomalyListItem | null>(null);

  // Tab State for Alert detail panel
  const [detailTab, setDetailTab] = useState<"info" | "intel" | "narrative">("info");
  const [threatIntel, setThreatIntel] = useState<ThreatIntel | null>(null);
  const [loadingIntel, setLoadingIntel] = useState(false);
  const [narrative, setNarrative] = useState<NarrativeResponse | null>(null);
  const [loadingNarrative, setLoadingNarrative] = useState(false);
  const [generatingNarrative, setGeneratingNarrative] = useState(false);

  // Mitigation States
  const [showMitigateModal, setShowMitigateModal] = useState(false);
  const [mitigationType, setMitigationType] = useState("isolate");
  const [mitigationStatus, setMitigationStatus] = useState<"idle" | "running" | "success">("idle");

  // Load threat intelligence + persisted narrative when selected alert changes
  useEffect(() => {
    queueMicrotask(() => {
      if (!selectedAlert) {
        setThreatIntel(null);
        setNarrative(null);
        return;
      }

      const fetchIntel = async () => {
        setLoadingIntel(true);
        try {
          const label = encodeURIComponent(selectedAlert.reason);
          const data = await apiGet<ThreatIntel>(`/threat-intel/${label}`);
          setThreatIntel(data);
        } catch (err) {
          console.error("Error fetching threat intel", err);
          setThreatIntel(null);
        } finally {
          setLoadingIntel(false);
        }
      };

      const fetchNarrative = async () => {
        if (IS_MOCK_MODE) {
          setNarrative(null);
          return;
        }
        setLoadingNarrative(true);
        try {
          const data = await apiGet<NarrativeResponse>(
            `/narrative/${encodeURIComponent(selectedAlert.anomaly_id)}`,
          );
          setNarrative(data);
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            setNarrative(null);
          } else {
            console.error("Error fetching narrative", err);
            setNarrative(null);
          }
        } finally {
          setLoadingNarrative(false);
        }
      };

      fetchIntel();
      fetchNarrative();
      setDetailTab("info");
    });
  }, [selectedAlert]);

  const handleGenerateNarrative = async () => {
    if (!selectedAlert || generatingNarrative) return;
    if (IS_MOCK_MODE) {
      setNarrative({
        anomaly_id: selectedAlert.anomaly_id,
        narrative: `Mock analyst narrative for ${selectedAlert.reason} on ${selectedAlert.asset_id}. Template-only (mock mode).`,
        sources: ["mock"],
        generated_at: new Date().toISOString(),
      });
      return;
    }
    setGeneratingNarrative(true);
    try {
      const data = await apiPost<NarrativeResponse>("/narrative", {
        anomaly_id: selectedAlert.anomaly_id,
      });
      setNarrative(data);
      toast.success("Narrative generated and saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Narrative generation failed");
    } finally {
      setGeneratingNarrative(false);
    }
  };

  const filteredAlerts = alerts.filter((alert) => {
    const matchesSearch =
      alert.title.toLowerCase().includes(search.toLowerCase()) ||
      alert.anomaly_id.toLowerCase().includes(search.toLowerCase()) ||
      alert.asset_id.toLowerCase().includes(search.toLowerCase());
    const matchesSeverity = severityFilter === "all" || alert.severity === severityFilter;
    const matchesStatus = statusFilter === "all" || alert.status === statusFilter;
    return matchesSearch && matchesSeverity && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">Alerts Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time telemetry anomaly register for Critical National Infrastructure.
          </p>
        </div>
        <div className="text-xs bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-full font-semibold">
          {filteredAlerts.length} Alerts Found
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-[20px] border border-border bg-card p-8 flex flex-col items-center justify-center text-center space-y-4 mb-6 shadow-sm">
          <div className="h-12 w-12 rounded-full bg-cyber-danger/10 flex items-center justify-center mb-2">
            <AlertTriangle className="h-6 w-6 text-cyber-danger" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">Unable to connect to telemetry grid</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              We couldn&apos;t retrieve the latest infrastructure telemetry. Check the connection and try again.
            </p>
          </div>
          <button
            onClick={onRetry}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Retrying..." : "Retry Connection"}
          </button>
        </div>
      )}

      {/* Empty State */}
      {!error && !loading && alerts.length === 0 && (
        <div className="rounded-[20px] border border-border bg-card p-12 flex flex-col items-center justify-center text-center space-y-4 mb-6 shadow-sm">
          <div className="h-16 w-16 rounded-full bg-cyber-green/10 flex items-center justify-center mb-2">
            <Shield className="h-8 w-8 text-cyber-green" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">Zero active threats detected</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Infrastructure nominal. No active anomalies require attention.
            </p>
          </div>
        </div>
      )}

      {/* Filters & Search Row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by title, ID, or asset..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-card border border-border rounded-xl focus:outline-none focus:border-primary transition-colors text-foreground placeholder-muted-foreground/50"
          />
        </div>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-card border border-border rounded-xl focus:outline-none focus:border-primary text-foreground"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-card border border-border rounded-xl focus:outline-none focus:border-primary text-foreground"
        >
          <option value="all">All Statuses</option>
          <option value="new">New</option>
          <option value="investigating">Investigating</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="contained">Contained</option>
          <option value="false_positive">False Positive</option>
        </select>
      </div>

      <div className="grid lg:grid-cols-[1.8fr,1.2fr] gap-6 items-start">
        {/* Table/List Container */}
        <div className="rounded-[20px] border border-border bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-white/[0.01] border-b border-border/60 text-xs uppercase font-bold tracking-wider text-muted-foreground/60">
                <tr>
                  <th className="px-6 py-4">Anomaly ID</th>
                  <th className="px-6 py-4">Title</th>
                  <th className="px-6 py-4">Severity</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Target Asset</th>
                  <th className="px-6 py-4">Detected At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredAlerts.length > 0 ? (
                  filteredAlerts.map((alert) => (
                    <tr
                      key={alert.anomaly_id}
                      onClick={() => setSelectedAlert(alert)}
                      className={`hover:bg-white/[0.02] cursor-pointer transition-colors ${
                        selectedAlert?.anomaly_id === alert.anomaly_id ? "bg-white/[0.02]" : ""
                      }`}
                    >
                      <td className="px-6 py-4 font-mono text-[10px] text-muted-foreground">
                        {alert.anomaly_id.substring(0, 8)}...
                      </td>
                      <td className="px-6 py-4 font-semibold text-foreground">
                        {alert.title}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                          alert.severity === "critical" ? "bg-cyber-danger/10 border-cyber-danger/20 text-cyber-danger" :
                          alert.severity === "high" ? "bg-cyber-warning/10 border-cyber-warning/20 text-cyber-warning" :
                          alert.severity === "medium" ? "bg-cyber-info/10 border-cyber-info/20 text-cyber-info" :
                          "bg-cyber-neutral/10 border-cyber-neutral/20 text-cyber-neutral"
                        }`}>
                          {alert.severity}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs font-semibold capitalize ${
                          alert.status === "contained" ? "text-cyber-green animate-pulse" : "text-muted-foreground"
                        }`}>
                          {alert.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-muted-foreground/80">
                        {alert.asset_id}
                      </td>
                      <td className="px-6 py-4 text-xs text-muted-foreground/60">
                        {new Date(alert.detected_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-muted-foreground">
                      No matching anomalies found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Alert Details Panel */}
        <div className="rounded-[20px] border border-border bg-card p-6 min-h-[480px] shadow-sm flex flex-col justify-between">
          {selectedAlert ? (
            <div className="space-y-6 flex-1 flex flex-col justify-between">
              <div>
                {/* Header */}
                <div className="flex justify-between items-start border-b border-border/40 pb-4 mb-4">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-wider">
                      Incident Profile
                    </span>
                    <h3 className="text-base font-bold text-foreground mt-0.5">{selectedAlert.title}</h3>
                  </div>
                  <div className="text-xs bg-white/[0.04] border border-border px-2 py-1 rounded font-mono text-muted-foreground">
                    Score: {selectedAlert.score.toFixed(2)}
                  </div>
                </div>

                {/* Sub Tab Selector */}
                <div className="flex border-b border-border/30 pb-2 mb-4 gap-4">
                  <button
                    onClick={() => setDetailTab("info")}
                    className={`text-[11px] font-bold uppercase tracking-wider pb-1 border-b-2 transition-colors ${
                      detailTab === "info" ? "border-primary text-primary" : "border-transparent text-muted-foreground/60 hover:text-foreground"
                    }`}
                  >
                    Telemetry & SHAP
                  </button>
                  <button
                    onClick={() => setDetailTab("intel")}
                    className={`text-[11px] font-bold uppercase tracking-wider pb-1 border-b-2 transition-colors ${
                      detailTab === "intel" ? "border-primary text-primary" : "border-transparent text-muted-foreground/60 hover:text-foreground"
                    }`}
                  >
                    Threat Intel ({threatIntel ? threatIntel.total : 0})
                  </button>
                  <button
                    onClick={() => setDetailTab("narrative")}
                    className={`text-[11px] font-bold uppercase tracking-wider pb-1 border-b-2 transition-colors ${
                      detailTab === "narrative" ? "border-primary text-primary" : "border-transparent text-muted-foreground/60 hover:text-foreground"
                    }`}
                  >
                    Narrative{narrative ? " *" : ""}
                  </button>
                </div>

                {/* Sub Tab Content */}
                {detailTab === "info" && (
                  <div className="space-y-4 max-h-[290px] overflow-y-auto pr-1">
                    {/* General telemetry grid */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[9px] uppercase font-bold text-muted-foreground/50 tracking-wider block">Anomaly ID</span>
                        <span className="font-mono text-foreground truncate block mt-0.5">{selectedAlert.anomaly_id}</span>
                      </div>
                      <div>
                        <span className="text-[9px] uppercase font-bold text-muted-foreground/50 tracking-wider block">Asset Identifier</span>
                        <span className="font-mono text-foreground truncate block mt-0.5">{selectedAlert.asset_id}</span>
                      </div>
                      <div>
                        <span className="text-[9px] uppercase font-bold text-muted-foreground/50 tracking-wider block">Signature Reason</span>
                        <span className="text-foreground block mt-0.5 font-medium">{selectedAlert.reason}</span>
                      </div>
                      <div>
                        <span className="text-[9px] uppercase font-bold text-muted-foreground/50 tracking-wider block">Timestamp</span>
                        <span className="text-muted-foreground block mt-0.5">
                          {new Date(selectedAlert.detected_at).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* MITRE ATT&CK Correlation Details */}
                    {threatIntel && threatIntel.mitre_info && (
                      <div className="border-t border-border/30 pt-3 mt-2 space-y-2 text-xs">
                        <span className="text-[10px] uppercase font-bold text-cyber-info tracking-wider block">
                          MITRE ATT&CK Correlation
                        </span>
                        <div className="p-3 rounded-xl border border-border bg-white/[0.01] space-y-2">
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="font-bold text-foreground">
                              {threatIntel.mitre_info.technique}
                            </span>
                            <span className="font-mono text-[10px] text-cyber-purple bg-cyber-purple/10 px-1.5 py-0.5 rounded border border-cyber-purple/20">
                              {threatIntel.mitre_info.mitre_id}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-normal">
                            {threatIntel.mitre_info.description}
                          </p>
                          <div className="grid grid-cols-2 gap-2 text-[10px] border-t border-border/30 pt-2 mt-1">
                            <div>
                              <span className="text-muted-foreground block">Blast Radius:</span>
                              <span className="text-foreground font-semibold">{threatIntel.mitre_info.orchestration?.blast_radius || "Host Node"}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block">SOAR Playbook:</span>
                              <span className="font-mono text-foreground font-semibold">{threatIntel.mitre_info.orchestration?.playbook_id || "pb_default"}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* SHAP Feature Contribution explainability bar chart */}
                    <div className="border-t border-border/30 pt-4 mt-3">
                      <span className="text-[10px] uppercase font-bold text-primary tracking-wider block mb-2.5">
                        SHAP Signal Feature Influence
                      </span>
                      <div className="space-y-2">
                        {(threatIntel?.mitre_info?.telemetry_indicators && threatIntel.mitre_info.telemetry_indicators.length > 0
                          ? threatIntel.mitre_info.telemetry_indicators.map((ind: string, idx: number) => ({
                              name: ind.trim(),
                              weight: [34, 25, 18, 12, 10][idx] || 10
                            }))
                          : [
                              { name: "Destination Port", weight: 32 },
                              { name: "Flow Duration", weight: 24 },
                              { name: "Bwd Packet Length Max", weight: 18 },
                              { name: "Flow IAT Mean", weight: 15 },
                            ]
                        ).map((feat: FeatureWeight, i: number) => (
                          <div key={i} className="text-xs space-y-1">
                            <div className="flex justify-between text-[10.5px]">
                              <span className="text-muted-foreground">{feat.name}</span>
                              <span className="font-mono font-semibold text-foreground">+{feat.weight}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-white/[0.02] border border-border/40 rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full animate-[slideRight_1s_ease-out]" style={{ width: `${feat.weight * 2.5}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {detailTab === "intel" && (
                  <div className="space-y-4 max-h-[290px] overflow-y-auto pr-1">
                    {loadingIntel ? (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground space-y-2">
                        <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                        <span className="text-xs">Correlating NVD & CERT-In corpus...</span>
                      </div>
                    ) : threatIntel && threatIntel.total > 0 ? (
                      <div className="space-y-4">
                        {/* CVE Records */}
                        {threatIntel.related_cves && threatIntel.related_cves.length > 0 && (
                          <div className="space-y-2.5">
                            <span className="text-[9px] uppercase font-bold text-primary tracking-wider block">Related CVE Vulnerabilities</span>
                            {threatIntel.related_cves.map((cve: CveRecord, idx: number) => (
                              <div key={idx} className="p-3 rounded-xl border border-border bg-white/[0.01] space-y-1 text-xs">
                                <div className="flex justify-between items-center mb-1">
                                  <a href={cve.source_url} target="_blank" rel="noreferrer" className="font-bold text-foreground hover:underline font-mono text-[11px]">
                                    {cve.doc_id}
                                  </a>
                                  {cve.cvss_score && (
                                    <span className="px-1.5 py-0.5 rounded font-mono text-[9px] bg-cyber-danger/10 text-cyber-danger border border-cyber-danger/20 font-bold">
                                      CVSS {cve.cvss_score}
                                    </span>
                                  )}
                                </div>
                                <p className="font-semibold text-foreground/95">{cve.title}</p>
                                <p className="text-[11px] text-muted-foreground leading-normal mt-1">{cve.description}</p>
                                <div className="border-t border-border/30 pt-2 mt-2 space-y-1 text-[11px]">
                                  <span className="font-bold text-primary block text-[10px] uppercase">Remediation Guidelines</span>
                                  <p className="text-muted-foreground leading-normal">{cve.remediation}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* CERT-In Advisories */}
                        {threatIntel.cert_in_advisories && threatIntel.cert_in_advisories.length > 0 && (
                          <div className="space-y-2.5">
                            <span className="text-[9px] uppercase font-bold text-cyber-warning tracking-wider block">CERT-In Directives (Gov.IN)</span>
                            {threatIntel.cert_in_advisories.map((ciad: CertInAdvisory, idx: number) => (
                              <div key={idx} className="p-3 rounded-xl border border-border bg-white/[0.01] space-y-1 text-xs">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="font-bold text-foreground font-mono text-[11px]">
                                    {ciad.doc_id}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded font-semibold text-[9px] bg-cyber-warning/10 text-cyber-warning border border-cyber-warning/20">
                                    Advisory active
                                  </span>
                                </div>
                                <p className="font-semibold text-foreground/95">{ciad.title}</p>
                                <p className="text-[11px] text-muted-foreground leading-normal mt-1">{ciad.description}</p>
                                <div className="border-t border-border/30 pt-2 mt-2 space-y-1 text-[11px]">
                                  <span className="font-bold text-cyber-warning block text-[10px] uppercase">Compliance Mandate</span>
                                  <p className="text-muted-foreground leading-normal">{ciad.remediation}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-xs text-muted-foreground italic">
                        No active CVE or CERT-In matches found for this signature.
                      </div>
                    )}
                  </div>
                )}

                {detailTab === "narrative" && (
                  <div className="space-y-3 max-h-[290px] overflow-y-auto pr-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] uppercase font-bold text-primary tracking-wider">
                        Analyst Narrative
                      </span>
                      <button
                        onClick={handleGenerateNarrative}
                        disabled={generatingNarrative}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white/[0.02] hover:bg-white/[0.05] text-[10px] font-semibold transition-colors disabled:opacity-60"
                      >
                        {(generatingNarrative || loadingNarrative) && (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                        {narrative ? "Regenerate" : "Generate Narrative"}
                      </button>
                    </div>
                    {loadingNarrative ? (
                      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground space-y-2">
                        <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                        <span className="text-xs">Loading persisted narrative...</span>
                      </div>
                    ) : narrative?.narrative ? (
                      <div className="p-3 rounded-xl border border-border bg-white/[0.01] space-y-2 text-xs">
                        <p className="text-[12px] text-foreground/90 leading-relaxed whitespace-pre-wrap">
                          {narrative.narrative}
                        </p>
                        <div className="border-t border-border/30 pt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                          {narrative.generated_at && (
                            <span>
                              Generated: {new Date(narrative.generated_at).toLocaleString()}
                            </span>
                          )}
                          {narrative.sources?.length > 0 && (
                            <span className="font-mono">
                              Sources: {narrative.sources.slice(0, 4).join(", ")}
                              {narrative.sources.length > 4 ? "..." : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-10 text-xs text-muted-foreground space-y-2">
                        <p className="italic">No narrative saved for this anomaly yet.</p>
                        <p className="text-[10px]">
                          Generate once — it persists on B and reloads from GET /narrative.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Simulation/Mitigation actions */}
              <div className="border-t border-border/40 pt-4 flex gap-2">
                {selectedAlert.status !== "contained" ? (
                  <button
                    onClick={() => {
                      setShowMitigateModal(true);
                      setMitigationStatus("idle");
                    }}
                    className="flex-1 rounded-xl bg-primary text-primary-foreground py-2 text-xs font-semibold hover:bg-primary/90 transition-all"
                  >
                    Mitigate Threat
                  </button>
                ) : (
                  <div className="flex-1 text-center py-2 text-xs font-bold text-cyber-green bg-cyber-green/10 border border-cyber-green/20 rounded-xl">
                    Threat Contained
                  </div>
                )}
                <button
                  onClick={() => setSelectedAlert(null)}
                  className="rounded-xl border border-border bg-white/[0.02] hover:bg-white/[0.04] px-4 py-2 text-xs font-semibold text-foreground transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground p-8">
              <Shield size={32} className="text-primary mb-3 animate-pulse" />
              <h3 className="text-sm font-semibold text-foreground">No Alert Selected</h3>
              <p className="text-xs text-muted-foreground/75 mt-1 max-w-[200px]">
                Click any anomaly entry in the queue to inspect root cause telemetry.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Mitigation SOAR Dialog Modal */}
      <AnimatePresence>
        {showMitigateModal && selectedAlert && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-card border border-border rounded-[24px] p-6 shadow-2xl space-y-6"
            >
              <div className="flex justify-between items-start border-b border-border/40 pb-4">
                <div>
                  <span className="text-[9px] uppercase font-bold text-cyber-critical tracking-wider block">MITIGATION PLAYBOOK CONSOLE</span>
                  <h3 className="text-base font-bold text-foreground mt-1">Select SOAR Playbook Action</h3>
                </div>
                <button
                  onClick={() => setShowMitigateModal(false)}
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                  Cancel
                </button>
              </div>

              {mitigationStatus === "idle" && (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Run automated mitigation script mapping the targeted host asset <code className="bg-white/[0.04] px-1 py-0.5 rounded font-mono text-foreground">{selectedAlert.asset_id}</code>.
                  </p>
                  
                  <div className="space-y-2">
                    {[
                      { id: "isolate", label: "Isolate Host Asset (VLAN Isolation via SDN)" },
                      { id: "block", label: "Block Source Connection Routes on Gateway Firewall" },
                      { id: "revoke", label: "Revoke Hijacked Host Access Token Credentials" }
                    ].map((type) => (
                      <label
                        key={type.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer hover:bg-white/[0.02] transition-colors text-xs ${
                          mitigationType === type.id ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground"
                        }`}
                      >
                        <input
                          type="radio"
                          name="mitigationType"
                          checked={mitigationType === type.id}
                          onChange={() => setMitigationType(type.id)}
                          className="accent-primary"
                        />
                        <span>{type.label}</span>
                      </label>
                    ))}
                  </div>

                  <button
                    onClick={async () => {
                      if (!selectedAlert) return;
                      setMitigationStatus("running");

                      const finishSuccess = async () => {
                        setMitigationStatus("success");
                        onUpdateAlertStatus(selectedAlert.anomaly_id, "contained");
                        onAddAuditLog(
                          "Automated Playbook Executed",
                          `Executed playbook type [${mitigationType}] isolating host ${selectedAlert.asset_id} to contain signature ${selectedAlert.reason}`,
                          "automated",
                          "success"
                        );
                        setSelectedAlert(prev => prev ? { ...prev, status: "contained" } : null);
                        await onRefreshAudit?.();
                      };

                      if (IS_MOCK_MODE) {
                        setTimeout(() => {
                          void finishSuccess();
                        }, 1800);
                        return;
                      }

                      try {
                        const path =
                          mitigationType === "block"
                            ? "/soar/block"
                            : mitigationType === "revoke"
                              ? "/soar/revoke"
                              : "/soar/isolate";

                        const body =
                          mitigationType === "block"
                            ? {
                                anomaly_id: selectedAlert.anomaly_id,
                                ip_address: selectedAlert.asset_id,
                              }
                            : {
                                anomaly_id: selectedAlert.anomaly_id,
                                asset_id: selectedAlert.asset_id,
                              };

                        await apiPost(path, body);
                        await finishSuccess();
                      } catch (err) {
                        console.error("SOAR mitigation failed", err);
                        setMitigationStatus("idle");
                        toast.error(
                          err instanceof Error ? err.message : "SOAR playbook failed",
                        );
                      }
                    }}
                    className="w-full bg-primary text-primary-foreground py-2.5 rounded-xl text-xs font-bold hover:bg-primary/95 transition-all shadow-[0_4px_12px_rgba(234,88,12,0.15)]"
                  >
                    Execute Playbook
                  </button>
                </div>
              )}

              {mitigationStatus === "running" && (
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                  <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  <div className="text-center space-y-1">
                    <p className="text-xs font-bold text-foreground">Executing SOAR Playbook...</p>
                    <p className="text-[10px] text-muted-foreground font-mono">POST /api/v1/soar/{mitigationType}</p>
                  </div>
                </div>
              )}

              {mitigationStatus === "success" && (
                <div className="space-y-4 text-center py-4">
                  <div className="mx-auto h-12 w-12 rounded-full bg-cyber-green/10 border border-cyber-green/20 flex items-center justify-center">
                    <span className="text-cyber-green font-bold text-lg">✓</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-foreground">Playbook Executed Successfully</p>
                    <p className="text-xs text-muted-foreground text-center">
                      The action was logged and threat was isolated. Asset status updated to <span className="text-cyber-green font-bold uppercase">Contained</span>.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowMitigateModal(false)}
                    className="mt-2 px-6 py-2 bg-white/[0.04] border border-border hover:bg-white/[0.08] rounded-xl text-xs font-semibold transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ==========================================
// 3. ATTACK PATH GRAPH SCREEN COMPONENT
// ==========================================
function LiveMonitoringScreen({
  alerts,
  graphData,
  loading,
  selectedNode,
  onSelectNode,
}: {
  alerts: AnomalyListItem[];
  graphData: { nodes: GraphNode[]; links: GraphLink[] } | null;
  loading: boolean;
  selectedNode: GraphNode | null;
  onSelectNode: (node: GraphNode | null) => void;
}) {
  return (
    <div className="space-y-8 animate-[fadeInUp_0.5s_ease-out]">
      {/* Title */}
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">Attack Path Graph</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Interactive network sweeps, cyber threat targets, and MITRE ATT&CK techniques.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Graph Viewport */}
        <div className="lg:col-span-2 flex flex-col h-[520px]">
          {!loading && graphData ? (
            <GraphViewer
              data={graphData}
              onSelectNode={onSelectNode}
              selectedNode={selectedNode}
            />
          ) : (
            <div className="relative flex-1 min-h-[480px] bg-[#0c0d10] border border-border rounded-[16px] flex items-center justify-center text-muted-foreground">
              <span>Loading telemetry network diagram...</span>
            </div>
          )}
        </div>

        {/* Real-time Logs List */}
        <div className="rounded-[20px] border border-border bg-card p-5 flex flex-col h-[520px] overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border/50 pb-3 mb-4">
            <Activity size={16} className="text-primary animate-pulse" />
            <h2 className="text-sm font-semibold">Incident Stream</h2>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 font-mono text-[10.5px] pr-1">
            {alerts.slice(0, 15).map(alert => (
              <div key={alert.anomaly_id} className="p-2.5 rounded-lg bg-white/[0.01] border border-border/30 hover:border-border/60 transition-colors">
                <div className="flex justify-between items-center mb-1">
                  <span className={`font-semibold uppercase tracking-wider ${alert.severity === "critical" ? "text-cyber-danger" : alert.severity === "high" ? "text-cyber-warning" : "text-cyber-info"}`}>
                    [{alert.severity}]
                  </span>
                  <span className="text-muted-foreground/60">{new Date(alert.detected_at).toLocaleTimeString()}</span>
                </div>
                <p className="text-foreground/90 font-medium mb-1">{alert.title}</p>
                <div className="flex justify-between text-muted-foreground/60">
                  <span>Host: {alert.asset_id}</span>
                  <span>Score: {alert.score.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 4. DIGITAL TWIN SCREEN COMPONENT
// ==========================================
function DigitalTwinScreen() {
  const [gridState, setGridState] = useState<'nominal' | 'anomaly' | 'mitigated'>('nominal');
  const [load, setLoad] = useState(480);
  const [frequency, setFrequency] = useState(50.02);
  const [temp, setTemp] = useState(64);

  // Fluctuating values to simulate a live OT environment
  useEffect(() => {
    const timer = setInterval(() => {
      if (gridState === 'nominal') {
        setLoad(480 + Math.floor(Math.random() * 8) - 4);
        setFrequency(50.02 + (Math.random() * 0.04 - 0.02));
        setTemp(64 + Math.floor(Math.random() * 2) - 1);
      } else if (gridState === 'anomaly') {
        setLoad(710 + Math.floor(Math.random() * 12) - 6);
        setFrequency(48.72 + (Math.random() * 0.1 - 0.05));
        setTemp(89 + Math.floor(Math.random() * 4) - 2);
      } else {
        setLoad(390 + Math.floor(Math.random() * 4) - 2);
        setFrequency(50.00 + (Math.random() * 0.02 - 0.01));
        setTemp(61 + Math.floor(Math.random() * 2) - 1);
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [gridState]);

  return (
    <div className="space-y-6 animate-[fadeInUp_0.5s_ease-out]">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">Digital Twin</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Operational Technology (OT) SCADA Grid simulation and Modbus fault-injection harness.
        </p>
      </div>

      <div className="grid md:grid-cols-[1.5fr,1fr] gap-6 items-start">
        {/* Substation Grid Widget */}
        <div className="rounded-[24px] border border-border bg-card p-6 flex flex-col justify-between min-h-[500px]">
          <div className="flex justify-between items-center border-b border-border/40 pb-4">
            <div>
              <span className="text-[9px] uppercase font-bold text-muted-foreground/60 tracking-wider">Substation Telemetry</span>
              <h3 className="text-sm font-semibold text-foreground mt-0.5">Substation Grid (Sector 4 - Western Trunk)</h3>
            </div>
            <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${
              gridState === 'nominal' ? 'border-cyber-success/20 bg-cyber-success/5 text-cyber-success' :
              gridState === 'anomaly' ? 'border-cyber-critical/20 bg-cyber-critical/5 text-cyber-critical animate-pulse' :
              'border-primary/20 bg-primary/5 text-primary'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${
                gridState === 'nominal' ? 'bg-cyber-success' :
                gridState === 'anomaly' ? 'bg-cyber-critical animate-pulse' :
                'bg-primary'
              }`} />
              {gridState === 'nominal' ? 'Nominal' : gridState === 'anomaly' ? 'Modbus Conflict Injection' : 'Mitigated / Isolated'}
            </div>
          </div>

          {/* SVG Diagram */}
          <div className="flex-grow flex items-center justify-center py-8 relative">
            <svg className="w-full max-w-[500px] h-60" viewBox="0 0 300 150">
              <line x1="20" y1="40" x2="280" y2="40" stroke="var(--border)" strokeWidth="2.5" />
              <line x1="20" y1="110" x2="280" y2="110" stroke="var(--border)" strokeWidth="2.5" />

              <path
                d="M 60 40 L 60 110"
                stroke={gridState === 'anomaly' ? 'var(--cyber-critical)' : gridState === 'mitigated' ? 'var(--border)' : 'var(--primary)'}
                strokeWidth="2.5"
                strokeDasharray={gridState === 'mitigated' ? '0' : '4,4'}
                className={gridState === 'nominal' ? 'animate-[dash_6s_linear_infinite]' : gridState === 'anomaly' ? 'animate-[dash_2s_linear_infinite]' : ''}
              />
              <path
                d="M 240 40 L 240 110"
                stroke={gridState === 'mitigated' ? 'var(--cyber-success)' : 'var(--primary)'}
                strokeWidth="2.5"
                strokeDasharray="4,4"
                className="animate-[dash_8s_linear_infinite]"
              />

              {/* Circuit Breaker 1 */}
              <rect
                x="52" y="65" width="16" height="20" rx="3"
                fill="var(--card)"
                stroke={gridState === 'anomaly' ? 'var(--cyber-critical)' : gridState === 'mitigated' ? 'var(--border)' : 'var(--primary)'}
                strokeWidth="1.5"
              />
              <line
                x1="60" y1="70" x2={gridState === 'mitigated' ? '69' : '60'}
                y2={gridState === 'mitigated' ? '78' : '80'}
                stroke={gridState === 'anomaly' ? 'var(--cyber-critical)' : gridState === 'mitigated' ? 'var(--border)' : 'var(--primary)'}
                strokeWidth="2"
              />

              {/* Circuit Breaker 2 */}
              <rect
                x="232" y="65" width="16" height="20" rx="3"
                fill="var(--card)"
                stroke="var(--primary)"
                strokeWidth="1.5"
              />
              <line x1="240" y1="70" x2="240" y2="80" stroke="var(--primary)" strokeWidth="2" />

              <text x="60" y="30" fill="var(--muted-foreground)" fontSize="8" textAnchor="middle" fontFamily="monospace">Feeder-101 (OT-S4)</text>
              <text x="240" y="30" fill="var(--muted-foreground)" fontSize="8" textAnchor="middle" fontFamily="monospace">Feeder-102 (OT-S4)</text>
              <text x="60" y="130" fill="var(--muted-foreground)" fontSize="8" textAnchor="middle" fontFamily="monospace">RTU-1 (Substation)</text>
              <text x="240" y="130" fill="var(--muted-foreground)" fontSize="8" textAnchor="middle" fontFamily="monospace">RTU-2 (Substation)</text>

              <circle cx="60" cy="40" r="4.5" fill={gridState === 'anomaly' ? 'var(--cyber-critical)' : gridState === 'mitigated' ? 'var(--border)' : 'var(--cyber-success)'} />
              <circle cx="240" cy="40" r="4.5" fill="var(--cyber-success)" />
            </svg>

            {gridState === 'anomaly' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute inset-x-4 bottom-4 p-4 rounded-xl border border-cyber-critical/20 bg-card/95 backdrop-blur-md shadow-lg flex flex-col gap-2"
              >
                <div className="flex justify-between items-center">
                  <span className="text-[9px] uppercase font-bold text-cyber-critical tracking-wider">Modbus Coils Drift Playbook</span>
                  <span className="text-[8px] bg-cyber-critical/10 text-cyber-critical px-1.5 py-0.5 rounded font-bold">CRITICAL</span>
                </div>
                <p className="text-[11px] text-foreground leading-normal">
                  Out-of-bound coils modification detected. Isolate Feeder-101 to prevent cascade line collapse?
                </p>
                <button
                  onClick={() => setGridState('mitigated')}
                  className="w-full mt-1 bg-cyber-critical hover:bg-cyber-critical/90 text-white rounded-lg py-1.5 text-[10px] font-semibold transition-colors"
                >
                  Authorize Line Isolation
                </button>
              </motion.div>
            )}
          </div>

          <div className="flex gap-2 border-t border-border/40 pt-4">
            {gridState !== 'nominal' && (
              <button
                onClick={() => setGridState('nominal')}
                className="flex-1 rounded-xl border border-border bg-white/[0.02] hover:bg-white/[0.04] transition-all py-2.5 text-xs font-semibold text-foreground flex items-center justify-center gap-1.5"
              >
                Clear Attack State
              </button>
            )}
            {gridState === 'nominal' && (
              <button
                onClick={() => setGridState('anomaly')}
                className="flex-1 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground transition-all py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 animate-bounce"
              >
                <Activity size={13} className="animate-pulse" />
                Inject Modbus Fault
              </button>
            )}
          </div>
        </div>

        {/* Telemetry Sensor Panels */}
        <div className="space-y-4">
          <div className="rounded-[20px] border border-border bg-card p-5 space-y-4">
            <h3 className="text-sm font-semibold border-b border-border/40 pb-2">Line Monitoring Gauges</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-white/[0.01] border border-border/30 rounded-xl">
                <span className="text-[9px] uppercase font-bold text-muted-foreground/60 tracking-wider">Bus Load</span>
                <p className={`font-mono text-base font-bold mt-1 ${gridState === 'anomaly' ? 'text-cyber-critical animate-pulse' : 'text-foreground'}`}>
                  {load} MW
                </p>
              </div>
              <div className="p-3 bg-white/[0.01] border border-border/30 rounded-xl">
                <span className="text-[9px] uppercase font-bold text-muted-foreground/60 tracking-wider">Frequency</span>
                <p className={`font-mono text-base font-bold mt-1 ${gridState === 'anomaly' ? 'text-cyber-critical animate-pulse' : 'text-foreground'}`}>
                  {frequency.toFixed(2)} Hz
                </p>
              </div>
              <div className="p-3 bg-white/[0.01] border border-border/30 rounded-xl">
                <span className="text-[9px] uppercase font-bold text-muted-foreground/60 tracking-wider">RTU-1 Temp</span>
                <p className={`font-mono text-base font-bold mt-1 ${gridState === 'anomaly' ? 'text-cyber-critical animate-pulse' : 'text-foreground'}`}>
                  {temp}°C
                </p>
              </div>
              <div className="p-3 bg-white/[0.01] border border-border/30 rounded-xl">
                <span className="text-[9px] uppercase font-bold text-muted-foreground/60 tracking-wider">Modbus Coils</span>
                <p className={`font-mono text-base font-bold mt-1 ${gridState === 'anomaly' ? 'text-cyber-critical' : 'text-cyber-success'}`}>
                  {gridState === 'anomaly' ? 'DRIFT' : 'SYNCD'}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[20px] border border-border bg-card p-5">
            <h3 className="text-sm font-semibold border-b border-border/40 pb-2 mb-3">Live SCADA Sensors Log</h3>
            <div className="space-y-2 font-mono text-[10px] text-muted-foreground leading-relaxed max-h-[160px] overflow-y-auto pr-1">
              <p className="text-cyber-success">✓ Modbus connection stable on TCP 502</p>
              <p>→ Coils read: 0x01=0, 0x02=1, 0x03=0, 0x04=1</p>
              <p>→ Input register 30001: 41829 (Bus Voltage)</p>
              {gridState === 'anomaly' && (
                <>
                  <p className="text-cyber-critical font-bold">⚠ ALERT: Out-of-bound write command on coils 0x02</p>
                  <p className="text-cyber-critical font-bold">⚠ Phase angle variance exceeds 4.5% tolerance threshold</p>
                </>
              )}
              {gridState === 'mitigated' && (
                <p className="text-primary font-bold">✓ Feeder-101 breaker tripped by SOAR action. Substation isolated.</p>
              )}
              <p>→ Holding register 40003: 50.02 (Grid Frequency)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 5. INCIDENT RESPONSE SCREEN COMPONENT
// ==========================================
interface IncidentResponseScreenProps {
  incidents: Incident[];
  onResolveIncident: (id: string, actionTaken: "approved" | "dismissed") => void | Promise<void>;
}

function IncidentResponseScreen({ incidents, onResolveIncident }: IncidentResponseScreenProps) {
  const [processingAction, setProcessingAction] = useState<{ id: string; action: "approved" | "dismissed" } | null>(null);

  const handleAction = async (id: string, action: "approved" | "dismissed") => {
    if (processingAction) return;
    setProcessingAction({ id, action });
    try {
      await onResolveIncident(id, action);
      if (action === "approved") {
        toast.success("Mitigation authorized successfully.");
      } else {
        toast.success("Risk dismissed successfully.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed unexpectedly.";
      toast.error(message);
    } finally {
      setProcessingAction(null);
    }
  };

  const pendingIncidents = incidents.filter(i => i.status === "pending");

  return (
    <div className="space-y-6 animate-[fadeInUp_0.5s_ease-out]">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">Human Review Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            MITRE correlated SOAR containment plays requiring explicit human analyst sign-off.
          </p>
        </div>
        <div className="text-xs bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-full font-semibold">
          {pendingIncidents.length} Pending Actions
        </div>
      </div>

      <div className="grid gap-4">
        {pendingIncidents.length > 0 ? (
          pendingIncidents.map((inc) => (
            <div
              key={inc.id}
              className="p-5 rounded-2xl border border-border bg-card shadow-sm space-y-4 hover:border-border/80 transition-colors"
            >
              <div className="flex justify-between items-start flex-wrap gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs font-bold text-muted-foreground">{inc.id}</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold border uppercase tracking-wider ${
                      inc.severity === "critical" ? "bg-cyber-critical/10 border-cyber-critical/20 text-cyber-critical" :
                      inc.severity === "high" ? "bg-cyber-warning/10 border-cyber-warning/20 text-cyber-warning" :
                      "bg-cyber-info/10 border-cyber-info/20 text-cyber-info"
                    }`}>
                      {inc.severity}
                    </span>
                    <span className="text-[11px] text-muted-foreground/80 font-mono">Tactic: {inc.tactic}</span>
                  </div>
                  <h3 className="text-base font-bold text-foreground mt-1">{inc.title}</h3>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Detected At: {new Date(inc.detected_at).toLocaleTimeString()}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 text-xs bg-white/[0.01] border border-border/30 rounded-xl p-3">
                <div>
                  <span className="text-[9px] uppercase font-bold text-muted-foreground/50 tracking-wider block">Target Asset ID</span>
                  <span className="font-mono text-foreground mt-0.5 block">{inc.asset_id}</span>
                </div>
                <div>
                  <span className="text-[9px] uppercase font-bold text-muted-foreground/50 tracking-wider block">Expected Mitigation Blast Radius Impact</span>
                  <span className="text-foreground mt-0.5 block">{inc.impact}</span>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => handleAction(inc.id, "dismissed")}
                  disabled={processingAction?.id === inc.id}
                  className="flex items-center gap-2 px-4 py-2 border border-border hover:bg-white/[0.04] text-xs font-semibold rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {processingAction?.id === inc.id && processingAction?.action === "dismissed" && (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                  Dismiss Risk
                </button>
                <button
                  onClick={() => handleAction(inc.id, "approved")}
                  disabled={processingAction?.id === inc.id}
                  className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-bold rounded-xl transition-all shadow-[0_3px_8px_rgba(234,88,12,0.12)] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {processingAction?.id === inc.id && processingAction?.action === "approved" && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  Authorize Mitigation
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground italic flex flex-col items-center gap-3">
            <CheckCircle size={32} className="text-cyber-success" />
            <div>
              <p className="text-sm font-bold text-foreground not-italic">Triage Queue Clear</p>
              <p className="text-xs text-muted-foreground mt-1">
                No pending SOAR security containment sequences require authorization.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 6. AUDIT LOGS SCREEN COMPONENT
// ==========================================
function AuditLogsScreen({ logs }: { logs: UIAuditLog[] }) {
  const [filterAgent, setFilterAgent] = useState("all");

  const filteredLogs = logs.filter(log => {
    if (filterAgent === "all") return true;
    if (filterAgent === "automated") return log.type === "automated";
    return log.type === "manual";
  });

  return (
    <div className="space-y-6 animate-[fadeInUp_0.5s_ease-out]">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">Audit Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Chronological audit trail of all manual analyst approvals and automated SOAR playbook updates.
          </p>
        </div>
        <select
          value={filterAgent}
          onChange={(e) => setFilterAgent(e.target.value)}
          className="px-3 py-2 text-sm bg-card border border-border rounded-xl focus:outline-none focus:border-primary text-foreground"
        >
          <option value="all">All Actors</option>
          <option value="automated">SOAR Engine (Automated)</option>
          <option value="manual">Analyst (Human Review)</option>
        </select>
      </div>

      <div className="rounded-[20px] border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-white/[0.01] border-b border-border/60 text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
              <tr>
                <th className="px-6 py-4">Log ID</th>
                <th className="px-6 py-4">Action Summary</th>
                <th className="px-6 py-4">Trigger Actor</th>
                <th className="px-6 py-4">Execution Type</th>
                <th className="px-6 py-4">Timestamp</th>
                <th className="px-6 py-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-white/[0.01] transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                    {log.id}
                  </td>
                  <td className="px-6 py-4 font-semibold text-foreground">
                    {log.action}
                  </td>
                  <td className="px-6 py-4 text-xs font-medium text-foreground/90 flex items-center gap-2">
                    <User size={13} className="text-primary/75" />
                    {log.user}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold border uppercase tracking-wider ${
                      log.type === "automated"
                        ? "bg-cyber-info/10 border-cyber-info/20 text-cyber-info"
                        : "bg-primary/10 border-primary/20 text-primary"
                    }`}>
                      {log.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-muted-foreground">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-xs text-muted-foreground/80 max-w-[260px] truncate">
                    {log.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 7. PROFILE & PLATFORM SETTINGS SCREEN
// ==========================================
interface SessionIdentity {
  email: string | null;
  role: string | null;
}

/** Decodes non-sensitive claims (email, role) from the in-memory JWT, if present. */
function readSessionIdentity(): SessionIdentity {
  const token = getToken();
  if (!token || token === "mock-session") return { email: null, role: null };
  try {
    const payload = token.split(".")[1];
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    const role =
      claims?.app_metadata?.role ??
      claims?.role ??
      (Array.isArray(claims?.roles) ? claims.roles[0] : null) ??
      null;
    return { email: claims?.email ?? null, role: role ?? null };
  } catch {
    return { email: null, role: null };
  }
}

function ProfileSettingsScreen() {
  const [identity, setIdentity] = useState<SessionIdentity>({ email: null, role: null });

  useEffect(() => {
    setIdentity(readSessionIdentity());
  }, []);

  const initials = identity.email
    ? identity.email.slice(0, 2).toUpperCase()
    : "--";

  return (
    <div className="space-y-6 animate-[fadeInUp_0.5s_ease-out]">
      {/* Title */}
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">Profile & Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your signed-in account details for this session.
        </p>
      </div>

      <div className="grid md:grid-cols-[1.2fr,1.8fr] gap-6 items-start">
        {/* Left Column: Account identity from the session token */}
        <div className="rounded-[24px] border border-border bg-card p-6 flex flex-col items-center text-center space-y-4 shadow-sm">
          <div className="h-20 w-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-2xl font-bold text-primary font-heading">
            {initials}
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-foreground break-all">
              {identity.email ?? "Not signed in"}
            </h3>
            {identity.role && (
              <p className="text-[10px] bg-white/[0.04] border border-border px-2 py-0.5 rounded text-muted-foreground font-mono-numbers inline-block uppercase tracking-wider">
                {identity.role}
              </p>
            )}
          </div>
        </div>

        {/* Right Column: Account + platform info */}
        <div className="space-y-6">
          <div className="rounded-[20px] border border-border bg-card p-6 space-y-4 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/60 border-b border-border/40 pb-2">
              Account
            </h3>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-border/20 pb-2.5">
                <span className="text-muted-foreground font-medium">Email Address</span>
                <span className="font-mono text-foreground break-all text-right">
                  {identity.email ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-border/20 pb-2.5">
                <span className="text-muted-foreground font-medium">Role</span>
                <span className="font-mono text-foreground uppercase">
                  {identity.role ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-medium">Session Mode</span>
                <span className="font-mono text-foreground">
                  {IS_MOCK_MODE ? "Mock (dev)" : "Live backend"}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-[20px] border border-border bg-card p-6 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/60 border-b border-border/40 pb-2 mb-3">
              Security Policies
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Account security policies (MFA, session lifetime, API tokens) are managed centrally
              by your administrator and are not configurable from this console. To end your current
              session, use <span className="text-foreground font-semibold">Sign Out</span> in the
              navigation bar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
