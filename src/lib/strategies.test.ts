import { describe, expect, it } from "vitest";
import {
  STRATEGY_TEMPLATES, buildStrategyLegs, isMultiExpiryTemplate, legsHaveUnboundedLoss,
  resolveStrikes, samplePayoff, validateTemplates, type StrategyTemplate,
} from "./strategies";
import { EXPIRIES } from "./pricing";
import { combinedPnl, markToModelPnl, nearestExpiryDays, strategyPnl } from "./payoff";

// Fixed market so snapshots are deterministic: a $100 underlying, 60% vol,
// strikes listed every $2.50, selected expiry 30D (index 2) with 60D next.
const SPOT = 100;
const LISTED = Array.from({ length: 41 }, (_, i) => 50 + i * 2.5);
const CTX = { spot: SPOT, vol: 0.6, expiries: EXPIRIES, expiryIndex: 2, contracts: 1, listedStrikes: LISTED };

describe("STRATEGY_TEMPLATES", () => {
  it("has at least 12 structures, all valid", () => {
    expect(STRATEGY_TEMPLATES.length).toBeGreaterThanOrEqual(12);
    expect(validateTemplates(STRATEGY_TEMPLATES)).toEqual([]);
  });

  it("includes every structure the library promises", () => {
    const ids = STRATEGY_TEMPLATES.map(t => t.id);
    for (const id of [
      "long-strangle", "short-strangle", "long-call-butterfly", "long-put-butterfly", "iron-butterfly",
      "collar", "call-ratio-spread", "put-ratio-spread", "call-calendar", "call-diagonal", "jade-lizard",
    ]) expect(ids).toContain(id);
  });

  it.each(STRATEGY_TEMPLATES.map(t => [t.id, t] as const))("%s payoff matches snapshot", (_id, template) => {
    const built = buildStrategyLegs(template, CTX);
    expect(built.error).toBeNull();
    expect({
      strikes: built.legs.map(l => `${l.action} ${l.contracts}x ${l.side} ${l.strike} @${l.expiryDays}D`),
      payoff: samplePayoff(built.legs, SPOT),
    }).toMatchSnapshot();
  });
});

describe("validateTemplates", () => {
  const base: StrategyTemplate = {
    id: "x", name: "X", description: "", outlook: "bullish", volView: "neutral", risk: "defined",
    legs: [{ side: "call", action: "buy", strikeOffset: 1 }],
  };

  it("flags malformed legs", () => {
    const errors = validateTemplates([{
      ...base,
      legs: [{ side: "call", action: "buy", strikeOffset: -1, ratio: 1.5, expiryOffset: -1 }],
    }]);
    expect(errors.join("\n")).toMatch(/strikeOffset/);
    expect(errors.join("\n")).toMatch(/ratio/);
    expect(errors.join("\n")).toMatch(/expiryOffset/);
  });

  it("flags duplicate ids and empty legs", () => {
    expect(validateTemplates([base, base])).toContain('strategy "x": duplicate id');
    expect(validateTemplates([{ ...base, legs: [] }])).toContain('strategy "x": has no legs');
  });

  it("flags a risk label that contradicts the payoff", () => {
    const nakedCall: StrategyTemplate = { ...base, legs: [{ side: "call", action: "sell", strikeOffset: 1.1 }] };
    expect(validateTemplates([nakedCall]).join()).toMatch(/labelled defined-risk but its loss is unbounded/);
    expect(validateTemplates([{ ...base, risk: "undefined" }]).join()).toMatch(/labelled undefined-risk/);
  });

  it("requires a leg on the selected expiry", () => {
    const allFar: StrategyTemplate = { ...base, legs: [{ side: "call", action: "buy", strikeOffset: 1, expiryOffset: 1 }] };
    expect(validateTemplates([allFar]).join()).toMatch(/expiryOffset 0/);
  });
});

describe("resolveStrikes", () => {
  it("snaps to the nearest listed strike", () => {
    const r = resolveStrikes([{ side: "call", action: "buy", strikeOffset: 1.04 }], 100, LISTED)!;
    expect(r.strikes).toEqual([105]);
    expect(r.adjusted).toBe(false);
  });

  it("keeps a butterfly's wings off its body when offsets collapse (XLM-style wide listing)", () => {
    // XLM at $0.1182 with strikes every 4%: 0.99 / 1.0 / 1.01 all round to
    // the ATM strike. The wings must be pushed one strike out each way.
    const spot = 0.1182;
    const listed = Array.from({ length: 21 }, (_, i) => Math.round(spot * (1 + (i - 10) * 0.04) * 10000) / 10000);
    const legs = [
      { side: "call" as const, action: "buy" as const, strikeOffset: 0.99 },
      { side: "call" as const, action: "sell" as const, strikeOffset: 1.0, ratio: 2 },
      { side: "call" as const, action: "buy" as const, strikeOffset: 1.01 },
    ];
    const r = resolveStrikes(legs, spot, listed)!;
    expect(r.adjusted).toBe(true);
    expect(r.strikes[0]).toBeLessThan(r.strikes[1]);
    expect(r.strikes[1]).toBeLessThan(r.strikes[2]);
    expect(r.strikes[1]).toBe(listed[10]);
  });

  it("returns null when there aren't enough strikes to stay distinct", () => {
    const legs = [
      { side: "call" as const, action: "buy" as const, strikeOffset: 1.0 },
      { side: "call" as const, action: "sell" as const, strikeOffset: 1.1 },
    ];
    expect(resolveStrikes(legs, 100, [100])).toBeNull();
  });

  it("gives legs sharing an offset the same strike", () => {
    const r = resolveStrikes(STRATEGY_TEMPLATES.find(t => t.id === "iron-butterfly")!.legs, 100, LISTED)!;
    expect(r.strikes[1]).toBe(r.strikes[2]);
  });
});

describe("buildStrategyLegs", () => {
  it("applies ratios to contracts", () => {
    const fly = STRATEGY_TEMPLATES.find(t => t.id === "long-call-butterfly")!;
    const built = buildStrategyLegs(fly, { ...CTX, contracts: 3 });
    expect(built.legs.map(l => l.contracts)).toEqual([3, 6, 3]);
  });

  it("puts calendar legs on consecutive expiries", () => {
    const cal = STRATEGY_TEMPLATES.find(t => t.id === "call-calendar")!;
    expect(isMultiExpiryTemplate(cal)).toBe(true);
    const built = buildStrategyLegs(cal, CTX);
    expect(built.legs.map(l => l.expiryDays)).toEqual([30, 60]);
  });

  it("refuses a calendar on the last listed expiry", () => {
    const cal = STRATEGY_TEMPLATES.find(t => t.id === "call-calendar")!;
    const built = buildStrategyLegs(cal, { ...CTX, expiryIndex: EXPIRIES.length - 1 });
    expect(built.error).toMatch(/later expiry/);
    expect(built.legs).toEqual([]);
  });
});

describe("multi-expiry payoff", () => {
  it("equals the plain expiry payoff when every leg shares an expiry", () => {
    const built = buildStrategyLegs(STRATEGY_TEMPLATES.find(t => t.id === "iron-condor")!, CTX);
    for (const s of [70, 95, 100, 120]) {
      expect(strategyPnl(built.legs, s)).toBeCloseTo(combinedPnl(built.legs, s), 10);
    }
  });

  it("marks the far calendar leg to model at the near expiry", () => {
    const built = buildStrategyLegs(STRATEGY_TEMPLATES.find(t => t.id === "call-calendar")!, CTX);
    expect(nearestExpiryDays(built.legs)).toBe(30);
    // At the strike, the near call expires worthless and the far call still
    // has 30 days of time value, so the calendar should be profitable.
    const atStrike = strategyPnl(built.legs, built.legs[0].strike);
    expect(atStrike).toBeGreaterThan(0);
    expect(atStrike).toBeCloseTo(markToModelPnl(built.legs, built.legs[0].strike, 30), 10);
    // Far from the strike both legs converge on intrinsic, so the loss is
    // bounded by roughly the debit paid.
    const debit = built.legs[1].greeks.premium - built.legs[0].greeks.premium;
    expect(strategyPnl(built.legs, 40)).toBeGreaterThan(-debit - 1e-6);
  });
});

describe("legsHaveUnboundedLoss", () => {
  it("classifies every template consistently with its risk label", () => {
    for (const t of STRATEGY_TEMPLATES) {
      const unbounded = legsHaveUnboundedLoss(t.legs.map(l => ({ side: l.side, action: l.action, contracts: l.ratio ?? 1 })));
      expect([t.id, unbounded]).toEqual([t.id, t.risk === "undefined"]);
    }
  });
});
