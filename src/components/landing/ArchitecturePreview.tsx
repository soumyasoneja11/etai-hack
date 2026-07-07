"use client";

import { motion } from "framer-motion";

export function ArchitecturePreview() {
  return (
    <section className="relative py-24 lg:py-32 bg-secondary/30" id="architecture">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center rounded-full border border-cyber-green/20 bg-cyber-green/5 px-4 py-1.5 text-xs font-medium text-cyber-green mb-4">
            System Architecture
          </span>
          <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Platform Architecture
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Multi-layered AI pipeline from telemetry ingestion through knowledge
            graph reasoning to autonomous response orchestration.
          </p>
        </motion.div>

        {/* Architecture Diagram (Stylized SVG) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative rounded-[20px] border border-border bg-card p-8 lg:p-12 overflow-hidden"
        >
          {/* Grid background */}
          <div className="absolute inset-0 bg-grid opacity-30" />

          <svg
            viewBox="0 0 900 500"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="relative w-full h-auto"
          >
            {/* Data Sources Layer */}
            <rect x="30" y="40" width="140" height="60" rx="12" fill="#17181C" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x="100" y="65" fill="#A1A1AA" fontSize="10" textAnchor="middle">Endpoints</text>
            <text x="100" y="82" fill="#71717A" fontSize="8" textAnchor="middle">eBPF / EDR Agents</text>

            <rect x="200" y="40" width="140" height="60" rx="12" fill="#17181C" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x="270" y="65" fill="#A1A1AA" fontSize="10" textAnchor="middle">Network</text>
            <text x="270" y="82" fill="#71717A" fontSize="8" textAnchor="middle">IDS / Flow Data</text>

            <rect x="370" y="40" width="140" height="60" rx="12" fill="#17181C" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x="440" y="65" fill="#A1A1AA" fontSize="10" textAnchor="middle">Cloud / SIEM</text>
            <text x="440" y="82" fill="#71717A" fontSize="8" textAnchor="middle">Wazuh / Logs</text>

            <rect x="540" y="40" width="140" height="60" rx="12" fill="#17181C" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x="610" y="65" fill="#A1A1AA" fontSize="10" textAnchor="middle">Threat Intel</text>
            <text x="610" y="82" fill="#71717A" fontSize="8" textAnchor="middle">CERT-In / MITRE</text>

            <rect x="710" y="40" width="140" height="60" rx="12" fill="#17181C" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x="780" y="65" fill="#A1A1AA" fontSize="10" textAnchor="middle">OT / SCADA</text>
            <text x="780" y="82" fill="#71717A" fontSize="8" textAnchor="middle">ICS Sensors</text>

            {/* Flow arrows down */}
            {[100, 270, 440, 610, 780].map((x) => (
              <line key={x} x1={x} y1="100" x2={x} y2="140" stroke="#22C55E" strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />
            ))}

            {/* Data Processing Layer */}
            <rect x="150" y="150" width="600" height="60" rx="12" fill="#17181C" stroke="rgba(34,197,94,0.15)" strokeWidth="1" />
            <text x="450" y="175" fill="#22C55E" fontSize="12" textAnchor="middle" fontWeight="600">Data Ingestion & Normalisation Engine</text>
            <text x="450" y="192" fill="#71717A" fontSize="9" textAnchor="middle">FastAPI + Apache Kafka + Vector Processing</text>

            {/* Arrow */}
            <line x1="450" y1="210" x2="450" y2="245" stroke="#22C55E" strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />

            {/* AI Agents Layer */}
            <rect x="50" y="250" width="800" height="80" rx="14" fill="rgba(34,197,94,0.03)" stroke="rgba(34,197,94,0.12)" strokeWidth="1" />
            <text x="450" y="270" fill="#22C55E" fontSize="11" textAnchor="middle" fontWeight="600">AI Agent Orchestration (LangGraph)</text>

            {/* Agent boxes */}
            {[
              { x: 80, label: "Behaviour", sub: "Detection" },
              { x: 240, label: "Threat", sub: "Attribution" },
              { x: 400, label: "Autonomous", sub: "Response" },
              { x: 560, label: "Vulnerability", sub: "Prioritisation" },
              { x: 720, label: "Digital Twin", sub: "Simulation" },
            ].map((agent) => (
              <g key={agent.label}>
                <rect x={agent.x} y="280" width="130" height="40" rx="8" fill="#17181C" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                <text x={agent.x + 65} y="297" fill="#F5F5F5" fontSize="9" textAnchor="middle" fontWeight="500">{agent.label}</text>
                <text x={agent.x + 65} y="311" fill="#71717A" fontSize="8" textAnchor="middle">{agent.sub}</text>
              </g>
            ))}

            {/* Arrow */}
            <line x1="450" y1="330" x2="450" y2="360" stroke="#22C55E" strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />

            {/* Knowledge Layer */}
            <rect x="100" y="365" width="280" height="55" rx="12" fill="#17181C" stroke="rgba(139,92,246,0.15)" strokeWidth="1" />
            <text x="240" y="388" fill="#8B5CF6" fontSize="11" textAnchor="middle" fontWeight="600">Knowledge Graph</text>
            <text x="240" y="405" fill="#71717A" fontSize="9" textAnchor="middle">Neo4j + Qdrant Vector DB</text>

            <rect x="420" y="365" width="280" height="55" rx="12" fill="#17181C" stroke="rgba(59,130,246,0.15)" strokeWidth="1" />
            <text x="560" y="388" fill="#3B82F6" fontSize="11" textAnchor="middle" fontWeight="600">Response Orchestration</text>
            <text x="560" y="405" fill="#71717A" fontSize="9" textAnchor="middle">OpenSOAR + Ansible + Playbooks</text>

            {/* Arrow to dashboard */}
            <line x1="450" y1="420" x2="450" y2="450" stroke="#22C55E" strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />

            {/* Dashboard Layer */}
            <rect x="200" y="450" width="500" height="40" rx="10" fill="rgba(34,197,94,0.08)" stroke="rgba(34,197,94,0.2)" strokeWidth="1" />
            <text x="450" y="475" fill="#22C55E" fontSize="11" textAnchor="middle" fontWeight="600">CyberShield AI Dashboard — React + Next.js</text>
          </svg>
        </motion.div>
      </div>
    </section>
  );
}
