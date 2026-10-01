import { describe, expect, it } from "vitest";
import {
  MAX_CANDIDATES, TOP_N, capitalRequired, centersFor, expiryIndicesFor, generateCandidates,
  maxLossOf, priceCandidate, probabilityStats, scoreOf, searchStrategies, type FinderInput,
} from "./engine";
import { BULLISH_INPUT, FIXTURE_MARKET } from "./fixtures";
import { STRATEGY_TEMPLATES } from "../../lib/strategies";
import type { PricedLeg } from "../../lib/payoff";

const leg = (p: Partial<PricedLeg> & Pick<PricedLeg, "side" | "action" | "strike">): PricedLeg => ({
  contracts: 1, greeks: { premium: 0, delta: 0, gamma: 0, theta: 0, vega: 0, iv: 0.6 }, ...p,
});

describe("scoring primitives", () => {
  it("maxLossOf finds a vertical spread's loss exactly (the debit)", () => {
    const spread = [
      leg({ side: "call", action: "buy", strike: 100, greeks: { premium: 6, delta: 0, gamma: 0, theta: 0, vega: 0, iv: 0.6 } }),
      leg({ side: "call", action: "sell", strike: 110, greeks: { premium: 2, delta: 0, gamma: 0, theta: 0, vega: 0, iv: 0.6 } }),
    ];
    expect(maxLossOf(spread, 100)).toBeCloseTo(4, 10);
  });

  it("maxLossOf is Infinity for net short calls", () => {
    expect(maxLossOf([leg({ side: "call", action: "sell", strike: 110 })], 100)).toBe(Infinity);
  });

  it("probabilityStats: a zero-cost long call is profitable roughly as often as spot ends above the strike", () => {
    const call = [leg({ side: "call", action: "buy", strike: 100, expiryDays: 30 })];
    const { pop, expectedValue } = probabilityStats(call, 100, 0.6);
    expect(pop).toBeGreaterThan(0.45);
    expect(pop).toBeLessThan(0.55);
    expect(expectedValue).toBeGreaterThan(0);
  });

  it("capitalRequired adds collateral for short legs to the net debit", () => {
    const legs = [
      leg({ side: "put", action: "sell", strike: 90, greeks: { premium: 3, delta: 0, gamma: 0, theta: 0, vega: 0, iv: 0.6 } }),
    ];
    // Cash-secured put: 110% of strike, and a credit adds nothing.
    expect(capitalRequired(legs, 100)).toBeCloseTo(99, 10);
  });

  it("scoreOf rewards return on risk and probability, and stays below 1", () => {
    const base = { returnOnRisk: 1, pop: 0.5, expectedValue: 0 };
    expect(scoreOf({ ...base, returnOnRisk: 3 }, 10)).toBeGreaterThan(scoreOf(base, 10));
    expect(scoreOf({ ...base, pop: 0.8 }, 10)).toBeGreaterThan(scoreOf(base, 10));
    expect(scoreOf({ returnOnRisk: 1e9, pop: 1, expectedValue: 1e9 }, 1)).toBeLessThan(1.0000001);
  });
});

describe("candidate generation", () => {
  it("uses expiries on or after the target date, nearest first", () => {
    expect(expiryIndicesFor(FIXTURE_MARKET.expiries, 20).map(i => FIXTURE_MARKET.expiries[i].days)).toEqual([30, 60, 90]);
    expect(expiryIndicesFor(FIXTURE_MARKET.expiries, 400).map(i => FIXTURE_MARKET.expiries[i].days)).toEqual([180]);
  });

  it("spans centers from spot to target", () => {
    const c = centersFor(100, 120);
    expect(c[0]).toBeCloseTo(0.95);
    expect(c[c.length - 1]).toBeCloseTo(1.26);
  });

  it("only uses templates matching the outlook, and skips undefined risk unless opted in", () => {
    const { raw, undefinedRisk } = generateCandidates(BULLISH_INPUT, FIXTURE_MARKET);
    const ids = new Set(raw.map(r => r.template.id));
    for (const id of Array.from(ids)) {
      const t = STRATEGY_TEMPLATES.find(x => x.id === id)!;
      expect(t.outlook).toBe("bullish");
      expect(t.risk).toBe("defined");
    }
    expect(undefinedRisk).toBeGreaterThan(0);
    const withUndefined = generateCandidates({ ...BULLISH_INPUT, allowUndefinedRisk: true }, FIXTURE_MARKET);
    expect(withUndefined.raw.some(r => r.template.risk === "undefined")).toBe(true);
  });

  it("never generates two candidates with the same legs", () => {
    const { raw } = generateCandidates(BULLISH_INPUT, FIXTURE_MARKET);
    const keys = raw.map(r => `${r.template.id}|${r.legs.map(l => `${l.strike}@${l.expiryDays}`).join()}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(raw.length).toBeLessThanOrEqual(MAX_CANDIDATES);
  });

  it("stays under MAX_CANDIDATES for every outlook, even with undefined risk allowed", () => {
    for (const outlook of ["bullish", "bearish", "neutral", "volatile"] as const) {
      const { raw, capped } = generateCandidates({ ...BULLISH_INPUT, outlook, allowUndefinedRisk: true }, FIXTURE_MARKET);
      expect(raw.length).toBeLessThanOrEqual(MAX_CANDIDATES);
      expect(capped).toBe(false);
    }
  });
});

describe("searchStrategies", () => {
  it("returns at most TOP_N candidates, all within budget and max loss and profitable at target", () => {
    const { candidates } = searchStrategies(BULLISH_INPUT, FIXTURE_MARKET);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(TOP_N);
    for (const c of candidates) {
      expect(c.capital).toBeLessThanOrEqual(BULLISH_INPUT.budget);
      expect(c.maxLoss).toBeLessThanOrEqual(BULLISH_INPUT.maxLoss);
      expect(c.pnlAtTarget).toBeGreaterThan(0);
      expect(c.risk).toBe("defined");
    }
    for (let i = 1; i < candidates.length; i++) expect(candidates[i - 1].score).toBeGreaterThanOrEqual(candidates[i].score);
  });

  it("ranks deterministically on a fixture chain", () => {
    const a = searchStrategies(BULLISH_INPUT, FIXTURE_MARKET).candidates.map(c => c.id);
    const b = searchStrategies(BULLISH_INPUT, FIXTURE_MARKET).candidates.map(c => c.id);
    expect(a).toEqual(b);
    expect(a).toMatchSnapshot();
  });

  it("prunes everything when the budget is too small, and says why", () => {
    const r = searchStrategies({ ...BULLISH_INPUT, budget: 1 }, FIXTURE_MARKET);
    expect(r.candidates).toEqual([]);
    expect(r.pruned.budget).toBeGreaterThan(0);
  });

  it("includes undefined-risk structures only when opted in", () => {
    const input: FinderInput = { ...BULLISH_INPUT, outlook: "neutral", targetPrice: 100, budget: 1000, maxLoss: 50 };
    expect(searchStrategies(input, FIXTURE_MARKET).candidates.every(c => c.risk === "defined")).toBe(true);
    const optedResult = searchStrategies({ ...input, allowUndefinedRisk: true }, FIXTURE_MARKET, Infinity);
    expect(optedResult.pruned.undefinedRisk).toBe(0);
    const opted = optedResult.candidates;
    expect(opted.some(c => c.risk === "undefined")).toBe(true);
    expect(opted.filter(c => c.risk === "undefined").every(c => c.maxLoss === Infinity)).toBe(true);
  });

  it("candidate legs re-price to the reported net premium", () => {
    const [top] = searchStrategies(BULLISH_INPUT, FIXTURE_MARKET).candidates;
    const priced = priceCandidate(top.legs, FIXTURE_MARKET);
    const net = priced.reduce((s, l) => s + (l.action === "buy" ? 1 : -1) * l.greeks.premium * l.contracts, 0);
    expect(net).toBeCloseTo(top.netPremium, 10);
  });

  it("benchmark: every outlook searches in well under 500 ms", () => {
    const run = (outlook: FinderInput["outlook"]) => {
      // Worst case: nothing pruned, every candidate fully scored.
      const input: FinderInput = { ...BULLISH_INPUT, outlook, budget: 1e6, maxLoss: 1e6, allowUndefinedRisk: true };
      const started = performance.now();
      const r = searchStrategies(input, FIXTURE_MARKET);
      expect(r.generated).toBeGreaterThan(0);
      return performance.now() - started;
    };
    const outlooks = ["bullish", "bearish", "neutral", "volatile"] as const;
    outlooks.forEach(run); // JIT warm-up, as a long-lived worker would be
    for (const outlook of outlooks) {
      // Best of 5: the search's own cost, not whatever else the (parallel)
      // test run is doing to the CPU at that moment.
      const best = Math.min(...Array.from({ length: 5 }, () => run(outlook)));
      console.info(`finder benchmark ${outlook}: ${best.toFixed(0)} ms`);
      expect([outlook, best < 500]).toEqual([outlook, true]);
    }
  });
});
