import { describe, expect, it } from "vitest";
import type { Position } from "./api/types";
import {
  collateralRequired,
  collateralRows,
  collateralSummary,
  preciseSum,
  reconcileCollateral,
  sortCollateralRows,
  utilizationLevel,
  whatIfClose,
  whatIfWrite,
  DEFAULT_THRESHOLDS,
} from "./collateral";

let n = 0;
function pos(over: Partial<Position> = {}): Position {
  n += 1;
  return {
    id: `p${n}`, wallet_address: "GTEST", underlying: "XLM", strike: 0.12, expiry_days: 30,
    option_type: "put", position_type: "short", contracts: 100, entry_premium: 0.01, entry_spot: 0.12,
    collateral: 13.2, status: "open", close_premium: null, close_spot: null, realized_pnl: null,
    opened_at: "2026-09-01T00:00:00.000Z", closed_at: null, strategy_id: null,
    ...over,
  };
}

describe("collateralRequired", () => {
  it("is 100% of spot for calls and 110% of strike for puts", () => {
    expect(collateralRequired("call", 2, 70000, 67420.5)).toBe(2 * 67420.5);
    expect(collateralRequired("put", 3, 60000, 67420.5)).toBeCloseTo(3 * 60000 * 1.1, 8);
  });
});

describe("collateralSummary", () => {
  it("treats balance as total cash including locked collateral", () => {
    const s = collateralSummary(100_000, 25_000);
    expect(s.free).toBe(75_000);
    expect(s.utilization).toBeCloseTo(0.25, 12);
  });

  it("handles a zero balance", () => {
    expect(collateralSummary(0, 0)).toEqual({ balance: 0, locked: 0, free: 0, utilization: 0 });
    const s = collateralSummary(0, 50);
    expect(s.utilization).toBe(1);
    expect(s.free).toBe(-50);
  });
});

describe("utilizationLevel", () => {
  it("maps utilization onto the thresholds, inclusive at the boundary", () => {
    expect(utilizationLevel(0.79, DEFAULT_THRESHOLDS)).toBe("ok");
    expect(utilizationLevel(0.8, DEFAULT_THRESHOLDS)).toBe("warning");
    expect(utilizationLevel(0.95, DEFAULT_THRESHOLDS)).toBe("critical");
    expect(utilizationLevel(0.5, { warning: 0.4, critical: 0.6 })).toBe("warning");
  });
});

describe("preciseSum", () => {
  it("avoids naive float drift", () => {
    const values = Array.from({ length: 10 }, () => 0.1);
    expect(values.reduce((a, b) => a + b, 0)).not.toBe(1);
    expect(preciseSum(values)).toBe(1);
  });

  it("recovers small values next to large ones", () => {
    expect(preciseSum([1e16, 1, -1e16])).toBe(1);
  });
});

describe("reconcileCollateral", () => {
  it("passes when the per-position sum matches the account", () => {
    const ps = Array.from({ length: 10 }, () => pos({ collateral: 0.1 }));
    const r = reconcileCollateral(ps, 1);
    expect(r.ok).toBe(true);
    expect(r.positionsTotal).toBe(1);
  });

  it("tolerates sub-cent float noise", () => {
    expect(reconcileCollateral([pos({ collateral: 1000 })], 1000.000001).ok).toBe(true);
  });

  it("flags a real discrepancy with its signed size", () => {
    const r = reconcileCollateral([pos({ collateral: 100 }), pos({ collateral: 50 })], 200);
    expect(r.ok).toBe(false);
    expect(r.difference).toBe(50);
  });

  it("flags locked collateral with no positions behind it", () => {
    expect(reconcileCollateral([], 10).ok).toBe(false);
    expect(reconcileCollateral([], 0).ok).toBe(true);
  });
});

describe("collateralRows", () => {
  const now = new Date("2026-09-11T00:00:00.000Z");
  const shortPut = pos({ id: "a", collateral: 300, contracts: 2, entry_premium: 6, strike: 136.36 });
  const shortCall = pos({ id: "b", option_type: "call", collateral: 100, contracts: 1, entry_premium: 4, strike: 110, opened_at: "2026-09-10T12:00:00.000Z" });
  const longCall = pos({ id: "c", position_type: "long", option_type: "call", collateral: 0 });
  const rows = collateralRows([
    { position: shortPut, spot: 100, pnl: 3, currentPremium: 9 },
    { position: shortCall, spot: 120, pnl: -2, currentPremium: 6 },
    { position: longCall, spot: 100, pnl: 1, currentPremium: 5 },
  ], now);

  it("includes only positions with collateral", () => {
    expect(rows.map(r => r.id)).toEqual(["a", "b"]);
  });

  it("computes share, yield, RoC, days held and release on close", () => {
    const [a, b] = rows;
    expect(a.share).toBeCloseTo(0.75, 12);
    expect(b.share).toBeCloseTo(0.25, 12);
    expect(a.premiumYield).toBeCloseTo(12 / 300, 12);
    expect(a.returnOnCollateral).toBeCloseTo(0.01, 12);
    expect(a.daysHeld).toBeCloseTo(10, 12);
    expect(b.daysHeld).toBeCloseTo(0.5, 12);
    expect(a.freedOnClose).toBe(291);
  });

  it("reports the requirement at today's spot separately from the entry-time amount", () => {
    expect(rows[1].collateral).toBe(100);
    expect(rows[1].currentRequirement).toBe(120);
  });

  it("sorts in both directions with a stable tiebreak", () => {
    expect(sortCollateralRows(rows, "collateral", "desc").map(r => r.id)).toEqual(["a", "b"]);
    expect(sortCollateralRows(rows, "collateral", "asc").map(r => r.id)).toEqual(["b", "a"]);
    expect(sortCollateralRows(rows, "daysHeld", "asc").map(r => r.id)).toEqual(["b", "a"]);
    const tied = rows.map(r => ({ ...r, collateral: 1 }));
    expect(sortCollateralRows(tied, "collateral", "desc").map(r => r.id)).toEqual(["a", "b"]);
  });
});

describe("what-if", () => {
  const before = collateralSummary(10_000, 6_000);

  it("a new write credits premium and locks collateral", () => {
    const w = whatIfWrite(before, { side: "put", contracts: 10, strike: 100, spot: 100, premium: 3 });
    expect(w.collateralDelta).toBeCloseTo(1100, 8);
    expect(w.cashDelta).toBe(30);
    expect(w.after.balance).toBe(10_030);
    expect(w.after.locked).toBeCloseTo(7_100, 8);
    expect(w.after.free).toBeCloseTo(2_930, 8);
    expect(w.insufficient).toBe(false);
  });

  it("flags a write the backend would reject for buying power", () => {
    const w = whatIfWrite(before, { side: "put", contracts: 50, strike: 100, spot: 100, premium: 3 });
    expect(w.insufficient).toBe(true);
  });

  it("closing a short releases collateral and pays the buy-back", () => {
    const p = pos({ collateral: 1_000 });
    const w = whatIfClose(before, p, 40);
    expect(w.collateralDelta).toBe(-1_000);
    expect(w.after.balance).toBe(9_960);
    expect(w.after.locked).toBe(5_000);
    expect(w.after.free - before.free).toBe(960);
  });

  it("closing a long raises cash and releases nothing", () => {
    const p = pos({ position_type: "long", collateral: 0 });
    const w = whatIfClose(before, p, 40);
    expect(w.collateralDelta).toBe(-0);
    expect(w.after.balance).toBe(10_040);
  });
});
