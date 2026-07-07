"use client";

import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import {
  Shield,
  AlertTriangle,
  Activity,
  Zap,
  ChevronRight,
  ExternalLink,
  Clock,
  MapPin,
  Search,
  Filter,
} from "lucide-react";
import { MetricCard } from "@/components/shared/MetricCard";
import {
  DASHBOARD_METRICS,
  SPARKLINE_DATA,
  THREAT_SEVERITY,
  BEHAVIOR_TIMELINE,
  NETWORK_ACTIVITY,
  ATTACK_TIMELINE,
  THREAT_FEED,
  THREAT_ORIGINS,
} from "@/lib/dummy-data";
import { SEVERITY_LEVELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

// Lazy load heavy chart components
const BehaviorChart = dynamic(() => import("@/components/dashboard/charts/BehaviorChart"), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
const NetworkChart = dynamic(() => import("@/components/dashboard/charts/NetworkChart"), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
const ThreatSeverityGauges = dynamic(
  () => import("@/components/dashboard/charts/ThreatSeverityGauges"),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const WorldThreatMap = dynamic(() => import("@/components/dashboard/charts/WorldThreatMap"), {
  ssr: false,
  loading: () => <ChartSkeleton height={400} />,
});

function ChartSkeleton({ height = 300 }: { height?: number }) {
  return (
    <div
      className="rounded-[20px] border border-border bg-card animate-pulse"
      style={{ height }}
    />
  );
}

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Welcome back, Analyst
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Security overview for your critical infrastructure environment
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Threat Level Badge */}
          <div className="flex items-center gap-2 rounded-full border border-cyber-warning/20 bg-cyber-warning/5 px-4 py-2">
            <div className="h-2 w-2 rounded-full bg-cyber-warning animate-pulse" />
            <span className="text-xs font-semibold text-cyber-warning uppercase tracking-wider">
              Threat Level: Elevated
            </span>
          </div>
          {/* Quick Actions */}
          <button className="hidden md:inline-flex items-center gap-2 rounded-[14px] bg-cyber-green px-4 py-2 text-xs font-semibold text-black hover:bg-cyber-green/90 transition-colors">
            <Zap className="h-3.5 w-3.5" />
            Quick Scan
          </button>
        </div>
      </motion.div>

      {/* Metric Cards — Row 1: Infrastructure */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/50 mb-4">
          Infrastructure Overview
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {DASHBOARD_METRICS.infrastructure.map((metric, i) => (
            <MetricCard
              key={metric.label}
              {...metric}
              sparklineData={i === 0 ? SPARKLINE_DATA.assets : undefined}
              index={i}
            />
          ))}
        </div>
      </div>

      {/* Metric Cards — Row 2: Security */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/50 mb-4">
          Security Metrics
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          {DASHBOARD_METRICS.security.map((metric, i) => (
            <MetricCard
              key={metric.label}
              {...metric}
              sparklineData={
                metric.label === "Live Threats"
                  ? SPARKLINE_DATA.threats
                  : metric.label === "Blocked Today"
                  ? SPARKLINE_DATA.blocked
                  : metric.label === "AI Confidence"
                  ? SPARKLINE_DATA.confidence
                  : undefined
              }
              index={i + 5}
            />
          ))}
        </div>
      </div>

      {/* Charts Row 1: Severity Gauges + Behavior Detection */}
      <div className="grid lg:grid-cols-[380px,1fr] gap-6">
        {/* Threat Severity Gauges */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-[20px] border border-border bg-card p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-semibold">Threat Severity</h3>
            <span className="text-[10px] text-muted-foreground">Last 24h</span>
          </div>
          <ThreatSeverityGauges data={THREAT_SEVERITY} />
        </motion.div>

        {/* Behavior Detection */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-[20px] border border-border bg-card p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-semibold">Behaviour Detection</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                User & entity behaviour analysis
              </p>
            </div>
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-cyber-green" />
                Normal
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-cyber-danger" />
                Anomaly
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full border border-muted-foreground/30" />
                Baseline
              </span>
            </div>
          </div>
          <BehaviorChart data={BEHAVIOR_TIMELINE} />
        </motion.div>
      </div>

      {/* Charts Row 2: Network Activity + World Map */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Network Activity */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="rounded-[20px] border border-border bg-card p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-semibold">Network Activity</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Real-time bandwidth & connection monitoring
              </p>
            </div>
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-cyber-info" />
                Bandwidth
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-cyber-green" />
                Connections
              </span>
            </div>
          </div>
          <NetworkChart data={NETWORK_ACTIVITY} />
        </motion.div>

        {/* World Threat Map */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="rounded-[20px] border border-border bg-card p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-semibold">Global Threat Map</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Attack origins by geography
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Activity className="h-3 w-3 text-cyber-green animate-pulse" />
              <span>Live</span>
            </div>
          </div>
          <WorldThreatMap origins={THREAT_ORIGINS} />
        </motion.div>
      </div>

      {/* Attack Timeline */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="rounded-[20px] border border-border bg-card p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-sm font-semibold">Attack Timeline</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Recent security events and AI actions
            </p>
          </div>
          <button className="text-xs text-cyber-green hover:text-cyber-green/80 transition-colors flex items-center gap-1">
            View all <ChevronRight className="h-3 w-3" />
          </button>
        </div>
        <div className="space-y-0">
          {ATTACK_TIMELINE.slice(0, 6).map((event, i) => {
            const sevConfig = SEVERITY_LEVELS[event.severity];
            return (
              <div
                key={event.id}
                className="relative flex gap-4 pb-6 last:pb-0"
              >
                {/* Timeline line */}
                {i < 5 && (
                  <div className="absolute left-[15px] top-[28px] bottom-0 w-[1px] bg-border" />
                )}
                {/* Dot */}
                <div
                  className="relative z-10 mt-1 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border"
                  style={{
                    borderColor: `${sevConfig.color}30`,
                    backgroundColor: sevConfig.bg,
                  }}
                >
                  <AlertTriangle className="h-3.5 w-3.5" style={{ color: sevConfig.color }} />
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{event.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {event.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                          event.status === "contained" && "bg-cyber-warning/10 text-cyber-warning",
                          event.status === "resolved" && "bg-cyber-green/10 text-cyber-green",
                          event.status === "investigating" && "bg-cyber-info/10 text-cyber-info",
                          event.status === "monitoring" && "bg-cyber-purple/10 text-cyber-purple"
                        )}
                      >
                        {event.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {event.time}
                    </span>
                    <span className="font-mono-numbers text-cyber-purple">
                      {event.mitre}
                    </span>
                    <span className="text-cyber-green/70 hidden sm:inline">
                      AI: {event.aiAction}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Threat Feed Table */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="rounded-[20px] border border-border bg-card p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-sm font-semibold">Threat Feed</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Active threat intelligence indicators
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2 rounded-xl border border-border bg-background/30 px-3 py-1.5">
              <Search className="h-3 w-3 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search threats..."
                className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none w-32"
              />
            </div>
            <button className="flex items-center gap-1.5 rounded-xl border border-border bg-white/[0.03] px-3 py-1.5 text-xs text-muted-foreground hover:bg-white/[0.06] transition-colors">
              <Filter className="h-3 w-3" />
              Filter
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {["Threat", "Source", "MITRE Technique", "Confidence", "Affected Asset", "Status", ""].map(
                  (header) => (
                    <th
                      key={header}
                      className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60"
                    >
                      {header}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {THREAT_FEED.map((threat) => (
                <tr
                  key={threat.id}
                  className="border-b border-border last:border-0 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-3 py-3">
                    <div>
                      <p className="text-sm font-medium">{threat.threat}</p>
                      <p className="text-[10px] text-muted-foreground font-mono-numbers">
                        {threat.id}
                      </p>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    {threat.source}
                  </td>
                  <td className="px-3 py-3">
                    <div>
                      <span className="font-mono-numbers text-xs text-cyber-purple">
                        {threat.mitreTechnique}
                      </span>
                      <p className="text-[10px] text-muted-foreground">{threat.mitreLabel}</p>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-cyber-green"
                          style={{ width: `${threat.confidence}%` }}
                        />
                      </div>
                      <span className="font-mono-numbers text-xs">{threat.confidence}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs font-mono-numbers text-muted-foreground">
                    {threat.affectedAsset}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                        threat.status === "active" && "bg-cyber-danger/10 text-cyber-danger",
                        threat.status === "contained" && "bg-cyber-warning/10 text-cyber-warning",
                        threat.status === "resolved" && "bg-cyber-green/10 text-cyber-green",
                        threat.status === "investigating" && "bg-cyber-info/10 text-cyber-info",
                        threat.status === "monitoring" && "bg-cyber-purple/10 text-cyber-purple"
                      )}
                    >
                      {threat.status}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <button className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
