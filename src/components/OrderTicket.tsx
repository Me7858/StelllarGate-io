"use client";

import { useEffect, useMemo, useState } from "react";
import { PayoffDiagram } from "./PayoffDiagram";
import { MultiLegPayoffDiagram } from "./MultiLegPayoffDiagram";
import {
  QUOTE_TTL_MS,
  checkPriceProtection,
  initialTicketState,
  isQuoteLive,
  quoteRemainingMs,
  ticketReducer,
  type TicketState,
} from "../lib/orderTicket";
import { collateralRequired } from "../lib/collateral";
import { fmtK, fmtN, type Greeks } from "../lib/pricing";
import type { AggregateGreeks } from "../lib/api/types";

export interface OrderTicketTrade {
  side: "call" | "put";
  mode: "buy" | "write";
  strike: number;
  premium: number;
  greeks: Greeks;
  expiryLabel: string;
  expiryDays: number;
  underlying: string;
  spot: number;
}

interface Props {
  trade: OrderTicketTrade;
  balance: number;
  collateralLocked: number;
  portfolioGreeks: AggregateGreeks;
  notSignedIn: boolean;
  onClose: () => void;
  onSubmit: (args: { quantity: number; quotedPremium: number; maxSlippageBps: number; limitPrice: number | null }) => Promise<number>;
}

export function OrderTicket({
  trade,
  balance,
  collateralLocked,
  portfolioGreeks,
  notSignedIn,
  onClose,
  onSubmit,
}: Props) {
  const [state, setState] = useState<TicketState>(() => {
    const s = initialTicketState();
    const now = Date.now();
    return {
      ...s,
      status: "quoted",
      quote: {
        premium: trade.premium,
        quotedAt: now,
        expiresAt: now + QUOTE_TTL_MS,
        side: trade.side,
        mode: trade.mode,
        strike: trade.strike,
        expiryDays: trade.expiryDays,
        underlying: trade.underlying,
      },
    };
  });
  const [now, setNow] = useState(Date.now());
  const [slippageError, setSlippageError] = useState<string | null>(null);
  const dispatch = (action: Parameters<typeof ticketReducer>[1]) =>
    setState(s => ticketReducer(s, action));

  // Re-seed quote when the underlying trade identity changes
  useEffect(() => {
    dispatch({
      type: "startQuote",
      quote: {
        premium: trade.premium,
        side: trade.side,
        mode: trade.mode,
        strike: trade.strike,
        expiryDays: trade.expiryDays,
        underlying: trade.underlying,
      },
    });
    dispatch({ type: "quoteReady", premium: trade.premium });
    setSlippageError(null);
  }, [trade.strike, trade.side, trade.mode, trade.expiryDays, trade.underlying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tick countdown every 250ms
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      setState(s => {
        if (s.quote && (s.status === "quoted" || s.status === "confirming") && Date.now() >= s.quote.expiresAt) {
          return ticketReducer(s, { type: "expireQuote" });
        }
        return s;
      });
    }, 250);
    return () => clearInterval(id);
  }, []);

  const qty = state.quantity;
  const quoted = state.quote?.premium ?? trade.premium;
  const remaining = quoteRemainingMs(state.quote, now);
  const live = isQuoteLive(state.quote, now) && state.status !== "quoting";
  const collateral = trade.mode === "write" ? collateralRequired(trade.side, qty, trade.strike, trade.spot) : 0;
  const premiumTotal = quoted * qty;
  const fees = 0; // placeholder
  const required = trade.mode === "write" ? collateral : premiumTotal + fees;
  const insufficient = balance < required;

  const impact = useMemo(() => {
    const sign = trade.mode === "write" ? -1 : 1;
    const dDelta = sign * trade.greeks.delta * qty;
    const dGamma = sign * trade.greeks.gamma * qty;
    const dTheta = sign * trade.greeks.theta * qty;
    const dVega = sign * trade.greeks.vega * qty;
    const balanceAfter = trade.mode === "write"
      ? balance + premiumTotal - collateral
      : balance - premiumTotal - fees;
    const collateralAfter = collateralLocked + collateral;
    const util = balanceAfter + collateralAfter > 0
      ? (collateralAfter / (balanceAfter + collateralAfter)) * 100
      : 0;
    return {
      balanceAfter,
      collateralAfter,
      util,
      before: portfolioGreeks,
      after: {
        delta: portfolioGreeks.delta + dDelta,
        gamma: portfolioGreeks.gamma + dGamma,
        theta: portfolioGreeks.theta + dTheta,
        vega: portfolioGreeks.vega + dVega,
      },
    };
  }, [trade, qty, balance, collateralLocked, portfolioGreeks, premiumTotal, collateral, fees]);

  const refreshQuote = () => {
    dispatch({ type: "refreshQuote", premium: trade.premium });
    setSlippageError(null);
  };

  const handleConfirm = async () => {
    if (!live || insufficient || notSignedIn || state.status === "submitting") return;
    dispatch({ type: "beginConfirm" });
    dispatch({ type: "submit" });
    setSlippageError(null);
    try {
      const fillPremium = await onSubmit({
        quantity: qty,
        quotedPremium: quoted,
        maxSlippageBps: state.maxSlippageBps,
        limitPrice: state.limitPrice,
      });
      const check = checkPriceProtection(
        trade.mode, quoted, fillPremium, state.maxSlippageBps, state.limitPrice
      );
      if (check.ok === false) {
        setSlippageError(check.reason);
        dispatch({ type: "failed", error: check.reason });
        return;
      }
      dispatch({ type: "filled", fillPremium });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Order failed";
      dispatch({ type: "failed", error: msg });
    }
  };

  const disableConfirm = !live || insufficient || notSignedIn || state.status === "submitting";

  return (
    <aside style={{
      width: 316, flexShrink: 0, borderLeft: "1px solid var(--border-default)",
      overflowY: "auto", background: "var(--bg-raised)", display: "flex", flexDirection: "column",
    }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-default)", display: "flex", justifyContent: "space-between" }}>
        <div>
          <div style={{
            fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4,
            color: trade.side === "call" ? "var(--call)" : "var(--put)",
          }}>
            {trade.mode === "write" ? "WRITE " : "BUY "}{trade.side === "call" ? "▲ CALL" : "▼ PUT"}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-hi)" }}>
            {trade.underlying} {trade.side === "call" ? "Call" : "Put"}
          </div>
          <div className="num" style={{ fontSize: 12, color: "var(--text-mid)" }}>
            K={fmtK(trade.strike)} · {trade.expiryLabel}
          </div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-lo)", fontSize: 18, cursor: "pointer" }}>×</button>
      </div>

      {/* Quote lifetime */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border-default)", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, textTransform: "uppercase", color: "var(--text-lo)", marginBottom: 4 }}>Quote lifetime</div>
          <div style={{ height: 4, background: "var(--bg-overlay)" }}>
            <div style={{
              height: "100%", width: `${(remaining / QUOTE_TTL_MS) * 100}%`,
              background: remaining < 3000 ? "var(--put)" : "var(--brand)",
              transition: "width 200ms linear",
            }} />
          </div>
        </div>
        <span className="num" style={{ fontSize: 12, color: live ? "var(--text-hi)" : "var(--put)", minWidth: 36 }}>
          {(remaining / 1000).toFixed(1)}s
        </span>
        {!live && (
          <button onClick={refreshQuote} style={{
            fontSize: 11, padding: "4px 8px", border: "1px solid var(--brand)",
            background: "none", color: "var(--brand)", cursor: "pointer",
          }}>Refresh quote</button>
        )}
      </div>

      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-lo)", marginBottom: 8 }}>
          Mark-to-model P&amp;L
        </div>
        <PayoffDiagram
          spot={trade.spot} strike={trade.strike} premium={quoted}
          isCall={trade.side === "call"} short={trade.mode === "write"} contracts={qty}
          width={284} height={140}
        />
        <div style={{ marginTop: 8 }}>
          <MultiLegPayoffDiagram
            legs={[{
              side: trade.side,
              action: trade.mode === "write" ? "sell" : "buy",
              strike: trade.strike,
              contracts: qty,
              expiryDays: trade.expiryDays,
              greeks: { ...trade.greeks, premium: quoted },
              iv: trade.greeks.iv,
            }]}
            spot={trade.spot}
            width={284}
            height={130}
          />
        </div>
      </div>

      {/* Order fields */}
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-lo)", marginBottom: 8 }}>Order ticket</div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: "var(--text-lo)", marginBottom: 4 }}>Quantity</div>
          <div style={{ display: "flex", alignItems: "center", background: "var(--bg-overlay)", border: "1px solid var(--border-default)" }}>
            <button
              aria-label="Decrease quantity"
              onClick={() => dispatch({ type: "setQuantity", quantity: Math.max(0.01, qty - 1) })}
              style={{ width: 36, height: 40, border: "none", background: "none", color: "var(--text-mid)", fontSize: 18, cursor: "pointer" }}
            >−</button>
            <input
              type="number" min={0.01} step={0.01} value={qty}
              aria-label="Contract quantity"
              onChange={e => dispatch({ type: "setQuantity", quantity: parseFloat(e.target.value) || 0.01 })}
              onKeyDown={e => {
                if (e.key === "ArrowUp") { e.preventDefault(); dispatch({ type: "setQuantity", quantity: qty + 1 }); }
                if (e.key === "ArrowDown") { e.preventDefault(); dispatch({ type: "setQuantity", quantity: Math.max(0.01, qty - 1) }); }
              }}
              style={{ flex: 1, height: 40, border: "none", background: "none", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 16, color: "var(--text-hi)", outline: "none" }}
            />
            <button
              aria-label="Increase quantity"
              onClick={() => dispatch({ type: "setQuantity", quantity: qty + 1 })}
              style={{ width: 36, height: 40, border: "none", background: "none", color: "var(--text-mid)", fontSize: 18, cursor: "pointer" }}
            >+</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-lo)", marginBottom: 4 }}>Max slippage (bps)</div>
            <input
              type="number" min={0} step={5} value={state.maxSlippageBps}
              onChange={e => dispatch({ type: "setSlippageBps", bps: Number(e.target.value) || 0 })}
              style={{ width: "100%", padding: "8px", background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--text-hi)", fontFamily: "var(--font-mono)", fontSize: 12 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-lo)", marginBottom: 4 }}>Limit price</div>
            <input
              type="number" min={0} step={0.0001}
              value={state.limitPrice ?? ""}
              placeholder="Optional"
              onChange={e => dispatch({
                type: "setLimitPrice",
                price: e.target.value === "" ? null : Number(e.target.value),
              })}
              style={{ width: "100%", padding: "8px", background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--text-hi)", fontFamily: "var(--font-mono)", fontSize: 12 }}
            />
          </div>
        </div>

        <div style={{ background: "var(--bg-elevated)", padding: "9px 12px", marginBottom: 10 }}>
          {[
            ["Premium / contract", `$${fmtN(quoted)}`],
            ["Total premium", `$${fmtN(premiumTotal, 2)}`],
            ["Fees (est.)", `$${fmtN(fees, 2)}`],
            ...(trade.mode === "write" ? [["Collateral", `$${fmtN(collateral, 2)}`]] as const : []),
            ["Available", `$${fmtN(balance, 2)}`],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
              <span style={{ fontSize: 11, color: "var(--text-lo)" }}>{k}</span>
              <span className="num" style={{ fontSize: 11, color: "var(--text-hi)" }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Pre-trade impact */}
        <div style={{ background: "var(--bg-elevated)", padding: "9px 12px", marginBottom: 10, border: "1px solid var(--border-default)" }}>
          <div style={{ fontSize: 9, textTransform: "uppercase", color: "var(--text-lo)", marginBottom: 6 }}>Pre-trade impact</div>
          {[
            ["Balance after", `$${fmtN(impact.balanceAfter, 2)}`],
            ["Collateral after", `$${fmtN(impact.collateralAfter, 2)}`],
            ["Utilization", `${impact.util.toFixed(1)}%`],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
              <span style={{ fontSize: 11, color: "var(--text-lo)" }}>{k}</span>
              <span className="num" style={{ fontSize: 11, color: "var(--text-hi)" }}>{v}</span>
            </div>
          ))}
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border-subtle)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            {(["delta", "gamma", "theta", "vega"] as const).map(g => (
              <div key={g} style={{ fontSize: 10 }}>
                <span style={{ color: "var(--text-lo)", textTransform: "uppercase" }}>{g[0]} </span>
                <span className="num" style={{ color: "var(--text-mid)" }}>{impact.before[g].toFixed(3)}</span>
                <span style={{ color: "var(--text-lo)" }}> → </span>
                <span className="num" style={{ color: "var(--text-hi)" }}>{impact.after[g].toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>

        {(insufficient || notSignedIn || slippageError || state.error) && (
          <div style={{ marginBottom: 8, fontSize: 11, color: "var(--put)" }}>
            {slippageError ?? state.error ?? (notSignedIn ? "Connect your wallet to trade." : "Insufficient balance.")}
          </div>
        )}

        <button
          onClick={handleConfirm}
          disabled={disableConfirm}
          style={{
            width: "100%", height: 44, border: "none", fontSize: 14, fontWeight: 700,
            cursor: disableConfirm ? "default" : "pointer", opacity: disableConfirm ? 0.5 : 1,
            background: trade.side === "call" ? "var(--call)" : "var(--put)", color: "var(--bg)",
          }}
        >
          {!live ? "Quote expired" : state.status === "submitting" ? "Submitting…" :
            `${trade.mode === "write" ? "Write" : "Buy"} ${trade.side.toUpperCase()} @ ${fmtK(trade.strike)}`}
        </button>
        <div style={{ marginTop: 6, fontSize: 9, color: "var(--text-lo)" }}>
          Price protection is checked client-side; backend must enforce max_slippage_bps / limit_price (see ORDER_TICKET_BACKEND.md).
        </div>
      </div>
    </aside>
  );
}
