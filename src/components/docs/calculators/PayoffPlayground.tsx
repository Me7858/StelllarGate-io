"use client";

import React, { useState, useMemo } from "react";
import { combinedPnl, combinedPayoffSeries, netPremium, type PricedLeg } from "../../../lib/payoff";
import { bs, smileVol, MARKETS, fmtSpot, fmtN, fmtK } from "../../../lib/pricing";

interface StrategyTemplate {
  name: string;
  description: string;
  generateLegs: (spot: number, baseVol: number) => {
    side: "call" | "put";
    action: "buy" | "sell";
    strikeOffset: number; // multiplier of spot
    contracts: number;
  }[];
}

const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    name: "Long Call",
    description: "Bullish strategy with limited risk (premium paid) and unlimited upside.",
    generateLegs: () => [
      { side: "call", action: "buy", strikeOffset: 1.0, contracts: 10 },
    ],
  },
  {
    name: "Long Put",
    description: "Bearish strategy with limited risk and substantial profit potential if the price crashes.",
    generateLegs: () => [
      { side: "put", action: "buy", strikeOffset: 1.0, contracts: 10 },
    ],
  },
  {
    name: "Covered Call (Write)",
    description: "Generate yield by selling an OTM call against holding the underlying asset.",
    generateLegs: () => [
      { side: "call", action: "sell", strikeOffset: 1.08, contracts: 10 },
    ],
  },
  {
    name: "Cash-Secured Put",
    description: "Collect premium by committing to buy the asset at a discounted strike.",
    generateLegs: () => [
      { side: "put", action: "sell", strikeOffset: 0.92, contracts: 10 },
    ],
  },
  {
    name: "Bull Call Spread",
    description: "Moderately bullish. Buy lower strike call and sell higher strike call to reduce cost.",
    generateLegs: () => [
      { side: "call", action: "buy", strikeOffset: 0.98, contracts: 10 },
      { side: "call", action: "sell", strikeOffset: 1.08, contracts: 10 },
    ],
  },
  {
    name: "Bear Put Spread",
    description: "Moderately bearish. Buy higher strike put and sell lower strike put.",
    generateLegs: () => [
      { side: "put", action: "buy", strikeOffset: 1.02, contracts: 10 },
      { side: "put", action: "sell", strikeOffset: 0.92, contracts: 10 },
    ],
  },
  {
    name: "Long Straddle",
    description: "Volatility breakout play. Buy ATM call and ATM put, profiting from large moves in either direction.",
    generateLegs: () => [
      { side: "call", action: "buy", strikeOffset: 1.0, contracts: 10 },
      { side: "put", action: "buy", strikeOffset: 1.0, contracts: 10 },
    ],
  },
  {
    name: "Iron Condor",
    description: "Neutral range-bound strategy. Sell OTM put spread and OTM call spread to collect net credit.",
    generateLegs: () => [
      { side: "put", action: "buy", strikeOffset: 0.85, contracts: 10 },
      { side: "put", action: "sell", strikeOffset: 0.92, contracts: 10 },
      { side: "call", action: "sell", strikeOffset: 1.08, contracts: 10 },
      { side: "call", action: "buy", strikeOffset: 1.15, contracts: 10 },
    ],
  },
];

export function PayoffPlayground() {
  const [selectedAsset, setSelectedAsset] = useState<string>("XLM");
  const [customSpot, setCustomSpot] = useState<number>(0.1182);
  const [expiryDays, setExpiryDays] = useState<number>(30);
  const [activeTemplate, setActiveTemplate] = useState<string>("Bull Call Spread");

  const market = useMemo(() => MARKETS.find((m) => m.sym === selectedAsset), [selectedAsset]);
  const spot = selectedAsset === "CUSTOM" ? customSpot : market?.price ?? 0.1182;
  const baseVol = market?.vol ?? 0.82;
  const t = Math.max(0.0001, expiryDays / 365);

  const initialLegs = useMemo(() => {
    const tmpl = STRATEGY_TEMPLATES.find((t) => t.name === activeTemplate) || STRATEGY_TEMPLATES[0];
    return tmpl.generateLegs(spot, baseVol).map((cfg) => {
      const strike = Number((spot * cfg.strikeOffset).toFixed(spot < 1 ? 4 : 2));
      const moneyness = spot > 0 ? strike / spot : 1;
      const vol = smileVol(baseVol, moneyness);
      const greeks = bs(spot, strike, vol, t, cfg.side === "call");
      return {
        side: cfg.side,
        action: cfg.action,
        strike,
        contracts: cfg.contracts,
        greeks,
      } as PricedLeg;
    });
  }, [activeTemplate, spot, baseVol, t]);

  const [legs, setLegs] = useState<PricedLeg[]>(initialLegs);

  // Update legs whenever activeTemplate or spot or t changes
  const applyTemplate = (templateName: string) => {
    setActiveTemplate(templateName);
    const tmpl = STRATEGY_TEMPLATES.find((item) => item.name === templateName);
    if (!tmpl) return;
    const newLegs = tmpl.generateLegs(spot, baseVol).map((cfg) => {
      const strike = Number((spot * cfg.strikeOffset).toFixed(spot < 1 ? 4 : 2));
      const moneyness = spot > 0 ? strike / spot : 1;
      const vol = smileVol(baseVol, moneyness);
      const greeks = bs(spot, strike, vol, t, cfg.side === "call");
      return {
        side: cfg.side,
        action: cfg.action,
        strike,
        contracts: cfg.contracts,
        greeks,
      } as PricedLeg;
    });
    setLegs(newLegs);
  };

  const recomputeGreeks = (side: "call" | "put", strike: number): PricedLeg["greeks"] => {
    const moneyness = spot > 0 ? strike / spot : 1;
    const vol = smileVol(baseVol, moneyness);
    return bs(spot, strike, vol, t, side === "call");
  };

  const updateLeg = (index: number, updates: Partial<PricedLeg>) => {
    setActiveTemplate("Custom");
    setLegs((prev) =>
      prev.map((leg, i) => {
        if (i !== index) return leg;
        const updated = { ...leg, ...updates };
        const greeks = recomputeGreeks(updated.side, updated.strike);
        return { ...updated, greeks };
      })
    );
  };

  const removeLeg = (index: number) => {
    setActiveTemplate("Custom");
    setLegs((prev) => prev.filter((_, i) => i !== index));
  };

  const addLeg = () => {
    setActiveTemplate("Custom");
    const strike = Number(spot.toFixed(spot < 1 ? 4 : 2));
    const greeks = recomputeGreeks("call", strike);
    setLegs((prev) => [
      ...prev,
      {
        side: "call",
        action: "buy",
        strike,
        contracts: 10,
        greeks,
      },
    ]);
  };

  // Production math calculations
  const totalNetPremium = useMemo(() => netPremium(legs), [legs]);

  const loSpot = spot * 0.6;
  const hiSpot = spot * 1.4;
  const series = useMemo(() => combinedPayoffSeries(legs, loSpot, hiSpot, 200), [legs, loSpot, hiSpot]);

  const { maxPnl, minPnl, isUnlimitedUpside, isUnlimitedDownside, breakevens } = useMemo(() => {
    if (legs.length === 0) {
      return { maxPnl: 0, minPnl: 0, isUnlimitedUpside: false, isUnlimitedDownside: false, breakevens: [] };
    }
    let max = -Infinity;
    let min = Infinity;
    for (const pt of series) {
      if (pt.p > max) max = pt.p;
      if (pt.p < min) min = pt.p;
    }

    // Unlimited detection via net call/put delta at extremities
    const netCalls = legs.reduce((acc, l) => {
      if (l.side !== "call") return acc;
      return acc + (l.action === "buy" ? l.contracts : -l.contracts);
    }, 0);

    const netPuts = legs.reduce((acc, l) => {
      if (l.side !== "put") return acc;
      return acc + (l.action === "buy" ? l.contracts : -l.contracts);
    }, 0);

    const isUnlimitedUpside = netCalls > 0;
    const isUnlimitedDownside = netPuts < 0; // selling puts has large downside down to S=0

    // Detect breakevens (sign changes in series)
    const bes: number[] = [];
    for (let i = 0; i < series.length - 1; i++) {
      const p1 = series[i].p;
      const p2 = series[i + 1].p;
      if ((p1 <= 0 && p2 >= 0) || (p1 >= 0 && p2 <= 0)) {
        // Linear interpolation
        const fraction = Math.abs(p1) / (Math.abs(p1) + Math.abs(p2) || 1);
        const be = series[i].s + fraction * (series[i + 1].s - series[i].s);
        bes.push(be);
      }
    }

    return {
      maxPnl: max,
      minPnl: min,
      isUnlimitedUpside,
      isUnlimitedDownside,
      breakevens: bes,
    };
  }, [legs, series]);

  // SVG Chart Dimensions
  const W = 620;
  const H = 220;
  const PAD = { t: 20, r: 24, b: 32, l: 64 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  const chartData = useMemo(() => {
    const range = hiSpot - loSpot;
    const ySpan = Math.max(Math.abs(maxPnl), Math.abs(minPnl), 0.1) * 2.2;
    const yLo = -ySpan / 2;
    const yHi = ySpan / 2;
    const yRange = yHi - yLo;

    const toX = (s: number) => PAD.l + ((s - loSpot) / range) * plotW;
    const toY = (p: number) => PAD.t + plotH - ((p - yLo) / yRange) * plotH;
    const zeroY = toY(0);

    const pathData = series
      .map((pt, i) => `${i === 0 ? "M" : "L"}${toX(pt.s).toFixed(1)},${toY(pt.p).toFixed(1)}`)
      .join(" ");

    const profitPath =
      series
        .map((pt) => ({ x: toX(pt.s), y: toY(Math.max(0, pt.p)) }))
        .map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
        .join(" ") +
      ` L${toX(hiSpot).toFixed(1)},${zeroY.toFixed(1)} L${toX(loSpot).toFixed(1)},${zeroY.toFixed(1)} Z`;

    const lossPath =
      series
        .map((pt) => ({ x: toX(pt.s), y: toY(Math.min(0, pt.p)) }))
        .map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
        .join(" ") +
      ` L${toX(hiSpot).toFixed(1)},${zeroY.toFixed(1)} L${toX(loSpot).toFixed(1)},${zeroY.toFixed(1)} Z`;

    const spotX = toX(spot);

    const yTicks = [yHi * 0.7, 0, yLo * 0.7].map((v) => ({
      val: v,
      y: toY(v),
      label: v === 0 ? "$0" : v > 0 ? `+$${v.toFixed(1)}` : `−$${Math.abs(v).toFixed(1)}`,
    }));

    const xTicks = [loSpot, spot, hiSpot].map((s) => ({
      val: s,
      x: toX(s),
      label: s >= 1 ? `$${s.toFixed(2)}` : `$${s.toFixed(4)}`,
    }));

    return {
      toX,
      toY,
      zeroY,
      pathData,
      profitPath,
      lossPath,
      spotX,
      yTicks,
      xTicks,
    };
  }, [hiSpot, loSpot, maxPnl, minPnl, plotH, plotW, series, spot]);

  return (
    <div
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border-default)",
        padding: 24,
        margin: "24px 0",
        borderRadius: 4,
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-hi)", fontFamily: "var(--font-serif)" }}>
            Interactive Payoff & Strategy Playground
          </div>
          <div style={{ fontSize: 12, color: "var(--text-mid)", marginTop: 2 }}>
            Simulates combined option expiry payoff using <code style={{ color: "var(--brand)" }}>src/lib/payoff.ts</code> and pricing greeks.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--text-lo)", textTransform: "uppercase" }}>Asset:</span>
          {MARKETS.map((m) => (
            <button
              key={m.sym}
              type="button"
              onClick={() => {
                setSelectedAsset(m.sym);
                setActiveTemplate("Custom");
              }}
              style={{
                padding: "3px 8px",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                cursor: "pointer",
                border: selectedAsset === m.sym ? "1px solid var(--brand)" : "1px solid var(--border-default)",
                background: selectedAsset === m.sym ? "var(--brand-dim)" : "var(--bg-elevated)",
                color: selectedAsset === m.sym ? "var(--brand)" : "var(--text-mid)",
              }}
            >
              {m.sym}
            </button>
          ))}
        </div>
      </div>

      {/* Preset Strategy Buttons */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "var(--text-lo)", textTransform: "uppercase", marginBottom: 6, letterSpacing: "0.05em" }}>
          Pre-built Strategies:
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {STRATEGY_TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.name}
              type="button"
              onClick={() => applyTemplate(tmpl.name)}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                border: activeTemplate === tmpl.name ? "1px solid var(--brand)" : "1px solid var(--border-default)",
                background: activeTemplate === tmpl.name ? "var(--brand-dim)" : "var(--bg-elevated)",
                color: activeTemplate === tmpl.name ? "var(--brand)" : "var(--text-mid)",
              }}
            >
              {tmpl.name}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Payoff Curve */}
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          padding: "16px 8px",
          marginBottom: 20,
          overflowX: "auto",
        }}
      >
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 480, display: "block" }}>
          <defs>
            <clipPath id="playground-clip">
              <rect x={PAD.l} y={PAD.t} width={plotW} height={plotH} />
            </clipPath>
          </defs>

          {/* Grid lines */}
          {chartData.yTicks.map((t) => (
            <line
              key={t.val}
              x1={PAD.l}
              y1={t.y}
              x2={PAD.l + plotW}
              y2={t.y}
              stroke={t.val === 0 ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.05)"}
              strokeWidth={t.val === 0 ? 1 : 0.5}
            />
          ))}

          {/* Profit & Loss Areas */}
          <path d={chartData.profitPath} fill="rgba(92,154,107,0.18)" clipPath="url(#playground-clip)" />
          <path d={chartData.lossPath} fill="rgba(182,86,64,0.18)" clipPath="url(#playground-clip)" />

          {/* Spot vertical line */}
          <line
            x1={chartData.spotX}
            y1={PAD.t}
            x2={chartData.spotX}
            y2={PAD.t + plotH}
            stroke="rgba(255,255,255,0.25)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <text
            x={chartData.spotX}
            y={PAD.t - 6}
            textAnchor="middle"
            fontSize={9}
            fontFamily="var(--font-mono)"
            fill="var(--text-mid)"
          >
            Spot ({fmtSpot(spot)})
          </text>

          {/* Strikes vertical markers */}
          {legs.map((leg, i) => {
            const legX = chartData.toX(leg.strike);
            if (legX < PAD.l || legX > PAD.l + plotW) return null;
            return (
              <g key={i}>
                <line
                  x1={legX}
                  y1={PAD.t}
                  x2={legX}
                  y2={PAD.t + plotH}
                  stroke={leg.side === "call" ? "rgba(92,154,107,0.3)" : "rgba(182,86,64,0.3)"}
                  strokeWidth={1}
                  strokeDasharray="2 2"
                />
                <text
                  x={legX}
                  y={PAD.t + plotH + 24}
                  textAnchor="middle"
                  fontSize={8}
                  fontFamily="var(--font-mono)"
                  fill={leg.side === "call" ? "var(--call)" : "var(--put)"}
                >
                  K{i + 1}:{leg.strike}
                </text>
              </g>
            );
          })}

          {/* Breakeven lines */}
          {breakevens.map((be, idx) => {
            const beX = chartData.toX(be);
            if (beX < PAD.l || beX > PAD.l + plotW) return null;
            return (
              <g key={`be-${idx}`}>
                <line
                  x1={beX}
                  y1={PAD.t}
                  x2={beX}
                  y2={PAD.t + plotH}
                  stroke="var(--brand)"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                />
                <text
                  x={beX}
                  y={chartData.zeroY - 4}
                  textAnchor="start"
                  fontSize={8}
                  fontFamily="var(--font-mono)"
                  fill="var(--brand)"
                  fontWeight={700}
                >
                  BE: {fmtSpot(be)}
                </text>
              </g>
            );
          })}

          {/* Combined payoff line */}
          <path
            d={chartData.pathData}
            fill="none"
            stroke="var(--brand)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            clipPath="url(#playground-clip)"
          />

          {/* Y Axis labels */}
          {chartData.yTicks.map((t) => (
            <text
              key={t.val}
              x={PAD.l - 8}
              y={t.y + 3}
              textAnchor="end"
              fontSize={9}
              fontFamily="var(--font-mono)"
              fill={t.val === 0 ? "rgba(255,255,255,0.4)" : t.val > 0 ? "var(--call)" : "var(--put)"}
            >
              {t.label}
            </text>
          ))}

          {/* X Axis labels */}
          {chartData.xTicks.map((t, idx) => (
            <text
              key={idx}
              x={t.x}
              y={PAD.t + plotH + 12}
              textAnchor="middle"
              fontSize={8}
              fontFamily="var(--font-mono)"
              fill="rgba(255,255,255,0.3)"
            >
              {t.label}
            </text>
          ))}

          {/* Chart boundary */}
          <rect
            x={PAD.l}
            y={PAD.t}
            width={plotW}
            height={plotH}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={1}
          />
        </svg>
      </div>

      {/* Metrics Banner */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div style={{ background: "var(--bg-overlay)", padding: 12, borderLeft: "3px solid var(--brand)" }}>
          <div style={{ fontSize: 10, color: "var(--text-lo)", textTransform: "uppercase" }}>Net Cost / Premium</div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-mono)", marginTop: 4 }}>
            {totalNetPremium > 0 ? (
              <span style={{ color: "var(--put)" }}>−${totalNetPremium.toFixed(2)} (Debit)</span>
            ) : totalNetPremium < 0 ? (
              <span style={{ color: "var(--call)" }}>+${Math.abs(totalNetPremium).toFixed(2)} (Credit)</span>
            ) : (
              <span style={{ color: "var(--text-mid)" }}>$0.00 (Even)</span>
            )}
          </div>
        </div>

        <div style={{ background: "var(--bg-overlay)", padding: 12, borderLeft: "3px solid var(--call)" }}>
          <div style={{ fontSize: 10, color: "var(--text-lo)", textTransform: "uppercase" }}>Max Profit</div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--call)", marginTop: 4 }}>
            {isUnlimitedUpside ? "Unlimited" : `+$${Math.max(0, maxPnl).toFixed(2)}`}
          </div>
        </div>

        <div style={{ background: "var(--bg-overlay)", padding: 12, borderLeft: "3px solid var(--put)" }}>
          <div style={{ fontSize: 10, color: "var(--text-lo)", textTransform: "uppercase" }}>Max Loss</div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--put)", marginTop: 4 }}>
            {isUnlimitedDownside ? "Substantial (Down to $0)" : `−$${Math.abs(Math.min(0, minPnl)).toFixed(2)}`}
          </div>
        </div>

        <div style={{ background: "var(--bg-overlay)", padding: 12 }}>
          <div style={{ fontSize: 10, color: "var(--text-lo)", textTransform: "uppercase" }}>Breakeven(s)</div>
          <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--text-hi)", marginTop: 4 }}>
            {breakevens.length > 0 ? breakevens.map((b) => fmtSpot(b)).join(", ") : "None in window"}
          </div>
        </div>
      </div>

      {/* Interactive Legs Table */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-hi)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Strategy Legs ({legs.length})
          </span>
          <button
            type="button"
            onClick={addLeg}
            style={{
              padding: "4px 10px",
              background: "var(--brand)",
              color: "var(--bg)",
              border: "none",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            + Add Custom Leg
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)", color: "var(--text-lo)" }}>
                <th style={{ padding: "6px 8px" }}>Side</th>
                <th style={{ padding: "6px 8px" }}>Action</th>
                <th style={{ padding: "6px 8px" }}>Strike ($K$)</th>
                <th style={{ padding: "6px 8px" }}>Contracts</th>
                <th style={{ padding: "6px 8px" }}>Unit Premium</th>
                <th style={{ padding: "6px 8px" }}>Delta (Δ)</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {legs.map((leg, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: "6px 8px" }}>
                    <select
                      value={leg.side}
                      onChange={(e) => updateLeg(idx, { side: e.target.value as "call" | "put" })}
                      style={{
                        background: "var(--bg-overlay)",
                        color: leg.side === "call" ? "var(--call)" : "var(--put)",
                        border: "1px solid var(--border-default)",
                        padding: "3px 6px",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      <option value="call">CALL</option>
                      <option value="put">PUT</option>
                    </select>
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    <select
                      value={leg.action}
                      onChange={(e) => updateLeg(idx, { action: e.target.value as "buy" | "sell" })}
                      style={{
                        background: "var(--bg-overlay)",
                        color: "var(--text-hi)",
                        border: "1px solid var(--border-default)",
                        padding: "3px 6px",
                        fontSize: 11,
                      }}
                    >
                      <option value="buy">BUY (Long)</option>
                      <option value="sell">SELL (Short)</option>
                    </select>
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    <input
                      type="number"
                      step="any"
                      value={leg.strike}
                      onChange={(e) => updateLeg(idx, { strike: parseFloat(e.target.value) || 0 })}
                      style={{
                        background: "var(--bg-overlay)",
                        border: "1px solid var(--border-default)",
                        color: "var(--text-hi)",
                        padding: "3px 6px",
                        width: 90,
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                      }}
                    />
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    <input
                      type="number"
                      min="1"
                      value={leg.contracts}
                      onChange={(e) => updateLeg(idx, { contracts: Math.max(1, parseInt(e.target.value) || 1) })}
                      style={{
                        background: "var(--bg-overlay)",
                        border: "1px solid var(--border-default)",
                        color: "var(--text-hi)",
                        padding: "3px 6px",
                        width: 60,
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                      }}
                    />
                  </td>
                  <td style={{ padding: "6px 8px", fontFamily: "var(--font-mono)", color: "var(--text-mid)" }}>
                    {fmtSpot(leg.greeks.premium)}
                  </td>
                  <td style={{ padding: "6px 8px", fontFamily: "var(--font-mono)", color: "var(--text-mid)" }}>
                    {fmtN(leg.greeks.delta, 3)}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    <button
                      type="button"
                      onClick={() => removeLeg(idx)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--text-lo)",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                      title="Remove leg"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Link */}
      <div style={{ marginTop: 16, fontSize: 11, color: "var(--text-lo)", display: "flex", justifyContent: "space-between" }}>
        <span>Reuses combinedPnl and combinedPayoffSeries algorithms directly from src/lib/payoff.ts.</span>
        <a
          href="https://github.com/Zenith-options/frontend/blob/main/src/lib/payoff.ts#L12-L37"
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--brand)", textDecoration: "none" }}
        >
          View source code (src/lib/payoff.ts) →
        </a>
      </div>
    </div>
  );
}
