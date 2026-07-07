"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Play } from "lucide-react";
import { CRITICAL_SECTORS } from "@/lib/constants";

/** Animated fingerprint / cyber shield SVG */
function FingerprintVisual() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = 480;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    let frame = 0;
    let animationId: number;

    const draw = () => {
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;

      // Outer rings
      for (let i = 0; i < 6; i++) {
        const radius = 80 + i * 28;
        const rotation = frame * (0.002 + i * 0.0005) * (i % 2 === 0 ? 1 : -1);
        const dashLength = 8 + i * 3;
        const gapLength = 4 + i * 2;

        ctx.beginPath();
        ctx.setLineDash([dashLength, gapLength]);
        ctx.lineDashOffset = rotation * 100;
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(34, 197, 94, ${0.12 - i * 0.015})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Inner fingerprint arcs
      for (let i = 0; i < 12; i++) {
        const radius = 25 + i * 5;
        const startAngle = (Math.PI * i) / 6 + frame * 0.003;
        const endAngle = startAngle + Math.PI * (0.3 + (i % 3) * 0.2);

        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, endAngle);
        ctx.strokeStyle = `rgba(34, 197, 94, ${0.35 - i * 0.02})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Central glow
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60);
      gradient.addColorStop(0, "rgba(34, 197, 94, 0.15)");
      gradient.addColorStop(1, "rgba(34, 197, 94, 0)");
      ctx.beginPath();
      ctx.arc(cx, cy, 60, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Central dot
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(34, 197, 94, 0.8)";
      ctx.fill();

      // Scanning line
      const scanY = cy + Math.sin(frame * 0.02) * 100;
      const scanGradient = ctx.createLinearGradient(cx - 120, scanY, cx + 120, scanY);
      scanGradient.addColorStop(0, "rgba(34, 197, 94, 0)");
      scanGradient.addColorStop(0.5, "rgba(34, 197, 94, 0.15)");
      scanGradient.addColorStop(1, "rgba(34, 197, 94, 0)");
      ctx.fillStyle = scanGradient;
      ctx.fillRect(cx - 120, scanY - 1, 240, 2);

      // Corner brackets
      const bracketSize = 20;
      const bracketOffset = 100;
      ctx.strokeStyle = "rgba(34, 197, 94, 0.3)";
      ctx.lineWidth = 1.5;

      // Top-left
      ctx.beginPath();
      ctx.moveTo(cx - bracketOffset, cy - bracketOffset + bracketSize);
      ctx.lineTo(cx - bracketOffset, cy - bracketOffset);
      ctx.lineTo(cx - bracketOffset + bracketSize, cy - bracketOffset);
      ctx.stroke();

      // Top-right
      ctx.beginPath();
      ctx.moveTo(cx + bracketOffset - bracketSize, cy - bracketOffset);
      ctx.lineTo(cx + bracketOffset, cy - bracketOffset);
      ctx.lineTo(cx + bracketOffset, cy - bracketOffset + bracketSize);
      ctx.stroke();

      // Bottom-left
      ctx.beginPath();
      ctx.moveTo(cx - bracketOffset, cy + bracketOffset - bracketSize);
      ctx.lineTo(cx - bracketOffset, cy + bracketOffset);
      ctx.lineTo(cx - bracketOffset + bracketSize, cy + bracketOffset);
      ctx.stroke();

      // Bottom-right
      ctx.beginPath();
      ctx.moveTo(cx + bracketOffset - bracketSize, cy + bracketOffset);
      ctx.lineTo(cx + bracketOffset, cy + bracketOffset);
      ctx.lineTo(cx + bracketOffset, cy + bracketOffset - bracketSize);
      ctx.stroke();

      // Particles
      for (let i = 0; i < 20; i++) {
        const angle = (Math.PI * 2 * i) / 20 + frame * 0.005;
        const r = 130 + Math.sin(frame * 0.01 + i) * 20;
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;
        const particleSize = 1 + Math.sin(frame * 0.03 + i * 0.5) * 0.5;

        ctx.beginPath();
        ctx.arc(px, py, particleSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(34, 197, 94, ${0.2 + Math.sin(frame * 0.02 + i) * 0.15})`;
        ctx.fill();
      }

      frame++;
      animationId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animationId);
  }, []);

  return (
    <div className="relative w-full max-w-[480px] aspect-square">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ width: 480, height: 480 }}
      />
      {/* Ambient glow behind */}
      <div className="absolute inset-0 -z-10 bg-cyber-green/5 rounded-full blur-[80px]" />
    </div>
  );
}

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 bg-grid opacity-50" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8 py-20 lg:py-32">
        <div className="grid lg:grid-cols-[1fr,0.8fr] gap-16 lg:gap-20 items-center">
          {/* Left Content */}
          <div className="space-y-8">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-cyber-green/20 bg-cyber-green/5 px-4 py-1.5 text-xs font-medium text-cyber-green">
                <span className="h-1.5 w-1.5 rounded-full bg-cyber-green animate-pulse" />
                Behaviour-Based Threat Intelligence
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="font-heading text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight leading-[1.1]"
            >
              AI-Powered Cyber Resilience for{" "}
              <span className="gradient-text">Critical National Infrastructure</span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-base lg:text-lg text-muted-foreground max-w-xl leading-relaxed"
            >
              Continuously monitor infrastructure, detect anomalies using AI behavioural
              analysis, correlate threats with MITRE ATT&CK, predict attack progression,
              and orchestrate intelligent response — before damage occurs.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-wrap gap-4"
            >
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-[14px] bg-cyber-green px-6 py-3 text-sm font-semibold text-black hover:bg-cyber-green/90 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                Launch Dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="#workflow"
                className="inline-flex items-center gap-2 rounded-[14px] border border-border bg-white/[0.03] px-6 py-3 text-sm font-medium text-foreground hover:bg-white/[0.06] transition-all"
              >
                <Play className="h-4 w-4" />
                Explore Architecture
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
                Protecting Critical Sectors
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

          {/* Right Visual */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="hidden lg:flex justify-center"
          >
            <FingerprintVisual />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
