import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { bs, normCDF, RISK_FREE_RATE } from "./pricing";
import type { PricedLeg } from "./payoff";
import {
  analyzeLegs,
  expectedMove,
  expectedValue,
  lognormalPdf,
  probAbove,
  probITM,
  probabilityOfProfit,
  type DistributionInputs,
} from "./probability";

const leg = (
  side: "call" | "put",
  action: "buy" | "sell",
  strike: number,
  premium: number,
  contracts = 1
): PricedLeg => ({
  side, action, strike, contracts,
  greeks: { premium, delta: 0, gamma: 0, theta: 0, vega: 0, iv: 0 },
});

const d2 = (S: number, K: number, vol: number, t: number) =>
  (Math.log(S / K) + (RISK_FREE_RATE - 0.5 * vol * vol) * t) / (vol * Math.sqrt(t));

const dist: DistributionInputs = { spot: 100, vol: 0.6, t: 30 / 365 };

describe("probAbove / probITM", () => {
  it("matches N(d2) for a long call's P(ITM)", () => {
    for (const K of [70, 90, 100, 115, 140]) {
      expect(probITM("call", K, dist)).toBeCloseTo(normCDF(d2(100, K, 0.6, 30 / 365)), 10);
    }
  });

  it("put P(ITM) is N(-d2) and complements the call", () => {
    const K = 95;
    expect(probITM("put", K, dist)).toBeCloseTo(normCDF(-d2(100, K, 0.6, 30 / 365)), 6);
    expect(probITM("put", K, dist) + probITM("call", K, dist)).toBeCloseTo(1, 12);
  });

  it("handles the edges of the price axis", () => {
    expect(probAbove(0, dist)).toBe(1);
    expect(probAbove(Infinity, dist)).toBe(0);
  });

  it("collapses to a point mass as t → 0", () => {
    const expiring = { ...dist, t: 0 };
    expect(probAbove(99, expiring)).toBe(1);
    expect(probAbove(101, expiring)).toBe(0);
    expect(lognormalPdf(100, expiring)).toBe(0);
  });

  it("uses the smile vol for the level when volAt is given", () => {
    const smile = { ...dist, volAt: (k: number) => (k < 100 ? 0.9 : 0.6) };
    expect(probAbove(80, smile)).toBeCloseTo(normCDF(d2(100, 80, 0.9, 30 / 365)), 10);
    expect(probAbove(120, smile)).toBeCloseTo(probAbove(120, dist), 12);
  });
});

describe("expectedMove", () => {
  it("brackets ~68.27% / ~95.45% of the distribution", () => {
    const m1 = expectedMove(dist, 1);
    const m2 = expectedMove(dist, 2);
    expect(probAbove(m1.lower, dist) - probAbove(m1.upper, dist)).toBeCloseTo(0.6827, 3);
    expect(probAbove(m2.lower, dist) - probAbove(m2.upper, dist)).toBeCloseTo(0.9545, 3);
    expect(m1.lower).toBeLessThan(100);
    expect(m1.upper).toBeGreaterThan(100);
  });

  it("is skewed upward (lognormal) and never negative", () => {
    const wide = { spot: 100, vol: 2.5, t: 1 };
    const m = expectedMove(wide, 2);
    expect(m.lower).toBeGreaterThan(0);
    expect(m.upper - 100).toBeGreaterThan(100 - m.lower);
  });

  it("is a zero-width range at expiry", () => {
    expect(expectedMove({ ...dist, t: 0 }, 2)).toEqual({ lower: 100, upper: 100 });
  });
});

describe("probabilityOfProfit", () => {
  it("long call: P(S_T > K + premium)", () => {
    const legs = [leg("call", "buy", 105, 3)];
    expect(probabilityOfProfit(legs, dist)).toBeCloseTo(probAbove(108, dist), 3);
  });

  it("short put: P(S_T > K − premium)", () => {
    const legs = [leg("put", "sell", 95, 2.5)];
    expect(probabilityOfProfit(legs, dist)).toBeCloseTo(probAbove(92.5, dist), 3);
  });

  it("iron condor: mass between the two breakevens", () => {
    // Net credit 2 → breakevens at 90 − 2 = 88 and 110 + 2 = 112.
    const legs = [
      leg("put", "buy", 80, 0.5), leg("put", "sell", 90, 1.5),
      leg("call", "sell", 110, 1.5), leg("call", "buy", 120, 0.5),
    ];
    const expected = probAbove(88, dist) - probAbove(112, dist);
    expect(probabilityOfProfit(legs, dist)).toBeCloseTo(expected, 3);
  });

  it("long straddle: mass outside the two breakevens", () => {
    const legs = [leg("call", "buy", 100, 5), leg("put", "buy", 100, 5)];
    const expected = 1 - (probAbove(90, dist) - probAbove(110, dist));
    expect(probabilityOfProfit(legs, dist)).toBeCloseTo(expected, 3);
  });

  it("is deterministic at expiry", () => {
    const legs = [leg("call", "buy", 90, 5)];
    expect(probabilityOfProfit(legs, { ...dist, t: 0 })).toBe(1);
    expect(probabilityOfProfit([leg("call", "buy", 110, 5)], { ...dist, t: 0 })).toBe(0);
  });

  it("is 0 for no legs", () => {
    expect(probabilityOfProfit([], dist)).toBe(0);
  });
});

describe("expectedValue", () => {
  it("long call: e^{rt}·C_bs − premium paid", () => {
    const t = dist.t;
    const C = bs(100, 105, 0.6, t, true).premium;
    const legs = [leg("call", "buy", 105, C)];
    const expected = C * Math.exp(RISK_FREE_RATE * t) - C;
    expect(expectedValue(legs, dist)).toBeCloseTo(expected, 4);
  });

  it("long put: e^{rt}·P_bs − premium paid", () => {
    const t = dist.t;
    const P = bs(100, 92, 0.6, t, false).premium;
    const legs = [leg("put", "buy", 92, 1)];
    expect(expectedValue(legs, dist)).toBeCloseTo(P * Math.exp(RISK_FREE_RATE * t) - 1, 4);
  });

  it("short is the exact negation of long", () => {
    const long = [leg("call", "buy", 100, 5), leg("put", "buy", 100, 5)];
    const short = long.map(l => ({ ...l, action: "sell" as const }));
    expect(expectedValue(short, dist)).toBeCloseTo(-expectedValue(long, dist), 10);
  });

  it("scales with contracts", () => {
    const one = expectedValue([leg("call", "buy", 100, 4, 1)], dist);
    const three = expectedValue([leg("call", "buy", 100, 4, 3)], dist);
    expect(three).toBeCloseTo(3 * one, 8);
  });

  it("stays finite for an unbounded (naked short call) payoff at very high IV", () => {
    const ev = expectedValue([leg("call", "sell", 100, 10)], { spot: 100, vol: 3, t: 1 });
    expect(Number.isFinite(ev)).toBe(true);
  });

  it("equals the intrinsic P&L at expiry", () => {
    expect(expectedValue([leg("call", "buy", 90, 4)], { ...dist, t: 0 })).toBeCloseTo(6, 12);
  });
});

describe("analyzeLegs", () => {
  it("reports P(ITM) only for single-leg positions", () => {
    expect(analyzeLegs([leg("call", "buy", 100, 5)], dist).probItm).not.toBeNull();
    expect(analyzeLegs([leg("call", "buy", 100, 5), leg("put", "buy", 100, 5)], dist).probItm).toBeNull();
  });
});

describe("properties", () => {
  const legArb = fc.record({
    side: fc.constantFrom("call" as const, "put" as const),
    action: fc.constantFrom("buy" as const, "sell" as const),
    strikeMult: fc.double({ min: 0.5, max: 1.5, noNaN: true }),
    premiumMult: fc.double({ min: 0, max: 0.3, noNaN: true }),
    contracts: fc.double({ min: 0.01, max: 50, noNaN: true }),
  });
  const distArb = fc.record({
    spot: fc.double({ min: 0.01, max: 100_000, noNaN: true }),
    vol: fc.double({ min: 0.01, max: 3, noNaN: true }),
    t: fc.double({ min: 0, max: 2, noNaN: true }),
  });

  it("PoP and P(ITM) are always probabilities", () => {
    fc.assert(
      fc.property(fc.array(legArb, { minLength: 1, maxLength: 4 }), distArb, (raw, d) => {
        const legs = raw.map(l => leg(l.side, l.action, d.spot * l.strikeMult, d.spot * l.premiumMult, l.contracts));
        const stats = analyzeLegs(legs, d);
        expect(stats.pop).toBeGreaterThanOrEqual(0);
        expect(stats.pop).toBeLessThanOrEqual(1);
        if (stats.probItm !== null) {
          expect(stats.probItm).toBeGreaterThanOrEqual(0);
          expect(stats.probItm).toBeLessThanOrEqual(1);
        }
        expect(Number.isFinite(stats.ev)).toBe(true);
        expect(stats.move2.lower).toBeLessThanOrEqual(stats.move1.lower);
        expect(stats.move2.upper).toBeGreaterThanOrEqual(stats.move1.upper);
      }),
      { numRuns: 300 }
    );
  });

  it("P(S_T > K) is non-increasing in K", () => {
    fc.assert(
      fc.property(distArb, fc.double({ min: 0.1, max: 3, noNaN: true }), fc.double({ min: 1, max: 2, noNaN: true }), (d, k, bump) => {
        const K = d.spot * k;
        expect(probAbove(K * bump, d)).toBeLessThanOrEqual(probAbove(K, d) + 1e-12);
      }),
      { numRuns: 300 }
    );
  });
});
