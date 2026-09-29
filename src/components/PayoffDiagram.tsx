"use client";

import { useMemo, useState } from "react";
import { smileVol } from "../lib/pricing";
import { combinedPnl, markToModelPnl, type PricedLeg } from "../lib/payoff";

interface PayoffDiagramProps {
  spot: number;
  strike: number;
  premium: number;
  isCall: boolean;
  /** True for a written/short position — mirrors the payoff curve (writer's P&L is the buyer's, negated). */
  short?: boolean;
  contracts?: number;
  width?: number;
  height?: number;
  compact?: boolean;
  /** When set, enable today / T+n / expiry mark-to-model overlays (#33). */
  expiryDays?: number;
  baseVol?: number;
  iv?: number;
}

export function PayoffDiagram({
  spot,
  strike,
  premium,
  isCall,
  short = false,
  contracts = 1,
  width = 340,
  height = 180,
  compact = false,
  expiryDays,
  baseVol = 0.5,
  iv,
}: PayoffDiagramProps) {
  const PAD = compact ? { t: 8, r: 8, b: 20, l: 40 } : { t: 16, r: 16, b: 28, l: 52 };
  const W = width  - PAD.l - PAD.r;
  const H = height - PAD.t - PAD.b;
  const timeAware = expiryDays != null && expiryDays > 0;
  const [daysForward, setDaysForward] = useState(0);
  const [ivShiftPct, setIvShiftPct] = useState(0);

  const leg: PricedLeg = useMemo(() => ({
    side: isCall ? "call" : "put",
    action: short ? "sell" : "buy",
    strike,
    contracts,
    expiryDays: expiryDays ?? 0,
    iv: iv ?? smileVol(baseVol, strike / Math.max(spot, 1e-9)),
    greeks: { premium, delta: 0, gamma: 0, theta: 0, vega: 0, iv: iv ?? 0 },
  }), [isCall, short, strike, contracts, expiryDays, iv, baseVol, spot, premium]);

  const data = useMemo(() => {
    const lo = spot * 0.65;
    const hi = spot * 1.35;
    const range = hi - lo;
    const ivShift = ivShiftPct / 100;
    const steps = 200;

    const pnlExpiry = (s: number) => combinedPnl([leg], s);
    const ptsExpiry = Array.from({ length: steps + 1 }, (_, i) => {
      const s = lo + (range * i) / steps;
      return { s, p: pnlExpiry(s) };
    });
    const ptsToday = timeAware
      ? Array.from({ length: steps + 1 }, (_, i) => {
          const s = lo + (range * i) / steps;
          return { s, p: markToModelPnl([leg], s, 0, ivShift, baseVol) };
        })
      : [];
    const ptsFwd = timeAware
      ? Array.from({ length: steps + 1 }, (_, i) => {
          const s = lo + (range * i) / steps;
          return { s, p: markToModelPnl([leg], s, daysForward, ivShift, baseVol) };
        })
      : [];

    const all = [...ptsExpiry, ...ptsToday, ...ptsFwd];
    const breakeven = isCall ? strike + premium : strike - premium;
    const maxPnl = all.reduce((m, pt) => Math.max(m, pt.p), 0);
    const worstPnl = all.reduce((m, pt) => Math.min(m, pt.p), 0);
    const minPnl = Math.min(worstPnl * 1.3, -premium * contracts * 1.2);
    const yRange = Math.max(maxPnl * 1.2, premium * 2) - minPnl;

    const toX = (s: number) => ((s - lo) / range) * W;
    const toY = (p: number) => H - ((p - minPnl) / yRange) * H;
    const zeroY = toY(0);
    const pathOf = (pts: { s: number; p: number }[]) =>
      pts.map((pt, i) => `${i === 0 ? "M" : "L"}${toX(pt.s).toFixed(1)},${toY(pt.p).toFixed(1)}`).join(" ");

    const profitArea = ptsExpiry.map(pt => ({ x: toX(pt.s), y: toY(Math.max(0, pt.p)) }));
    const lossArea = ptsExpiry.map(pt => ({ x: toX(pt.s), y: toY(Math.min(0, pt.p)) }));
    const profitPath = profitArea
      .map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
      .join(" ") + ` L${toX(hi).toFixed(1)},${zeroY.toFixed(1)} L${toX(lo).toFixed(1)},${zeroY.toFixed(1)} Z`;
    const lossPath = lossArea
      .map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
      .join(" ") + ` L${toX(hi).toFixed(1)},${zeroY.toFixed(1)} L${toX(lo).toFixed(1)},${zeroY.toFixed(1)} Z`;

    const yLabels = [-premium * contracts, 0, premium * contracts * 2].map(v => ({
      value: v,
      y: toY(v),
      label: v === 0 ? "0" : v > 0 ? `+$${v.toFixed(2)}` : `−$${Math.abs(v).toFixed(2)}`,
    }));
    const xLabels = [lo, spot, strike, hi].filter((v, i, a) => {
      const dists = a.map(x => Math.abs(x - v));
      return !dists.some((d, j) => j < i && d < range * 0.08);
    }).map(s => ({
      value: s,
      x: toX(s),
      label: s >= 1 ? `$${s.toFixed(2)}` : `$${s.toFixed(4)}`,
    }));

    return {
      pathData: pathOf(ptsExpiry),
      todayPath: pathOf(ptsToday),
      forwardPath: pathOf(ptsFwd),
      profitPath, lossPath, zeroY,
      spotX: toX(spot), strikeX: toX(strike), breakevenX: toX(breakeven),
      breakevenInRange: breakeven >= lo && breakeven <= hi,
      yLabels, xLabels, breakeven, maxPnl,
    };
  }, [spot, strike, premium, isCall, contracts, W, H, leg, timeAware, daysForward, ivShiftPct, baseVol]);

  const color = isCall ? "#5C9A6B" : "#B65640";

  return (
    <div style={{ width }}>
      {timeAware && !compact && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 9, color: "var(--text-lo)", minWidth: 48 }}>T+{daysForward}d</span>
            <input type="range" min={0} max={expiryDays} value={daysForward}
              onChange={e => setDaysForward(Number(e.target.value))} style={{ flex: 1 }} aria-label="Days forward" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 9, color: "var(--text-lo)", minWidth: 48 }}>IV</span>
            <input type="range" min={-50} max={100} value={ivShiftPct}
              onChange={e => setIvShiftPct(Number(e.target.value))} style={{ flex: 1 }} aria-label="IV shift" />
            <span className="num" style={{ fontSize: 9, color: "var(--text-mid)" }}>{ivShiftPct >= 0 ? "+" : ""}{ivShiftPct}%</span>
          </div>
        </div>
      )}
      <div style={{ width, height }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
          <defs>
            <clipPath id="chart-clip"><rect x={PAD.l} y={PAD.t} width={W} height={H} /></clipPath>
            <linearGradient id="profit-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(92,154,107,0.25)" />
              <stop offset="100%" stopColor="rgba(92,154,107,0.04)" />
            </linearGradient>
            <linearGradient id="loss-grad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="rgba(182,86,64,0.25)" />
              <stop offset="100%" stopColor="rgba(182,86,64,0.04)" />
            </linearGradient>
          </defs>
          <g transform={`translate(${PAD.l}, ${PAD.t})`}>
            {data.yLabels.map(l => (
              <line key={l.value} x1={0} y1={l.y} x2={W} y2={l.y}
                stroke={l.value === 0 ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)"}
                strokeWidth={l.value === 0 ? 1 : 0.5}
                strokeDasharray={l.value === 0 ? "none" : "3 4"}
              />
            ))}
            <path d={data.lossPath} fill="url(#loss-grad)" clipPath="url(#chart-clip)" />
            <path d={data.profitPath} fill="url(#profit-grad)" clipPath="url(#chart-clip)" />
            <line x1={data.spotX} y1={0} x2={data.spotX} y2={H} stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="3 3" />
            <line x1={data.strikeX} y1={0} x2={data.strikeX} y2={H} stroke="rgba(181,150,101,0.4)" strokeWidth={1} strokeDasharray="4 3" />
            {data.breakevenInRange && (
              <line x1={data.breakevenX} y1={0} x2={data.breakevenX} y2={H} stroke={color} strokeWidth={1} strokeOpacity={0.5} />
            )}
            {timeAware && data.todayPath && (
              <path d={data.todayPath} fill="none" stroke="#8B9DC3" strokeWidth={1.25} strokeDasharray="4 3" clipPath="url(#chart-clip)" />
            )}
            {timeAware && daysForward > 0 && data.forwardPath && (
              <path d={data.forwardPath} fill="none" stroke="#B59665" strokeWidth={1.5} clipPath="url(#chart-clip)" />
            )}
            <path d={data.pathData} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" clipPath="url(#chart-clip)" />
            {data.yLabels.map(l => (
              <text key={l.value} x={-6} y={l.y} textAnchor="end" dominantBaseline="middle" fontSize={9} fontFamily="var(--font-mono)"
                fill={l.value === 0 ? "rgba(255,255,255,0.4)" : l.value > 0 ? "rgba(92,154,107,0.7)" : "rgba(182,86,64,0.7)"}>
                {l.label}
              </text>
            ))}
            {!compact && data.xLabels.map(l => (
              <text key={l.value} x={l.x} y={H + 14} textAnchor="middle" fontSize={8} fontFamily="var(--font-mono)" fill="rgba(255,255,255,0.25)">
                {l.label}
              </text>
            ))}
            <text x={data.strikeX} y={-6} textAnchor="middle" fontSize={9} fontFamily="var(--font-mono)" fill="rgba(181,150,101,0.8)">K</text>
            <text x={data.spotX} y={-6} textAnchor="middle" fontSize={9} fontFamily="var(--font-mono)" fill="rgba(255,255,255,0.5)">S</text>
            {!compact && data.breakevenInRange && (
              <text x={data.breakevenX + 3} y={data.zeroY - 5} textAnchor="start" fontSize={8} fontFamily="var(--font-mono)" fill={color} fillOpacity={0.7}>BE</text>
            )}
            <rect x={0} y={0} width={W} height={H} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
          </g>
        </svg>
        {!compact && (
          <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 4 }}>
            {[
              short
                ? { label: "Max gain", value: `+$${(premium * contracts).toFixed(2)}`, color: "#5C9A6B" }
                : { label: "Max loss", value: `−$${(premium * contracts).toFixed(2)}`, color: "#B65640" },
              { label: "Breakeven", value: data.breakeven >= 1 ? `$${data.breakeven.toFixed(2)}` : `$${data.breakeven.toFixed(4)}`, color: color },
            ].map(item => (
              <div key={item.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-lo)" }}>{item.label}</span>
                <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: item.color }}>{item.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
