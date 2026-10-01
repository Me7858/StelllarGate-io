import { useEffect, useRef, useState } from "react";
import { searchStrategies, type FinderInput, type FinderMarket, type FinderResult } from "./engine";
import type { FinderRequest, FinderResponse } from "./finder.worker";

const DEBOUNCE_MS = 150;

function createWorker(): Worker | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("./finder.worker.ts", import.meta.url));
  } catch {
    return null;
  }
}

/**
 * Runs the finder search in a Web Worker, debounced, and only ever
 * surfaces the response to the latest request — a slow search for an
 * older input can't overwrite a newer one. Falls back to searching on the
 * main thread (next macrotask) where workers aren't available, e.g. tests.
 */
export function useStrategyFinder(input: FinderInput | null, market: FinderMarket | null) {
  const [result, setResult] = useState<FinderResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const workerRef = useRef<Worker | null | undefined>(undefined);
  const latestId = useRef(0);
  // The worker's onmessage is attached once; it forwards through this ref
  // to whichever effect run's `deliver` is current.
  const deliverRef = useRef<(res: FinderResponse) => void>(() => {});

  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const key = input && market ? JSON.stringify([input, market]) : null;

  useEffect(() => {
    if (!input || !market) return;
    const id = ++latestId.current;
    setLoading(true);

    const deliver = (res: FinderResponse) => {
      if (res.id !== latestId.current) return;
      setLoading(false);
      if (res.error !== undefined) {
        setError(res.error);
      } else {
        setError(null);
        setResult(res.result);
      }
    };

    const timer = setTimeout(() => {
      if (workerRef.current === undefined) {
        workerRef.current = createWorker();
        if (workerRef.current) {
          workerRef.current.onmessage = (e: MessageEvent<FinderResponse>) => deliverRef.current(e.data);
          workerRef.current.onerror = () => {
            // Worker failed to load (e.g. blocked by CSP): fall back to the
            // main thread for this and later searches.
            workerRef.current?.terminate();
            workerRef.current = null;
            runInline(latestId.current, input, market);
          };
        }
      }
      if (workerRef.current) {
        const req: FinderRequest = { id, input, market };
        workerRef.current.postMessage(req);
      } else {
        runInline(id, input, market);
      }
    }, DEBOUNCE_MS);

    const runInline = (reqId: number, i: FinderInput, m: FinderMarket) => {
      setTimeout(() => {
        try {
          deliver({ id: reqId, result: searchStrategies(i, m) });
        } catch (err) {
          deliver({ id: reqId, error: err instanceof Error ? err.message : "Strategy search failed" });
        }
      }, 0);
    };

    deliverRef.current = deliver;
    return () => clearTimeout(timer);
    // `key` captures every field of input/market.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { result, error, loading };
}
