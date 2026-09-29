// Whole-portfolio risk: combines every open position on an underlying
// (solo trades and strategy legs alike — payoff.ts otherwise only ever
// sees the legs of a single strategy being previewed) into one payoff
// curve, and stress-tests the entire account across a spot-shock grid.
import type { Position } from "./api/types";
import { combinedPnl, combinedPayoffSeries, type PricedLeg } from "./payoff";

// entry_premium stands in for the leg's greeks.premium here — payoff math
// only ever reads .premium off the greeks object, and P&L should be
// measured against what was actually paid/collected at entry, not a
// freshly repriced premium.
export function positionsToLegs(positions: Position[]): PricedLeg[] {
  return positions.map(p => ({
    side: p.option_type,
    action: p.position_type === "short" ? "sell" : "buy",
    strike: p.strike,
    contracts: p.contracts,
    expiryDays: p.expiry_days,
    greeks: { premium: p.entry_premium, delta: 0, gamma: 0, theta: 0, vega: 0, iv: 0 },
  }));
}

export function groupPositionsByUnderlying(positions: Position[]): Map<string, Position[]> {
  const groups = new Map<string, Position[]>();
  for (const p of positions) {
    if (!groups.has(p.underlying)) groups.set(p.underlying, []);
    groups.get(p.underlying)!.push(p);
  }
  return groups;
}

export interface RiskProfile {
  breakevens: number[];
  maxProfit: number;
  maxProfitUnlimited: boolean;
  maxLoss: number;
  maxLossUnlimited: boolean;
}

// Wide range + endpoint slope is a cheap way to tell "capped by the
// chain's strikes" apart from "genuinely unbounded" (net long calls/short
// calls) without symbolically analyzing the leg set.
export function riskProfile(legs: PricedLeg[], spot: number): RiskProfile {
  if (legs.length === 0 || spot <= 0) {
    return { breakevens: [], maxProfit: 0, maxProfitUnlimited: false, maxLoss: 0, maxLossUnlimited: false };
  }
  const series = combinedPayoffSeries(legs, spot * 0.2, spot * 3, 400);

  let maxProfit = -Infinity;
  let maxLoss = Infinity;
  const breakevens: number[] = [];
  for (let i = 0; i < series.length; i++) {
    const pt = series[i];
    if (pt.p > maxProfit) maxProfit = pt.p;
    if (pt.p < maxLoss) maxLoss = pt.p;
    if (i > 0) {
      const prev = series[i - 1];
      if ((prev.p < 0 && pt.p >= 0) || (prev.p > 0 && pt.p <= 0)) {
        const frac = prev.p === pt.p ? 0 : -prev.p / (pt.p - prev.p);
        breakevens.push(prev.s + frac * (pt.s - prev.s));
      }
    }
  }

  const last = series[series.length - 1];
  const prevLast = series[series.length - 2];
  const tailSlope = last.p - prevLast.p;
  return {
    breakevens,
    maxProfit, maxProfitUnlimited: tailSlope > 1e-6,
    maxLoss, maxLossUnlimited: tailSlope < -1e-6,
  };
}

export const STRESS_SHOCKS = [-0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2];

export interface StressResult {
  shock: number;
  totalPnl: number;
  byUnderlying: Record<string, number>;
}

// Default stress P&L is still intrinsic-at-expiry (shock the spot, run to
// expiry). For live mark-to-model curves see markToModelPnl in payoff.ts
// and the time-aware controls on MultiLegPayoffDiagram / PortfolioRiskPanel.
export function stressTestPortfolio(positions: Position[], spots: Record<string, number>): StressResult[] {
  const groups = groupPositionsByUnderlying(positions);
  return STRESS_SHOCKS.map(shock => {
    const byUnderlying: Record<string, number> = {};
    let totalPnl = 0;
    for (const [underlying, posns] of Array.from(groups.entries())) {
      const spot = spots[underlying] ?? 0;
      const pnl = combinedPnl(positionsToLegs(posns), spot * (1 + shock));
      byUnderlying[underlying] = pnl;
      totalPnl += pnl;
    }
    return { shock, totalPnl, byUnderlying };
  });
}
