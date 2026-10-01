"use client";

import { AlertsPanel } from "../../components/AlertsPanel";
import { SpotPriceChart } from "../../components/SpotPriceChart";
import { VolSmile } from "../../components/VolSmile";
import { useBackendData } from "../../lib/context/BackendDataContext";
import { EXPIRIES, fmtSpot } from "../../lib/pricing";
import type { AggregateGreeks } from "../../lib/api/types";
import type { PricePoint } from "../../lib/usePriceHistory";
import { Term } from "../onboarding/Term";
import type { GlossaryId } from "../onboarding/i18n";

const heading = { fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-lo)", marginBottom: 8 } as const;
const statRow = { display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--border-subtle)" } as const;

const GREEK_ROWS: { id: GlossaryId; label: string; key: keyof AggregateGreeks; dp: number }[] = [
  { id: "delta", label: "Δ Net Delta", key: "delta", dp: 3 },
  { id: "gamma", label: "Γ Net Gamma", key: "gamma", dp: 4 },
  { id: "theta", label: "Θ Daily", key: "theta", dp: 4 },
  { id: "vega", label: "V Vega", key: "vega", dp: 3 },
];

/**
 * Spot/vol charts, alerts, market stats and portfolio Greeks. The desktop
 * left sidebar, and the "Market" tab on tablets/phones.
 */
export function MarketSidebar({ sym, spot, vol, priceHistory }: {
  sym: string;
  spot: number;
  vol: number;
  priceHistory: PricePoint[];
}) {
  const { authStatus, positions, greeks } = useBackendData();

  return (
    <>
      <SpotPriceChart history={priceHistory} width={212} height={70} />
      <VolSmile baseVol={vol} width={212} height={110} />
      <AlertsPanel sym={sym} spot={spot} />

      <div>
        <div style={heading}>Market</div>
        {([
          ["spot", "Spot", fmtSpot(spot)],
          ["iv", "ATM IV", `${Math.round(vol * 100)}%`],
          ["skew", "25Δ Skew", "-4.2%"],
          ["oi", "OI Calls", "$284K"],
          ["oi", "OI Puts", "$198K"],
          ["pc-ratio", "P/C Ratio", "0.70"],
        ] as [GlossaryId, string, string][]).map(([id, k, v]) => (
          <div key={k} style={statRow}>
            <span style={{ fontSize: 11, color: "var(--text-lo)" }}><Term id={id}>{k}</Term></span>
            <span className="num" style={{ fontSize: 11, color: "var(--text-hi)" }}>{v}</span>
          </div>
        ))}
      </div>

      <div>
        <div style={heading}>OI by Expiry</div>
        {EXPIRIES.slice(0, 4).map((e, i) => {
          const pct = [42, 28, 18, 12][i];
          return (
            <div key={e.label} style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <span style={{ fontSize: 10, color: "var(--text-lo)" }}>{e.label}</span>
                <span className="num" style={{ fontSize: 10, color: "var(--text-mid)" }}>{pct}%</span>
              </div>
              <div style={{ height: 3, background: "var(--bg-overlay)" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: `rgba(181,150,101,${0.3 + pct / 100 * 0.5})` }} />
              </div>
            </div>
          );
        })}
      </div>

      {authStatus === "signed-in" && positions.length > 0 && (
        <div>
          <div style={heading}>Portfolio Greeks</div>
          {GREEK_ROWS.map(item => {
            const v = greeks[item.key];
            return (
              <div key={item.key} style={statRow}>
                <span style={{ fontSize: 10, color: "var(--text-lo)", fontFamily: "var(--font-mono)" }}><Term id={item.id}>{item.label}</Term></span>
                <span className="num" style={{ fontSize: 11, color: item.key === "theta" ? "var(--put)" : v >= 0 ? "var(--call)" : "var(--put)" }}>
                  {v >= 0 ? "+" : "−"}{Math.abs(v).toFixed(item.dp)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
