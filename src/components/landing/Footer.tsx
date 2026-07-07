"use client";

import Link from "next/link";
import { Shield, Code, Briefcase, ExternalLink } from "lucide-react";
import { PLATFORM } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="relative border-t border-border bg-secondary/30">
      <div className="mx-auto max-w-7xl px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyber-green/10 border border-cyber-green/20">
                <Shield className="h-4.5 w-4.5 text-cyber-green" />
              </div>
              <span className="font-heading text-lg font-semibold">{PLATFORM.name}</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              AI-Powered Cyber Resilience Platform for Critical National Infrastructure.
              Built for ET AI Hackathon 2026.
            </p>
            <div className="flex items-center gap-3">
              <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors">
                <Code className="h-4 w-4" />
              </a>
              <a href="https://x.com" target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors">
                <ExternalLink className="h-4 w-4" />
              </a>
              <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors">
                <Briefcase className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Platform */}
          <div>
            <h3 className="text-sm font-semibold mb-4">Platform</h3>
            <ul className="space-y-2.5">
              {["Dashboard", "AI Agents", "Threat Intelligence", "Digital Twin", "Reports"].map((item) => (
                <li key={item}>
                  <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="text-sm font-semibold mb-4">Resources</h3>
            <ul className="space-y-2.5">
              {["Documentation", "API Reference", "Architecture", "MITRE ATT&CK", "CERT-In Advisories"].map((item) => (
                <li key={item}>
                  <Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Hackathon */}
          <div>
            <h3 className="text-sm font-semibold mb-4">Hackathon</h3>
            <ul className="space-y-2.5">
              {["ET AI Hackathon 2026", "Problem Statement", "Team", "GitHub Repository", "License — MIT"].map((item) => (
                <li key={item}>
                  <Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © 2026 {PLATFORM.name}. Built for ET AI Hackathon. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link href="#" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link href="#" className="hover:text-foreground transition-colors">Terms of Service</Link>
            <Link href="#" className="hover:text-foreground transition-colors">Security</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
