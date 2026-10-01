"use client";

import React, { useState, useMemo } from "react";
import { collateralRequired, type OptionSide } from "../../../lib/collateral";
import { MARKETS, fmtSpot, fmtN } from "../../../lib/pricing";

export function CollateralCalculator() {
  const [side, setSide] = useState<OptionSide>("call");
  const [selectedAsset, setSelectedAsset] = useState<string>("XLM");
  const [customSpot, setCustomSpot] = useState<number>(0.1182);
  const [strike, setStrike] = useState<number>(0.12);
  const [contracts, setContracts] = useState<number>(100);

  const market = useMemo(() => {
    return MARKETS.find((m) => m.sym === selectedAsset);
  }, [selectedAsset]);

  const spot = selectedAsset === "CUSTOM" ? customSpot : market?.price ?? 0.1182;

  const handleAssetChange = (sym: string) => {
    setSelectedAsset(sym);
    const m = MARKETS.find((item) => item.sym === sym);
    if (m) {
      setStrike(Number((m.price * (side === "call" ? 1.05 : 0.95)).toFixed(m.price < 1 ? 4 : 2)));
    }
  };

  const requiredCollateral = useMemo(() => {
    return collateralRequired(side, contracts, strike, spot);
  }, [side, contracts, strike, spot]);

  // Collateral tokens: Calls lock underlying asset; Puts lock USDC/stablecoins
  const collateralToken = side === "call" ? (selectedAsset === "CUSTOM" ? "UNDERLYING" : selectedAsset) : "USDC";

  // In underlying units (if call) or USD (if put)
  const requiredUnits = side === "call" ? contracts : requiredCollateral;

  const bufferAmount = side === "put" ? contracts * strike * 0.1 : 0;

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-hi)", fontFamily: "var(--font-serif)" }}>
            Interactive Collateral Calculator
          </div>
          <div style={{ fontSize: 12, color: "var(--text-mid)", marginTop: 2 }}>
            Powered directly by production logic in <code style={{ color: "var(--brand)" }}>src/lib/collateral.ts</code>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={() => {
              setSide("call");
              if (market) setStrike(Number((market.price * 1.05).toFixed(market.price < 1 ? 4 : 2)));
            }}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              border: "1px solid",
              borderColor: side === "call" ? "var(--call)" : "var(--border-default)",
              background: side === "call" ? "var(--call-dim)" : "transparent",
              color: side === "call" ? "var(--call)" : "var(--text-mid)",
            }}
          >
            COVERED CALL (100%)
          </button>
          <button
            type="button"
            onClick={() => {
              setSide("put");
              if (market) setStrike(Number((market.price * 0.95).toFixed(market.price < 1 ? 4 : 2)));
            }}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              border: "1px solid",
              borderColor: side === "put" ? "var(--put)" : "var(--border-default)",
              background: side === "put" ? "var(--put-dim)" : "transparent",
              color: side === "put" ? "var(--put)" : "var(--text-mid)",
            }}
          >
            CASH-SECURED PUT (110%)
          </button>
        </div>
      </div>

      {/* Asset Selection */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--text-lo)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Asset:
        </span>
        {MARKETS.map((m) => (
          <button
            key={m.sym}
            type="button"
            onClick={() => handleAssetChange(m.sym)}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
              cursor: "pointer",
              border: selectedAsset === m.sym ? "1px solid var(--brand)" : "1px solid var(--border-default)",
              background: selectedAsset === m.sym ? "var(--brand-dim)" : "var(--bg-elevated)",
              color: selectedAsset === m.sym ? "var(--brand)" : "var(--text-mid)",
            }}
          >
            {m.sym} ({fmtSpot(m.price)})
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSelectedAsset("CUSTOM")}
          style={{
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            border: selectedAsset === "CUSTOM" ? "1px solid var(--brand)" : "1px solid var(--border-default)",
            background: selectedAsset === "CUSTOM" ? "var(--brand-dim)" : "var(--bg-elevated)",
            color: selectedAsset === "CUSTOM" ? "var(--brand)" : "var(--text-mid)",
          }}
        >
          Custom
        </button>
      </div>

      {/* Input Parameters */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
          marginBottom: 20,
          background: "var(--bg-elevated)",
          padding: 16,
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div>
          <label style={{ display: "block", fontSize: 11, color: "var(--text-lo)", textTransform: "uppercase", marginBottom: 4 }}>
            Contracts to Write
          </label>
          <input
            type="number"
            min="1"
            step="1"
            value={contracts}
            onChange={(e) => setContracts(Math.max(1, parseInt(e.target.value) || 1))}
            style={{
              width: "100%",
              background: "var(--bg-overlay)",
              border: "1px solid var(--border-default)",
              color: "var(--text-hi)",
              padding: "6px 8px",
              fontFamily: "var(--font-mono)",
              fontSize: 13,
            }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, color: "var(--text-lo)", textTransform: "uppercase", marginBottom: 4 }}>
            Strike Price ($K$)
          </label>
          <input
            type="number"
            step="any"
            value={strike}
            onChange={(e) => setStrike(parseFloat(e.target.value) || 0)}
            style={{
              width: "100%",
              background: "var(--bg-overlay)",
              border: "1px solid var(--border-default)",
              color: "var(--text-hi)",
              padding: "6px 8px",
              fontFamily: "var(--font-mono)",
              fontSize: 13,
            }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11, color: "var(--text-lo)", textTransform: "uppercase", marginBottom: 4 }}>
            Underlying Spot ($S$)
          </label>
          {selectedAsset === "CUSTOM" ? (
            <input
              type="number"
              step="any"
              value={customSpot}
              onChange={(e) => setCustomSpot(parseFloat(e.target.value) || 0)}
              style={{
                width: "100%",
                background: "var(--bg-overlay)",
                border: "1px solid var(--border-default)",
                color: "var(--text-hi)",
                padding: "6px 8px",
                fontFamily: "var(--font-mono)",
                fontSize: 13,
              }}
            />
          ) : (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, color: "var(--text-hi)", padding: "6px 0" }}>
              {fmtSpot(spot)}
            </div>
          )}
        </div>
      </div>

      {/* Result Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr",
          gap: 16,
          borderTop: "1px solid var(--border-default)",
          paddingTop: 16,
        }}
      >
        <div
          style={{
            background: "var(--bg-overlay)",
            padding: 16,
            borderLeft: side === "call" ? "3px solid var(--call)" : "3px solid var(--put)",
          }}
        >
          <div style={{ fontSize: 10, color: "var(--text-lo)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Locked Collateral Required
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-hi)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
            {side === "call"
              ? `${requiredUnits.toLocaleString()} ${collateralToken}`
              : `$${requiredCollateral.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-mid)", marginTop: 4 }}>
            {side === "call"
              ? `Equivalent USD value: $${fmtN(requiredCollateral, 2)}`
              : `Base strike liability: $${fmtN(contracts * strike, 2)} + 10% safety buffer ($${fmtN(bufferAmount, 2)})`}
          </div>
        </div>

        <div style={{ background: "var(--bg-overlay)", padding: 16 }}>
          <div style={{ fontSize: 10, color: "var(--text-lo)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Rule Formulation
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--brand)", marginTop: 6 }}>
            {side === "call" ? (
              <>collateral = contracts × spot ({contracts} × {spot})</>
            ) : (
              <>collateral = contracts × strike × 1.10 ({contracts} × {strike} × 1.1)</>
            )}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-lo)", marginTop: 6, lineHeight: 1.5 }}>
            {side === "call"
              ? "Covered call writes lock the actual underlying asset, guaranteeing delivery upon exercise without liquidation risk."
              : "Cash-secured put writes lock 110% of strike value in USDC, protecting against sudden downward volatility prior to expiration."}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, fontSize: 11, color: "var(--text-lo)", display: "flex", justifyContent: "space-between" }}>
        <span>Collateral is locked in the Soroban smart contract until expiry or position close.</span>
        <a
          href="https://github.com/Zenith-options/frontend/blob/main/src/lib/collateral.ts#L8-L10"
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--brand)", textDecoration: "none" }}
        >
          View source code (src/lib/collateral.ts) →
        </a>
      </div>
    </div>
  );
}
