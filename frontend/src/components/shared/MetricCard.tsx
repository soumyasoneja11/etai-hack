"use client";

import { motion } from "framer-motion";
import CountUp from "react-countup";
import {
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: number;
  change: number;
  trend: "up" | "down" | "neutral";
  suffix?: string;
  severity?: string;
  sparklineData?: number[];
  index?: number;
}

export function MetricCard({
  label,
  value,
  change,
  trend,
  suffix,
  severity,
  sparklineData,
  index = 0,
}: MetricCardProps) {
  let trendColor = "text-muted-foreground";
  const labelLower = label.toLowerCase();
  const isNegativeMetric = labelLower.includes("threat") || labelLower.includes("suspicious") || labelLower.includes("false") || labelLower.includes("mtt");
  
  if (trend === "up") {
    trendColor = isNegativeMetric ? "text-cyber-danger" : "text-cyber-green";
  } else if (trend === "down") {
    trendColor = isNegativeMetric ? "text-cyber-green" : "text-cyber-danger";
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className={cn(
        "group relative rounded-[18px] border border-border bg-card p-5 card-hover overflow-hidden",
        severity === "high" && "border-cyber-danger/15"
      )}
    >
      {/* Mini sparkline background */}
      {sparklineData && (
        <div className="absolute bottom-0 left-0 right-0 h-12 opacity-20">
          <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-full">
            <polyline
              points={sparklineData
                .map((v, i) => {
                  const max = Math.max(...sparklineData);
                  const min = Math.min(...sparklineData);
                  const range = max - min || 1;
                  const x = (i / (sparklineData.length - 1)) * 100;
                  const y = 30 - ((v - min) / range) * 25;
                  return `${x},${y}`;
                })
                .join(" ")}
              fill="none"
              stroke="#22C55E"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}

      {/* Content */}
      <div className="relative z-10">
        <p className="text-xs text-muted-foreground mb-2">{label}</p>
        <div className="flex items-end justify-between gap-2">
          <div className="flex items-baseline gap-1">
            <span className="font-mono-numbers text-2xl font-bold tracking-tight">
              <CountUp
                end={value}
                duration={2}
                separator=","
                decimals={value % 1 !== 0 ? 1 : 0}
                preserveValue
              />
            </span>
            {suffix && (
              <span className="text-sm text-muted-foreground font-mono-numbers">{suffix}</span>
            )}
          </div>
          <div className={cn("flex items-center gap-0.5 text-xs font-medium", trendColor)}>
            {trend === "up" ? (
              <TrendingUp className="h-3 w-3" />
            ) : trend === "down" ? (
              <TrendingDown className="h-3 w-3" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            <span className="font-mono-numbers">{Math.abs(change)}%</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
