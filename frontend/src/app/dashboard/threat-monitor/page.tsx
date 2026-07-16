"use client";

import { useEffect, useState } from "react";
import { Search, Filter, RefreshCw, AlertOctagon, ShieldAlert, ArrowUpDown, ChevronLeft, ChevronRight, Play } from "lucide-react";
import { AnomalyListItem } from "@/app/api/alerts/route";
import { motion } from "framer-motion";

export default function ThreatMonitorPage() {
  const [alerts, setAlerts] = useState<AnomalyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter state
  const [search, setSearch] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  // Sorting state
  const [sortBy, setSortBy] = useState<"detected_at" | "score">("detected_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const fetchAlerts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/alerts");
      const json = await res.json();
      if (json.success) {
        setAlerts(json.data);
      } else {
        setError(json.error?.message || "Failed to load alerts");
      }
    } catch (err) {
      setError("Network error while loading alerts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const handleSort = (field: "detected_at" | "score") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setCurrentPage(1);
  };

  // Filter and search logic
  const filteredAlerts = alerts
    .filter((alert) => {
      const matchesSearch =
        alert.title.toLowerCase().includes(search.toLowerCase()) ||
        alert.asset_id.toLowerCase().includes(search.toLowerCase()) ||
        alert.reason.toLowerCase().includes(search.toLowerCase());

      const matchesSeverity = selectedSeverity === "all" || alert.severity === selectedSeverity;
      const matchesStatus = selectedStatus === "all" || alert.status === selectedStatus;

      return matchesSearch && matchesSeverity && matchesStatus;
    })
    .sort((a, b) => {
      let comparison = 0;
      if (sortBy === "detected_at") {
        comparison = new Date(a.detected_at).getTime() - new Date(b.detected_at).getTime();
      } else if (sortBy === "score") {
        comparison = a.score - b.score;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

  // Pagination
  const totalItems = filteredAlerts.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedAlerts = filteredAlerts.slice(startIndex, startIndex + itemsPerPage);

  const handleFilterChange = (setter: Function, value: string) => {
    setter(value);
    setCurrentPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setCurrentPage(1);
  };

  // Stats
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const highCount = alerts.filter((a) => a.severity === "high").length;
  const activeTriageCount = alerts.filter((a) => a.status === "investigating" || a.status === "new").length;

  let threatPosture = "Guarded";
  let postureColor = "text-cyber-green border-cyber-green/20 bg-cyber-green/5";
  let postureDot = "bg-cyber-green";
  if (criticalCount > 5 || highCount > 15) {
    threatPosture = "CRITICAL";
    postureColor = "text-cyber-danger border-cyber-danger/20 bg-cyber-danger/5";
    postureDot = "bg-cyber-danger";
  } else if (criticalCount > 0 || highCount > 5) {
    threatPosture = "ELEVATED";
    postureColor = "text-cyber-warning border-cyber-warning/20 bg-cyber-warning/5";
    postureDot = "bg-cyber-warning";
  }

  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  const getSeverityBadgeClass = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-cyber-danger/10 text-cyber-danger border border-cyber-danger/20";
      case "high":
        return "bg-cyber-warning/10 text-cyber-warning border border-cyber-warning/20";
      case "medium":
        return "bg-cyber-info/10 text-cyber-info border border-cyber-info/20";
      case "low":
        return "bg-cyber-green/10 text-cyber-green border border-cyber-green/20";
      default:
        return "bg-white/[0.05] text-muted-foreground border border-white/[0.1]";
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "new":
        return "bg-cyber-danger/10 text-cyber-danger border border-cyber-danger/20";
      case "investigating":
        return "bg-cyber-warning/10 text-cyber-warning border border-cyber-warning/20";
      case "acknowledged":
        return "bg-cyber-info/10 text-cyber-info border border-cyber-info/20";
      case "contained":
        return "bg-cyber-green/10 text-cyber-green border border-cyber-green/20";
      default:
        return "bg-white/[0.05] text-muted-foreground border border-white/[0.1]";
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return "text-cyber-danger";
    if (score >= 0.5) return "text-cyber-warning";
    if (score >= 0.3) return "text-cyber-info";
    return "text-cyber-green";
  };

  const getScoreProgressBg = (score: number) => {
    if (score >= 0.8) return "bg-cyber-danger";
    if (score >= 0.5) return "bg-cyber-warning";
    if (score >= 0.3) return "bg-cyber-info";
    return "bg-cyber-green";
  };

  return (
    <div className="space-y-8">
      {/* Title Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Live Threat Monitor</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time anomaly ingestion stream and machine learning scoring feed
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Threat Level Badge */}
          <div className={`flex items-center gap-2 rounded-full border px-4 py-2 ${postureColor}`}>
            <div className={`h-2 w-2 rounded-full animate-pulse ${postureDot}`} />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Posture: {threatPosture}
            </span>
          </div>

          <button
            onClick={fetchAlerts}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-[14px] border border-border bg-white/[0.03] px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-white/[0.06] transition-colors"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </motion.div>

      {/* Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-[18px] border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground mb-2">Total Alerts Ingested</p>
          <span className="font-mono-numbers text-2xl font-bold text-[#F5F5F5]">
            {alerts.length}
          </span>
        </div>
        <div className="rounded-[18px] border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground mb-2">Critical Anomalies</p>
          <span className="font-mono-numbers text-2xl font-bold text-cyber-danger">
            {criticalCount}
          </span>
        </div>
        <div className="rounded-[18px] border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground mb-2">High Severity Alerts</p>
          <span className="font-mono-numbers text-2xl font-bold text-cyber-warning">
            {highCount}
          </span>
        </div>
        <div className="rounded-[18px] border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground mb-2">Active Triage Pool</p>
          <span className="font-mono-numbers text-2xl font-bold text-cyber-info">
            {activeTriageCount}
          </span>
        </div>
      </div>

      {/* Table Container */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-[20px] border border-border bg-card p-6 space-y-6"
      >
        {/* Controls */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-background/30 px-3 py-2 flex-1 max-w-md">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by title, asset, reason..."
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              value={search}
              onChange={handleSearchChange}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Filter size={14} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Filters:</span>
            </div>

            <select
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
              value={selectedSeverity}
              onChange={(e) => handleFilterChange(setSelectedSeverity, e.target.value)}
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <select
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
              value={selectedStatus}
              onChange={(e) => handleFilterChange(setSelectedStatus, e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="new">New</option>
              <option value="investigating">Investigating</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="contained">Contained</option>
              <option value="false_positive">False Positive</option>
            </select>
          </div>
        </div>

        {/* Errors */}
        {error && (
          <div className="rounded-xl border border-cyber-danger/20 bg-cyber-danger/5 p-4 text-xs text-cyber-danger flex items-center gap-2">
            <AlertOctagon size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Table layout */}
        <div className="overflow-x-auto border border-border rounded-xl">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-white/[0.01]">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-[35%]">
                  Anomaly / Title
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-[12%]">
                  Severity
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-[15%]">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-[15%]">
                  Asset ID
                </th>
                <th
                  className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-[12%] cursor-pointer select-none"
                  onClick={() => handleSort("score")}
                >
                  <div className="flex items-center gap-1">
                    Score
                    <ArrowUpDown size={12} className={sortBy === "score" ? "text-cyber-green" : "text-muted-foreground/40"} />
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-[16%] cursor-pointer select-none"
                  onClick={() => handleSort("detected_at")}
                >
                  <div className="flex items-center gap-1">
                    Detected At
                    <ArrowUpDown size={12} className={sortBy === "detected_at" ? "text-cyber-green" : "text-muted-foreground/40"} />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0 animate-pulse">
                    <td className="px-4 py-4"><div className="h-4 bg-white/[0.04] rounded w-48"></div></td>
                    <td className="px-4 py-4"><div className="h-6 bg-white/[0.04] rounded w-16"></div></td>
                    <td className="px-4 py-4"><div className="h-6 bg-white/[0.04] rounded w-20"></div></td>
                    <td className="px-4 py-4"><div className="h-4 bg-white/[0.04] rounded w-24"></div></td>
                    <td className="px-4 py-4"><div className="h-4 bg-white/[0.04] rounded w-12"></div></td>
                    <td className="px-4 py-4"><div className="h-4 bg-white/[0.04] rounded w-32"></div></td>
                  </tr>
                ))
              ) : paginatedAlerts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    <ShieldAlert size={36} className="mx-auto mb-2 text-muted-foreground/30" />
                    No anomalies found matching search criteria.
                  </td>
                </tr>
              ) : (
                paginatedAlerts.map((alert) => (
                  <tr
                    key={alert.anomaly_id}
                    className="border-b border-border last:border-0 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2.5 w-2.5 rounded-full shrink-0`}
                            style={{
                              backgroundColor: alert.severity === "critical" ? "var(--color-cyber-danger)" : alert.severity === "high" ? "var(--color-cyber-warning)" : alert.severity === "medium" ? "var(--color-cyber-info)" : "var(--color-cyber-green)",
                              boxShadow: `0 0 8px ${alert.severity === "critical" ? "var(--color-cyber-danger)" : alert.severity === "high" ? "var(--color-cyber-warning)" : alert.severity === "medium" ? "var(--color-cyber-info)" : "var(--color-cyber-green)"}`
                            }}
                          />
                          <span className="text-sm font-medium text-[#F5F5F5]">{alert.title}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground ml-4.5 font-mono-numbers">
                          ID: {alert.anomaly_id}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${getSeverityBadgeClass(alert.severity)}`}>
                        {alert.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${getStatusBadgeClass(alert.status)}`}>
                        {alert.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono-numbers text-xs text-cyber-green/80">
                        {alert.asset_id}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono-numbers text-xs font-semibold ${getScoreColor(alert.score)}`}>
                          {alert.score.toFixed(2)}
                        </span>
                        <div className="h-1 w-12 rounded-full bg-white/[0.06] overflow-hidden hidden sm:block">
                          <div className={`h-full rounded-full ${getScoreProgressBg(alert.score)}`} style={{ width: `${alert.score * 100}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">{formatTime(alert.detected_at)}</span>
                        <span className="text-[10px] text-muted-foreground/60 italic font-mono-numbers">
                          Sig: {alert.reason}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Row */}
        {!loading && totalItems > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">
              Showing <strong className="text-foreground">{startIndex + 1}</strong> to{" "}
              <strong className="text-foreground">
                {Math.min(startIndex + itemsPerPage, totalItems)}
              </strong>{" "}
              of <strong className="text-foreground">{totalItems}</strong> entries
            </span>

            <div className="flex items-center gap-2">
              <button
                className="inline-flex items-center gap-1 rounded-xl border border-border bg-white/[0.03] px-3 py-1.5 text-xs text-muted-foreground hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft size={14} />
                Previous
              </button>
              <button
                className="inline-flex items-center gap-1 rounded-xl border border-border bg-white/[0.03] px-3 py-1.5 text-xs text-muted-foreground hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
