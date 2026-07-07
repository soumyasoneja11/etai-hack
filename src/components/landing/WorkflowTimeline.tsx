"use client";

import { motion } from "framer-motion";
import { WORKFLOW_STEPS } from "@/lib/constants";
import { ArrowRight } from "lucide-react";

export function WorkflowTimeline() {
  return (
    <section className="relative py-24 lg:py-32 bg-secondary/30" id="workflow">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center rounded-full border border-cyber-info/20 bg-cyber-info/5 px-4 py-1.5 text-xs font-medium text-cyber-info mb-4">
            End-to-End Pipeline
          </span>
          <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Autonomous Cyber Defence Workflow
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            From telemetry ingestion to system recovery — a fully automated pipeline that
            detects, predicts, and neutralizes threats in real-time.
          </p>
        </motion.div>

        {/* Horizontal Pipeline */}
        <div className="relative">
          {/* Connection line */}
          <div className="hidden lg:block absolute top-[60px] left-[10%] right-[10%] h-[2px] bg-gradient-to-r from-cyber-green/20 via-cyber-green/40 to-cyber-green/20" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {WORKFLOW_STEPS.map((step, index) => (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="relative flex flex-col items-center text-center"
              >
                {/* Step number circle */}
                <div className="relative z-10 mb-5">
                  <div className="flex h-[120px] w-[120px] items-center justify-center rounded-full border border-border bg-card">
                    <div className="flex h-[80px] w-[80px] items-center justify-center rounded-full bg-cyber-green/10 border border-cyber-green/20">
                      <span className="font-mono-numbers text-2xl font-bold text-cyber-green">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                  </div>
                  {/* Pulse dot */}
                  <div className="absolute top-1 right-1 h-3 w-3 rounded-full bg-cyber-green/60 animate-pulse" />
                </div>

                {/* Label */}
                <h3 className="font-heading text-lg font-semibold mb-2">{step.label}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-[200px]">
                  {step.description}
                </p>

                {/* Arrow (between steps, hidden on last) */}
                {index < WORKFLOW_STEPS.length - 1 && (
                  <div className="hidden lg:flex absolute top-[60px] -right-3 z-20">
                    <ArrowRight className="h-5 w-5 text-cyber-green/40" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
