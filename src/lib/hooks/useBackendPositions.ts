import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  closePosition,
  getPortfolioGreeks,
  listPositions,
  openPosition,
  rollPosition,
  type OpenPositionParams,
} from "../api/positions";
import { executeStrategy } from "../api/strategies";
import { queryKeys } from "../api/queryKeys";
import type { AggregateGreeks, Position } from "../api/types";
import { addPosition, applyOptimistic, placeholderPosition, removePositionById, rollback, tempId } from "../optimistic";

const ZERO_GREEKS: AggregateGreeks = { delta: 0, gamma: 0, theta: 0, vega: 0 };
const NO_TOKEN = "Connect and sign in with your wallet first";

/**
 * Open positions + aggregate portfolio Greeks from the backend, plus the
 * open/close/roll/strategy mutations. Every mutation invalidates
 * positions, greeks and account — the backend (not this hook) is the source
 * of truth for premium, collateral and realized P&L. Queries are disabled
 * while `token` is null (pre-hydration / signed out) and failures surface
 * as `error` instead of an empty list.
 */
export function useBackendPositions(token: string | null) {
  const qc = useQueryClient();
  const positionsQ = useQuery({
    queryKey: queryKeys.openPositions(token),
    queryFn: () => listPositions(token as string, { status: "open" }),
    enabled: !!token,
  });
  const greeksQ = useQuery({
    queryKey: queryKeys.greeks(token),
    queryFn: () => getPortfolioGreeks(token as string),
    enabled: !!token,
  });

  const invalidateAll = useCallback(
    () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.positions(token) }),
        qc.invalidateQueries({ queryKey: queryKeys.greeks(token) }),
        qc.invalidateQueries({ queryKey: queryKeys.account(token) }),
        // History changes when a position is closed or rolled.
        qc.invalidateQueries({ queryKey: queryKeys.history(token) }),
      ]),
    [qc, token]
  );

  const requireToken = () => {
    if (!token) throw new Error(NO_TOKEN);
    return token;
  };
  const posKey = queryKeys.openPositions(token);
  const rb = (mk: string) => (_e: unknown, _v: unknown, ctx: Awaited<ReturnType<typeof applyOptimistic<Position[]>>> | undefined) =>
    rollback(qc, ctx, [mk]);
  // Optimistic transforms live in ../optimistic; onSettled always
  // reconciles with the server (and refreshes greeks/account/history).
  const openM = useMutation({
    mutationKey: ["open"],
    mutationFn: (p: OpenPositionParams) => openPosition(p, requireToken()),
    onMutate: (p: OpenPositionParams) =>
      applyOptimistic<Position[]>(qc, posKey, old => addPosition(old, placeholderPosition(p, tempId())), []),
    onError: rb("open"),
    onSettled: invalidateAll,
  });
  const strategyM = useMutation({
    mutationFn: (legs: OpenPositionParams[]) => executeStrategy(legs, requireToken()),
    onSuccess: invalidateAll,
  });
  const closeM = useMutation({
    mutationKey: ["close"],
    mutationFn: (id: string) => closePosition(id, requireToken()),
    onMutate: (id: string) => applyOptimistic<Position[]>(qc, posKey, old => removePositionById(old, id), []),
    onError: rb("close"),
    onSettled: invalidateAll,
  });
  const rollM = useMutation({
    mutationKey: ["roll"],
    mutationFn: (v: { id: string; newStrike: number; newExpiryDays: number }) =>
      rollPosition(v.id, { newStrike: v.newStrike, newExpiryDays: v.newExpiryDays }, requireToken()),
    // The old leg leaves the open list immediately; the new leg appears on settle.
    onMutate: (v: { id: string }) => applyOptimistic<Position[]>(qc, posKey, old => removePositionById(old, v.id), []),
    onError: rb("roll"),
    onSettled: invalidateAll,
  });

  const refresh = useCallback(() => {
    void invalidateAll();
  }, [invalidateAll]);

  return {
    positions: token ? positionsQ.data ?? [] : [],
    greeks: token ? greeksQ.data ?? ZERO_GREEKS : ZERO_GREEKS,
    loading: positionsQ.isFetching || greeksQ.isFetching,
    error: positionsQ.error ?? greeksQ.error,
    refresh,
    open: openM.mutateAsync,
    openStrategy: strategyM.mutateAsync,
    close: closeM.mutateAsync,
    roll: (id: string, params: { newStrike: number; newExpiryDays: number }) => rollM.mutateAsync({ id, ...params }),
  };
}
