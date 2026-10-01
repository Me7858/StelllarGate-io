"use client";

import { useMemo } from "react";
import { describeTrade, type TradeContext, type TradeLeg } from "./describeTrade";

/** Renders describeTrade() for a confirm dialog, flagging unlimited risk. */
export function TradeSummary({ legs, context }: { legs: TradeLeg[]; context: TradeContext }) {
  const description = useMemo(() => describeTrade(legs, context), [legs, context]);
  return (
    <>
      {description.maxLoss === null && (
        <span style={{
          display: "inline-block", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", padding: "2px 6px", marginBottom: 6,
          color: "var(--bg)", background: "var(--put)",
        }}>UNLIMITED LOSS</span>
      )}
      <p style={{ margin: 0 }}>{description.text}</p>
    </>
  );
}
