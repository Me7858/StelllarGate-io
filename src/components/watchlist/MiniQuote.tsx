"use client";

import { fmtSpot } from "../../lib/pricing";
import type { SessionTick } from "../../lib/hooks/useSpotFeed";

export interface Quote {
  spot: number | null;
  /** Fractional change since the first tick this session, or null. */
  change: number | null;
  atmIv: number | null;
  ticks: SessionTick[];
}

export function Sparkline({ ticks, width = 64, height = 20 }: { ticks: SessionTick[]; width?: number; height?: number }) {
  if (ticks.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const prices = ticks.map(t => t.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const span = hi - lo || hi * 1e-4 || 1;
  const up = prices[prices.length - 1] >= prices[0];
  const d = prices
    .map((p, i) => `${i ? "L" : "M"}${((i / (prices.length - 1)) * width).toFixed(1)},${(1 + (1 - (p - lo) / span) * (height - 2)).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={d} fill="none" stroke={up ? "var(--call)" : "var(--put)"} strokeWidth={1.25} />
    </svg>
  );
}

export function MiniQuote({ quote }: { quote: Quote }) {
  const { spot, change, atmIv, ticks } = quote;
  return (
    <>
      <span className="num" style={{ fontSize: 12, color: "var(--text-hi)", minWidth: 84, textAlign: "right" }}>
        {spot === null ? "—" : fmtSpot(spot)}
      </span>
      <span className="num" title="Change since this session's first price" style={{
        fontSize: 11, minWidth: 56, textAlign: "right",
        color: change === null ? "var(--text-lo)" : change >= 0 ? "var(--call)" : "var(--put)",
      }}>
        {change === null ? "—" : `${change >= 0 ? "+" : "−"}${Math.abs(change * 100).toFixed(2)}%`}
      </span>
      <span className="num" style={{ fontSize: 11, color: "var(--brand)", minWidth: 40, textAlign: "right" }}>
        {atmIv === null ? "—" : `${Math.round(atmIv * 100)}%`}
      </span>
      <Sparkline ticks={ticks} />
    </>
  );
}
