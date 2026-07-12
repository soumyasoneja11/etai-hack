"use client";

import { memo } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from "react-simple-maps";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

interface ThreatOrigin {
  country: string;
  code: string;
  lat: number;
  lng: number;
  attacks: number;
  severity: string;
}

interface WorldThreatMapProps {
  origins: ThreatOrigin[];
}

function WorldThreatMapInner({ origins }: WorldThreatMapProps) {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "#EF4444";
      case "high": return "#F59E0B";
      case "medium": return "#3B82F6";
      default: return "#22C55E";
    }
  };

  const getMarkerSize = (attacks: number) => {
    if (attacks > 2000) return 10;
    if (attacks > 500) return 7;
    if (attacks > 200) return 5;
    return 4;
  };

  return (
    <div className="relative">
      <ComposableMap
        projectionConfig={{
          rotate: [-10, 0, 0],
          scale: 140,
        }}
        style={{ width: "100%", height: "auto" }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }: { geographies: any[] }) =>
            geographies.map((geo: any) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="#1E1F23"
                stroke="rgba(255,255,255,0.04)"
                strokeWidth={0.5}
                style={{
                  default: { outline: "none" },
                  hover: { fill: "#252629", outline: "none" },
                  pressed: { outline: "none" },
                }}
              />
            ))
          }
        </Geographies>

        {/* Attack origin markers */}
        {origins.map((origin) => {
          const color = getSeverityColor(origin.severity);
          const size = getMarkerSize(origin.attacks);
          return (
            <Marker key={origin.code} coordinates={[origin.lng, origin.lat]}>
              {/* Pulse ring */}
              <circle
                r={size + 4}
                fill={color}
                opacity={0.15}
              >
                <animate
                  attributeName="r"
                  from={String(size + 2)}
                  to={String(size + 10)}
                  dur="2s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  from="0.2"
                  to="0"
                  dur="2s"
                  repeatCount="indefinite"
                />
              </circle>
              {/* Main dot */}
              <circle
                r={size}
                fill={color}
                opacity={0.8}
                stroke={color}
                strokeWidth={1}
              />
              {/* Label */}
              <text
                textAnchor="middle"
                y={-size - 6}
                style={{
                  fontSize: 8,
                  fill: "#A1A1AA",
                  fontFamily: "Inter, sans-serif",
                }}
              >
                {origin.country}
              </text>
            </Marker>
          );
        })}

        {/* Target: India */}
        <Marker coordinates={[77.209, 28.6139]}>
          <circle r={6} fill="#22C55E" opacity={0.3} />
          <circle r={3} fill="#22C55E" opacity={0.8} />
        </Marker>
      </ComposableMap>

      {/* Legend */}
      <div className="absolute bottom-2 left-2 flex items-center gap-4 text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-cyber-danger" /> Critical
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-cyber-warning" /> High
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-cyber-info" /> Medium
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-cyber-green" /> Low
        </span>
      </div>
    </div>
  );
}

const WorldThreatMap = memo(WorldThreatMapInner);
export default WorldThreatMap;
