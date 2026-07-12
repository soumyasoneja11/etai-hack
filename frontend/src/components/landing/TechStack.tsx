"use client";

import { motion } from "framer-motion";
import { TECH_STACK } from "@/lib/constants";

export function TechStackSection() {
  return (
    <section className="relative py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary mb-4">
            Technology Stack
          </span>
          <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight mb-4 text-foreground">
            Built on Modern Infrastructure
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-sm">
            Enterprise-grade technologies powering AI-driven threat detection,
            knowledge graph reasoning, and autonomous response orchestration.
          </p>
        </motion.div>

        {/* Tech Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {TECH_STACK.map((tech, index) => (
            <motion.div
              key={tech.name}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.05 }}
              className="group relative rounded-[20px] landing-glass landing-glass-hover p-6 text-center"
            >
              {/* Icon placeholder */}
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.04] border border-border/60 group-hover:border-primary/30 transition-colors">
                <span className="font-mono-numbers text-base font-bold text-primary">
                  {tech.name.charAt(0)}
                </span>
              </div>

              <h3 className="text-xs font-semibold mb-1 text-foreground">{tech.name}</h3>
              <p className="text-[10px] text-muted-foreground">{tech.category}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
