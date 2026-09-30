"use client";

import { useEnvironment } from "../../lib/context/EnvironmentContext";

/**
 * The active environment, stated loudly. Rendered at the top of every
 * ConfirmDialog so nobody confirms a mainnet trade thinking it's paper.
 */
export function ModeStamp({ practice = false }: { practice?: boolean }) {
  const { network } = useEnvironment();
  return (
    <div
      data-testid="mode-stamp"
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", marginBottom: 14,
        border: `1px ${network.mode === "paper" ? "dashed" : "solid"} ${network.color}`,
        background: network.colorDim,
      }}
    >
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: network.color, flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: network.color }}>
          {network.label}{network.realFunds ? " · Real funds" : ""}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-mid)" }}>{network.description}</div>
      </div>
      {practice && (
        <span style={{
          marginLeft: "auto", fontSize: 10, fontWeight: 700, padding: "2px 6px", letterSpacing: "0.08em",
          color: "var(--bg)", background: "var(--call)", flexShrink: 0,
        }}>PRACTICE</span>
      )}
    </div>
  );
}
