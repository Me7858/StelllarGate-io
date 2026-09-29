// Lightweight in-main-thread "worker" shim that batches mark-to-model
// series recomputation via requestAnimationFrame so slider updates stay
// at ~60fps without flooding React with intermediate states.
// A real Worker can replace the compute fn later without changing callers.

import {
  markToModelSeries,
  combinedPayoffSeries,
  markToModelGreeks,
  type PricedLeg,
} from "./payoff";
import type { Greeks } from "./pricing";

export interface CurveRequest {
  legs: PricedLeg[];
  lo: number;
  hi: number;
  tForwardDays: number;
  ivShift: number;
  baseVol: number;
  steps?: number;
}

export interface CurveBundle {
  today: { s: number; p: number }[];
  forward: { s: number; p: number }[];
  expiry: { s: number; p: number }[];
  greeksAtSpot: Greeks;
}

type Listener = (bundle: CurveBundle) => void;

export function createQuantScheduler(onResult: Listener) {
  let pending: CurveRequest | null = null;
  let raf = 0;

  const flush = () => {
    raf = 0;
    const req = pending;
    pending = null;
    if (!req) return;
    const steps = req.steps ?? 160;
    const today = markToModelSeries(req.legs, req.lo, req.hi, 0, req.ivShift, req.baseVol, steps);
    const forward = markToModelSeries(
      req.legs, req.lo, req.hi, req.tForwardDays, req.ivShift, req.baseVol, steps
    );
    const expiry = combinedPayoffSeries(req.legs, req.lo, req.hi, steps);
    const mid = (req.lo + req.hi) / 2;
    const greeksAtSpot = markToModelGreeks(
      req.legs, mid, req.tForwardDays, req.ivShift, req.baseVol
    );
    onResult({ today, forward, expiry, greeksAtSpot });
  };

  return {
    schedule(req: CurveRequest) {
      pending = req;
      if (!raf) raf = requestAnimationFrame(flush);
    },
    computeSync(req: CurveRequest): CurveBundle {
      const steps = req.steps ?? 160;
      return {
        today: markToModelSeries(req.legs, req.lo, req.hi, 0, req.ivShift, req.baseVol, steps),
        forward: markToModelSeries(req.legs, req.lo, req.hi, req.tForwardDays, req.ivShift, req.baseVol, steps),
        expiry: combinedPayoffSeries(req.legs, req.lo, req.hi, steps),
        greeksAtSpot: markToModelGreeks(req.legs, (req.lo + req.hi) / 2, req.tForwardDays, req.ivShift, req.baseVol),
      };
    },
    cancel() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      pending = null;
    },
  };
}
