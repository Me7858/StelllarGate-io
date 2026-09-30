"use client";

import { useMemo } from "react";
import { combinedPayoffSeries, type PricedLeg } from "../../lib/payoff";

/** Label-free payoff sparkline for a results row, with spot and target marked. */
export function PayoffThumbnail({ legs, spot, target, width = 120, height = 40 }: {
  legs: PricedLeg[]; spot: number; target: number; width?: number; height?: number;
}) {
  const d = useMemo(() => {
    const lo = Math.min(spot, target) * 0.75;
    const hi = Math.max(spot, target) * 1.25;
    const series = combinedPayoffSeries(legs, lo, hi, 60);
    const min = Math.min(0, ...series.map(p => p.p));
    const max = Math.max(0, ...series.map(p => p.p));
    const span = Math.max(max - min, 1e-9);
    const x = (s: number) => ((s - lo) / (hi - lo)) * width;
    const y = (p: number) => 2 + (1 - (p - min) / span) * (height - 4);
    return {
      path: series.map((p, i) => `${i ? "L" : "M"}${x(p.s).toFixed(1)},${y(p.p).toFixed(1)}`).join(" "),
      zeroY: y(0), spotX: x(spot), targetX: x(target),
    };
  }, [legs, spot, target, width, height]);

  return (
    <svg width={width} height={height} aria-hidden="true">
      <line x1={0} x2={width} y1={d.zeroY} y2={d.zeroY} stroke="rgba(255,255,255,0.12)" />
      <line x1={d.spotX} x2={d.spotX} y1={0} y2={height} stroke="rgba(255,255,255,0.2)" strokeDasharray="2 2" />
      <line x1={d.targetX} x2={d.targetX} y1={0} y2={height} stroke="var(--atm)" strokeDasharray="2 2" />
      <path d={d.path} fill="none" stroke="var(--brand)" strokeWidth={1.5} />
    </svg>
  );
}
