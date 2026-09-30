import { describe, expect, it } from "vitest";
import type { Position } from "../api/types";
import { STRATEGY_TEMPLATES } from "../strategies";
import { buildSpark, cardFromPosition, cardFromStrategy, truncateWallet, DEFAULT_PRIVACY } from "./card";
import { parseCard } from "./payload";

const WALLET = "GCKFBEIYV2U22IO2BJ4KVJOIP7XPWQGQFKKWXR6DOSJBV7STMAQSMTGG";
const now = new Date("2026-09-27T00:00:00Z");
const closed: Position = {
  id: "p1", wallet_address: WALLET, underlying: "BTC", strike: 60000, expiry_days: 30,
  option_type: "put", position_type: "short", contracts: 0.5, entry_premium: 1200, entry_spot: 65000,
  collateral: 33000, status: "closed", close_premium: 600, close_spot: 66000, realized_pnl: 300,
  opened_at: "2026-09-01T00:00:00Z", closed_at: "2026-09-20T00:00:00Z", strategy_id: null,
};

describe("cardFromPosition", () => {
  it("computes return on premium from the recorded trade", () => {
    const card = cardFromPosition(closed, DEFAULT_PRIVACY, now)!;
    expect(card.structure).toBe("Short Put");
    expect(card.pnlPct).toBe(50);
    expect(card.legs).toEqual([{ side: "put", action: "sell", strike: 60000 }]);
    expect(card.iat).toBe(Math.floor(now.getTime() / 1000));
  });

  it("omits hidden fields entirely by default", () => {
    const card = cardFromPosition(closed, DEFAULT_PRIVACY, now)!;
    expect(card).not.toHaveProperty("pnlAbs");
    expect(card).not.toHaveProperty("contracts");
    expect(card).not.toHaveProperty("wallet");
    // Nothing size- or premium-revealing anywhere in the payload.
    const json = JSON.stringify(card);
    expect(json).not.toContain("1200");
    expect(json).not.toContain("0.5,");
  });

  it("includes opted-in fields, with the wallet only ever truncated", () => {
    const card = cardFromPosition(closed, { hideAbsolutePnl: false, hideSize: false, showWallet: true }, now)!;
    expect(card.pnlAbs).toBe(300);
    expect(card.contracts).toBe(0.5);
    expect(card.wallet).toBe("GCKF…MTGG");
    expect(JSON.stringify(card)).not.toContain(WALLET);
    expect(parseCard(card)).toEqual(card);
  });

  it("refuses open positions", () => {
    expect(cardFromPosition({ ...closed, status: "open", realized_pnl: null }, DEFAULT_PRIVACY, now)).toBeNull();
  });
});

describe("cardFromStrategy", () => {
  const market = { underlying: "ETH", spot: 3500, vol: 0.72 };

  it("shows max return on risk for bounded structures", () => {
    const condor = STRATEGY_TEMPLATES.find(t => t.id === "iron-condor")!;
    const card = cardFromStrategy(condor, market, { expiryDays: 30, contracts: 3 }, DEFAULT_PRIVACY, now);
    expect(card.status).toBe("preview");
    expect(card.legs).toHaveLength(4);
    expect(card.pnlLabel).toBe("Max return on risk");
    expect(card.pnlPct).toBeGreaterThan(0);
    expect(card).not.toHaveProperty("contracts");
    expect(parseCard(card)).toEqual(card);
  });

  it("has no percentage for unbounded structures", () => {
    const straddle = STRATEGY_TEMPLATES.find(t => t.id === "straddle")!;
    const card = cardFromStrategy(straddle, market, { expiryDays: 30, contracts: 1 }, DEFAULT_PRIVACY, now);
    expect(card.pnlPct).toBeNull();
    expect(card.pnlLabel).toBe("Unlimited upside");
  });
});

describe("buildSpark", () => {
  it("normalizes to 0–1 and places zero and the marker", () => {
    const leg = { side: "call" as const, action: "buy" as const, strike: 100, contracts: 1, greeks: { premium: 5, delta: 0, gamma: 0, theta: 0, vega: 0, iv: 0 } };
    const s = buildSpark([leg], 100, 100);
    expect(Math.min(...s.pts)).toBe(0);
    expect(Math.max(...s.pts)).toBe(1);
    expect(s.zero).toBeGreaterThan(0);
    expect(s.zero).toBeLessThan(1);
    expect(s.spotX).toBe(0.5);
    expect(buildSpark([leg], 100, 1000).spotX).toBeNull();
  });
});

describe("truncateWallet", () => {
  it("keeps only the first and last four characters", () => {
    expect(truncateWallet(WALLET)).toBe("GCKF…MTGG");
  });
});
