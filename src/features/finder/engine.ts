// Strategy finder engine: generates candidate strategies from the template
// library across listed strikes/expiries, prunes anything over budget or
// max loss as early as possible, then scores the survivors against the
// user's view (target price by a date). Pure functions only — this runs
// inside finder.worker.ts, and in tests directly.
import { collateralRequired } from "../../lib/collateral";
import { combinedPnl, isMultiExpiry, nearestExpiryDays, netPremium, strategyPnl, strategyPnlFn, type PricedLeg } from "../../lib/payoff";
import type { Expiry } from "../../lib/pricing";
import {
  STRATEGY_TEMPLATES, legExpiryOffset, legRatio, legsHaveUnboundedLoss, priceLeg, resolveStrikes,
  type StrategyOutlook, type StrategyRisk, type StrategyTemplate, type StrategyVolView,
} from "../../lib/strategies";

export interface FinderInput {
  outlook: StrategyOutlook;
  targetPrice: number;
  /** Days from now to the date the user expects the target to be reached. */
  targetDays: number;
  /** Largest acceptable worst-case loss, in dollars, for one strategy unit. */
  maxLoss: number;
  /** Capital available: net debit plus collateral for short legs. */
  budget: number;
  /** Undefined-risk structures are excluded unless this is set. */
  allowUndefinedRisk: boolean;
}

export interface FinderMarket {
  spot: number;
  vol: number;
  strikes: number[];
  expiries: Expiry[];
}

export interface CandidateLeg {
  side: "call" | "put";
  action: "buy" | "sell";
  strike: number;
  expiryDays: number;
  ratio: number;
}

export interface Candidate {
  id: string;
  templateId: string;
  name: string;
  outlook: StrategyOutlook;
  volView: StrategyVolView;
  risk: StrategyRisk;
  legs: CandidateLeg[];
  /** Positive = debit paid, negative = credit received. */
  netPremium: number;
  /** Net debit (if any) plus collateral for the short legs. */
  capital: number;
  /** Worst-case loss as a positive number; Infinity for undefined risk. */
  maxLoss: number;
  /** P&L at the nearest expiry if spot is exactly at the target. */
  pnlAtTarget: number;
  /** Probability the position is profitable at its nearest expiry (lognormal, current IV). */
  pop: number;
  /** Expected P&L at the nearest expiry under the same distribution. */
  expectedValue: number;
  /** pnlAtTarget / max loss (or / capital for undefined-risk). */
  returnOnRisk: number;
  /** pnlAtTarget / capital tied up. */
  capitalEfficiency: number;
  score: number;
}

export interface FinderResult {
  candidates: Candidate[];
  generated: number;
  pruned: { budget: number; maxLoss: number; undefinedRisk: number; unprofitable: number };
  /** True when generation stopped at MAX_CANDIDATES. */
  capped: boolean;
  elapsedMs: number;
}

export const MAX_CANDIDATES = 5000;
export const TOP_N = 10;
const RISK_FREE = 0.05; // same r the local Black-Scholes uses
const WIDTHS = [0.5, 0.75, 1, 1.5, 2];
const CENTER_COUNT = 9;
const EXPIRIES_PER_TEMPLATE = 3;
const PDF_POINTS = 101;

/** Candidate expiries: the ones on/after the target date, nearest first (or the longest listed). */
export function expiryIndicesFor(expiries: Expiry[], targetDays: number): number[] {
  const sorted = expiries.map((e, i) => ({ e, i })).sort((a, b) => a.e.days - b.e.days);
  const after = sorted.filter(x => x.e.days >= targetDays);
  const picked = after.length > 0 ? after : sorted.slice(-1);
  return picked.slice(0, EXPIRIES_PER_TEMPLATE).map(x => x.i);
}

/** Structure centers, as spot multiples, spanning spot → target with a margin. */
export function centersFor(spot: number, target: number): number[] {
  const lo = Math.min(spot, target) * 0.95;
  const hi = Math.max(spot, target) * 1.05;
  return Array.from({ length: CENTER_COUNT }, (_, i) => (lo + ((hi - lo) * i) / (CENTER_COUNT - 1)) / spot);
}

interface RawCandidate {
  template: StrategyTemplate;
  legs: CandidateLeg[];
}

/** Every template × expiry × center × width variation, deduplicated, capped. */
export function generateCandidates(input: FinderInput, market: FinderMarket): { raw: RawCandidate[]; capped: boolean; undefinedRisk: number } {
  const templates = STRATEGY_TEMPLATES.filter(t => t.outlook === input.outlook);
  const expiryIdx = expiryIndicesFor(market.expiries, input.targetDays);
  const byDays = [...market.expiries].sort((a, b) => a.days - b.days);
  const centers = centersFor(market.spot, input.targetPrice);
  const seen = new Set<string>();
  const raw: RawCandidate[] = [];
  let undefinedRisk = 0;

  for (const template of templates) {
    // Pruned before any strike is resolved or leg priced: the risk class
    // depends only on the template's shape.
    if (template.risk === "undefined" && !input.allowUndefinedRisk) {
      undefinedRisk++;
      continue;
    }
    for (const ei of expiryIdx) {
      const sortedPos = byDays.indexOf(market.expiries[ei]);
      const maxOffset = Math.max(...template.legs.map(legExpiryOffset));
      if (sortedPos + maxOffset >= byDays.length) continue;
      for (const center of centers) {
        for (const width of WIDTHS) {
          const shaped = template.legs.map(l => ({ ...l, strikeOffset: center + (l.strikeOffset - 1) * width }));
          if (shaped.some(l => l.strikeOffset <= 0)) continue;
          const resolved = resolveStrikes(shaped, market.spot, market.strikes);
          if (!resolved) continue;
          const legs = template.legs.map((l, i): CandidateLeg => ({
            side: l.side, action: l.action, strike: resolved.strikes[i],
            expiryDays: byDays[sortedPos + legExpiryOffset(l)].days, ratio: legRatio(l),
          }));
          const key = `${template.id}|${legs.map(l => `${l.strike}@${l.expiryDays}`).join(",")}`;
          if (seen.has(key)) continue;
          seen.add(key);
          raw.push({ template, legs });
          if (raw.length >= MAX_CANDIDATES) return { raw, capped: true, undefinedRisk };
        }
      }
    }
  }
  return { raw, capped: false, undefinedRisk };
}

export function priceCandidate(legs: CandidateLeg[], market: FinderMarket): PricedLeg[] {
  return legs.map(l => priceLeg({ side: l.side, action: l.action, strike: l.strike, expiryDays: l.expiryDays, contracts: l.ratio }, market.spot, market.vol));
}

export function capitalRequired(legs: PricedLeg[], spot: number): number {
  const collateral = legs.reduce((sum, l) => (l.action === "sell" ? sum + collateralRequired(l.side, l.contracts, l.strike, spot) : sum), 0);
  return collateral + Math.max(0, netPremium(legs));
}

/**
 * Worst-case loss at the nearest expiry, as a positive number (Infinity
 * when uncapped). A single-expiry payoff is piecewise linear with kinks
 * only at the strikes, so its minimum is at a strike or at a tail — no
 * grid needed. Multi-expiry payoffs are curved, so they're sampled.
 */
export function maxLossOf(legs: PricedLeg[], spot: number): number {
  if (legsHaveUnboundedLoss(legs)) return Infinity;
  let worst: number;
  if (!isMultiExpiry(legs)) {
    const points = [0, ...legs.map(l => l.strike), Math.max(...legs.map(l => l.strike)) * 2];
    worst = Math.min(...points.map(s => combinedPnl(legs, s)));
  } else {
    const pnl = strategyPnlFn(legs);
    worst = Infinity;
    for (let i = 0; i <= 80; i++) worst = Math.min(worst, pnl(spot * (0.2 + (2.8 * i) / 80)));
  }
  return Math.max(0, -worst);
}

/** PoP and expected P&L under a lognormal spot distribution at the nearest expiry. */
export function probabilityStats(legs: PricedLeg[], spot: number, vol: number): { pop: number; expectedValue: number } {
  const days = nearestExpiryDays(legs) ?? 30;
  const t = Math.max(days, 1) / 365;
  const sd = vol * Math.sqrt(t);
  const mu = (RISK_FREE - 0.5 * vol * vol) * t;
  const pnlAt = strategyPnlFn(legs);
  let wSum = 0;
  let pop = 0;
  let ev = 0;
  for (let i = 0; i < PDF_POINTS; i++) {
    const z = -5 + (10 * i) / (PDF_POINTS - 1);
    const w = Math.exp(-0.5 * z * z);
    const pnl = pnlAt(spot * Math.exp(mu + sd * z));
    wSum += w;
    ev += w * pnl;
    if (pnl > 0) pop += w;
  }
  return { pop: pop / wSum, expectedValue: ev / wSum };
}

/**
 * Composite rank in [0, 1): half return on risk at the target (squashed
 * so one outlier can't dominate), a third probability of profit, the rest
 * expected value per unit of risk.
 */
export function scoreOf(c: Pick<Candidate, "returnOnRisk" | "pop" | "expectedValue">, riskBase: number): number {
  const ror = Math.max(0, c.returnOnRisk);
  const evPerRisk = riskBase > 0 ? c.expectedValue / riskBase : 0;
  return 0.5 * (ror / (1 + ror)) + 0.3 * c.pop + 0.2 * Math.min(1, Math.max(0, (evPerRisk + 1) / 2));
}

export function searchStrategies(
  input: FinderInput, market: FinderMarket, limit = TOP_N, now: () => number = () => Date.now(),
): FinderResult {
  const started = now();
  const pruned = { budget: 0, maxLoss: 0, undefinedRisk: 0, unprofitable: 0 };
  const { raw, capped, undefinedRisk } = generateCandidates(input, market);
  pruned.undefinedRisk = undefinedRisk;
  const scored: Candidate[] = [];

  for (const { template, legs } of raw) {
    const priced = priceCandidate(legs, market);
    const capital = capitalRequired(priced, market.spot);
    if (capital > input.budget) { pruned.budget++; continue; }
    const maxLoss = maxLossOf(priced, market.spot);
    if (Number.isFinite(maxLoss) ? maxLoss > input.maxLoss : !input.allowUndefinedRisk) { pruned.maxLoss++; continue; }

    const pnlAtTarget = strategyPnl(priced, input.targetPrice);
    if (pnlAtTarget <= 0) { pruned.unprofitable++; continue; }

    const { pop, expectedValue } = probabilityStats(priced, market.spot, market.vol);
    const riskBase = Number.isFinite(maxLoss) && maxLoss > 0 ? maxLoss : Math.max(capital, 1e-9);
    const returnOnRisk = pnlAtTarget / riskBase;
    const capitalEfficiency = capital > 0 ? pnlAtTarget / capital : returnOnRisk;
    const candidate: Candidate = {
      id: `${template.id}|${legs.map(l => `${l.action[0]}${l.ratio}${l.side[0]}${l.strike}@${l.expiryDays}`).join(",")}`,
      templateId: template.id, name: template.name,
      outlook: template.outlook, volView: template.volView, risk: template.risk,
      legs, netPremium: netPremium(priced), capital, maxLoss,
      pnlAtTarget, pop, expectedValue, returnOnRisk, capitalEfficiency, score: 0,
    };
    candidate.score = scoreOf(candidate, riskBase);
    scored.push(candidate);
  }

  // Ties broken by id so identical inputs always rank identically.
  scored.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { candidates: scored.slice(0, limit), generated: raw.length, pruned, capped, elapsedMs: now() - started };
}
