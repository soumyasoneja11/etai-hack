"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Activity } from "lucide-react";
import { CRITICAL_SECTORS } from "@/lib/constants";

/** Hands-on, humanized multi-state SCADA Grid / Substation Simulation Widget */
function SubstationGridVisual() {
  // States: 'nominal', 'anomaly', 'mitigated'
  const [gridState, setGridState] = useState<'nominal' | 'anomaly' | 'mitigated'>('nominal');

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="landing-glass rounded-[24px] p-6 w-full max-w-[440px] shadow-2xl relative overflow-hidden flex flex-col gap-6"
    >
      {/* Header */}
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
          <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${
            gridState === 'nominal' ? 'bg-cyber-success' :
            gridState === 'anomaly' ? 'bg-cyber-critical' :
            'bg-primary'
          }`} />
          {gridState === 'nominal' ? 'Nominal' : gridState === 'anomaly' ? 'Telemetry Drift' : 'Mitigated'}
        </div>
      </div>

      {/* SVG SCADA Diagram */}
      <div className="flex-1 flex items-center justify-center py-2 relative">
        <svg className="w-full h-44" viewBox="0 0 300 150">
          {/* Main bus lines */}
          <line x1="20" y1="40" x2="280" y2="40" stroke="var(--border)" strokeWidth="2" />
          <line x1="20" y1="110" x2="280" y2="110" stroke="var(--border)" strokeWidth="2" />

          {/* Dotted Telemetry Flows */}
          {/* Feeder 1 */}
          <path
            d="M 50 40 L 50 110"
            stroke={gridState === 'anomaly' ? 'var(--cyber-critical)' : gridState === 'mitigated' ? 'var(--border)' : 'var(--primary)'}
            strokeWidth="2"
            strokeDasharray={gridState === 'mitigated' ? '0' : '4,4'}
            className={gridState === 'nominal' ? 'animate-[dash_6s_linear_infinite]' : gridState === 'anomaly' ? 'animate-[dash_2s_linear_infinite]' : ''}
          />
          {/* Feeder 2 */}
          <path
            d="M 250 40 L 250 110"
            stroke={gridState === 'mitigated' ? 'var(--cyber-success)' : 'var(--primary)'}
            strokeWidth="2"
            strokeDasharray="4,4"
            className="animate-[dash_8s_linear_infinite]"
          />

          {/* Circuit Breaker 1 (Togglable) */}
          <rect
            x="42" y="65" width="16" height="20" rx="3"
            fill="var(--card)"
            stroke={gridState === 'anomaly' ? 'var(--cyber-critical)' : gridState === 'mitigated' ? 'var(--border)' : 'var(--primary)'}
            strokeWidth="1.5"
          />
          <line
            x1="50" y1="70" x2={gridState === 'mitigated' ? '59' : '50'}
            y2={gridState === 'mitigated' ? '78' : '80'}
            stroke={gridState === 'anomaly' ? 'var(--cyber-critical)' : gridState === 'mitigated' ? 'var(--border)' : 'var(--primary)'}
            strokeWidth="2"
          />

          {/* Circuit Breaker 2 */}
          <rect
            x="242" y="65" width="16" height="20" rx="3"
            fill="var(--card)"
            stroke="var(--primary)"
            strokeWidth="1.5"
          />
          <line x1="250" y1="70" x2="250" y2="80" stroke="var(--primary)" strokeWidth="2" />

          {/* Node details */}
          <text x="50" y="30" fill="var(--muted-foreground)" fontSize="8" textAnchor="middle" fontFamily="monospace">Feeder-101</text>
          <text x="250" y="30" fill="var(--muted-foreground)" fontSize="8" textAnchor="middle" fontFamily="monospace">Feeder-102</text>
          <text x="50" y="130" fill="var(--muted-foreground)" fontSize="8" textAnchor="middle" fontFamily="monospace">RTU-1</text>
          <text x="250" y="130" fill="var(--muted-foreground)" fontSize="8" textAnchor="middle" fontFamily="monospace">RTU-2</text>

          {/* Status Indicators */}
          <circle cx="50" cy="40" r="4" fill={gridState === 'anomaly' ? 'var(--cyber-critical)' : gridState === 'mitigated' ? 'var(--border)' : 'var(--cyber-success)'} />
          <circle cx="250" cy="40" r="4" fill="var(--cyber-success)" />
        </svg>

        {/* Floating playbook box in anomaly state */}
        {gridState === 'anomaly' && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute inset-x-4 bottom-4 p-4 rounded-xl border border-cyber-critical/20 bg-card/95 backdrop-blur-md shadow-lg flex flex-col gap-2"
          >
            <div className="flex justify-between items-center">
              <span className="text-[9px] uppercase font-bold text-cyber-critical tracking-wider">Playbook Suggestion</span>
              <span className="text-[8px] bg-cyber-critical/10 text-cyber-critical px-1.5 py-0.5 rounded">Severe</span>
            </div>
            <p className="text-[10px] text-foreground leading-normal">
              Register intercept on RTU-1. Isolate Feeder-101 to prevent phase drift?
            </p>
            <button
              onClick={() => setGridState('mitigated')}
              className="w-full mt-1 bg-cyber-critical hover:bg-cyber-critical/90 text-white rounded-lg py-1.5 text-[10px] font-semibold transition-colors"
            >
              Execute Isolation Playbook
            </button>
          </motion.div>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-3 gap-3 border-t border-border/40 pt-4 text-center">
        <div>
          <span className="text-[9px] uppercase font-bold text-muted-foreground/60 tracking-wider">Grid Load</span>
          <p className="font-mono text-xs font-semibold mt-0.5 text-foreground">
            {gridState === 'nominal' ? '480 MW' : gridState === 'anomaly' ? '710 MW' : '390 MW'}
          </p>
        </div>
        <div>
          <span className="text-[9px] uppercase font-bold text-muted-foreground/60 tracking-wider">Frequency</span>
          <p className={`font-mono text-xs font-semibold mt-0.5 ${gridState === 'anomaly' ? 'text-cyber-critical' : 'text-foreground'}`}>
            {gridState === 'nominal' ? '50.02 Hz' : gridState === 'anomaly' ? '48.72 Hz' : '50.00 Hz'}
          </p>
        </div>
        <div>
          <span className="text-[9px] uppercase font-bold text-muted-foreground/60 tracking-wider">Wazuh Sync</span>
          <p className="font-mono text-xs font-semibold mt-0.5 text-cyber-success">Linked</p>
        </div>
      </div>

      {/* Toggle simulator button */}
      <div className="flex gap-2 w-full">
        {gridState !== 'nominal' && (
          <button
            onClick={() => setGridState('nominal')}
            className="flex-1 rounded-xl border border-border bg-white/[0.02] hover:bg-white/[0.04] transition-all py-2.5 text-xs font-semibold text-foreground flex items-center justify-center gap-1.5"
          >
            Reset Telemetry
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
    </motion.div>
  );
}

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">
      {/* Dynamic blurred background glowing blob for high contrast Coral scheme */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-primary/10 via-cyber-critical/5 to-transparent blur-[130px] pointer-events-none" />

      {/* Background grid */}
      <div className="absolute inset-0 bg-grid opacity-30" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8 py-20 lg:py-32">
        <div className="grid lg:grid-cols-[1.1fr,0.9fr] gap-16 lg:gap-20 items-center">
          {/* Left Content */}
          <div className="space-y-8">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                SCADA Behavioral Profiling & Defense
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="font-heading text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight leading-[1.1]"
            >
              Defending the grid.{" "}
              <span className="gradient-text">In real-time.</span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-base lg:text-lg text-muted-foreground max-w-xl leading-relaxed"
            >
              An autonomous operational technology safeguards engine. Ingest millisecond register telemetry from RTUs, PLCs, and transmission lines to quarantine state-sponsored campaign anomalies dynamically.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2.5 rounded-full bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary/95 transition-all shadow-[0_4px_20px_rgba(255,107,53,0.15)] hover:scale-[1.01] active:scale-[0.99]"
              >
                Enter Platform Console
                <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>

            {/* Sector Badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="pt-4"
            >
              <p className="text-xs text-muted-foreground/60 uppercase tracking-widest mb-3">
                Protected CNI Sectors
              </p>
              <div className="flex flex-wrap gap-2">
                {CRITICAL_SECTORS.map((sector) => (
                  <span
                    key={sector}
                    className="inline-flex items-center rounded-full border border-border bg-white/[0.02] px-3 py-1 text-xs text-muted-foreground"
                  >
                    {sector}
                  </span>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Right Visual (SCADA Substation Widget) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="hidden lg:flex justify-center"
          >
            <SubstationGridVisual />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
