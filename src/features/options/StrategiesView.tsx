"use client";

import { StrategyPicker } from "../../components/StrategyPicker";
import { MultiLegPayoffDiagram } from "../../components/MultiLegPayoffDiagram";
import { fmtK, fmtN } from "../../lib/pricing";
import type { PricedLeg } from "../../lib/payoff";
import type { StrategyTemplate } from "../../lib/strategies";
import { Term } from "../onboarding/Term";

export function StrategiesView({
  selected, onSelect, legs, spot, netPremium, collateral, requiredFunds, balance, blockReason, onExecute,
}: {
  selected: StrategyTemplate | null;
  onSelect: (t: StrategyTemplate) => void;
  legs: PricedLeg[];
  spot: number;
  netPremium: number;
  collateral: number;
  requiredFunds: number;
  balance: number | null;
  blockReason: string | null;
  onExecute: () => void;
}) {
  return (
    <div className="strategies-grid" style={{ padding: 16 }}>
      <StrategyPicker selectedId={selected?.id ?? null} onSelect={onSelect} />

      {selected && (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-hi)", marginBottom: 12 }}>{selected.name}</div>
          {legs.map((leg, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--border-subtle)" }}>
              <span style={{ fontSize: 11, color: leg.action === "buy" ? "var(--call)" : "var(--put)", textTransform: "uppercase" }}>
                {leg.action} {leg.side}
              </span>
              <span className="num" style={{ fontSize: 11, color: "var(--text-mid)" }}>K={fmtK(leg.strike)}</span>
              <span className="num" style={{ fontSize: 11, color: "var(--text-hi)" }}>${fmtN(leg.greeks.premium, 4)}</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-lo)" }}>
                <Term id={netPremium >= 0 ? "net-debit" : "net-credit"}>{netPremium >= 0 ? "Net Debit" : "Net Credit"}</Term>
              </div>
              <div className="num" style={{ fontSize: 13, fontWeight: 600, color: netPremium >= 0 ? "var(--put)" : "var(--call)" }}>
                ${fmtN(Math.abs(netPremium), 2)}
              </div>
            </div>
            {collateral > 0 && (
              <div>
                <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-lo)" }}>
                  <Term id="collateral">Collateral Required</Term>
                </div>
                <div className="num" style={{ fontSize: 13, fontWeight: 600, color: "var(--atm)" }}>${fmtN(collateral, 2)}</div>
              </div>
            )}
          </div>
          <div style={{ marginTop: 16 }} data-swipe-ignore>
            <MultiLegPayoffDiagram legs={legs} spot={spot} width={420} height={220} />
          </div>
          <button type="button" className="tap" data-testid="strategy-review" onClick={onExecute} disabled={!!blockReason} style={{
            marginTop: 12, padding: "10px 20px", background: "var(--brand)", color: "var(--bg)", border: "none", fontSize: 13, fontWeight: 700,
            cursor: blockReason ? "default" : "pointer", opacity: blockReason ? 0.5 : 1, maxWidth: "100%",
          }}>
            Execute {selected.name} ({legs.length} legs)
          </button>
          {blockReason && (
            <div role="alert" style={{ marginTop: 6, fontSize: 11, color: "var(--put)" }}>
              {blockReason}
              {balance !== null && requiredFunds > balance && ` Needs $${fmtN(requiredFunds, 2)}, have $${fmtN(balance, 2)}.`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
