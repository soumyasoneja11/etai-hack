"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Cpu as TerminalIcon } from "lucide-react";

export function FeaturesSection() {
  // Live incident simulator state inside the feature section
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 4);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const incidentSteps = [
    {
      title: "01 / INGESTION",
      desc: "Modbus telemetry hook captures registers sweep on sub-gateway-04 (Sector 2)",
      status: "Ingested",
      log: "ebpf_kernel_probe: modbus_write_register (0x10A) deviation vs baseline (+12.4%)",
      color: "text-primary"
    },
    {
      title: "02 / ATTRIBUTION",
      desc: "Graph reasoning engine matches behavior with state-level APT adversary campaigns",
      status: "Attributed (APT29 Profile)",
      log: "ml_correlator: footprint matches tactics T1078 (Valid Accounts) & T0812",
      color: "text-cyber-warning"
    },
    {
      title: "03 / PLAYBOOK ACTION",
      desc: "Ansible SOAR triggers firewall isolation rule at the network switch port tier",
      status: "Contained",
      log: "soar_executor: isolated port 502 on switch-sub-02; rerouted secondary transformer",
      color: "text-cyber-critical"
    },
    {
      title: "04 / RECOVERY & SYNC",
      desc: "Firmware hashes verified and telemetry frequencies synced back to nominal bounds",
      status: "Grid Stabilized",
      log: "recovery_daemon: buffer flushed, grid frequency restored to 50.00Hz",
      color: "text-cyber-success"
    }
  ];

  return (
    <section className="relative py-24 lg:py-32 overflow-hidden border-t border-border/40" id="features">
      {/* Background glow */}
      <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-gradient-to-l from-primary/5 to-transparent blur-[120px] pointer-events-none" />

      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          
          {/* Left Column: Typographic Details */}
          <div className="space-y-8">
            <div className="space-y-4">
              <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary">
                Incident Lifecycle
              </span>
              <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-[1.15]">
                How we isolate anomalies in milliseconds.
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed max-w-md">
                Standard dashboards show alerts after the damage is done. CyberShield couples low-latency kernel hooks with graph reasoning to mitigate state-level anomalies automatically.
              </p>
            </div>

            {/* Micro details list */}
            <div className="space-y-6 pt-4 border-t border-border/40">
              <div className="flex gap-4">
                <div className="flex-none h-10 w-10 rounded-xl landing-glass flex items-center justify-center text-primary">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Kernel-Level Observability</h4>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">eBPF instrumentation traces telemetry flows at the operating system level, bypassing standard user-space delays.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-none h-10 w-10 rounded-xl landing-glass flex items-center justify-center text-primary">
                  <TerminalIcon size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Automated Switch Containment</h4>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">Ansible orchestration playbooks isolate hardware router paths automatically without needing manual SOC intervention.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Live Incident Console Simulator */}
          <div className="relative">
            <div className="landing-glass rounded-[24px] overflow-hidden border border-border/60 shadow-2xl flex flex-col h-[400px]">
              {/* Console Header */}
              <div className="flex justify-between items-center bg-white/[0.01] border-b border-border/40 px-6 py-4">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-cyber-critical animate-pulse" />
                  <span className="font-mono text-xs font-semibold tracking-wider text-muted-foreground">SOAR INCIDENT PIPELINE</span>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground/50">Wazuh-Event-ID: 940-EX</span>
              </div>

              {/* Console Body */}
              <div className="flex-1 p-6 flex flex-col justify-between overflow-hidden">
                <div className="space-y-4">
                  {incidentSteps.map((step, idx) => {
                    const isActive = idx === activeStep;
                    const isPassed = idx < activeStep;

                    return (
                      <div
                        key={step.title}
                        className={`flex gap-4 transition-all duration-300 ${
                          isActive ? "opacity-100 scale-100" : isPassed ? "opacity-60" : "opacity-30"
                        }`}
                      >
                        {/* Bullet tracker */}
                        <div className="flex flex-col items-center">
                          <div className={`h-6 w-6 rounded-full flex items-center justify-center border text-[10px] font-bold transition-colors ${
                            isActive ? "border-primary bg-primary/10 text-primary" :
                            isPassed ? "border-cyber-success bg-cyber-success/10 text-cyber-success" :
                            "border-border bg-transparent text-muted-foreground"
                          }`}>
                            {idx + 1}
                          </div>
                          {idx < 3 && <div className="w-[1px] h-6 bg-border/40 mt-1" />}
                        </div>

                        {/* Text */}
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60">{step.title}</span>
                            {isActive && (
                              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[8px] font-medium text-primary animate-pulse">
                                Processing
                              </span>
                            )}
                          </div>
                          <h4 className="text-xs font-semibold text-foreground">{step.desc}</h4>
                          {isActive && (
                            <motion.p
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="font-mono text-[9px] text-primary/80 mt-1"
                            >
                              &gt; {step.log}
                            </motion.p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Status Bar */}
                <div className="mt-4 border-t border-border/40 pt-4 flex justify-between items-center text-[10px] font-mono text-muted-foreground/60">
                  <span>SYSTEM STATUS: CONTAINING</span>
                  <span className="text-primary font-bold">STEP {activeStep + 1} / 4</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
