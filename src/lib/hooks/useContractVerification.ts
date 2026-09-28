"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NetworkId } from "../soroban/networks";
import { deploymentsFor } from "../soroban/registry";
import type { ContractVerification } from "../soroban/verify";
import { verifyNetwork } from "../soroban/verify";

export interface UseContractVerification {
  results: Record<string, ContractVerification>;
  loading: boolean;
  /** Wall-clock ms of the check that produced `results`, or null. */
  checkedAt: number | null;
  /** Run the check again against the same network. */
  refresh: () => void;
  /** True if this contract's on-chain actions must be refused. */
  isBlocked: (contractKey: string) => boolean;
}

/**
 * Runs the live contract-hash check for one network.
 *
 * The check is re-run when the network changes, and on demand via
 * `refresh`. It is intentionally *not* polled: the page is a verification
 * surface, not a status board, and a background poll would imply a
 * liveness guarantee the data does not carry. A visitor who wants a fresh
 * reading presses refresh, and the timestamp next to the result says how
 * old it is.
 */
export function useContractVerification(network: NetworkId): UseContractVerification {
  const [results, setResults] = useState<Record<string, ContractVerification>>({});
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setLoading(true);

    verifyNetwork(deploymentsFor(network), { network, signal: controller.signal })
      .then(next => {
        if (controller.signal.aborted) return;
        setResults(next);
        setCheckedAt(Date.now());
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [network, nonce]);

  const refresh = useCallback(() => setNonce(n => n + 1), []);

  const isBlocked = useCallback(
    (contractKey: string) => results[contractKey]?.blocksActions ?? true,
    [results]
  );

  return { results, loading, checkedAt, refresh, isBlocked };
}
