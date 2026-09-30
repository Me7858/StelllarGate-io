// Collateral requirements for writing options, mirroring the on-chain rules
// described in the protocol README: covered calls are 100% covered by the
// underlying's current value, cash-secured puts are over-collateralized by 110%
// of the strike (protects against a further drop before the writer can react).

import type { Account, Position } from "./api/types";

export type OptionSide = "call" | "put";

export function collateralRequired(side: OptionSide, contracts: number, strike: number, spot: number): number {
  return side === "call" ? contracts * spot : contracts * strike * 1.1;
}

// ---------------------------------------------------------------------------
// Dashboard selectors. Pure functions over the backend's Account and
// Position rows — no fetching, no React.
//
// Account semantics (backend/src/positions.rs): `balance` is total cash
// and *includes* locked collateral — writing an option credits the
// premium to balance and adds to `collateral_locked` without debiting
// balance. Buying power is therefore `balance − collateral_locked`, and
// utilization is `collateral_locked / balance`.
//
// Per-position collateral is the `collateral` stored on the row: what
// the backend actually locked at entry (calls: contracts × *entry* spot;
// puts: 110% of strike). It is not re-marked as spot moves — the
// `currentRequirement` column shows what the same write would lock at
// today's spot, for information only.
// ---------------------------------------------------------------------------

/** Neumaier-compensated sum — keeps reconciliation of many float amounts from drifting. */
export function preciseSum(values: number[]): number {
  let sum = 0;
  let c = 0;
  for (const v of values) {
    const t = sum + v;
    c += Math.abs(sum) >= Math.abs(v) ? sum - t + v : v - t + sum;
    sum = t;
  }
  return sum + c;
}

export interface CollateralSummary {
  balance: number;
  locked: number;
  /** Buying power: balance minus locked collateral. */
  free: number;
  /** locked / balance, 0 when nothing is locked; 1 when collateral is locked against a non-positive balance. */
  utilization: number;
}

export function collateralSummary(balance: number, locked: number): CollateralSummary {
  const utilization = balance > 0 ? locked / balance : locked > 0 ? 1 : 0;
  return { balance, locked, free: balance - locked, utilization: Math.max(0, utilization) };
}

export function accountCollateralSummary(account: Account | null): CollateralSummary {
  return collateralSummary(account?.balance ?? 0, account?.collateral_locked ?? 0);
}

export interface UtilizationThresholds {
  /** Fractions, e.g. 0.8 for 80%. */
  warning: number;
  critical: number;
}

export const DEFAULT_THRESHOLDS: UtilizationThresholds = { warning: 0.8, critical: 0.95 };

export type UtilizationLevel = "ok" | "warning" | "critical";

export function utilizationLevel(utilization: number, thresholds: UtilizationThresholds): UtilizationLevel {
  if (utilization >= thresholds.critical) return "critical";
  if (utilization >= thresholds.warning) return "warning";
  return "ok";
}

export interface MarkedCollateralInput {
  position: Position;
  /** Current underlying spot. */
  spot: number;
  /** Unrealized P&L at current marks. */
  pnl: number;
  /** Cash it would cost (short) or raise (long) to close now, total across contracts. */
  currentPremium: number;
}

export interface CollateralRow {
  id: string;
  position: Position;
  collateral: number;
  /** Share of the sum of all rows' collateral, 0–1. */
  share: number;
  /** What the same write would lock at today's spot. */
  currentRequirement: number;
  /** Premium received at entry ÷ collateral. */
  premiumYield: number;
  /** Unrealized P&L ÷ collateral. */
  returnOnCollateral: number;
  daysHeld: number;
  /** Change in buying power if closed now: collateral released minus the buy-to-close cost. */
  freedOnClose: number;
}

const DAY_MS = 86_400_000;

export function daysBetween(fromIso: string, now: Date): number {
  const from = Date.parse(fromIso);
  if (Number.isNaN(from)) return 0;
  return Math.max(0, (now.getTime() - from) / DAY_MS);
}

/** One row per position that has collateral locked (i.e. every short). */
export function collateralRows(items: MarkedCollateralInput[], now: Date): CollateralRow[] {
  const withCollateral = items.filter(i => i.position.collateral > 0);
  const total = preciseSum(withCollateral.map(i => i.position.collateral));
  return withCollateral.map(({ position: p, spot, pnl, currentPremium }) => ({
    id: p.id,
    position: p,
    collateral: p.collateral,
    share: total > 0 ? p.collateral / total : 0,
    currentRequirement: collateralRequired(p.option_type, p.contracts, p.strike, spot),
    premiumYield: (p.entry_premium * p.contracts) / p.collateral,
    returnOnCollateral: pnl / p.collateral,
    daysHeld: daysBetween(p.opened_at, now),
    freedOnClose: p.collateral - (p.position_type === "short" ? currentPremium : -currentPremium),
  }));
}

export type CollateralSortKey = "underlying" | "collateral" | "share" | "premiumYield" | "returnOnCollateral" | "daysHeld" | "freedOnClose";

export function sortCollateralRows(rows: CollateralRow[], key: CollateralSortKey, dir: "asc" | "desc"): CollateralRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const cmp = key === "underlying"
      ? a.position.underlying.localeCompare(b.position.underlying)
      : a[key] - b[key];
    // Stable, deterministic tiebreak so equal rows don't shuffle between renders.
    return cmp !== 0 ? sign * cmp : a.id.localeCompare(b.id);
  });
}

export interface Reconciliation {
  /** Sum of per-position collateral. */
  positionsTotal: number;
  /** The account's collateral_locked. */
  accountLocked: number;
  difference: number;
  ok: boolean;
}

/**
 * Sum of every open position's collateral should equal the account's
 * collateral_locked. Tolerance is half a cent or 1e-9 relative, whichever
 * is larger, so float noise from many adds/subtracts on the backend isn't
 * reported as a real discrepancy.
 */
export function reconcileCollateral(openPositions: Position[], accountLocked: number): Reconciliation {
  const positionsTotal = preciseSum(openPositions.map(p => p.collateral));
  const difference = accountLocked - positionsTotal;
  const tolerance = Math.max(0.005, Math.abs(accountLocked) * 1e-9);
  return { positionsTotal, accountLocked, difference, ok: Math.abs(difference) <= tolerance };
}

export interface WhatIf {
  before: CollateralSummary;
  after: CollateralSummary;
  /** Positive = consumes collateral, negative = releases it. */
  collateralDelta: number;
  /** Cash in (+) or out (−) of the balance. */
  cashDelta: number;
  /** The backend rejects trades that would leave buying power negative. */
  insufficient: boolean;
}

function applyDelta(before: CollateralSummary, cashDelta: number, collateralDelta: number): WhatIf {
  const after = collateralSummary(before.balance + cashDelta, before.locked + collateralDelta);
  return { before, after, collateralDelta, cashDelta, insufficient: after.free < 0 };
}

/** Writing (selling) a new option: premium credited, collateral locked. */
export function whatIfWrite(
  before: CollateralSummary,
  trade: { side: OptionSide; contracts: number; strike: number; spot: number; premium: number }
): WhatIf {
  const collateral = collateralRequired(trade.side, trade.contracts, trade.strike, trade.spot);
  return applyDelta(before, trade.premium * trade.contracts, collateral);
}

/** Closing an existing position at `currentPremium` (total, all contracts). */
export function whatIfClose(before: CollateralSummary, position: Position, currentPremium: number): WhatIf {
  const cash = position.position_type === "short" ? -currentPremium : currentPremium;
  return applyDelta(before, cash, -position.collateral);
}
