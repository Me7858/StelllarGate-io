"use client";

/**
 * useQuant — async hook that offloads math to quant.worker.ts.
 *
 * Features:
 *  - Request cancellation: stale in-flight requests are ignored on result.
 *  - Deduplication: identical (fn + JSON-serialised args) calls share one in-flight request.
 *  - Last-result retention: previous value stays visible while a new one is computing.
 *  - SSR / no-Worker fallback: falls back to synchronous main-thread execution.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { QuantRequest, QuantResponse, QuantResult } from "../../workers/quant.worker";
import type { QuantResult as QR } from "../../workers/quant.worker";

// ---------------------------------------------------------------------------
// Worker singleton — one instance shared across all useQuant calls.
// ---------------------------------------------------------------------------

let _worker: Worker | null = null;
let _workerReady = false;
const _pendingMap = new Map<string, (r: QuantResponse) => void>();

function getWorker(): Worker | null {
  if (typeof window === "undefined") return null; // SSR
  if (!("Worker" in window)) return null;          // no Worker support
  if (_worker) return _worker;

  try {
    _worker = new Worker(new URL("../../workers/quant.worker.ts", import.meta.url), {
      type: "module",
    });
    _workerReady = true;

    _worker.onmessage = (e: MessageEvent<QuantResponse>) => {
      const handler = _pendingMap.get(e.data.id);
      if (handler) {
        _pendingMap.delete(e.data.id);
        handler(e.data);
      }
    };

    _worker.onerror = (e) => {
      console.error("[quant.worker] error", e);
      // Resolve all pending with error so callers don't hang
      Array.from(_pendingMap.entries()).forEach(([id, handler]) => {
        handler({ id, ok: false, error: "Worker error" } as QuantResponse);
        _pendingMap.delete(id);
      });
    };
  } catch {
    _worker = null;
    _workerReady = false;
  }

  return _worker;
}

// Terminate the shared worker — called by the last consumer (or tests).
export function terminateQuantWorker() {
  if (_worker) {
    _worker.terminate();
    _worker = null;
    _workerReady = false;
    _pendingMap.clear();
  }
}

// ---------------------------------------------------------------------------
// Synchronous fallback (SSR / tests / no Worker support)
// ---------------------------------------------------------------------------

async function runSync(req: QuantRequest): Promise<QuantResult> {
  // Lazy-import so the worker bundle doesn't tree-shake these out
  const { bs } = await import("../pricing");
  const { buildSurfaceGrid } = await import("../volSurface");
  const { combinedPayoffSeries } = await import("../payoff");
  const { riskProfile, stressTestPortfolio } = await import("../risk");

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

// ---------------------------------------------------------------------------
// Low-level: post one request, return a promise
// ---------------------------------------------------------------------------

let _idCounter = 0;

// In-flight deduplication: key → promise
const _inFlight = new Map<string, Promise<QuantResult>>();

function postToWorker(req: Omit<QuantRequest, "id">): Promise<QuantResult> {
  const dedupeKey = `${req.fn}:${JSON.stringify(req.args)}`;
  const inflight = _inFlight.get(dedupeKey);
  if (inflight) return inflight;

  const worker = getWorker();
  const id = `${req.fn}-${++_idCounter}`;
  const fullReq: QuantRequest = { ...req, id } as QuantRequest;

  const promise: Promise<QuantResult> = new Promise((resolve, reject) => {
    if (!worker || !_workerReady) {
      // Fallback: run synchronously
      runSync(fullReq).then(resolve).catch(reject);
      return;
    }

    _pendingMap.set(id, (response) => {
      _inFlight.delete(dedupeKey);
      if (response.ok) {
        resolve(response.result);
      } else {
        const errResponse = response as { id: string; ok: false; error: string };
        reject(new Error(errResponse.error));
      }
    });

    worker.postMessage(fullReq);
  }).finally(() => {
    _inFlight.delete(dedupeKey);
  }) as Promise<QuantResult>;

  _inFlight.set(dedupeKey, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

type FnName = QuantRequest["fn"];
type ArgsFor<F extends FnName> = Extract<QuantRequest, { fn: F }>["args"];
type ResultFor<F extends FnName> = Extract<QR, { fn: F }>["data"];

export interface UseQuantResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export function useQuant<F extends FnName>(
  fn: F,
  args: ArgsFor<F> | null,
): UseQuantResult<ResultFor<F>> {
  const [state, setState] = useState<UseQuantResult<ResultFor<F>>>({
    data: null,
    loading: false,
    error: null,
  });

  // Track the current request ID to ignore stale responses (cancellation)
  const currentReqId = useRef(0);

  const run = useCallback(
    async (reqArgs: ArgsFor<F>) => {
      const myId = ++currentReqId.current;

      setState(prev => ({ ...prev, loading: true, error: null }));

      try {
        const req = { fn, args: reqArgs } as Omit<QuantRequest, "id">;
        const result = await postToWorker(req);

        // Ignore if a newer request superseded this one (cancellation)
        if (currentReqId.current !== myId) return;

        setState({
          data: (result as unknown as { fn: F; data: ResultFor<F> }).data,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (currentReqId.current !== myId) return;
        setState(prev => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        }));
      }
    },
    [fn],
  );

  // Stable serialization key — avoids re-running on reference changes when
  // the logical args haven't changed.
  const argsKey = args ? JSON.stringify(args) : null;

  useEffect(() => {
    if (!args || argsKey === null) return;
    run(args);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [argsKey]);

  return state;
}
