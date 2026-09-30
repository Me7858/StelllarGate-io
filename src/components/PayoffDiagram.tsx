"use client";

import { combinedPayoffSeries, type PricedLeg } from "../lib/payoff";

export interface PayoffDiagramProps {
  legs: PricedLeg[];
  spot?: number;
  width?: number;
  height?: number;
  title?: string;
}

export function PayoffDiagram({
  legs,
  spot = 100,
  width = 520,
  height = 220,
  title = "Payoff",
}: PayoffDiagramProps) {
  const low = Math.max(0, spot * 0.6);
  const high = spot * 1.6;
  const series = combinedPayoffSeries(legs, low, high, 200);
  const values = series.map((pt) => pt.p);
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 0);
  const pad = Math.max(10, (maxValue - minValue || 1) * 0.2);
  const range = maxValue - minValue || 1;

  const toPoint = (pt: { s: number; p: number }, index: number) => {
    const x = 30 + ((pt.s - low) / (high - low || 1)) * (width - 60);
    const y = height - 24 - ((pt.p - (minValue - pad)) / (range + pad * 2 || 1)) * (height - 50);
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  };

  const points = series.map((pt, idx) => toPoint(pt, idx)).join(" ");
  const zeroY = height - 24 - ((0 - (minValue - pad)) / (range + pad * 2 || 1)) * (height - 50);

  return (
    <div style={{ width, background: "var(--bg-raised)", border: "1px solid var(--border-default)", borderRadius: 12, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--text-lo)" }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--text-mid)" }}>Spot {spot.toFixed(2)}</div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Payoff diagram" style={{ width: "100%", height: "auto", display: "block" }}>
        <g>
          <line x1="30" x2={width - 20} y1={height - 24} y2={height - 24} stroke="var(--border-default)" />
          <line x1="30" x2="30" y1="18" y2={height - 24} stroke="var(--border-default)" />
          <line x1="30" x2={width - 20} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
          <path d={points} fill="none" stroke="var(--brand)" strokeWidth="2.5" />
        </g>
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-lo)", fontSize: 10 }}>
        <span>{low.toFixed(0)}</span>
        <span>{spot.toFixed(0)}</span>
        <span>{high.toFixed(0)}</span>
      </div>
    </div>
  );
}
