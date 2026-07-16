"use client";

import { motion } from "framer-motion";
import { Search, Filter, Download, Server, Shield } from "lucide-react";
import { ASSET_INVENTORY } from "@/lib/dummy-data";
import { cn } from "@/lib/utils";

export default function AssetsPage() {
  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-heading text-2xl font-bold tracking-tight">Asset Inventory</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Complete inventory of monitored infrastructure assets
        </p>
      </motion.div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-[14px] border border-border bg-card px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search assets..."
              className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none w-48"
            />
          </div>
          <button className="flex items-center gap-1.5 rounded-[14px] border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-white/[0.04] transition-colors">
            <Filter className="h-3.5 w-3.5" />
            Filters
          </button>
        </div>
        <button className="flex items-center gap-1.5 rounded-[14px] border border-border bg-card px-4 py-2 text-sm text-muted-foreground hover:bg-white/[0.04] transition-colors">
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-[20px] border border-border bg-card overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-white/[0.01]">
                {["Hostname", "IP Address", "Department", "Risk Level", "Operating System", "Owner", "Last Seen", "Status"].map((header) => (
                  <th key={header} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ASSET_INVENTORY.map((asset, i) => (
                <motion.tr
                  key={asset.hostname}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="border-b border-border last:border-0 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Server className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium font-mono-numbers">{asset.hostname}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono-numbers text-muted-foreground">{asset.ip}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{asset.department}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                      asset.risk === "critical" && "bg-cyber-danger/10 text-cyber-danger",
                      asset.risk === "high" && "bg-cyber-warning/10 text-cyber-warning",
                      asset.risk === "medium" && "bg-cyber-info/10 text-cyber-info",
                      asset.risk === "low" && "bg-cyber-green/10 text-cyber-green"
                    )}>
                      {asset.risk}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{asset.os}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{asset.owner}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{asset.lastSeen}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        asset.status === "online" && "bg-cyber-green",
                        asset.status === "isolated" && "bg-cyber-danger animate-pulse",
                        asset.status === "offline" && "bg-muted-foreground"
                      )} />
                      <span className={cn(
                        "text-xs",
                        asset.status === "online" && "text-cyber-green",
                        asset.status === "isolated" && "text-cyber-danger",
                        asset.status === "offline" && "text-muted-foreground"
                      )}>
                        {asset.status}
                      </span>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <span className="text-xs text-muted-foreground">Showing 1–10 of 12,847 assets</span>
          <div className="flex items-center gap-1">
            {[1, 2, 3, "...", 1285].map((page, i) => (
              <button
                key={i}
                className={cn(
                  "h-7 min-w-7 rounded-lg px-2 text-xs transition-colors",
                  page === 1 ? "bg-cyber-green/10 text-cyber-green" : "text-muted-foreground hover:bg-white/[0.04]"
                )}
              >
                {page}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
