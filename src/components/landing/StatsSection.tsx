"use client";

import { motion } from "framer-motion";
import CountUp from "react-countup";
import { useInView } from "framer-motion";
import { useRef } from "react";
import { LANDING_STATS } from "@/lib/dummy-data";

function StatCard({ stat, index }: { stat: typeof LANDING_STATS[number]; index: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="text-center"
    >
      <div className="font-mono-numbers text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-2">
        {isInView ? (
          <CountUp
            end={stat.value}
            duration={2.5}
            separator=","
            decimals={stat.value % 1 !== 0 ? 1 : 0}
            suffix={stat.suffix}
          />
        ) : (
          <span>0{stat.suffix}</span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{stat.label}</p>
    </motion.div>
  );
}

export function StatsSection() {
  return (
    <section className="relative py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Platform Performance
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Real-time metrics from our deployment across critical national infrastructure.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {LANDING_STATS.map((stat, index) => (
            <StatCard key={stat.label} stat={stat} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
