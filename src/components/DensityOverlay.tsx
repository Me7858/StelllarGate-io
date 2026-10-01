"use client";

import { useMemo } from "react";
import { densitySeries, expectedMove, isDegenerate, type DistributionInputs } from "../lib/probability";

interface Props {
  dist: DistributionInputs;
  /** Price range of the host chart's x axis. */
  lo: number;
  hi: number;
  /** Plot-area size of the host chart (inside its padding). */
  W: number;
  H: number;
  /** Tallest point of the density curve, as a fraction of the plot height. */
  heightFrac?: number;
}

/**
 * Lognormal terminal density plus shaded ±1σ/±2σ bands, drawn inside a
 * payoff chart's plot-area <g> (same linear lo→hi x scale). Renders
 * behind the payoff curve, so hosts should place it before their path.
 */
export function DensityOverlay({ dist, lo, hi, W, H, heightFrac = 0.32 }: Props) {
  const data = useMemo(() => {
    if (isDegenerate(dist) || hi <= lo) return null;
    const toX = (s: number) => Math.min(W, Math.max(0, ((s - lo) / (hi - lo)) * W));
    const series = densitySeries(dist, lo, hi);
    const peak = series.reduce((m, p) => Math.max(m, p.density), 0);
    const toY = (v: number) => H - (peak > 0 ? (v / peak) * H * heightFrac : 0);
    const area = series.map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.s).toFixed(1)},${toY(p.density).toFixed(1)}`).join(" ")
      + ` L${W.toFixed(1)},${H} L0,${H} Z`;
    const band = (n: number) => {
      const m = expectedMove(dist, n);
      return { x0: toX(m.lower), x1: toX(m.upper) };
    };
    return { area, b1: band(1), b2: band(2) };
  }, [dist, lo, hi, W, H, heightFrac]);

  if (!data) return null;
  const { area, b1, b2 } = data;
  return (
    <g data-testid="density-overlay" pointerEvents="none">
      <rect x={b2.x0} y={0} width={Math.max(0, b2.x1 - b2.x0)} height={H} fill="rgba(243,238,227,0.035)" />
      <rect x={b1.x0} y={0} width={Math.max(0, b1.x1 - b1.x0)} height={H} fill="rgba(243,238,227,0.05)" />
      <path d={area} fill="rgba(181,150,101,0.14)" stroke="rgba(181,150,101,0.55)" strokeWidth={1} />
      {[b2.x0, b2.x1].map((x, i) => (
        <line key={`b2-${i}`} x1={x} y1={0} x2={x} y2={H} stroke="rgba(243,238,227,0.12)" strokeDasharray="1 3" />
      ))}
      {[b1.x0, b1.x1].map((x, i) => (
        <line key={`b1-${i}`} x1={x} y1={0} x2={x} y2={H} stroke="rgba(243,238,227,0.2)" strokeDasharray="2 2" />
      ))}
      <text x={b1.x1 + 2} y={H - 4} fontSize={8} fontFamily="var(--font-mono)" fill="rgba(243,238,227,0.45)">1σ</text>
      {b2.x1 < W - 10 && (
        <text x={b2.x1 + 2} y={H - 4} fontSize={8} fontFamily="var(--font-mono)" fill="rgba(243,238,227,0.3)">2σ</text>
      )}
    </g>
  );
}

/** Small pressed/unpressed toggle, positioned over a chart's top-right corner by the host. */
export function DensityToggle({ on, onToggle, style }: { on: boolean; onToggle: () => void; style?: React.CSSProperties }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      title="Overlay the lognormal probability density with ±1σ/±2σ bands"
      style={{
        position: "absolute", fontSize: 9, padding: "1px 6px", cursor: "pointer",
        background: on ? "var(--atm-dim)" : "var(--bg-overlay)",
        color: on ? "var(--atm)" : "var(--text-lo)",
        border: "1px solid var(--border-default)", fontFamily: "var(--font-sans)",
        ...style,
      }}
    >
      Prob. {on ? "on" : "off"}
    </button>
  );
}
