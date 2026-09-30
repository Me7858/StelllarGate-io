"use client";

import { useMemo, useState } from "react";
import type { Position } from "../lib/api/types";
import { groupPositionsByUnderlying, positionsToLegs } from "../lib/risk";
import { netPremium } from "../lib/payoff";
import { fmtN, fmtSpot } from "../lib/pricing";
import { MultiLegPayoffDiagram } from "./MultiLegPayoffDiagram";
import { useQuant } from "../lib/hooks/useQuant";

interface Props {
  positions: Position[];
  spots: Record<string, number>;
}

const pnlColor = (v: number) => (v >= 0 ? "var(--call)" : "var(--put)");
const fmtPnl = (v: number) => `${v >= 0 ? "+" : "−"}$${fmtN(Math.abs(v), 2)}`;

export function PortfolioRiskPanel({ positions, spots }: Props) {
  const groups = useMemo(() => groupPositionsByUnderlying(positions), [positions]);
  const underlyings = useMemo(() => Array.from(groups.keys()).sort(), [groups]);
  const [selected, setSelected] = useState(underlyings[0] ?? "");
  const activeUnderlying = underlyings.includes(selected) ? selected : underlyings[0];

  const legs = useMemo(
    () => (activeUnderlying ? positionsToLegs(groups.get(activeUnderlying) ?? []) : []),
    [groups, activeUnderlying],
  );
  const spot = spots[activeUnderlying] ?? 0;
  const premium = useMemo(() => netPremium(legs), [legs]);

  // Offload riskProfile to worker
  const { data: profile } = useQuant(
    "riskProfile",
    legs.length > 0 && spot > 0 ? { legs, spot } : null,
  );

  // Offload stressTestPortfolio to worker
  const { data: stress } = useQuant(
    "stressTest",
    positions.length > 0 ? { positions, spots } : null,
  );

  if (underlyings.length === 0) return null;

  return (
    <div style={{ marginBottom: 24, border: "1px solid var(--border-default)", background: "var(--bg-raised)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-hi)" }}>Portfolio Risk</div>
        <div style={{ display: "flex", gap: 2 }}>
          {underlyings.map(u => (
            <button key={u} onClick={() => setSelected(u)} style={{
              padding: "3px 10px", border: "none", cursor: "pointer", fontSize: 11,
              background: activeUnderlying === u ? "var(--atm-dim)" : "transparent",
              color: activeUnderlying === u ? "var(--atm)" : "var(--text-lo)",
            }}>{u}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 24, padding: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, color: "var(--text-lo)", marginBottom: 8 }}>
            Combined payoff at expiry · {activeUnderlying} · all open legs
          </div>
          <MultiLegPayoffDiagram legs={legs} spot={spot} width={420} height={200} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 160, paddingTop: 20 }}>
          {[
            { label: "Net Premium", value: `${premium >= 0 ? "−" : "+"}$${fmtN(Math.abs(premium), 2)}`, color: "var(--text-hi)" },
            {
              label: "Max Profit",
              value: profile
                ? profile.maxProfitUnlimited ? "Unlimited" : `+$${fmtN(profile.maxProfit, 2)}`
                : "…",
              color: "var(--call)",
            },
            {
              label: "Max Loss",
              value: profile
                ? profile.maxLossUnlimited ? "Unlimited" : `−$${fmtN(Math.abs(profile.maxLoss), 2)}`
                : "…",
              color: "var(--put)",
            },
            {
              label: profile && profile.breakevens.length === 1 ? "Breakeven" : "Breakevens",
              value: !profile ? "…"
                : profile.breakevens.length === 0 ? "—"
                : profile.breakevens.map(b => fmtSpot(b)).join(" / "),
              color: "var(--text-hi)",
            },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-lo)", marginBottom: 2 }}>{s.label}</div>
              <div className="num" style={{ fontSize: 13, fontWeight: 600, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--border-default)", padding: "12px 16px" }}>
        <div style={{ fontSize: 10, color: "var(--text-lo)", marginBottom: 8 }}>
          Stress test · account-wide P&amp;L if every underlying moved this much and every position ran to expiry
        </div>
        <div style={{ display: "flex", gap: 0, overflowX: "auto" }}>
          {stress ? stress.map(r => (
            <div key={r.shock} style={{
              flex: "1 0 90px", padding: "8px 10px", textAlign: "center",
              borderLeft: "1px solid var(--border-subtle)",
              background: r.shock === 0 ? "var(--bg-elevated)" : "transparent",
            }}>
              <div style={{ fontSize: 10, color: "var(--text-lo)", marginBottom: 4 }}>
                {r.shock === 0 ? "Now" : `${r.shock > 0 ? "+" : ""}${(r.shock * 100).toFixed(0)}%`}
              </div>
              <div className="num" style={{ fontSize: 12, fontWeight: 600, color: pnlColor(r.totalPnl) }}>
                {fmtPnl(r.totalPnl)}
              </div>
            </div>
          )) : (
            <div style={{ fontSize: 10, color: "var(--text-lo)", padding: 8 }}>Computing…</div>
          )}
        </div>
      </div>
    </div>
  );
}
