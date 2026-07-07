"use client";

import { motion } from "framer-motion";
import { Brain, Target, Zap, Bug, Cpu } from "lucide-react";
import { FEATURE_CARDS } from "@/lib/constants";

const iconMap: Record<string, React.ElementType> = {
  Brain,
  Target,
  Zap,
  Bug,
  Cpu,
};

export function FeaturesSection() {
  return (
    <section className="relative py-24 lg:py-32" id="features">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center rounded-full border border-cyber-purple/20 bg-cyber-purple/5 px-4 py-1.5 text-xs font-medium text-cyber-purple mb-4">
            Five Intelligent Agents
          </span>
          <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            AI-Driven Cyber Defence
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Five specialized AI agents work in concert to detect, attribute, respond,
            prioritize, and simulate — providing end-to-end autonomous cyber resilience.
          </p>
        </motion.div>

        {/* Feature Cards Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURE_CARDS.map((card, index) => {
            const Icon = iconMap[card.icon];
            return (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className={`group relative rounded-[18px] border border-border bg-card p-8 card-hover ${
                  index >= 3 ? "sm:col-span-1 lg:col-span-1" : ""
                }`}
                style={index === 3 ? { gridColumn: "span 1" } : index === 4 ? { gridColumn: "span 1" } : {}}
              >
                {/* Icon */}
                <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-cyber-green/10 border border-cyber-green/20 group-hover:bg-cyber-green/15 transition-colors">
                  {Icon && <Icon className="h-6 w-6 text-cyber-green" />}
                </div>

                {/* Content */}
                <h3 className="font-heading text-lg font-semibold mb-3 text-foreground">
                  {card.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {card.description}
                </p>

                {/* Subtle corner accent */}
                <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-cyber-green/[0.03] to-transparent rounded-tr-[18px] pointer-events-none" />
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
