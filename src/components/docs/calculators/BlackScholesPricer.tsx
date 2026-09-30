"use client";

import React, { useState, useMemo } from "react";
import { bs, smileVol, MARKETS, EXPIRIES, fmtN, fmtSpot, fmtK } from "../../../lib/pricing";

export function BlackScholesPricer() {
  const [selectedMarket, setSelectedMarket] = useState<string>("XLM");
  const [customSpot, setCustomSpot] = useState<number>(0.1182);
  const [strike, setStrike] = useState<number>(0.12);
  const [days, setDays] = useState<number>(30);
  const [useSmile, setUseSmile] = useState<boolean>(true);
  const [customVol, setCustomVol] = useState<number>(0.82);
  const [isCall, setIsCall] = useState<boolean>(true);

  const market = useMemo(() => {
    return MARKETS.find((m) => m.sym === selectedMarket);
  }, [selectedMarket]);

  const spot = selectedMarket === "CUSTOM" ? customSpot : market?.price ?? 0.1182;
  const baseVol = selectedMarket === "CUSTOM" ? customVol : market?.vol ?? 0.82;

  const moneyness = spot > 0 ? strike / spot : 1;

  const effectiveVol = useMemo(() => {
    if (!useSmile) return customVol;
    return smileVol(baseVol, moneyness);
  }, [useSmile, customVol, baseVol, moneyness]);

  const t = Math.max(0.0001, days / 365);

  const greeks = useMemo(() => {
    return bs(spot, strike, effectiveVol, t, isCall);
  }, [spot, strike, effectiveVol, t, isCall]);

  const handleMarketChange = (sym: string) => {
    setSelectedMarket(sym);
    const m = MARKETS.find((item) => item.sym === sym);
    if (m) {
      setStrike(Number((m.price * 1.02).toFixed(m.price < 1 ? 4 : 2)));
      setCustomVol(m.vol);
    }
  };

  const moneynessStatus = useMemo(() => {
    const diff = Math.abs(strike - spot) / spot;
    if (diff < 0.015) return { label: "At-the-Money (ATM)", color: "var(--atm)" };
    if (isCall) {
      return spot > strike
        ? { label: "In-the-Money (ITM)", color: "var(--call)" }
        : { label: "Out-of-the-Money (OTM)", color: "var(--put)" };
    } else {
      return spot < strike
        ? { label: "In-the-Money (ITM)", color: "var(--put)" }
        : { label: "Out-of-the-Money (OTM)", color: "var(--call)" };
    }
  }, [isCall, spot, strike]);

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
            Interactive Black-Scholes Pricer
          </div>
          <div style={{ fontSize: 12, color: "var(--text-mid)", marginTop: 2 }}>
            Powered directly by production code in <code style={{ color: "var(--brand)" }}>src/lib/pricing.ts</code>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={() => setIsCall(true)}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              border: "1px solid",
              borderColor: isCall ? "var(--call)" : "var(--border-default)",
              background: isCall ? "var(--call-dim)" : "transparent",
              color: isCall ? "var(--call)" : "var(--text-mid)",
            }}
          >
            CALL
          </button>
          <button
            type="button"
            onClick={() => setIsCall(false)}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              border: "1px solid",
              borderColor: !isCall ? "var(--put)" : "var(--border-default)",
              background: !isCall ? "var(--put-dim)" : "transparent",
              color: !isCall ? "var(--put)" : "var(--text-mid)",
            }}
          >
            PUT
          </button>
        </div>
      </div>

      {/* Preset Asset Selection */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--text-lo)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Asset:
        </span>
        {MARKETS.map((m) => (
          <button
            key={m.sym}
            type="button"
            onClick={() => handleMarketChange(m.sym)}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
              cursor: "pointer",
              border: selectedMarket === m.sym ? "1px solid var(--brand)" : "1px solid var(--border-default)",
              background: selectedMarket === m.sym ? "var(--brand-dim)" : "var(--bg-elevated)",
              color: selectedMarket === m.sym ? "var(--brand)" : "var(--text-mid)",
            }}
          >
            {m.sym} ({fmtSpot(m.price)})
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSelectedMarket("CUSTOM")}
          style={{
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            border: selectedMarket === "CUSTOM" ? "1px solid var(--brand)" : "1px solid var(--border-default)",
            background: selectedMarket === "CUSTOM" ? "var(--brand-dim)" : "var(--bg-elevated)",
            color: selectedMarket === "CUSTOM" ? "var(--brand)" : "var(--text-mid)",
          }}
        >
          Custom
        </button>
      </div>

      {/* Inputs Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 20,
          background: "var(--bg-elevated)",
          padding: 16,
          border: "1px solid var(--border-subtle)",
        }}
      >
        {/* Spot Price */}
        <div>
          <label style={{ display: "block", fontSize: 11, color: "var(--text-lo)", textTransform: "uppercase", marginBottom: 4 }}>
            Spot Price ($S$)
          </label>
          {selectedMarket === "CUSTOM" ? (
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

        {/* Strike Price */}
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

        {/* Expiry Selector */}
        <div>
          <label style={{ display: "block", fontSize: 11, color: "var(--text-lo)", textTransform: "uppercase", marginBottom: 4 }}>
            Expiry ({days} days)
          </label>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {EXPIRIES.map((exp) => (
              <button
                key={exp.label}
                type="button"
                onClick={() => setDays(exp.days)}
                style={{
                  padding: "4px 8px",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  cursor: "pointer",
                  border: days === exp.days ? "1px solid var(--brand)" : "1px solid var(--border-default)",
                  background: days === exp.days ? "var(--brand-dim)" : "var(--bg-overlay)",
                  color: days === exp.days ? "var(--brand)" : "var(--text-mid)",
                }}
              >
                {exp.label}
              </button>
            ))}
          </div>
        </div>

        {/* Volatility Selection */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <label style={{ fontSize: 11, color: "var(--text-lo)", textTransform: "uppercase" }}>
              Implied Vol ($\sigma$)
            </label>
            <button
              type="button"
              onClick={() => setUseSmile(!useSmile)}
              style={{
                background: "transparent",
                border: "none",
                fontSize: 10,
                color: useSmile ? "var(--atm)" : "var(--text-mid)",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              {useSmile ? "Using Smile Curve" : "Manual IV"}
            </button>
          </div>
          {useSmile ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--atm)", padding: "6px 0" }}>
              {(effectiveVol * 100).toFixed(1)}% <span style={{ fontSize: 10, color: "var(--text-lo)" }}>(base: {(baseVol * 100).toFixed(0)}%)</span>
            </div>
          ) : (
            <input
              type="number"
              step="0.01"
              value={customVol}
              onChange={(e) => setCustomVol(parseFloat(e.target.value) || 0.1)}
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
          )}
        </div>
      </div>

      {/* Moneyness status badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <span
          style={{
            fontSize: 11,
            padding: "3px 8px",
            background: moneynessStatus.color.replace(")", "-dim)"),
            color: moneynessStatus.color,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {moneynessStatus.label}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-mid)", fontFamily: "var(--font-mono)" }}>
          Moneyness (K/S): {moneyness.toFixed(4)} · Annualized T: {t.toFixed(4)} yrs
        </span>
      </div>

      {/* Pricing and Greeks Output */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr repeat(4, 1fr)",
          gap: 12,
          borderTop: "1px solid var(--border-default)",
          paddingTop: 16,
        }}
      >
        <div style={{ background: "var(--bg-overlay)", padding: 14, borderLeft: "3px solid var(--brand)" }}>
          <div style={{ fontSize: 10, color: "var(--text-lo)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Calculated Premium
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-hi)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
            {fmtSpot(greeks.premium)}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-mid)", marginTop: 2 }}>
            {((greeks.premium / (spot || 1)) * 100).toFixed(2)}% of underlying spot
          </div>
        </div>

        <div style={{ background: "var(--bg-overlay)", padding: 12 }}>
          <div style={{ fontSize: 10, color: "var(--text-lo)", textTransform: "uppercase" }}>Delta (Δ)</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-hi)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
            {fmtN(greeks.delta, 4)}
          </div>
          <div style={{ fontSize: 9, color: "var(--text-mid)", marginTop: 2 }}>Spot sensitivity</div>
        </div>

        <div style={{ background: "var(--bg-overlay)", padding: 12 }}>
          <div style={{ fontSize: 10, color: "var(--text-lo)", textTransform: "uppercase" }}>Gamma (Γ)</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-hi)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
            {fmtN(greeks.gamma, 5)}
          </div>
          <div style={{ fontSize: 9, color: "var(--text-mid)", marginTop: 2 }}>Delta curvature</div>
        </div>

        <div style={{ background: "var(--bg-overlay)", padding: 12 }}>
          <div style={{ fontSize: 10, color: "var(--text-lo)", textTransform: "uppercase" }}>Theta (Θ)</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--put)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
            {fmtN(greeks.theta, 4)}/d
          </div>
          <div style={{ fontSize: 9, color: "var(--text-mid)", marginTop: 2 }}>Daily time decay</div>
        </div>

        <div style={{ background: "var(--bg-overlay)", padding: 12 }}>
          <div style={{ fontSize: 10, color: "var(--text-lo)", textTransform: "uppercase" }}>Vega (V)</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--atm)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
            {fmtN(greeks.vega, 4)}
          </div>
          <div style={{ fontSize: 9, color: "var(--text-mid)", marginTop: 2 }}>per 1% IV shift</div>
        </div>
      </div>

      <div style={{ marginTop: 16, fontSize: 11, color: "var(--text-lo)", display: "flex", justifyContent: "space-between" }}>
        <span>Black-Scholes assumes risk-free rate $r = 5.0\%$ per production engine defaults.</span>
        <a
          href="https://github.com/Zenith-options/frontend/blob/main/src/lib/pricing.ts#L54-L82"
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--brand)", textDecoration: "none" }}
        >
          View source code (src/lib/pricing.ts) →
        </a>
      </div>
    </div>
  );
}
