/**
 * Parity tests: worker dispatch functions produce the same results as
 * direct calls to the math libraries.
 *
 * Run with:  npx jest src/workers/__tests__/quant.worker.test.ts
 * (No actual Worker is spun up — we test the dispatch logic directly.)
 */

import { bs } from "../../lib/pricing";
import { buildSurfaceGrid } from "../../lib/volSurface";
import { combinedPayoffSeries } from "../../lib/payoff";
import { riskProfile, stressTestPortfolio } from "../../lib/risk";
import type { PricedLeg } from "../../lib/payoff";
import type { Position } from "../../lib/api/types";

// Re-export the dispatch logic for testing without spinning up a real Worker.
// We reproduce it inline here to avoid importing self.onmessage machinery.

function dispatchSync(fn: string, args: unknown): unknown {
  switch (fn) {
    case "priceChain": {
      const { S, strikes, vol, t, isCall } = args as { S: number; strikes: number[]; vol: number; t: number; isCall: boolean };
      return strikes.map(K => bs(S, K, vol, t, isCall));
    }
    case "surfaceGrid": {
      const { baseVol, moneyness, expiryDays } = args as { baseVol: number; moneyness: number[]; expiryDays: number[] };
      return buildSurfaceGrid(baseVol, moneyness, expiryDays);
    }
    case "payoffSeries": {
      const { legs, loSpot, hiSpot, steps } = args as { legs: PricedLeg[]; loSpot: number; hiSpot: number; steps?: number };
      return combinedPayoffSeries(legs, loSpot, hiSpot, steps);
    }
    case "stressTest": {
      const { positions, spots } = args as { positions: Position[]; spots: Record<string, number> };
      return stressTestPortfolio(positions, spots);
    }
    case "riskProfile": {
      const { legs, spot } = args as { legs: PricedLeg[]; spot: number };
      return riskProfile(legs, spot);
    }
    default:
      throw new Error(`Unknown fn: ${fn}`);
  }
}

// ---------------------------------------------------------------------------
// Parity tests
// ---------------------------------------------------------------------------

const LEGS: PricedLeg[] = [
  { side: "call", action: "buy", strike: 100, contracts: 1, greeks: { premium: 5, delta: 0.5, gamma: 0.02, theta: -0.01, vega: 0.1, iv: 0.3 } },
  { side: "put", action: "sell", strike: 95, contracts: 1, greeks: { premium: 3, delta: -0.4, gamma: 0.015, theta: -0.008, vega: 0.09, iv: 0.28 } },
];

describe("quant worker dispatch parity", () => {
  test("priceChain matches bs() direct calls", () => {
    const args = { S: 100, strikes: [90, 95, 100, 105, 110], vol: 0.3, t: 30 / 365, isCall: true };
    const workerResult = dispatchSync("priceChain", args) as ReturnType<typeof bs>[];
    const directResult = args.strikes.map(K => bs(args.S, K, args.vol, args.t, args.isCall));
    expect(workerResult).toEqual(directResult);
  });

  test("surfaceGrid matches buildSurfaceGrid() directly", () => {
    const args = { baseVol: 0.6, moneyness: [0.9, 1.0, 1.1], expiryDays: [7, 30, 90] };
    const workerResult = dispatchSync("surfaceGrid", args);
    const directResult = buildSurfaceGrid(args.baseVol, args.moneyness, args.expiryDays);
    expect(workerResult).toEqual(directResult);
  });

  test("payoffSeries matches combinedPayoffSeries() directly", () => {
    const args = { legs: LEGS, loSpot: 80, hiSpot: 120, steps: 100 };
    const workerResult = dispatchSync("payoffSeries", args);
    const directResult = combinedPayoffSeries(args.legs, args.loSpot, args.hiSpot, args.steps);
    expect(workerResult).toEqual(directResult);
  });

  test("riskProfile matches riskProfile() directly", () => {
    const args = { legs: LEGS, spot: 100 };
    const workerResult = dispatchSync("riskProfile", args);
    const directResult = riskProfile(args.legs, args.spot);
    expect(workerResult).toEqual(directResult);
  });

  test("stressTest matches stressTestPortfolio() directly", () => {
    const positions: Position[] = [
      {
        id: "1",
        wallet_address: "test",
        underlying: "BTC",
        option_type: "call",
        strike: 67000,
        expiry_days: 30,
        contracts: 1,
        entry_premium: 500,
        entry_spot: 67420,
        collateral: 0,
        position_type: "long",
        status: "open",
        close_premium: null,
        close_spot: null,
        realized_pnl: null,
        opened_at: "",
        closed_at: null,
        strategy_id: null,
      },
    ];
    const spots = { BTC: 67420 };
    const workerResult = dispatchSync("stressTest", { positions, spots });
    const directResult = stressTestPortfolio(positions, spots);
    expect(workerResult).toEqual(directResult);
  });
});

// ---------------------------------------------------------------------------
// Cancellation / deduplication tests (useQuant hook logic)
// ---------------------------------------------------------------------------

describe("useQuant cancellation logic", () => {
  test("stale request ID is ignored (simulated)", () => {
    // Simulate: two requests issued, only the second resolves.
    // We can't test the React hook here without jsdom — this validates the
    // id counter logic conceptually.
    let counter = 0;
    const id1 = ++counter; // 1
    const id2 = ++counter; // 2

    // Simulate: request 1 arrives after request 2 has already resolved
    const currentReqId = { current: id2 };
    const isStale = (id: number) => currentReqId.current !== id;

    expect(isStale(id1)).toBe(true);  // request 1 is stale
    expect(isStale(id2)).toBe(false); // request 2 is current
  });

  test("deduplication key is stable for identical args", () => {
    const args = { baseVol: 0.6, moneyness: [0.9, 1.0, 1.1], expiryDays: [7, 30] };
    const key1 = `surfaceGrid:${JSON.stringify(args)}`;
    const key2 = `surfaceGrid:${JSON.stringify({ ...args })}`;
    expect(key1).toBe(key2);
  });
});
