"use client";

import ReactECharts from "echarts-for-react";

interface ThreatSeverityGaugesProps {
  data: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

export default function ThreatSeverityGauges({ data }: ThreatSeverityGaugesProps) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  
  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: "#17181C",
      borderColor: "rgba(255,255,255,0.06)",
      borderWidth: 1,
      textStyle: { color: "#F5F5F5", fontSize: 11 },
    },
    series: [
      {
        type: "pie",
        radius: ["55%", "80%"],
        center: ["50%", "50%"],
        avoidLabelOverlap: true,
        padAngle: 3,
        itemStyle: {
          borderRadius: 6,
        },
        label: {
          show: false,
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 12,
            fontWeight: "bold",
            color: "#F5F5F5",
          },
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: "rgba(0, 0, 0, 0.5)",
          },
        },
        data: [
          { value: data.critical, name: "Critical", itemStyle: { color: "#EF4444" } },
          { value: data.high, name: "High", itemStyle: { color: "#F59E0B" } },
          { value: data.medium, name: "Medium", itemStyle: { color: "#3B82F6" } },
          { value: data.low, name: "Low", itemStyle: { color: "#22C55E" } },
          { value: data.info, name: "Info", itemStyle: { color: "#8B5CF6" } },
        ],
      },
    ],
    graphic: [
      {
        type: "text",
        left: "center",
        top: "42%",
        style: {
          text: `${total}`,
          fontSize: 28,
          fontWeight: "bold",
          fontFamily: "JetBrains Mono, monospace",
          fill: "#F5F5F5",
          textAlign: "center",
        },
      },
      {
        type: "text",
        left: "center",
        top: "55%",
        style: {
          text: "Total Threats",
          fontSize: 10,
          fill: "#71717A",
          textAlign: "center",
        },
      },
    ],
    animation: true,
    animationDuration: 1200,
    animationEasing: "cubicOut",
  };

  const items = [
    { label: "Critical", value: data.critical, color: "#EF4444" },
    { label: "High", value: data.high, color: "#F59E0B" },
    { label: "Medium", value: data.medium, color: "#3B82F6" },
    { label: "Low", value: data.low, color: "#22C55E" },
    { label: "Info", value: data.info, color: "#8B5CF6" },
  ];

  return (
    <div>
      <ReactECharts option={option} style={{ height: 220 }} />
      <div className="grid grid-cols-5 gap-2 mt-4">
        {items.map((item) => (
          <div key={item.label} className="text-center">
            <div
              className="h-1.5 rounded-full mb-2 mx-auto"
              style={{ backgroundColor: item.color, width: "60%" }}
            />
            <p className="font-mono-numbers text-sm font-bold" style={{ color: item.color }}>
              {item.value}
            </p>
            <p className="text-[9px] text-muted-foreground mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
