"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Candle, CandleInterval } from "../lib/candles";
import {
  computeEma,
  computeSma,
  periodsPerYearFor,
  realizedVol,
} from "../lib/candles";

export interface TradeMarker {
  time: number;
  price: number;
  side: "entry" | "exit";
  label?: string;
}

interface Props {
  candles: Candle[];
  interval: CandleInterval;
  onIntervalChange: (tf: CandleInterval) => void;
  limitedHistory?: boolean;
  atmIv?: number;
  strikeLines?: number[];
  markers?: TradeMarker[];
  height?: number;
  width?: number;
}

const TIMEFRAMES: CandleInterval[] = ["1m", "5m", "1h", "1D"];

/**
 * Candlestick / line spot chart with timeframes, SMA/EMA, realized vol,
 * strike overlays, and trade markers. Zoom/pan via wheel + drag; crosshair
 * on pointer move. Themed with zn-* / CSS variables (no external chart lib
 * required at runtime — stays inside the terminal bundle budget).
 */
export function SpotPriceChart({
  candles,
  interval,
  onIntervalChange,
  limitedHistory,
  atmIv,
  strikeLines = [],
  markers = [],
  height = 160,
  width = 212,
}: Props) {
  const [mode, setMode] = useState<"candle" | "line">("candle");
  const [view, setView] = useState({ start: 0, end: 1 }); // fraction of series
  const [cross, setCross] = useState<{ i: number; x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; start: number; end: number } | null>(null);

  const closes = useMemo(() => candles.map(c => c.close), [candles]);
  const rvSeries = useMemo(
    () => realizedVol(closes, 20, periodsPerYearFor(interval)),
    [closes, interval]
  );
  const lastRv = useMemo(() => {
    for (let i = rvSeries.length - 1; i >= 0; i--) {
      if (rvSeries[i] != null) return rvSeries[i] as number;
    }
    return null;
  }, [rvSeries]);

  const sma20 = useMemo(() => computeSma(closes, 20), [closes]);
  const ema20 = useMemo(() => computeEma(closes, 20), [closes]);

  useEffect(() => {
    setView({ start: 0, end: 1 });
  }, [interval, candles.length < 2]);

  const PAD = { t: 8, r: 8, b: 16, l: 8 };
  const W = width - PAD.l - PAD.r;
  const H = height - PAD.t - PAD.b;

  const visible = useMemo(() => {
    if (candles.length === 0) return [];
    const a = Math.floor(view.start * candles.length);
    const b = Math.max(a + 1, Math.ceil(view.end * candles.length));
    return candles.slice(a, b).map((c, i) => ({ ...c, idx: a + i }));
  }, [candles, view]);

  const priceExt = useMemo(() => {
    if (visible.length === 0) return { lo: 0, hi: 1 };
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of visible) {
      lo = Math.min(lo, c.low);
      hi = Math.max(hi, c.high);
    }
    for (const k of strikeLines) {
      lo = Math.min(lo, k);
      hi = Math.max(hi, k);
    }
    if (!Number.isFinite(lo)) return { lo: 0, hi: 1 };
    const pad = (hi - lo) * 0.05 || hi * 0.001;
    return { lo: lo - pad, hi: hi + pad };
  }, [visible, strikeLines]);

  const toX = (i: number) => {
    const n = Math.max(1, visible.length - 1);
    const local = i - (visible[0]?.idx ?? 0);
    return PAD.l + (local / n) * W;
  };
  const toY = (p: number) =>
    PAD.t + H - ((p - priceExt.lo) / (priceExt.hi - priceExt.lo || 1)) * H;

  const smaPath = useMemo(() => {
    const pts: string[] = [];
    for (const c of visible) {
      const v = sma20[c.idx];
      if (v == null) continue;
      pts.push(`${pts.length === 0 ? "M" : "L"}${toX(c.idx).toFixed(1)},${toY(v).toFixed(1)}`);
    }
    return pts.join(" ");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, sma20, priceExt]);

  const emaPath = useMemo(() => {
    const pts: string[] = [];
    for (const c of visible) {
      const v = ema20[c.idx];
      if (v == null) continue;
      pts.push(`${pts.length === 0 ? "M" : "L"}${toX(c.idx).toFixed(1)},${toY(v).toFixed(1)}`);
    }
    return pts.join(" ");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, ema20, priceExt]);

  const linePath = useMemo(() => {
    return visible
      .map((c, i) => `${i === 0 ? "M" : "L"}${toX(c.idx).toFixed(1)},${toY(c.close).toFixed(1)}`)
      .join(" ");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, priceExt]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const span = view.end - view.start;
    const next = Math.min(1, Math.max(0.05, span * (e.deltaY > 0 ? 1.15 : 0.85)));
    const mid = (view.start + view.end) / 2;
    let start = mid - next / 2;
    let end = mid + next / 2;
    if (start < 0) { end -= start; start = 0; }
    if (end > 1) { start -= end - 1; end = 1; }
    setView({ start: Math.max(0, start), end: Math.min(1, end) });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, start: view.start, end: view.end };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frac = Math.min(1, Math.max(0, (x - PAD.l) / W));
    const i = Math.min(
      visible.length - 1,
      Math.max(0, Math.round(frac * Math.max(0, visible.length - 1)))
    );
    if (visible[i]) {
      setCross({ i: visible[i].idx, x: toX(visible[i].idx), y: toY(visible[i].close) });
    }
    if (drag.current) {
      const dx = (e.clientX - drag.current.x) / W;
      const span = drag.current.end - drag.current.start;
      let start = drag.current.start - dx * span;
      let end = drag.current.end - dx * span;
      if (start < 0) { end -= start; start = 0; }
      if (end > 1) { start -= end - 1; end = 1; }
      setView({ start: Math.max(0, start), end: Math.min(1, end) });
    }
  };
  const onPointerUp = () => { drag.current = null; };

  const candleW = Math.max(2, W / Math.max(visible.length, 1) * 0.6);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-lo)" }}>
          Spot
        </span>
        <div style={{ display: "flex", gap: 2 }}>
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              type="button"
              onClick={() => onIntervalChange(tf)}
              style={{
                fontSize: 9, padding: "1px 5px", border: "none", cursor: "pointer",
                background: interval === tf ? "var(--atm-dim)" : "transparent",
                color: interval === tf ? "var(--atm)" : "var(--text-lo)",
              }}
            >
              {tf}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMode(m => (m === "candle" ? "line" : "candle"))}
            style={{
              fontSize: 9, padding: "1px 5px", border: "none", cursor: "pointer",
              color: "var(--text-lo)", background: "transparent",
            }}
          >
            {mode === "candle" ? "OHLC" : "Line"}
          </button>
        </div>
      </div>
      {limitedHistory && (
        <div style={{ fontSize: 9, color: "var(--atm)", marginBottom: 4 }}>
          Limited history · seeded from live feed (GET /api/v1/candles pending)
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        <span className="num" style={{ fontSize: 9, color: "var(--text-lo)" }}>
          RV(20) {lastRv != null ? `${(lastRv * 100).toFixed(1)}%` : "—"}
        </span>
        {atmIv != null && (
          <span className="num" style={{ fontSize: 9, color: "var(--brand)" }}>
            IV {(atmIv * 100).toFixed(1)}%
          </span>
        )}
        {cross && candles[cross.i] && (
          <span className="num" style={{ fontSize: 9, color: "var(--text-mid)" }}>
            {candles[cross.i].close.toPrecision(5)}
          </span>
        )}
      </div>
      {candles.length < 2 ? (
        <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--text-lo)" }}>
          Waiting for ticks…
        </div>
      ) : (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => { setCross(null); drag.current = null; }}
          style={{ touchAction: "none", cursor: "crosshair", display: "block" }}
          role="img"
          aria-label="Spot price candlestick chart"
        >
          <rect x={0} y={0} width={width} height={height} fill="var(--bg)" />
          <rect x={PAD.l} y={PAD.t} width={W} height={H} fill="none" stroke="rgba(255,255,255,0.06)" />

          {strikeLines.map(k => (
            <g key={k}>
              <line x1={PAD.l} x2={PAD.l + W} y1={toY(k)} y2={toY(k)} stroke="rgba(181,150,101,0.55)" strokeDasharray="4 3" />
              <text x={PAD.l + W - 2} y={toY(k) - 2} textAnchor="end" fontSize={8} fill="var(--atm)">K</text>
            </g>
          ))}

          {mode === "candle"
            ? visible.map(c => {
                const x = toX(c.idx);
                const up = c.close >= c.open;
                const color = up ? "var(--call)" : "var(--put)";
                return (
                  <g key={c.time}>
                    <line x1={x} x2={x} y1={toY(c.high)} y2={toY(c.low)} stroke={color} strokeWidth={1} />
                    <rect
                      x={x - candleW / 2}
                      y={toY(Math.max(c.open, c.close))}
                      width={candleW}
                      height={Math.max(1, Math.abs(toY(c.open) - toY(c.close)))}
                      fill={color}
                    />
                  </g>
                );
              })
            : <path d={linePath} fill="none" stroke="var(--brand)" strokeWidth={1.5} />}

          {smaPath && <path d={smaPath} fill="none" stroke="var(--text-mid)" strokeWidth={1} opacity={0.7} />}
          {emaPath && <path d={emaPath} fill="none" stroke="var(--call)" strokeWidth={1} opacity={0.8} />}

          {markers.map((m, i) => {
            const idx = candles.findIndex(c => c.time >= m.time);
            if (idx < 0) return null;
            const c = candles[idx];
            if (c.idx !== undefined || true) {
              const inView = visible.some(v => v.idx === idx);
              if (!inView) return null;
            }
            const x = toX(idx);
            const y = toY(m.price || candles[idx].close);
            const color = m.side === "entry" ? "var(--call)" : "var(--put)";
            return (
              <g key={i}>
                <polygon
                  points={
                    m.side === "entry"
                      ? `${x},${y + 6} ${x - 4},${y} ${x + 4},${y}`
                      : `${x},${y - 6} ${x - 4},${y} ${x + 4},${y}`
                  }
                  fill={color}
                />
              </g>
            );
          })}

          {cross && (
            <g>
              <line x1={cross.x} x2={cross.x} y1={PAD.t} y2={PAD.t + H} stroke="rgba(245,238,220,0.2)" />
              <line x1={PAD.l} x2={PAD.l + W} y1={cross.y} y2={cross.y} stroke="rgba(245,238,220,0.2)" />
              <circle cx={cross.x} cy={cross.y} r={2.5} fill="var(--atm)" />
            </g>
          )}
        </svg>
      )}
    </div>
  );
}
