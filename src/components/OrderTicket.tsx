"use client";

import { useMemo, useReducer } from "react";
import {
  checkPriceProtection,
  initialTicketState,
  ticketReducer,
  type TicketQuote,
  type TicketState,
} from "../lib/orderTicket";

export interface OrderTicketProps {
  defaultQuote?: Partial<TicketQuote>;
  onSubmit?: (state: TicketState) => void;
}

const defaultQuote: TicketQuote = {
  premium: 0.0084,
  quotedAt: Date.now(),
  expiresAt: Date.now() + 15000,
  side: "call",
  mode: "buy",
  strike: 0.12,
  expiryDays: 30,
  underlying: "XLM",
};

export function OrderTicket({ defaultQuote: initialQuote, onSubmit }: OrderTicketProps) {
  const [state, dispatch] = useReducer(ticketReducer, initialTicketState());
  const quote = useMemo<TicketQuote>(() => ({
    ...defaultQuote,
    ...initialQuote,
    quotedAt: Date.now(),
    expiresAt: Date.now() + 15000,
  }), [initialQuote]);

  const protection =
    state.quote && state.fillPremium != null
      ? checkPriceProtection(
          state.quote.mode,
          state.quote.premium,
          state.fillPremium,
          state.maxSlippageBps,
          state.limitPrice,
        )
      : null;

  const notional = (state.quantity * (state.quote?.premium ?? quote.premium)).toFixed(2);

  return (
    <div
      style={{
        width: 360,
        background: "var(--bg-raised)",
        border: "1px solid var(--border-default)",
        borderRadius: 14,
        padding: 18,
        color: "var(--text-hi)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-lo)" }}>
            Order ticket
          </div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{quote.underlying}</div>
        </div>
        <div style={{ color: "var(--brand)", fontSize: 13, fontWeight: 600 }}>
          {quote.mode === "buy" ? "Buy" : "Write"} {quote.side}
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-mid)" }}>
          <span>Strike</span>
          <strong style={{ color: "var(--text-hi)" }}>${quote.strike.toFixed(2)}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-mid)" }}>
          <span>Expiry</span>
          <strong style={{ color: "var(--text-hi)" }}>{quote.expiryDays}D</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-mid)" }}>
          <span>Premium</span>
          <strong style={{ color: "var(--text-hi)" }}>${(state.quote?.premium ?? quote.premium).toFixed(4)}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-mid)" }}>
          <span>Qty</span>
          <input
            aria-label="quantity"
            type="number"
            min={1}
            value={state.quantity}
            onChange={(e) => dispatch({ type: "setQuantity", quantity: Number(e.target.value) || 1 })}
            style={{
              width: 72,
              background: "var(--bg)",
              border: "1px solid var(--border-default)",
              color: "var(--text-hi)",
              borderRadius: 8,
              padding: "6px 8px",
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: 18, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => dispatch({ type: "startQuote", quote: { ...quote, premium: quote.premium } })}
          style={{
            flex: 1,
            minWidth: 120,
            background: "var(--brand)",
            border: "none",
            borderRadius: 10,
            padding: "10px 12px",
            color: "var(--bg)",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {state.status === "quoted" ? "Refresh quote" : "Start quote"}
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: "beginConfirm" })}
          disabled={state.status !== "quoted"}
          style={{
            flex: 1,
            minWidth: 120,
            background: state.status === "quoted" ? "var(--call)" : "rgba(255,255,255,0.08)",
            border: "none",
            borderRadius: 10,
            padding: "10px 12px",
            color: "#fff",
            fontWeight: 700,
            cursor: state.status === "quoted" ? "pointer" : "not-allowed",
          }}
        >
          Confirm
        </button>
      </div>

      <div style={{ marginTop: 18, display: "grid", gap: 8, color: "var(--text-mid)" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Notional</span>
          <strong style={{ color: "var(--text-hi)" }}>${notional}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Protection</span>
          <strong style={{ color: "var(--text-hi)" }}>{state.maxSlippageBps} bps</strong>
        </div>
      </div>

      {state.error && (
        <div role="alert" style={{ marginTop: 14, color: "var(--put)", fontSize: 12 }}>
          {state.error}
        </div>
      )}

      {protection && !protection.ok && (
        <div role="alert" style={{ marginTop: 10, color: "var(--put)", fontSize: 12 }}>
          {protection.reason}
        </div>
      )}

      {state.status === "confirming" && (
        <button
          type="button"
          onClick={() => {
            dispatch({ type: "submit" });
            onSubmit?.(state);
          }}
          style={{
            marginTop: 16,
            width: "100%",
            background: "var(--bg)",
            border: "1px solid var(--border-default)",
            color: "var(--text-hi)",
            borderRadius: 10,
            padding: "10px 12px",
            cursor: "pointer",
          }}
        >
          Submit order
        </button>
      )}
    </div>
  );
}
