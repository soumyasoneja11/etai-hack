"use client";

import ReactECharts from "echarts-for-react";

interface NetworkChartProps {
  data: Array<{ time: string; bandwidth: number; packets: number; connections: number }>;
}

export default function NetworkChart({ data }: NetworkChartProps) {
  const option = {
    backgroundColor: "transparent",
    grid: {
      top: 10,
      right: 10,
      bottom: 30,
      left: 50,
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#17181C",
      borderColor: "rgba(255,255,255,0.06)",
      borderWidth: 1,
      textStyle: { color: "#F5F5F5", fontSize: 11 },
    },
    xAxis: {
      type: "category",
      data: data.map((d) => d.time),
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } },
      axisLabel: { color: "#71717A", fontSize: 10, interval: 4 },
      axisTick: { show: false },
    },
    yAxis: [
      {
        type: "value",
        name: "Mbps",
        nameTextStyle: { color: "#71717A", fontSize: 9 },
        axisLine: { show: false },
        axisLabel: { color: "#71717A", fontSize: 10 },
        splitLine: { lineStyle: { color: "rgba(255,255,255,0.04)" } },
      },
      {
        type: "value",
        name: "Connections",
        nameTextStyle: { color: "#71717A", fontSize: 9 },
        axisLine: { show: false },
        axisLabel: { color: "#71717A", fontSize: 10 },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "Bandwidth (Mbps)",
        type: "line",
        yAxisIndex: 0,
        data: data.map((d) => Math.round(d.bandwidth)),
        smooth: true,
        showSymbol: false,
        lineStyle: { color: "#3B82F6", width: 2 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(59,130,246,0.15)" },
              { offset: 1, color: "rgba(59,130,246,0)" },
            ],
          },
        },
      },
      {
        name: "Active Connections",
        type: "line",
        yAxisIndex: 1,
        data: data.map((d) => Math.round(d.connections)),
        smooth: true,
        showSymbol: false,
        lineStyle: { color: "#22C55E", width: 2 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(34,197,94,0.1)" },
              { offset: 1, color: "rgba(34,197,94,0)" },
            ],
          },
        },
      },
    ],
    animation: true,
    animationDuration: 1500,
    animationEasing: "cubicOut",
  };

  return <ReactECharts option={option} style={{ height: 280 }} />;
}
