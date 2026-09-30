// Multi-leg options strategy templates. Each leg's strike is expressed as a
// multiple of spot (1.0 = ATM) so a template renders sensibly for any
// underlying and any spot price, rather than hardcoding strikes.
import { bs, smileVol, type Expiry } from "./pricing";
import { combinedPayoffSeries, type PricedLeg } from "./payoff";

export interface StrategyLeg {
  side: "call" | "put";
  action: "buy" | "sell";
  strikeOffset: number;
  /** Index offset into the expiry list, relative to the selected expiry:
   *  0 (the default) is the selected expiry itself, 1 the next listed one
   *  after it, and so on. Only calendars/diagonals set this. */
  expiryOffset?: number;
  /** Contracts for this leg per unit of the strategy (default 1). A
   *  butterfly's body is `ratio: 2`, a 1x2 ratio spread's short leg too. */
  ratio?: number;
}

export type StrategyOutlook = "bullish" | "bearish" | "neutral" | "volatile";
/** Net vega sign of the structure: long vol profits from rising IV / big moves. */
export type StrategyVolView = "long" | "short" | "neutral";
/** Whether max loss is bounded by the legs themselves. */
export type StrategyRisk = "defined" | "undefined";

export interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  outlook: StrategyOutlook;
  volView: StrategyVolView;
  risk: StrategyRisk;
  legs: StrategyLeg[];
}

export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    id: "straddle",
    name: "Long Straddle",
    description:
      "Buy a call and a put at the same (ATM) strike. Profits from a big move in either direction — max loss is both premiums paid if spot pins the strike at expiry.",
    outlook: "volatile", volView: "long", risk: "defined",
    legs: [
      { side: "call", action: "buy", strikeOffset: 1.0 },
      { side: "put", action: "buy", strikeOffset: 1.0 },
    ],
  },
  {
    id: "long-strangle",
    name: "Long Strangle",
    description:
      "Buy an OTM put and an OTM call. Cheaper than a straddle but needs a bigger move to pay off — max loss is both premiums if spot finishes between the strikes.",
    outlook: "volatile", volView: "long", risk: "defined",
    legs: [
      { side: "put", action: "buy", strikeOffset: 0.9 },
      { side: "call", action: "buy", strikeOffset: 1.1 },
    ],
  },
  {
    id: "short-strangle",
    name: "Short Strangle",
    description:
      "Sell an OTM put and an OTM call and keep both premiums if spot stays between the strikes. Nothing caps the loss on a big move in either direction.",
    outlook: "neutral", volView: "short", risk: "undefined",
    legs: [
      { side: "put", action: "sell", strikeOffset: 0.9 },
      { side: "call", action: "sell", strikeOffset: 1.1 },
    ],
  },
  {
    id: "bull-call-spread",
    name: "Bull Call Spread",
    description:
      "Buy an ATM call, sell a further OTM call to offset the cost. Caps both the upside and the downside — cheaper than a naked long call, bullish but capped.",
    outlook: "bullish", volView: "neutral", risk: "defined",
    legs: [
      { side: "call", action: "buy", strikeOffset: 1.0 },
      { side: "call", action: "sell", strikeOffset: 1.1 },
    ],
  },
  {
    id: "bear-put-spread",
    name: "Bear Put Spread",
    description:
      "Buy an ATM put, sell a further OTM put to offset the cost. Bearish but capped, cheaper than a naked long put.",
    outlook: "bearish", volView: "neutral", risk: "defined",
    legs: [
      { side: "put", action: "buy", strikeOffset: 1.0 },
      { side: "put", action: "sell", strikeOffset: 0.9 },
    ],
  },
  {
    id: "long-call-butterfly",
    name: "Long Call Butterfly",
    description:
      "Buy a lower call, sell two ATM calls, buy a higher call. A cheap bet that spot pins the middle strike at expiry; loss is capped at the net debit.",
    outlook: "neutral", volView: "short", risk: "defined",
    legs: [
      { side: "call", action: "buy", strikeOffset: 0.9 },
      { side: "call", action: "sell", strikeOffset: 1.0, ratio: 2 },
      { side: "call", action: "buy", strikeOffset: 1.1 },
    ],
  },
  {
    id: "long-put-butterfly",
    name: "Long Put Butterfly",
    description:
      "Buy a higher put, sell two ATM puts, buy a lower put. Same pin-the-middle payoff as the call butterfly, built from puts.",
    outlook: "neutral", volView: "short", risk: "defined",
    legs: [
      { side: "put", action: "buy", strikeOffset: 1.1 },
      { side: "put", action: "sell", strikeOffset: 1.0, ratio: 2 },
      { side: "put", action: "buy", strikeOffset: 0.9 },
    ],
  },
  {
    id: "iron-condor",
    name: "Iron Condor",
    description:
      "Sell an OTM put and OTM call, buy further-out put and call as protection. Collects premium if spot stays in the middle range through expiry; loss is capped by the protective legs.",
    outlook: "neutral", volView: "short", risk: "defined",
    legs: [
      { side: "put", action: "buy", strikeOffset: 0.85 },
      { side: "put", action: "sell", strikeOffset: 0.92 },
      { side: "call", action: "sell", strikeOffset: 1.08 },
      { side: "call", action: "buy", strikeOffset: 1.15 },
    ],
  },
  {
    id: "iron-butterfly",
    name: "Iron Butterfly",
    description:
      "Sell an ATM put and ATM call, buy OTM wings on both sides. A bigger credit than an iron condor with a narrower profit zone; loss is capped by the wings.",
    outlook: "neutral", volView: "short", risk: "defined",
    legs: [
      { side: "put", action: "buy", strikeOffset: 0.9 },
      { side: "put", action: "sell", strikeOffset: 1.0 },
      { side: "call", action: "sell", strikeOffset: 1.0 },
      { side: "call", action: "buy", strikeOffset: 1.1 },
    ],
  },
  {
    id: "collar",
    name: "Collar",
    description:
      "Buy an OTM put and sell an OTM call to hedge spot you already hold: the call premium pays for the downside protection. Shown here without the spot leg, so on its own it is a bearish risk reversal whose short call is uncapped.",
    outlook: "bearish", volView: "neutral", risk: "undefined",
    legs: [
      { side: "put", action: "buy", strikeOffset: 0.95 },
      { side: "call", action: "sell", strikeOffset: 1.05 },
    ],
  },
  {
    id: "call-ratio-spread",
    name: "Call Ratio Spread",
    description:
      "Buy one ATM call, sell two OTM calls. Cheap or even a credit, profits most with spot at the short strike, but the extra short call loses without limit on a big rally.",
    outlook: "bullish", volView: "short", risk: "undefined",
    legs: [
      { side: "call", action: "buy", strikeOffset: 1.0 },
      { side: "call", action: "sell", strikeOffset: 1.1, ratio: 2 },
    ],
  },
  {
    id: "put-ratio-spread",
    name: "Put Ratio Spread",
    description:
      "Buy one ATM put, sell two OTM puts. Profits most with spot at the short strike, but the extra short put keeps losing all the way down to zero.",
    outlook: "bearish", volView: "short", risk: "undefined",
    legs: [
      { side: "put", action: "buy", strikeOffset: 1.0 },
      { side: "put", action: "sell", strikeOffset: 0.9, ratio: 2 },
    ],
  },
  {
    id: "call-calendar",
    name: "Call Calendar Spread",
    description:
      "Sell an ATM call at the selected expiry, buy the same strike one expiry later. Profits from the near leg decaying faster than the far one if spot stays near the strike.",
    outlook: "neutral", volView: "long", risk: "defined",
    legs: [
      { side: "call", action: "sell", strikeOffset: 1.0, expiryOffset: 0 },
      { side: "call", action: "buy", strikeOffset: 1.0, expiryOffset: 1 },
    ],
  },
  {
    id: "call-diagonal",
    name: "Call Diagonal Spread",
    description:
      "Sell an OTM call at the selected expiry, buy an ATM call one expiry later. A calendar with a bullish tilt: it gains from a moderate rise toward the short strike.",
    outlook: "bullish", volView: "long", risk: "defined",
    legs: [
      { side: "call", action: "sell", strikeOffset: 1.05, expiryOffset: 0 },
      { side: "call", action: "buy", strikeOffset: 1.0, expiryOffset: 1 },
    ],
  },
  {
    id: "jade-lizard",
    name: "Jade Lizard",
    description:
      "Sell an OTM put and an OTM call spread. When the total credit exceeds the call spread's width there's no upside risk, but the short put is exposed all the way down.",
    outlook: "bullish", volView: "short", risk: "undefined",
    legs: [
      { side: "put", action: "sell", strikeOffset: 0.92 },
      { side: "call", action: "sell", strikeOffset: 1.05 },
      { side: "call", action: "buy", strikeOffset: 1.1 },
    ],
  },
];

export const legRatio = (leg: StrategyLeg) => leg.ratio ?? 1;
export const legExpiryOffset = (leg: StrategyLeg) => leg.expiryOffset ?? 0;
export const isMultiExpiryTemplate = (t: StrategyTemplate) =>
  new Set(t.legs.map(legExpiryOffset)).size > 1;

// ── Validation ────────────────────────────────────────────────────────

/** Returns a human-readable problem for every malformed template (empty = valid). */
export function validateTemplates(templates: StrategyTemplate[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const t of templates) {
    const where = `strategy "${t.id}"`;
    if (!t.id) errors.push("strategy with an empty id");
    if (seen.has(t.id)) errors.push(`${where}: duplicate id`);
    seen.add(t.id);
    if (!t.name) errors.push(`${where}: missing name`);
    if (t.legs.length === 0) errors.push(`${where}: has no legs`);
    t.legs.forEach((leg, i) => {
      const at = `${where} leg ${i}`;
      if (leg.side !== "call" && leg.side !== "put") errors.push(`${at}: side must be call or put`);
      if (leg.action !== "buy" && leg.action !== "sell") errors.push(`${at}: action must be buy or sell`);
      if (!Number.isFinite(leg.strikeOffset) || leg.strikeOffset <= 0) errors.push(`${at}: strikeOffset must be > 0`);
      const ratio = legRatio(leg);
      if (!Number.isInteger(ratio) || ratio < 1) errors.push(`${at}: ratio must be a positive integer`);
      const off = legExpiryOffset(leg);
      if (!Number.isInteger(off) || off < 0) errors.push(`${at}: expiryOffset must be a non-negative integer`);
    });
    if (t.legs.length > 0 && !t.legs.some(l => legExpiryOffset(l) === 0)) {
      errors.push(`${where}: at least one leg must be on the selected expiry (expiryOffset 0)`);
    }
    // Cross-check the risk label against the payoff itself for
    // single-expiry structures — a "defined" label on a template that
    // actually has a naked tail is exactly the kind of mistake that
    // would hide a warning the user needs to see.
    if (t.legs.length > 0 && !isMultiExpiryTemplate(t)) {
      const unbounded = hasUnboundedLoss(t);
      if (t.risk === "defined" && unbounded) errors.push(`${where}: labelled defined-risk but its loss is unbounded`);
      if (t.risk === "undefined" && !unbounded) errors.push(`${where}: labelled undefined-risk but its loss is bounded`);
    }
  }
  return errors;
}

// Premium-free payoff: the naked-tail question depends only on the
// strikes and quantities, not on what was paid. "Unbounded" here also
// covers a short put's loss all the way to zero spot, which is bounded in
// theory but is the undefined-risk case traders mean in practice.
function hasUnboundedLoss(t: StrategyTemplate): boolean {
  return legsHaveUnboundedLoss(t.legs.map(l => ({ side: l.side, action: l.action, contracts: legRatio(l) })));
}

/** Net short calls or net short puts across the legs = undefined risk. */
export function legsHaveUnboundedLoss(legs: Array<{ side: "call" | "put"; action: "buy" | "sell"; contracts: number }>): boolean {
  let callQty = 0;
  let putQty = 0;
  for (const leg of legs) {
    const q = (leg.action === "buy" ? 1 : -1) * leg.contracts;
    if (leg.side === "call") callQty += q;
    else putQty += q;
  }
  return callQty < -1e-9 || putQty < -1e-9;
}

if (process.env.NODE_ENV !== "production") {
  const errors = validateTemplates(STRATEGY_TEMPLATES);
  if (errors.length > 0) throw new Error(`Invalid STRATEGY_TEMPLATES:\n${errors.join("\n")}`);
}

// ── Resolving a template against a live market ────────────────────────

export interface ResolvedStrikes {
  strikes: number[];
  /** True when a leg had to move off its nearest listed strike because
   *  another leg with a different offset already snapped to it. */
  adjusted: boolean;
}

/**
 * Snaps each leg's `spot × strikeOffset` to a listed strike, keeping legs
 * with different offsets on different strikes and in the same order. On a
 * low-priced underlying like XLM, adjacent offsets (0.95 / 1.0) can round
 * to the same listed strike, which would silently turn a butterfly or
 * spread into a degenerate zero-width structure — so the colliding leg is
 * pushed out to the next listed strike away from the ATM anchor instead.
 * Returns null if there aren't enough listed strikes to do that.
 */
export function resolveStrikes(legs: StrategyLeg[], spot: number, listedStrikes: number[]): ResolvedStrikes | null {
  const listed = Array.from(new Set(listedStrikes.filter(k => k > 0))).sort((a, b) => a - b);
  if (listed.length === 0) {
    return { strikes: legs.map(l => Math.round(spot * l.strikeOffset * 10000) / 10000), adjusted: false };
  }
  const nearestIdx = (target: number) => {
    // Binary search for the first strike >= target, then pick the closer
    // neighbour (ties go to the lower strike).
    let lo = 0;
    let hi = listed.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (listed[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    if (lo === 0) return 0;
    if (lo === listed.length) return listed.length - 1;
    return target - listed[lo - 1] <= listed[lo] - target ? lo - 1 : lo;
  };

  const offsets = Array.from(new Set(legs.map(l => l.strikeOffset))).sort((a, b) => a - b);
  const anchor = offsets.reduce((best, o) => (Math.abs(o - 1) < Math.abs(best - 1) ? o : best), offsets[0]);
  const anchorPos = offsets.indexOf(anchor);
  const idxFor = new Map<number, number>();
  idxFor.set(anchor, nearestIdx(spot * anchor));
  let adjusted = false;

  for (let i = anchorPos + 1; i < offsets.length; i++) {
    const want = nearestIdx(spot * offsets[i]);
    const floor = idxFor.get(offsets[i - 1])! + 1;
    if (want < floor) adjusted = true;
    const idx = Math.max(want, floor);
    if (idx >= listed.length) return null;
    idxFor.set(offsets[i], idx);
  }
  for (let i = anchorPos - 1; i >= 0; i--) {
    const want = nearestIdx(spot * offsets[i]);
    const ceil = idxFor.get(offsets[i + 1])! - 1;
    if (want > ceil) adjusted = true;
    const idx = Math.min(want, ceil);
    if (idx < 0) return null;
    idxFor.set(offsets[i], idx);
  }

  return { strikes: legs.map(l => listed[idxFor.get(l.strikeOffset)!]), adjusted };
}

export interface BuildContext {
  spot: number;
  /** ATM vol for the underlying; each leg gets the smile vol at its moneyness. */
  vol: number;
  expiries: Expiry[];
  /** Index into `expiries` of the selected (nearest) expiry. */
  expiryIndex: number;
  /** Strategy units — each leg trades `contracts × ratio`. */
  contracts: number;
  /** Strikes listed on the chain; empty falls back to unsnapped spot × offset. */
  listedStrikes: number[];
}

/** `error` is set (and `legs` empty) when the template can't be built. */
export interface BuildResult {
  legs: PricedLeg[];
  adjusted: boolean;
  error: string | null;
}

export function buildStrategyLegs(template: StrategyTemplate, ctx: BuildContext): BuildResult {
  const maxOffset = Math.max(...template.legs.map(legExpiryOffset));
  if (ctx.expiryIndex + maxOffset >= ctx.expiries.length) {
    return { legs: [], adjusted: false, error: `${template.name} needs a later expiry than ${ctx.expiries[ctx.expiryIndex]?.label ?? "the selected one"} — pick an earlier expiry.` };
  }
  const resolved = resolveStrikes(template.legs, ctx.spot, ctx.listedStrikes);
  if (!resolved) {
    return { legs: [], adjusted: false, error: `Not enough listed strikes to build a ${template.name} around the current spot.` };
  }
  const legs = template.legs.map((leg, i): PricedLeg => {
    const strike = resolved.strikes[i];
    const expiryDays = ctx.expiries[ctx.expiryIndex + legExpiryOffset(leg)].days;
    return priceLeg({
      side: leg.side, action: leg.action, strike, expiryDays,
      contracts: ctx.contracts * legRatio(leg),
    }, ctx.spot, ctx.vol);
  });
  return { legs, adjusted: resolved.adjusted, error: null };
}

export interface LegSpec {
  side: "call" | "put";
  action: "buy" | "sell";
  strike: number;
  expiryDays: number;
  contracts: number;
}

/** Local Black-Scholes preview price for a single concrete leg. */
export function priceLeg(spec: LegSpec, spot: number, vol: number): PricedLeg {
  const legVol = smileVol(vol, spec.strike / spot);
  return { ...spec, greeks: bs(spot, spec.strike, legVol, spec.expiryDays / 365, spec.side === "call") };
}

/** Payoff sampled at fixed spot multiples — used for snapshot tests. */
export function samplePayoff(legs: PricedLeg[], spot: number, points = 9) {
  return combinedPayoffSeries(legs, spot * 0.6, spot * 1.4, points - 1)
    .map(pt => ({ s: +pt.s.toPrecision(6), p: +pt.p.toPrecision(6) }));
}
