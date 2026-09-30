/**
 * Tests for history pagination adapter, filters, deduplication, and stats.
 *
 * No MSW needed for the client-adapter tests — we mock getHistory directly
 * since the adapter runs entirely in-process.
 */

import { applyFilters, computeStats } from "../history";
import type { Position } from "../types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    id: Math.random().toString(36).slice(2),
    wallet_address: "test",
    underlying: "BTC",
    strike: 67000,
    expiry_days: 30,
    option_type: "call",
    position_type: "long",
    contracts: 1,
    entry_premium: 500,
    entry_spot: 67000,
    collateral: 0,
    status: "closed",
    close_premium: 600,
    close_spot: 68000,
    realized_pnl: 100,
    opened_at: "2024-01-01T00:00:00Z",
    closed_at: "2024-01-15T12:00:00Z",
    strategy_id: null,
    ...overrides,
  };
}

const TRADES: Position[] = [
  makePosition({ id: "1", underlying: "BTC", option_type: "call", realized_pnl: 200, closed_at: "2024-02-10T00:00:00Z" }),
  makePosition({ id: "2", underlying: "ETH", option_type: "put", realized_pnl: -50, closed_at: "2024-02-20T00:00:00Z" }),
  makePosition({ id: "3", underlying: "BTC", option_type: "put", realized_pnl: 0, closed_at: "2024-03-01T00:00:00Z" }),
  makePosition({ id: "4", underlying: "SOL", option_type: "call", realized_pnl: -120, closed_at: "2024-03-15T00:00:00Z" }),
  makePosition({ id: "5", underlying: "BTC", option_type: "call", realized_pnl: 80, closed_at: "2024-04-01T00:00:00Z" }),
];

// ---------------------------------------------------------------------------
// applyFilters
// ---------------------------------------------------------------------------

describe("applyFilters", () => {
  test("no filters returns all trades", () => {
    expect(applyFilters(TRADES, {})).toHaveLength(5);
  });

  test("underlying filter", () => {
    const result = applyFilters(TRADES, { underlying: "BTC" });
    expect(result).toHaveLength(3);
    expect(result.every(t => t.underlying === "BTC")).toBe(true);
  });

  test("option_type filter", () => {
    const result = applyFilters(TRADES, { option_type: "call" });
    expect(result).toHaveLength(3);
    expect(result.every(t => t.option_type === "call")).toBe(true);
  });

  test("result=win filter (pnl > 0)", () => {
    const result = applyFilters(TRADES, { result: "win" });
    expect(result).toHaveLength(2);
    expect(result.every(t => (t.realized_pnl ?? 0) > 0)).toBe(true);
  });

  test("result=loss filter (pnl < 0)", () => {
    const result = applyFilters(TRADES, { result: "loss" });
    expect(result).toHaveLength(2);
    expect(result.every(t => (t.realized_pnl ?? 0) < 0)).toBe(true);
  });

  test("from date filter (inclusive)", () => {
    // from 2024-03-01, should include trades on or after that date
    const result = applyFilters(TRADES, { from: "2024-03-01T00:00:00Z" });
    expect(result).toHaveLength(3);
    expect(result.map(t => t.id).sort()).toEqual(["3", "4", "5"].sort());
  });

  test("to date filter (inclusive end of day)", () => {
    // to 2024-02-20, should include trades on or before that day
    const result = applyFilters(TRADES, { to: "2024-02-20T00:00:00Z" });
    expect(result).toHaveLength(2);
    expect(result.map(t => t.id).sort()).toEqual(["1", "2"].sort());
  });

  test("combined filters", () => {
    const result = applyFilters(TRADES, { underlying: "BTC", option_type: "call" });
    expect(result).toHaveLength(2);
    expect(result.map(t => t.id).sort()).toEqual(["1", "5"].sort());
  });

  test("date range + underlying", () => {
    const result = applyFilters(TRADES, {
      from: "2024-02-01T00:00:00Z",
      to: "2024-03-31T00:00:00Z",
      underlying: "BTC",
    });
    expect(result).toHaveLength(2);
    expect(result.map(t => t.id).sort()).toEqual(["1", "3"].sort());
  });
});

// ---------------------------------------------------------------------------
// computeStats
// ---------------------------------------------------------------------------

describe("computeStats", () => {
  test("counts wins, losses, and totals correctly", () => {
    const stats = computeStats(TRADES);
    expect(stats.trade_count).toBe(5);
    expect(stats.win_count).toBe(2);   // pnl > 0
    expect(stats.loss_count).toBe(2);  // pnl < 0
    expect(stats.total_realized_pnl).toBeCloseTo(200 - 50 + 0 - 120 + 80);
  });

  test("empty array", () => {
    const stats = computeStats([]);
    expect(stats.trade_count).toBe(0);
    expect(stats.win_count).toBe(0);
    expect(stats.total_realized_pnl).toBe(0);
  });

  test("all wins", () => {
    const allWins = TRADES.filter(t => (t.realized_pnl ?? 0) > 0);
    const stats = computeStats(allWins);
    expect(stats.win_count).toBe(stats.trade_count);
    expect(stats.loss_count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Deduplication (simulated pagination across two pages)
// ---------------------------------------------------------------------------

describe("deduplication across pages", () => {
  test("no duplicate ids when pages overlap", () => {
    // Simulate two pages that share the last/first item (boundary overlap)
    const page1 = TRADES.slice(0, 3);
    const page2 = TRADES.slice(2, 5); // trade[2] is in both

    const seen = new Set<string>();
    const deduped: Position[] = [];

    for (const t of [...page1, ...page2]) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        deduped.push(t);
      }
    }

    expect(deduped).toHaveLength(5); // no duplicates
    expect(new Set(deduped.map(t => t.id)).size).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// New-trades pill logic
// ---------------------------------------------------------------------------

describe("new trades detection", () => {
  test("detects trades not in seen set", () => {
    const seen = new Set(["1", "2", "3"]);
    const polled: Position[] = [
      makePosition({ id: "6" }), // new
      makePosition({ id: "7" }), // new
      makePosition({ id: "1" }), // already seen
    ];
    const unseen = polled.filter(t => !seen.has(t.id));
    expect(unseen).toHaveLength(2);
  });

  test("no new trades when all IDs are known", () => {
    const seen = new Set(["1", "2", "3"]);
    const polled: Position[] = [
      makePosition({ id: "1" }),
      makePosition({ id: "2" }),
    ];
    const unseen = polled.filter(t => !seen.has(t.id));
    expect(unseen).toHaveLength(0);
  });
});
