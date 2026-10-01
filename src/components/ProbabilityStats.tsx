"use client";

import { useId, useMemo, useState } from "react";
import { analyzeLegs } from "../lib/probability";
import type { PricedLeg } from "../lib/payoff";
import { fmtSpot, smileVol } from "../lib/pricing";

interface Props {
  legs: PricedLeg[];
  spot: number;
  /** ATM/base IV for the underlying — the flat σ, and the base of the smile. */
  vol: number;
  /** Years to expiry. */
  t: number;
  /** Extra line for the assumptions tooltip (e.g. which expiry a multi-expiry portfolio is measured at). */
  note?: string;
}

type VolMode = "flat" | "smile";

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const fmtEv = (v: number) => `${v >= 0 ? "+" : "−"}$${Math.abs(v).toFixed(2)}`;

export const PROBABILITY_ASSUMPTIONS = [
  "Risk-neutral lognormal distribution of spot at expiry (drift r = 5%, the rate the chain is priced with) — market-implied odds, not a forecast.",
  "Flat IV: one volatility for every price level. \"Smile\" swaps in the strike-specific smile vol for the P(ITM)/PoP edges; EV, the density and the σ bands always use the flat IV.",
  "P&L measured at expiry against the premium shown, before fees. EV is undiscounted and integrated to ±6σ.",
];

export function ProbabilityStats({ legs, spot, vol, t, note }: Props) {
  const [mode, setMode] = useState<VolMode>("flat");
  const [showInfo, setShowInfo] = useState(false);
  const tooltipId = useId();

  const stats = useMemo(() => {
    if (legs.length === 0 || !(spot > 0)) return null;
    return analyzeLegs(legs, {
      spot, vol, t,
      volAt: mode === "smile" ? (level: number) => smileVol(vol, level / spot) : undefined,
    });
  }, [legs, spot, vol, t, mode]);

  if (!stats) return null;

  const items = [
    { label: "Prob. of Profit", value: pct(stats.pop), color: "var(--text-hi)" },
    ...(stats.probItm !== null ? [{ label: "Prob. ITM", value: pct(stats.probItm), color: "var(--text-hi)" }] : []),
    { label: "Expected Value", value: fmtEv(stats.ev), color: stats.ev >= 0 ? "var(--call)" : "var(--put)" },
    { label: "1σ Range", value: `${fmtSpot(stats.move1.lower)} – ${fmtSpot(stats.move1.upper)}`, color: "var(--text-mid)", wide: true },
    { label: "2σ Range", value: `${fmtSpot(stats.move2.lower)} – ${fmtSpot(stats.move2.upper)}`, color: "var(--text-mid)", wide: true },
  ];

  return (
    <div data-testid="probability-stats">
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, position: "relative" }}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-lo)" }}>
          Probability
        </span>
        <button
          type="button"
          aria-label="Probability model assumptions"
          aria-describedby={showInfo ? tooltipId : undefined}
          aria-expanded={showInfo}
          // Click only opens — a mouse click also fires mouseenter/focus
          // first, so a toggle here would immediately close it again.
          onClick={() => setShowInfo(true)}
          onKeyDown={e => { if (e.key === "Escape") setShowInfo(false); }}
          onMouseEnter={() => setShowInfo(true)}
          onMouseLeave={() => setShowInfo(false)}
          onFocus={() => setShowInfo(true)}
          onBlur={() => setShowInfo(false)}
          style={{
            width: 14, height: 14, borderRadius: "50%", border: "1px solid var(--border-strong)",
            background: "none", color: "var(--text-lo)", fontSize: 9, lineHeight: "12px", cursor: "help", padding: 0,
          }}
        >i</button>
        {showInfo && (
          <div id={tooltipId} role="tooltip" style={{
            position: "absolute", top: 18, left: 0, zIndex: 20, width: 260, padding: "8px 10px",
            background: "var(--bg-overlay)", border: "1px solid var(--border-strong)",
            fontSize: 10, lineHeight: 1.45, color: "var(--text-mid)",
          }}>
            {[...PROBABILITY_ASSUMPTIONS, ...(note ? [note] : [])].map(line => (
              <div key={line} style={{ marginBottom: 4 }}>• {line}</div>
            ))}
          </div>
        )}
        <div role="group" aria-label="Volatility model" style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
          {(["flat", "smile"] as const).map(m => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} style={{
              fontSize: 9, padding: "1px 6px", border: "none", cursor: "pointer", textTransform: "capitalize",
              background: mode === m ? "var(--atm-dim)" : "transparent",
              color: mode === m ? "var(--atm)" : "var(--text-lo)",
            }}>{m === "flat" ? "Flat IV" : "Smile"}</button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
        {items.map(item => (
          <div key={item.label} style={"wide" in item ? { gridColumn: "1 / -1" } : undefined}>
            {/* Uppercased by hand, not text-transform — CSS would turn σ into Σ. */}
            <div style={{ fontSize: 9, letterSpacing: "0.06em", color: "var(--text-lo)", marginBottom: 2 }}>
              {item.label.replace(/[a-z]/g, c => c.toUpperCase())}
            </div>
            <div className="num" style={{ fontSize: 12, fontWeight: 600, color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
