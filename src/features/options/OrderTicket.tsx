"use client";

import { PayoffDiagram } from "../../components/PayoffDiagram";
import { Skeleton } from "../../components/states";
import { fmtK, fmtN, type Greeks } from "../../lib/pricing";
import { Term } from "../onboarding/Term";
import type { GlossaryId } from "../onboarding/i18n";
import type { ChainRow } from "./useChain";
import type { TradeMode, TradeSide } from "./ChainView";

export interface TicketTrade {
  row: ChainRow;
  side: TradeSide;
  mode: TradeMode;
}

interface Props {
  trade: TicketTrade;
  greeks: Greeks;
  sym: string;
  spot: number;
  expiryLabel: string;
  contracts: string;
  onContractsChange: (v: string) => void;
  qty: number;
  collateral: number;
  /** null while the account is loading or nobody is signed in — never shown as $0. */
  balance: number | null;
  /** Why the review button is disabled, if it is. */
  blockReason: string | null;
  error: string | null;
  practice: boolean;
  onReview: () => void;
  onClose: () => void;
  /** In the phone bottom sheet the chart is narrower and the close button is the sheet's. */
  inSheet?: boolean;
}

const GREEKS: { id: GlossaryId; label: string; key: keyof Greeks; dp: number; color: string }[] = [
  { id: "delta", label: "Δ Delta", key: "delta", dp: 3, color: "var(--brand)" },
  { id: "gamma", label: "Γ Gamma", key: "gamma", dp: 4, color: "var(--text-hi)" },
  { id: "theta", label: "Θ Theta", key: "theta", dp: 4, color: "var(--put)" },
  { id: "vega", label: "V Vega", key: "vega", dp: 3, color: "var(--atm)" },
];

const sectionLabel = { fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-lo)" } as const;

export function OrderTicket({
  trade, greeks, sym, spot, expiryLabel, contracts, onContractsChange, qty, collateral, balance,
  blockReason, error, practice, onReview, onClose, inSheet = false,
}: Props) {
  const isWrite = trade.mode === "write";
  const sideColor = trade.side === "call" ? "var(--call)" : "var(--put)";
  const balanceCell = balance === null
    ? <Skeleton width={64} height={11} style={{ display: "inline-block" }} />
    : `$${fmtN(balance, 2)}`;

  const rows: [React.ReactNode, React.ReactNode][] = isWrite
    ? [
      ["Qty", `${contracts} × ${sym}`],
      [<Term key="p" id="premium">Premium received</Term>, <span key="v" style={{ color: "var(--call)" }}>+${fmtN(greeks.premium * qty)}</span>],
      [<Term key="c" id="collateral">Collateral required</Term>, `$${fmtN(collateral)}`],
      ["Available balance", balanceCell],
    ]
    : [
      ["Qty", `${contracts} × ${sym}`],
      [<Term key="p" id="premium">Total premium</Term>, `$${fmtN(greeks.premium * qty)}`],
      [<Term key="m" id="max-loss">Max loss</Term>, `$${fmtN(greeks.premium * qty)}`],
      ["Available balance", balanceCell],
    ];

  return (
    <div data-tour="ticket" data-testid="order-ticket" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-default)", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: sideColor, marginBottom: 4 }}>
            {isWrite ? "WRITE " : "BUY "}{trade.side === "call" ? "▲ CALL" : "▼ PUT"}
          </div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-hi)" }}>
            {sym} {trade.side === "call" ? "Call" : "Put"}
          </h2>
          <div className="num" style={{ fontSize: 12, color: "var(--text-mid)" }}>
            K={fmtK(trade.row.strike)} · {expiryLabel}
          </div>
        </div>
        {!inSheet && (
          <button type="button" onClick={onClose} aria-label="Close order ticket" className="tap" style={{
            background: "none", border: "none", color: "var(--text-lo)", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: 4,
          }}>×</button>
        )}
      </div>

      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ ...sectionLabel, marginBottom: 8 }}>P&amp;L at Expiry</div>
        <PayoffDiagram
          spot={spot} strike={trade.row.strike} premium={greeks.premium}
          isCall={trade.side === "call"} short={isWrite} contracts={qty}
          width={inSheet ? 360 : 284} height={155}
        />
      </div>

      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ ...sectionLabel, marginBottom: 10 }}>Option Greeks</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {GREEKS.map(item => {
            const v = greeks[item.key];
            return (
              <div key={item.key} style={{ padding: "9px 10px", border: "1px solid var(--border-default)", background: "var(--bg-elevated)" }}>
                <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-lo)", marginBottom: 4 }}>
                  <Term id={item.id}>{item.label}</Term>
                </div>
                <div className="num" style={{ fontSize: 14, fontWeight: 600, color: item.color }}>
                  {v >= 0 ? "+" : "−"}{Math.abs(v).toFixed(item.dp)}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          {[
            { id: "premium" as const, label: "Premium", v: `$${fmtN(greeks.premium)}`, c: "var(--text-hi)" },
            { id: "iv" as const, label: "Impl. Vol", v: `${(greeks.iv * 100).toFixed(1)}%`, c: "var(--brand)" },
          ].map(item => (
            <div key={item.label} style={{ flex: 1, padding: "9px 10px", border: "1px solid var(--border-default)", background: "var(--bg-elevated)" }}>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-lo)", marginBottom: 4 }}>
                <Term id={item.id}>{item.label}</Term>
              </div>
              <div className="num" style={{ fontSize: 14, fontWeight: 600, color: item.c }}>{item.v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ ...sectionLabel, marginBottom: 8 }}>Order</div>
        <div style={{ marginBottom: 10 }}>
          <label htmlFor="ticket-contracts" style={{ display: "block", fontSize: 10, color: "var(--text-lo)", marginBottom: 4 }}>Contracts</label>
          <div style={{ display: "flex", alignItems: "center", background: "var(--bg-overlay)", border: "1px solid var(--border-default)", overflow: "hidden" }}>
            <button type="button" aria-label="Decrease contracts" className="tap"
              onClick={() => onContractsChange(String(Math.max(0.01, (parseFloat(contracts) || 1) - 1)))}
              style={{ width: 44, height: 44, border: "none", background: "none", color: "var(--text-mid)", fontSize: 18, cursor: "pointer" }}>−</button>
            <input id="ticket-contracts" type="number" inputMode="decimal" min="0.01" step="0.01" value={contracts}
              onChange={e => onContractsChange(e.target.value)}
              onBlur={e => onContractsChange(String(Math.max(0.01, parseFloat(e.target.value) || 1)))}
              style={{ flex: 1, minWidth: 0, height: 44, border: "none", background: "none", textAlign: "center",
                fontFamily: "var(--font-mono)", fontSize: 16, color: "var(--text-hi)", outline: "none" }} />
            <button type="button" aria-label="Increase contracts" className="tap"
              onClick={() => onContractsChange(String((parseFloat(contracts) || 0) + 1))}
              style={{ width: 44, height: 44, border: "none", background: "none", color: "var(--text-mid)", fontSize: 18, cursor: "pointer" }}>+</button>
          </div>
        </div>
        <div style={{ background: "var(--bg-elevated)", padding: "9px 12px", marginBottom: 10 }}>
          {rows.map(([k, v], i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
              <span style={{ fontSize: 11, color: "var(--text-lo)" }}>{k}</span>
              <span className="num" style={{ fontSize: 11, color: "var(--text-hi)" }}>{v}</span>
            </div>
          ))}
          {(blockReason || error) && (
            <div role="alert" style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border-default)", fontSize: 11, color: "var(--put)" }}>
              {error ?? blockReason}
            </div>
          )}
          {practice && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border-default)", fontSize: 11, color: "var(--call)" }}>
              Practice mode is on: confirming simulates this trade and sends nothing.
            </div>
          )}
        </div>
        <button type="button" data-tour="confirm" data-testid="ticket-review" onClick={onReview} disabled={!!blockReason}
          style={{
            width: "100%", height: 44, border: "none", cursor: blockReason ? "default" : "pointer", fontSize: 14, fontWeight: 700,
            opacity: blockReason ? 0.5 : 1, background: sideColor, color: "var(--bg)",
          }}>
          {isWrite ? "Write" : "Buy"} {trade.side.toUpperCase()} @ {fmtK(trade.row.strike)}
        </button>
      </div>

      <div style={{ padding: "14px 16px" }}>
        <div style={{ ...sectionLabel, marginBottom: 8 }}>Strategies using this strike</div>
        {(trade.side === "call"
          ? ["Covered Call: sell this call against stock", "Bull Call Spread: buy this, sell a higher strike", "Long Call: a pure directional bet"]
          : ["Protective Put: hedge long exposure", "Bear Put Spread: buy this, sell a lower strike", "Cash-Secured Put: sell this for income"]
        ).map(s => (
          <div key={s} style={{ padding: "7px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: 11, color: "var(--text-mid)" }}>
            → {s}
          </div>
        ))}
      </div>
    </div>
  );
}
