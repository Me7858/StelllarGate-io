// Probability analytics on top of the payoff math: probability of profit,
// probability ITM, expected value and expected-move ranges, all from a
// lognormal terminal distribution of spot at expiry.
//
// Model assumptions (surfaced in the UI's assumptions tooltip):
// - Risk-neutral drift: ln S_T ~ N(ln S + (r − σ²/2)·t, σ²·t), with the
//   same r=5% bs() prices with. These are market-implied odds, not a
//   forecast of where spot will actually go.
// - Flat IV: one σ for the whole distribution. `volAt` optionally swaps
//   in a strike-specific (smile-adjusted) σ for the "is spot above this
//   level" probabilities — P(ITM) and the PoP interval edges — while EV,
//   the density and the expected move keep the flat σ, since a single
//   smile-consistent density would need a full Breeden–Litzenberger fit.
// - Payoffs are evaluated at expiry (intrinsic value), the same
//   simplification the payoff diagrams and risk.ts already make.
import { normCDF, normPDF, RISK_FREE_RATE } from "./pricing";
import { combinedPnl, type PricedLeg } from "./payoff";
import { riskProfile } from "./risk";

export interface DistributionInputs {
  spot: number;
  /** Annualized flat IV, e.g. 0.8 for 80%. */
  vol: number;
  /** Years to expiry. */
  t: number;
  r?: number;
  /** Optional smile: σ to use for the probability of finishing above a given price level. */
  volAt?: (level: number) => number;
}

/** Below this σ√t the distribution is treated as a point mass at spot (t → 0). */
const DEGENERATE_SD = 1e-9;
/** EV integration is truncated at ±6σ — the tails beyond hold ~2e-9 of the mass. */
const EV_SIGMAS = 6;
const EV_STEPS = 1200;

function logParams(d: DistributionInputs, vol = d.vol) {
  const t = Math.max(0, d.t);
  const r = d.r ?? RISK_FREE_RATE;
  const sd = Math.max(0, vol) * Math.sqrt(t);
  const mu = Math.log(d.spot) + (r - 0.5 * vol * vol) * t;
  return { mu, sd };
}

export function isDegenerate(d: DistributionInputs): boolean {
  return !(d.spot > 0) || logParams(d).sd < DEGENERATE_SD;
}

/** Density of S_T at price x. Zero everywhere for the degenerate (t → 0) case. */
export function lognormalPdf(x: number, d: DistributionInputs): number {
  if (x <= 0 || isDegenerate(d)) return 0;
  const { mu, sd } = logParams(d);
  return normPDF((Math.log(x) - mu) / sd) / (x * sd);
}

/** P(S_T > level). Equals N(d2) from Black-Scholes at strike = level. */
export function probAbove(level: number, d: DistributionInputs): number {
  if (level <= 0) return 1;
  if (!Number.isFinite(level)) return 0;
  const vol = d.volAt ? d.volAt(level) : d.vol;
  const { mu, sd } = logParams(d, vol);
  if (!(d.spot > 0) || sd < DEGENERATE_SD) return d.spot > level ? 1 : 0;
  return normCDF((mu - Math.log(level)) / sd);
}

/** Probability a single option finishes in the money. */
export function probITM(side: "call" | "put", strike: number, d: DistributionInputs): number {
  const above = probAbove(strike, d);
  return side === "call" ? above : 1 - above;
}

export interface PriceRange {
  lower: number;
  upper: number;
}

/**
 * The ±nσ band of the terminal distribution, as prices. Quantiles of the
 * lognormal rather than spot·(1 ± nσ√t), so the band is correctly skewed
 * (wider on the upside) and never goes negative.
 */
export function expectedMove(d: DistributionInputs, nSigma = 1): PriceRange {
  if (isDegenerate(d)) return { lower: d.spot, upper: d.spot };
  const { mu, sd } = logParams(d);
  return { lower: Math.exp(mu - nSigma * sd), upper: Math.exp(mu + nSigma * sd) };
}

/**
 * Probability the combined position finishes with P&L > 0 at expiry.
 * Splits the price axis at the breakevens (riskProfile's, unless passed
 * in) and sums the probability mass of every interval whose payoff is
 * positive — so multiple breakevens (condors, straddles) just work.
 * riskProfile only scans 0.2×–3× spot, so a breakeven outside that
 * window is missed; the mass out there is negligible for realistic IVs.
 */
export function probabilityOfProfit(legs: PricedLeg[], d: DistributionInputs, breakevens?: number[]): number {
  if (legs.length === 0 || !(d.spot > 0)) return 0;
  if (isDegenerate(d)) return combinedPnl(legs, d.spot) > 0 ? 1 : 0;

  const bes = [...(breakevens ?? riskProfile(legs, d.spot).breakevens)]
    .filter(b => b > 0 && Number.isFinite(b))
    .sort((a, b) => a - b);
  if (bes.length === 0) return combinedPnl(legs, d.spot) > 0 ? 1 : 0;

  const edges = [0, ...bes, Infinity];
  let pop = 0;
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i];
    const hi = edges[i + 1];
    const probe = lo === 0 ? hi / 2 : hi === Infinity ? lo * 1.5 : (lo + hi) / 2;
    if (combinedPnl(legs, probe) > 0) {
      // max(0, …) guards against a steep smile making P(>lo) < P(>hi).
      pop += Math.max(0, probAbove(lo, d) - probAbove(hi, d));
    }
  }
  return Math.min(1, Math.max(0, pop));
}

/**
 * Expected P&L at expiry, E[payoff(S_T)] − premium, undiscounted.
 * Integrated in log-space (z ~ N(0,1), S_T = exp(μ + σ√t·z)) with
 * composite Simpson's rule over z ∈ [−6, 6]: the integrand is smooth
 * apart from the payoff's kinks, and truncating there covers unbounded
 * payoffs (naked calls) without integrating to infinity.
 */
export function expectedValue(legs: PricedLeg[], d: DistributionInputs, steps = EV_STEPS): number {
  if (legs.length === 0 || !(d.spot > 0)) return 0;
  if (isDegenerate(d)) return combinedPnl(legs, d.spot);
  const { mu, sd } = logParams(d);
  const n = steps % 2 === 0 ? steps : steps + 1;
  const a = -EV_SIGMAS;
  const h = (2 * EV_SIGMAS) / n;
  const f = (z: number) => combinedPnl(legs, Math.exp(mu + sd * z)) * normPDF(z);
  let sum = f(a) + f(-a);
  for (let i = 1; i < n; i++) sum += (i % 2 === 1 ? 4 : 2) * f(a + i * h);
  return (sum * h) / 3;
}

export interface ProbabilityStats {
  pop: number;
  /** Only meaningful for a single leg; null for multi-leg structures. */
  probItm: number | null;
  ev: number;
  move1: PriceRange;
  move2: PriceRange;
}

export function analyzeLegs(legs: PricedLeg[], d: DistributionInputs): ProbabilityStats {
  return {
    pop: probabilityOfProfit(legs, d),
    probItm: legs.length === 1 ? probITM(legs[0].side, legs[0].strike, d) : null,
    ev: expectedValue(legs, d),
    move1: expectedMove(d, 1),
    move2: expectedMove(d, 2),
  };
}

/** Evenly spaced {s, density} samples across [lo, hi], for chart overlays. */
export function densitySeries(d: DistributionInputs, lo: number, hi: number, steps = 120) {
  const range = hi - lo;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const s = lo + (range * i) / steps;
    return { s, density: lognormalPdf(s, d) };
  });
}
