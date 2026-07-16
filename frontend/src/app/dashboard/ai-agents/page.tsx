"use client";

import { motion } from "framer-motion";
import { Brain, Target, Zap, Bug, Cpu, Activity, ChevronRight, Play, Pause } from "lucide-react";
import { AI_AGENTS } from "@/lib/dummy-data";
import { cn } from "@/lib/utils";

const iconMap: Record<string, React.ElementType> = {
  Brain, Target, Zap, Bug, Cpu,
};

export default function AIAgentsPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="font-heading text-2xl font-bold tracking-tight">AI Intelligence Agents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Five specialized AI agents providing autonomous cyber defence
        </p>
      </motion.div>

      {/* Agent Cards */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
        {AI_AGENTS.map((agent, index) => {
          const Icon = iconMap[agent.icon];
          return (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="group rounded-[18px] border border-border bg-card p-6 card-hover"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyber-green/10 border border-cyber-green/20">
                    {Icon && <Icon className="h-5 w-5 text-cyber-green" />}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{agent.name}</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        agent.status === "running" ? "bg-cyber-green animate-pulse" : "bg-muted-foreground"
                      )} />
                      <span className={cn(
                        "text-[10px] font-medium uppercase",
                        agent.status === "running" ? "text-cyber-green" : "text-muted-foreground"
                      )}>
                        {agent.status}
                      </span>
                    </div>
                  </div>
                </div>
                <button className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  agent.status === "running"
                    ? "text-cyber-green hover:bg-cyber-green/10"
                    : "text-muted-foreground hover:bg-white/[0.04]"
                )}>
                  {agent.status === "running" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
              </div>

              {/* Description */}
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                {agent.description}
              </p>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-xl bg-white/[0.02] border border-border p-3 text-center">
                  <p className="font-mono-numbers text-lg font-bold text-cyber-green">
                    {agent.confidence}%
                  </p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">Confidence</p>
                </div>
                <div className="rounded-xl bg-white/[0.02] border border-border p-3 text-center">
                  <p className="font-mono-numbers text-lg font-bold">
                    {agent.modelsActive}
                  </p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">Models</p>
                </div>
                <div className="rounded-xl bg-white/[0.02] border border-border p-3 text-center">
                  <p className="font-mono-numbers text-sm font-bold">
                    {(agent.eventsProcessed / 1000).toFixed(0)}K
                  </p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">Events</p>
                </div>
              </div>

              {/* Recent Decision */}
              <div className="rounded-xl bg-cyber-green/[0.03] border border-cyber-green/10 p-3">
                <p className="text-[10px] text-muted-foreground mb-1">Latest Decision</p>
                <p className="text-xs text-foreground leading-relaxed">{agent.recentDecision}</p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                <span className="text-[10px] text-muted-foreground">
                  Last analysis: {agent.lastAnalysis}
                </span>
                <button className="text-xs text-cyber-green hover:text-cyber-green/80 flex items-center gap-1 transition-colors">
                  Details <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Agent Orchestration Info */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="rounded-[20px] border border-border bg-card p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <Activity className="h-5 w-5 text-cyber-purple" />
          <div>
            <h3 className="text-sm font-semibold">Agent Orchestration Pipeline</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Powered by LangGraph — agents collaborate autonomously via shared knowledge graph
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {/* TODO: Connect to backend agent orchestration status */}
          <span className="rounded-full border border-border bg-white/[0.02] px-3 py-1">
            LangGraph Engine: <span className="text-cyber-green font-medium">Active</span>
          </span>
          <span className="rounded-full border border-border bg-white/[0.02] px-3 py-1">
            Neo4j Knowledge Graph: <span className="text-cyber-green font-medium">Connected</span>
          </span>
          <span className="rounded-full border border-border bg-white/[0.02] px-3 py-1">
            Qdrant Vector DB: <span className="text-cyber-green font-medium">Connected</span>
          </span>
          <span className="rounded-full border border-border bg-white/[0.02] px-3 py-1">
            MITRE ATT&CK: <span className="text-cyber-green font-medium">v15.1</span>
          </span>
        </div>
      </motion.div>
    </div>
  );
}
