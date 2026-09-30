import { describe, expect, it } from "vitest";
import { analyzePayoff, describeTrade, fmtStrike, payoffAt, type TradeLeg } from "./describeTrade";
import { STRATEGY_TEMPLATES } from "../../lib/strategies";
import { bs, smileVol } from "../../lib/pricing";

const ctx = { underlying: "BTC", expiryDays: 30 };
const leg = (side: "call" | "put", action: "buy" | "sell", strike: number, premium: number, contracts = 1): TradeLeg =>
  ({ side, action, strike, premium, contracts });

describe("describeTrade: single legs", () => {
  it("short call matches the issue's example and flags unlimited loss", () => {
    const d = describeTrade([leg("call", "sell", 70000, 1500, 2)], ctx);
    expect(d.sentences[0]).toBe("You're selling 2 BTC 70k calls expiring in 30 days.");
    expect(d.text).toContain("You collect $3,000.00 now.");
    expect(d.text).toContain("If BTC is above $71,500.00 at expiry you lose money; losses are unlimited above that.");
    expect(d.maxLoss).toBeNull();
    expect(d.maxProfit).toBeCloseTo(3000);
    expect(d.breakevens).toEqual([71500]);
  });

  it("long call: loss capped at the premium, profit unlimited", () => {
    const d = describeTrade([leg("call", "buy", 70000, 1500)], ctx);
    expect(d.sentences[0]).toBe("You're buying 1 BTC 70k call expiring in 30 days.");
    expect(d.text).toContain("You pay $1,500.00 now.");
    expect(d.text).toContain("If BTC is below $71,500.00 at expiry you lose money; the most you can lose is $1,500.00.");
    expect(d.text).toContain("Your profit is unlimited if BTC keeps rising.");
    expect(d.maxLoss).toBeCloseTo(1500);
    expect(d.maxProfit).toBeNull();
  });

  it("long put: finite loss and finite profit (price can't go below zero)", () => {
    const d = describeTrade([leg("put", "buy", 100, 5)], { underlying: "SOL", expiryDays: 7 });
    expect(d.text).toContain("If SOL is above $95.0000 at expiry you lose money; the most you can lose is $5.00.");
    expect(d.maxProfit).toBeCloseTo(95);
    expect(d.text).toContain("The most you can make is $95.00.");
  });

  it("short put: worst case is the underlying going to zero", () => {
    const d = describeTrade([leg("put", "sell", 100, 5, 3)], { underlying: "SOL", expiryDays: 1, collateral: 330 });
    expect(d.sentences[0]).toBe("You're selling 3 SOL 100.0000 puts expiring in 1 day.");
    expect(d.text).toContain("$330.00 of your balance is locked as collateral");
    expect(d.text).toContain("below $95.0000");
    expect(d.maxLoss).toBeCloseTo(285);
  });

  it("formats tiny XLM premiums with 4 decimals and fractional contracts", () => {
    const d = describeTrade([leg("call", "buy", 0.1241, 0.0042, 0.5)], { underlying: "XLM", expiryDays: 14 });
    expect(d.sentences[0]).toBe("You're buying 0.5 XLM 0.1241 calls expiring in 14 days.");
    expect(d.text).toContain("You pay $0.0021 now.");
  });
});

describe("describeTrade: every strategy template", () => {
  const spot = 100;
  const priced = (id: string) => {
    const tpl = STRATEGY_TEMPLATES.find(t => t.id === id)!;
    return tpl.legs.map(l => {
      const strike = spot * l.strikeOffset;
      const premium = bs(spot, strike, smileVol(0.8, l.strikeOffset), 30 / 365, l.side === "call").premium;
      return leg(l.side, l.action, strike, premium);
    });
  };

  it("covers all templates (fails if a new one is added without a test)", () => {
    expect(STRATEGY_TEMPLATES.map(t => t.id).sort()).toEqual(["bear-put-spread", "bull-call-spread", "iron-condor", "straddle"]);
  });

  it("long straddle: debit, loses between two breakevens, unlimited upside", () => {
    const legs = priced("straddle");
    const d = describeTrade(legs, { underlying: "ETH", expiryDays: 30 });
    expect(d.sentences[0]).toMatch(/^You're opening a 2-leg ETH position expiring in 30 days: buy 1 × 100\.0000 call, buy 1 × 100\.0000 put\.$/);
    expect(d.netPremium).toBeGreaterThan(0);
    expect(d.breakevens).toHaveLength(2);
    expect(d.text).toMatch(/If ETH is between \$\d+\.\d{4} and \$\d+\.\d{4} at expiry you lose money; the most you can lose is/);
    expect(d.maxLoss).toBeCloseTo(d.netPremium);
    expect(d.maxProfit).toBeNull();
  });

  it("bull call spread: capped both ways, one breakeven", () => {
    const d = describeTrade(priced("bull-call-spread"), ctx);
    expect(d.text).toContain("You pay");
    expect(d.breakevens).toHaveLength(1);
    expect(d.maxLoss).toBeCloseTo(d.netPremium);
    expect(d.maxProfit).toBeCloseTo(10 - d.netPremium);
    expect(d.text).toMatch(/below \$/);
  });

  it("bear put spread: capped both ways, loses above the breakeven", () => {
    const d = describeTrade(priced("bear-put-spread"), ctx);
    expect(d.breakevens).toHaveLength(1);
    expect(d.maxLoss).toBeCloseTo(d.netPremium);
    expect(d.maxProfit).toBeCloseTo(10 - d.netPremium);
    expect(d.text).toMatch(/If BTC is above \$[\d.]+ at expiry you lose money; the most you can lose is/);
  });

  it("iron condor: credit, loses outside the wings, loss capped", () => {
    const d = describeTrade(priced("iron-condor"), ctx);
    expect(d.netPremium).toBeLessThan(0);
    expect(d.text).toContain("You collect");
    expect(d.breakevens).toHaveLength(2);
    expect(d.text).toMatch(/If BTC is below \$[\d.]+ or above \$[\d.]+ at expiry you lose money; the most you can lose is/);
    expect(d.maxLoss).toBeCloseTo(7 + d.netPremium, 6); // wing width minus credit
    expect(d.maxProfit).toBeCloseTo(-d.netPremium);
  });

  it("each template's reported max loss and breakevens agree with the payoff function", () => {
    for (const tpl of STRATEGY_TEMPLATES) {
      const legs = priced(tpl.id);
      const { breakevens, maxLoss } = analyzePayoff(legs);
      for (const be of breakevens) expect(Math.abs(payoffAt(legs, be))).toBeLessThan(1e-6);
      if (maxLoss !== null) {
        for (let s = 0; s <= 300; s += 0.5) expect(payoffAt(legs, s)).toBeGreaterThanOrEqual(-maxLoss - 1e-6);
      }
    }
  });
});

describe("helpers", () => {
  it("fmtStrike", () => {
    expect(fmtStrike(70000)).toBe("70k");
    expect(fmtStrike(67420.5)).toBe("67,420.50");
    expect(fmtStrike(0.1182)).toBe("0.1182");
  });
  it("empty legs describe nothing", () => {
    expect(describeTrade([], ctx).text).toBe("");
  });
});
