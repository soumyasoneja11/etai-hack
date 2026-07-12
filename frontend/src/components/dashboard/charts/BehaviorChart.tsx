"use client";

import ReactECharts from "echarts-for-react";

interface BehaviorChartProps {
  data: Array<{ hour: string; normal: number; anomaly: number; baseline: number }>;
}

export default function BehaviorChart({ data }: BehaviorChartProps) {
  const option = {
    backgroundColor: "transparent",
    grid: {
      top: 10,
      right: 10,
      bottom: 30,
      left: 40,
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#17181C",
      borderColor: "rgba(255,255,255,0.06)",
      borderWidth: 1,
      textStyle: { color: "#F5F5F5", fontSize: 11 },
      axisPointer: {
        type: "cross",
        crossStyle: { color: "rgba(255,255,255,0.1)" },
      },
    },
    xAxis: {
      type: "category",
      data: data.map((d) => d.hour),
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } },
      axisLabel: { color: "#71717A", fontSize: 10, interval: 3 },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      min: 40,
      max: 100,
      axisLine: { show: false },
      axisLabel: { color: "#71717A", fontSize: 10 },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.04)" } },
    },
    series: [
      {
        name: "Normal Score",
        type: "line",
        data: data.map((d) => d.normal),
        smooth: true,
        showSymbol: false,
        lineStyle: { color: "#22C55E", width: 2 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(34,197,94,0.15)" },
              { offset: 1, color: "rgba(34,197,94,0)" },
            ],
          },
        },
      },
      {
        name: "Anomaly Score",
        type: "line",
        data: data.map((d) => d.anomaly),
        smooth: true,
        showSymbol: false,
        lineStyle: { color: "#EF4444", width: 2 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(239,68,68,0.1)" },
              { offset: 1, color: "rgba(239,68,68,0)" },
            ],
          },
        },
      },
      {
        name: "Baseline",
        type: "line",
        data: data.map((d) => d.baseline),
        lineStyle: { color: "#71717A", width: 1, type: "dashed" },
        showSymbol: false,
      },
    ],
    animation: true,
    animationDuration: 1500,
    animationEasing: "cubicOut",
  };

  return <ReactECharts option={option} style={{ height: 280 }} />;
}
