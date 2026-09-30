/**
 * quant.worker.ts
 * All CPU-heavy math runs here, off the main thread.
 * Communicates via a typed postMessage protocol (no Comlink dependency).
 *
 * Shared math modules (pricing, volSurface, payoff, risk) are imported
 * directly — they are pure functions with no DOM/Next.js dependencies.
 */

import { bs } from "../lib/pricing";
import type { Greeks } from "../lib/pricing";
import { buildSurfaceGrid } from "../lib/volSurface";
import type { SurfaceCell } from "../lib/volSurface";
import { combinedPayoffSeries } from "../lib/payoff";
import type { PricedLeg } from "../lib/payoff";
import { riskProfile, stressTestPortfolio } from "../lib/risk";
import type { RiskProfile, StressResult } from "../lib/risk";
import type { Position } from "../lib/api/types";

// ---------------------------------------------------------------------------
// Message protocol
// ---------------------------------------------------------------------------

export type QuantRequest =
  | { id: string; fn: "priceChain"; args: PriceChainArgs }
  | { id: string; fn: "surfaceGrid"; args: SurfaceGridArgs }
  | { id: string; fn: "payoffSeries"; args: PayoffSeriesArgs }
  | { id: string; fn: "stressTest"; args: StressTestArgs }
  | { id: string; fn: "riskProfile"; args: RiskProfileArgs };

export type QuantResponse =
  | { id: string; ok: true; result: QuantResult }
  | { id: string; ok: false; error: string };

export type QuantResult =
  | { fn: "priceChain"; data: Greeks[] }
  | { fn: "surfaceGrid"; data: SurfaceCell[][] }
  | { fn: "payoffSeries"; data: Array<{ s: number; p: number }> }
  | { fn: "stressTest"; data: StressResult[] }
  | { fn: "riskProfile"; data: RiskProfile };

// ---------------------------------------------------------------------------
// Argument types
// ---------------------------------------------------------------------------

export interface PriceChainArgs {
  S: number;
  strikes: number[];
  vol: number;
  t: number; // years to expiry
  isCall: boolean;
}

export interface SurfaceGridArgs {
  baseVol: number;
  moneyness: number[];
  expiryDays: number[];
}

export interface PayoffSeriesArgs {
  legs: PricedLeg[];
  loSpot: number;
  hiSpot: number;
  steps?: number;
}

export interface StressTestArgs {
  positions: Position[];
  spots: Record<string, number>;
}

export interface RiskProfileArgs {
  legs: PricedLeg[];
  spot: number;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function dispatch(req: QuantRequest): QuantResult {
  switch (req.fn) {
    case "priceChain": {
      const { S, strikes, vol, t, isCall } = req.args;
      return { fn: "priceChain", data: strikes.map(K => bs(S, K, vol, t, isCall)) };
    }
    case "surfaceGrid": {
      const { baseVol, moneyness, expiryDays } = req.args;
      return { fn: "surfaceGrid", data: buildSurfaceGrid(baseVol, moneyness, expiryDays) };
    }
    case "payoffSeries": {
      const { legs, loSpot, hiSpot, steps } = req.args;
      return { fn: "payoffSeries", data: combinedPayoffSeries(legs, loSpot, hiSpot, steps) };
    }
    case "stressTest": {
      const { positions, spots } = req.args;
      return { fn: "stressTest", data: stressTestPortfolio(positions, spots) };
    }
    case "riskProfile": {
      const { legs, spot } = req.args;
      return { fn: "riskProfile", data: riskProfile(legs, spot) };
    }
  }
}

self.onmessage = (e: MessageEvent<QuantRequest>) => {
  const req = e.data;
  try {
    const result = dispatch(req);
    const response: QuantResponse = { id: req.id, ok: true, result };
    self.postMessage(response);
  } catch (err) {
    const response: QuantResponse = {
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};
