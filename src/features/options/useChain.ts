import { useMemo } from "react";
import { getChain } from "../../lib/api/market";
import type { OptionChainEntry } from "../../lib/api/types";
import { bs, smileVol, type Greeks } from "../../lib/pricing";
import { useAsyncQuery, type QueryState } from "../../lib/query";

export interface ChainRow {
  strike: number;
  call: Greeks;
  put: Greeks;
  itmCall: boolean;
  itmPut: boolean;
}

const CHAIN_POLL_MS = 4000;

export function toChainRows(entries: OptionChainEntry[]): ChainRow[] {
  return entries.map(e => ({
    strike: e.strike,
    call: { premium: e.call.premium, delta: e.call.delta, gamma: e.call.gamma, theta: e.call.theta, vega: e.call.vega, iv: e.call.iv },
    put: { premium: e.put.premium, delta: e.put.delta, gamma: e.put.gamma, theta: e.put.theta, vega: e.put.vega, iv: e.put.iv },
    itmCall: e.is_itm_call,
    itmPut: e.is_itm_put,
  }));
}

/** Local Black-Scholes chain, used when the backend chain can't be loaded. */
export function modelChain(spot: number, vol: number, t: number): ChainRow[] {
  return Array.from({ length: 21 }, (_, i) => {
    const n = i - 10;
    const strike = Math.round(spot * (1 + n * 0.04) * 10000) / 10000;
    const v = smileVol(vol, strike / spot);
    return { strike, call: bs(spot, strike, v, t, true), put: bs(spot, strike, v, t, false), itmCall: spot > strike, itmPut: spot < strike };
  });
}

export interface ChainResult {
  query: QueryState<ChainRow[]>;
  /** Rows to show: the backend's if it has ever loaded for this key, else
   *  the local model's once the backend has failed; empty while loading. */
  rows: ChainRow[];
  source: "backend" | "model" | "none";
}

/**
 * The chain for one underlying/expiry, polled every 4s rather than on
 * every 2s spot tick (so premiums update visibly without refetching and
 * re-rendering 21 rows twice a second). Public data: no auth.
 */
export function useChain(sym: string, expiryDays: number, spot: number, vol: number): ChainResult {
  const query = useAsyncQuery<ChainRow[]>(
    `chain:${sym}:${expiryDays}`,
    () => getChain(sym, expiryDays).then(toChainRows),
    { pollMs: CHAIN_POLL_MS }
  );
  const failedWithoutData = query.status === "error" && query.data === undefined;
  const fallback = useMemo(
    () => (failedWithoutData ? modelChain(spot, vol, expiryDays / 365) : null),
    [failedWithoutData, spot, vol, expiryDays]
  );
  if (query.data) return { query, rows: query.data, source: "backend" };
  if (fallback) return { query, rows: fallback, source: "model" };
  return { query, rows: [], source: "none" };
}
