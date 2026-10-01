"use client";

import { useMemo, useRef, useState } from "react";
import type { PricePoint } from "../../lib/usePriceHistory";
import { fmtSpot } from "../../lib/pricing";

interface Props {
  history: PricePoint[];
  spot: number;
  vol: number;
  target: number;
  targetDays: number;
  onChange: (target: number) => void;
  width?: number;
  height?: number;
}

/**
 * Recent spot on the left, a ±1σ/±2σ projection cone out to the target
 * date on the right, and a horizontal target marker that can be dragged
 * with the pointer or moved with the arrow keys (Shift for bigger steps).
 * The y-range depends only on spot/vol/history — never on the target — so
 * it doesn't rescale under the pointer mid-drag.
 */
export function TargetPriceChart({ history, spot, vol, target, targetDays, onChange, width = 420, height = 160 }: Props) {
  const PAD = { t: 10, r: 64, b: 18, l: 8 };
  const W = width - PAD.l - PAD.r;
  const H = height - PAD.t - PAD.b;
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);

  const geo = useMemo(() => {
    const sd = vol * Math.sqrt(Math.max(targetDays, 1) / 365);
    const prices = history.map(p => p.price);
    const lo = Math.min(spot * Math.exp(-2.5 * sd), ...prices);
    const hi = Math.max(spot * Math.exp(2.5 * sd), ...prices);
    const toY = (p: number) => H - ((p - lo) / (hi - lo)) * H;
    const histW = W * 0.45;
    const histPath = history.length > 1
      ? history.map((p, i) => `${i ? "L" : "M"}${((i / (history.length - 1)) * histW).toFixed(1)},${toY(p.price).toFixed(1)}`).join(" ")
      : `M0,${toY(spot).toFixed(1)} L${histW.toFixed(1)},${toY(spot).toFixed(1)}`;
    const cone = (k: number) =>
      `M${histW},${toY(spot)} L${W},${toY(spot * Math.exp(k * sd))} L${W},${toY(spot * Math.exp(-k * sd))} Z`;
    return { lo, hi, toY, histW, histPath, cone1: cone(1), cone2: cone(2) };
  }, [history, spot, vol, targetDays, W, H]);

  const clamp = (p: number) => Math.min(geo.hi, Math.max(geo.lo, p));
  const fromClientY = (clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.height === 0) return target;
    const y = ((clientY - rect.top) / rect.height) * height - PAD.t;
    return clamp(geo.lo + (1 - y / H) * (geo.hi - geo.lo));
  };
  const round = (p: number) => +p.toPrecision(6);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.05 : 0.005;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") onChange(round(clamp(target * (1 + step))));
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") onChange(round(clamp(target * (1 - step))));
    else return;
    e.preventDefault();
  };

  const ty = geo.toY(clamp(target));
  const up = target >= spot;

  return (
    <svg ref={svgRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      style={{ touchAction: "none", cursor: dragging ? "grabbing" : "ns-resize", display: "block" }}
      onPointerDown={e => { (e.target as Element).setPointerCapture?.(e.pointerId); setDragging(true); onChange(round(fromClientY(e.clientY))); }}
      onPointerMove={e => { if (dragging) onChange(round(fromClientY(e.clientY))); }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}>
      <g transform={`translate(${PAD.l},${PAD.t})`}>
        <rect x={0} y={0} width={W} height={H} fill="none" stroke="rgba(255,255,255,0.06)" />
        <path d={geo.cone2} fill="rgba(181,150,101,0.06)" />
        <path d={geo.cone1} fill="rgba(181,150,101,0.12)" />
        <path d={geo.histPath} fill="none" stroke="var(--text-mid)" strokeWidth={1.5} />
        <line x1={geo.histW} y1={0} x2={geo.histW} y2={H} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
        <text x={geo.histW} y={H + 12} textAnchor="middle" fontSize={9} fill="var(--text-lo)">now</text>
        <text x={W} y={H + 12} textAnchor="end" fontSize={9} fill="var(--text-lo)">+{targetDays}D</text>
        <g role="slider" tabIndex={0} aria-label="Target price" aria-valuemin={round(geo.lo)} aria-valuemax={round(geo.hi)}
          aria-valuenow={round(target)} aria-valuetext={fmtSpot(target)} onKeyDown={onKeyDown} style={{ outline: "none" }}>
          <line x1={0} y1={ty} x2={W} y2={ty} stroke={up ? "var(--call)" : "var(--put)"} strokeWidth={1.5} strokeDasharray="5 3" />
          <rect x={W - 6} y={ty - 6} width={12} height={12} fill={up ? "var(--call)" : "var(--put)"} />
          <text x={W + 8} y={ty} dominantBaseline="middle" fontSize={10} fontFamily="var(--font-mono)" fill="var(--text-hi)">
            {fmtSpot(target)}
          </text>
        </g>
        <text x={W + 8} y={geo.toY(spot)} dominantBaseline="middle" fontSize={9} fontFamily="var(--font-mono)" fill="var(--text-lo)">
          spot
        </text>
      </g>
    </svg>
  );
}
