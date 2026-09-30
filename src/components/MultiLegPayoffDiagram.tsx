"use client";

import { useMemo } from "react";
import { useQuant } from "../lib/hooks/useQuant";
import type { PricedLeg } from "../lib/payoff";

interface Props {
  legs: PricedLeg[];
  spot: number;
  width?: number;
  height?: number;
}

export function MultiLegPayoffDiagram({ legs, spot, width = 340, height = 180 }: Props) {
  const PAD = { t: 16, r: 16, b: 28, l: 52 };
  const W = width - PAD.l - PAD.r;
  const H = height - PAD.t - PAD.b;

  const lo = spot * 0.65;
  const hi = spot * 1.35;

  const { data: series } = useQuant(
    "payoffSeries",
    legs.length > 0 ? { legs, loSpot: lo, hiSpot: hi } : null,
  );

  const data = useMemo(() => {
    if (!series || series.length === 0) return null;

    const range = hi - lo;
    const maxPnl = series.reduce((m, pt) => Math.max(m, pt.p), 0);
    const minPnl = series.reduce((m, pt) => Math.min(m, pt.p), 0);
    const yRange = Math.max(maxPnl - minPnl, 0.01) * 1.3;
    const yMid = (maxPnl + minPnl) / 2;
    const yLo = yMid - yRange / 2;

    const toX = (s: number) => ((s - lo) / range) * W;
    const toY = (p: number) => H - ((p - yLo) / yRange) * H;
    const zeroY = toY(0);

    const pathData = series.map((pt, i) => `${i === 0 ? "M" : "L"}${toX(pt.s).toFixed(1)},${toY(pt.p).toFixed(1)}`).join(" ");
    const profitPath = series.map(pt => ({ x: toX(pt.s), y: toY(Math.max(0, pt.p)) }))
      .map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ")
      + ` L${toX(hi).toFixed(1)},${zeroY.toFixed(1)} L${toX(lo).toFixed(1)},${zeroY.toFixed(1)} Z`;
    const lossPath = series.map(pt => ({ x: toX(pt.s), y: toY(Math.min(0, pt.p)) }))
      .map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ")
      + ` L${toX(hi).toFixed(1)},${zeroY.toFixed(1)} L${toX(lo).toFixed(1)},${zeroY.toFixed(1)} Z`;

    return {
      lo, hi, pathData, profitPath, lossPath, zeroY, spotX: toX(spot), maxPnl, minPnl,
      yLabels: [minPnl, 0, maxPnl].map(v => ({ v, y: toY(v) })),
    };
  }, [series, lo, hi, W, H, spot]);

  if (!data) {
    return <div style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontSize: 10, color: "var(--text-lo)" }}>Computing…</span>
    </div>;
  }

  return (
    <div style={{ width, height }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <clipPath id="ml-chart-clip"><rect x={PAD.l} y={PAD.t} width={W} height={H} /></clipPath>
        </defs>
        <g transform={`translate(${PAD.l}, ${PAD.t})`}>
          <line x1={0} y1={data.zeroY} x2={W} y2={data.zeroY} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
          <path d={data.lossPath} fill="rgba(182,86,64,0.15)" clipPath="url(#ml-chart-clip)" />
          <path d={data.profitPath} fill="rgba(92,154,107,0.15)" clipPath="url(#ml-chart-clip)" />
          <line x1={data.spotX} y1={0} x2={data.spotX} y2={H} stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="3 3" />
          <path d={data.pathData} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" clipPath="url(#ml-chart-clip)" />
          {data.yLabels.map(l => (
            <text key={l.v} x={-6} y={l.y} textAnchor="end" dominantBaseline="middle" fontSize={9} fontFamily="var(--font-mono)"
              fill={l.v === 0 ? "rgba(255,255,255,0.4)" : l.v > 0 ? "rgba(92,154,107,0.7)" : "rgba(182,86,64,0.7)"}>
              {l.v === 0 ? "0" : `${l.v > 0 ? "+" : "−"}$${Math.abs(l.v).toFixed(2)}`}
            </text>
          ))}
          <text x={data.spotX} y={-6} textAnchor="middle" fontSize={9} fontFamily="var(--font-mono)" fill="rgba(255,255,255,0.5)">S</text>
          <rect x={0} y={0} width={W} height={H} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
        </g>
      </svg>
    </div>
  );
}
