import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api/client";
import { useWalletStore } from "./store/wallet";

/**
 * - idle:    disabled (for authed queries: nobody is signed in)
 * - loading: first fetch for this key in flight, nothing to show yet
 * - success: `data` is current
 * - error:   the last fetch failed; `data` still holds the last good value, if any
 */
export type QueryStatus = "idle" | "loading" | "success" | "error";

export interface QueryState<T> {
  status: QueryStatus;
  data: T | undefined;
  error: Error | null;
  /** A fetch is in flight (initial or background refetch/poll). */
  isFetching: boolean;
  refetch: () => void;
}

interface Snapshot<T> {
  status: QueryStatus;
  data: T | undefined;
  error: Error | null;
  isFetching: boolean;
}

const initial = <T,>(enabled: boolean): Snapshot<T> => ({
  status: enabled ? "loading" : "idle",
  data: undefined,
  error: null,
  isFetching: enabled,
});

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(typeof err === "string" ? err : "Request failed");
}

/**
 * Minimal fetch-state hook. `key` identifies the data; `null` disables the
 * query (status "idle"). Changing the key drops the old data immediately —
 * nothing fetched for one key (wallet, symbol, expiry) is ever shown under
 * another. Responses that arrive after the key changed are discarded.
 *
 * `authed` queries treat a 401 as an expired session and clear the wallet's
 * token, which flips every authed surface to its signed-out state instead
 * of leaving them stuck on an error.
 */
export function useAsyncQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options: { pollMs?: number; authed?: boolean } = {}
): QueryState<T> {
  const { pollMs, authed = false } = options;
  const [snap, setSnap] = useState<Snapshot<T>>(() => initial<T>(key !== null));
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const requestId = useRef(0);
  const keyRef = useRef(key);

  const run = useCallback(() => {
    if (keyRef.current === null) return;
    const id = ++requestId.current;
    setSnap(s => ({ ...s, isFetching: true, status: s.data === undefined ? "loading" : s.status }));
    fetcherRef.current().then(
      data => {
        if (id !== requestId.current) return;
        setSnap({ status: "success", data, error: null, isFetching: false });
      },
      err => {
        if (id !== requestId.current) return;
        if (authed && err instanceof ApiError && err.status === 401) {
          useWalletStore.setState({ token: null });
        }
        setSnap(s => ({ status: "error", data: s.data, error: toError(err), isFetching: false }));
      }
    );
  }, [authed]);

  useEffect(() => {
    keyRef.current = key;
    requestId.current++; // orphan anything in flight for the previous key
    setSnap(initial<T>(key !== null));
    if (key === null) return;
    run();
    if (!pollMs) return;
    const timer = setInterval(run, pollMs);
    return () => clearInterval(timer);
  }, [key, run, pollMs]);

  return { ...snap, refetch: run };
}
