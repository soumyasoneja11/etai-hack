"use client";

import { useEffect, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { GraphNode, GraphLink } from "@/app/api/graph/route";

interface ForceGraphNode extends GraphNode {
  x?: number;
  y?: number;
}

interface ForceGraphLink {
  source: string | ForceGraphNode;
  target: string | ForceGraphNode;
  animated?: boolean;
}

interface GraphViewerProps {
  data: {
    nodes: GraphNode[];
    links: GraphLink[];
  };
  onSelectNode: (node: GraphNode | null) => void;
  selectedNode: GraphNode | null;
}

export default function GraphViewer({ data, onSelectNode, selectedNode }: GraphViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  useEffect(() => {
    if (!containerRef.current) return;

    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const w = rect.width || containerRef.current.clientWidth || 800;
        const h = Math.max(rect.height || containerRef.current.clientHeight || 500, 480);
        setDimensions({ width: w, height: h });
      }
    };

    updateSize();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(updateSize);
      observer.observe(containerRef.current);
    } else {
      window.addEventListener("resize", updateSize);
    }
    
    const timer = setTimeout(updateSize, 150);

    return () => {
      if (observer) {
        observer.disconnect();
      } else {
        window.removeEventListener("resize", updateSize);
      }
      clearTimeout(timer);
    };
  }, []);

  const paintNode = (node: ForceGraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    if (!node) return;
    const { x = 0, y = 0 } = node;
    const isSelected = Boolean(selectedNode && selectedNode.id === node.id);
    const rawLabel = typeof node.label === "string" ? node.label : (node.id || "Node");
    const label = rawLabel.split(" (")[0] || rawLabel; 
    const scale = globalScale || 1;
    const fontSize = Math.max(8.5, 11.5 / scale);
    
    ctx.font = `${fontSize}px Geist, sans-serif`;

    const r = node.type === "asset" ? 7 : node.type === "attack" ? 8 : 6;
    
    let color = "#38bdf8"; 
    if (node.type === "asset") {
      if (node.severity === "critical") color = "#22C55E"; 
      else if (node.severity === "high") color = "#3B82F6"; 
      else color = "#38bdf8";
    } else if (node.type === "attack") {
      color = node.severity === "critical" ? "#EF4444" : "#F59E0B"; 
    } else if (node.type === "mitre") {
      color = "#8B5CF6"; 
    }

    // Outer Glow Selection
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(34, 197, 94, 0.8)";
      ctx.lineWidth = 1.8 / scale;
      ctx.stroke();
      
      ctx.shadowColor = "rgba(34, 197, 94, 0.8)";
      ctx.shadowBlur = 10;
    } else {
      ctx.shadowColor = color;
      ctx.shadowBlur = 5;
    }

    // Main Circle
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0; 

    // Inner center styling
    ctx.beginPath();
    ctx.arc(x, y, r * 0.35, 0, 2 * Math.PI);
    ctx.fillStyle = "#17181C";
    ctx.fill();

    // Text Label Box
    const textWidth = ctx.measureText(label).width;
    const paddingX = 4;
    const paddingY = 2;
    const bgW = textWidth + paddingX * 2;
    const bgH = fontSize + paddingY * 2;
    
    ctx.fillStyle = "rgba(23, 24, 28, 0.9)";
    ctx.strokeStyle = isSelected ? "rgba(34, 197, 94, 0.4)" : "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1 / scale;
    
    const labelY = y + r + 4;
    
    const rx = x - bgW / 2;
    const ry = labelY;
    const radius = 3;
    ctx.beginPath();
    ctx.moveTo(rx + radius, ry);
    ctx.lineTo(rx + bgW - radius, ry);
    ctx.quadraticCurveTo(rx + bgW, ry, rx + bgW, ry + radius);
    ctx.lineTo(rx + bgW, ry + bgH - radius);
    ctx.quadraticCurveTo(rx + bgW, ry + bgH, rx + bgW - radius, ry + bgH);
    ctx.lineTo(rx + radius, ry + bgH);
    ctx.quadraticCurveTo(rx, ry + bgH, rx, ry + bgH - radius);
    ctx.lineTo(rx, ry + radius);
    ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw text inside box
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = isSelected ? "#22C55E" : "rgba(245, 245, 245, 0.95)";
    ctx.fillText(label, x, labelY + bgH / 2);
  };

  const safeData = data && Array.isArray(data.nodes) ? data : { nodes: [], links: [] };

  if (safeData.nodes.length === 0) {
    return (
      <div 
        ref={containerRef} 
        className="relative flex-1 min-h-[480px] bg-[#0c0d10] border border-border rounded-[16px] flex items-center justify-center text-muted-foreground"
      >
        <span className="text-xs font-medium">No attack path topology data available</span>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef} 
      className="relative flex-1 min-h-[480px] bg-[#0c0d10] border border-border rounded-[16px] overflow-hidden"
    >
      <ForceGraph2D
        graphData={safeData}
        width={dimensions.width}
        height={dimensions.height}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={(node: ForceGraphNode, color, ctx) => {
          if (!node) return;
          const { x = 0, y = 0 } = node;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, 12, 0, 2 * Math.PI);
          ctx.fill();
        }}
        linkWidth={(link: ForceGraphLink) => (link?.animated ? 1.5 : 1)}
        linkColor={(link: ForceGraphLink) => {
          if (!link) return "rgba(255, 255, 255, 0.05)";
          const sourceId = typeof link.source === "string" ? link.source : link.source?.id;
          const targetId = typeof link.target === "string" ? link.target : link.target?.id;
          return selectedNode && (sourceId === selectedNode.id || targetId === selectedNode.id)
            ? "rgba(34, 197, 94, 0.5)"
            : link.animated 
              ? "rgba(239, 68, 68, 0.3)" 
              : "rgba(255, 255, 255, 0.05)";
        }}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        linkDirectionalParticles={(link: ForceGraphLink) => (link?.animated ? 3 : 0)}
        linkDirectionalParticleSpeed={0.005}
        linkDirectionalParticleWidth={2.5}
        linkDirectionalParticleColor={() => "#EF4444"}
        onNodeClick={(node: ForceGraphNode) => {
          if (node) onSelectNode(node);
        }}
        onBackgroundClick={() => {
          onSelectNode(null);
        }}
        cooldownTicks={100}
        d3VelocityDecay={0.3}
      />

      {/* Embedded UI Legend */}
      <div className="absolute bottom-4 left-4 border border-border bg-card/90 backdrop-blur-sm rounded-xl p-4 flex flex-col gap-2.5 z-10 pointer-events-auto shadow-xl">
        <div className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground/60">Topology Legend</div>
        <div className="flex items-center gap-2 text-xs">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: "#38bdf8" }}></div>
          <span className="text-muted-foreground">Monitored Assets</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: "#EF4444" }}></div>
          <span className="text-muted-foreground">ML Attack Detections</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: "#8B5CF6" }}></div>
          <span className="text-muted-foreground">MITRE Techniques</span>
        </div>
        <div className="flex items-center gap-2 text-xs border-t border-border/50 pt-2 mt-1">
          <div className="flex gap-0.5 items-center">
            <span className="w-6 h-0.5 bg-cyber-danger/30"></span>
            <span className="text-[9px] text-cyber-danger font-bold">••</span>
          </div>
          <span className="text-muted-foreground">Active Threat Flow</span>
        </div>
      </div>
    </div>
  );
}
