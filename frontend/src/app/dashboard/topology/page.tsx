"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Network, FileText, Search, Activity, HelpCircle } from "lucide-react";
import { GraphNode, GraphLink } from "@/app/api/graph/route";
import { FALLBACK_GRAPH_DATA } from "@/lib/graph-data";
import { apiGet } from "@/lib/api-client";
import { motion } from "framer-motion";

// Lazy load graph renderer
const GraphViewer = dynamic(() => import("@/components/dashboard/GraphViewer"), {
  ssr: false,
  loading: () => (
    <div className="relative flex-1 min-h-[480px] bg-[#0c0d10] border border-border rounded-[16px] flex items-center justify-center text-muted-foreground">
      <div className="flex flex-col items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-cyber-green animate-pulse" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Initializing Topology Graph Engine...
        </span>
      </div>
    </div>
  ),
});

export default function TopologyPage() {
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchGraphData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ nodes: GraphNode[]; links: GraphLink[] }>("/graph");
      setGraphData((data.nodes?.length ?? 0) > 0 ? data : FALLBACK_GRAPH_DATA);
    } catch (err) {
      setGraphData(FALLBACK_GRAPH_DATA);
      setError(err instanceof Error ? err.message : "Network error while loading graph data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      fetchGraphData();
    });
  }, []);

  const filteredNodes = graphData?.nodes.filter((node) =>
    node.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getSeverityBadgeClass = (severity?: string) => {
    if (!severity) return "bg-white/[0.05] text-muted-foreground border border-white/[0.1]";
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

  return (
    <div className="space-y-8">
      {/* Title Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="font-heading text-2xl font-bold tracking-tight">Attack Path Topology</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Interactive network path analysis mapping MITRE ATT&CK correlation, active threat indicators, and compromised assets
        </p>
      </motion.div>

      {/* Grid Layout */}
      <div className="grid lg:grid-cols-[1fr,360px] gap-6 items-start">
        {/* Left Side: Graph viewer */}
        <div className="flex flex-col h-[500px]">
          {error && (
            <div className="rounded-xl border border-cyber-danger/20 bg-cyber-danger/5 p-4 text-xs text-cyber-danger mb-4">
              <span>{error}</span>
            </div>
          )}

          {!loading && graphData ? (
            <GraphViewer
              data={graphData}
              onSelectNode={setSelectedNode}
              selectedNode={selectedNode}
            />
          ) : (
            <div className="relative flex-1 min-h-[480px] bg-[#0c0d10] border border-border rounded-[16px] flex items-center justify-center text-muted-foreground">
              <span>Loading topology data...</span>
            </div>
          )}
        </div>

        {/* Right Side: Sidebar panels */}
        <div className="space-y-6">
          {/* Node Inspector */}
          <div className="rounded-[20px] border border-border bg-card p-5">
            <div className="flex items-center gap-2 border-b border-border/50 pb-3 mb-4">
              <Network size={16} className="text-cyber-green" />
              <h2 className="text-sm font-semibold">Node Inspector</h2>
            </div>

            {selectedNode ? (
              <div className="space-y-4">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60">
                    Node Type: {selectedNode.type}
                  </span>
                  <h3 className="text-base font-bold text-foreground mt-0.5">
                    {selectedNode.label}
                  </h3>
                </div>

                {selectedNode.severity && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Severity:</span>
                    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${getSeverityBadgeClass(selectedNode.severity)}`}>
                      {selectedNode.severity}
                    </span>
                  </div>
                )}

                <div className="border-t border-border/50 pt-3">
                  <div className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground/60 mb-2">Properties</div>
                  <div className="space-y-2">
                    {selectedNode.details ? (
                      Object.entries(selectedNode.details).map(([key, val]) => (
                        <div key={key} className="flex justify-between items-center text-xs border-b border-white/[0.02] pb-1.5 last:border-0 last:pb-0">
                          <span className="text-muted-foreground">{key}</span>
                          <span className="font-mono text-foreground font-medium">{val}</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground italic">No detailed properties available</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-muted-foreground">
                <HelpCircle size={24} className="mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-xs">Click any node in the interactive topology layout to inspect details.</p>
              </div>
            )}
          </div>

          {/* Search/Highlight Panel */}
          <div className="rounded-[20px] border border-border bg-card p-5">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
              <input
                type="text"
                placeholder="Highlight node..."
                className="w-full rounded-xl border border-border bg-background/50 pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {searchQuery && filteredNodes && (
              <div className="mt-2 max-h-[140px] overflow-y-auto border border-border rounded-xl bg-background/30 divide-y divide-border">
                {filteredNodes.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground italic text-center">No matching nodes</div>
                ) : (
                  filteredNodes.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => {
                        setSelectedNode(n);
                        setSearchQuery("");
                      }}
                      className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.03] cursor-pointer transition-colors"
                    >
                      {n.label} <span className="text-[10px] text-muted-foreground/60 font-semibold uppercase ml-1">({n.type})</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Attribution Narrative */}
          <div className="rounded-[20px] border border-border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-border/50 pb-3">
              <FileText size={16} className="text-cyber-danger" />
              <h2 className="text-sm font-semibold">Attribution Narrative</h2>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong>Incident Timeline:</strong> Attacker initiated remote recon sweeps (MITRE T1046) hitting the firewall.
              They pivoted via public SQLi exploits (T1190) on the DMZ web server, brute-forced internal MySQL database credentials (T1110) to seize developer SSH keys, and escalated host privileges (T1068).
              Using forged golden Kerberos tickets (T1558), they compromised the AD Domain Controller and exfiltrated databases to the cloud backup bucket.
            </p>
            <div className="flex items-center gap-1.5 pt-1.5 border-t border-border/50 text-[10px] text-muted-foreground font-mono-numbers">
              <Activity size={12} className="text-cyber-danger animate-pulse" />
              <span>Attribution ID: att-8a9d-ff01</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
