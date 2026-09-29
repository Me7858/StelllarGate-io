import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addToWatchlist, getWatchlist, removeFromWatchlist } from "../api/watchlist";
import { queryKeys } from "../api/queryKeys";
import type { WatchlistItem } from "../api/types";
import { addWatchlistItem, applyOptimistic, removeWatchlistItem, rollback } from "../optimistic";

const NO_TOKEN = "Connect and sign in with your wallet first";

/**
 * Watchlist from the backend. `token` should be `null` pre-hydration,
 * which disables the query.
 */
export function useBackendWatchlist(token: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.watchlist(token);
  const q = useQuery({ queryKey: key, queryFn: () => getWatchlist(token as string), enabled: !!token });
  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  type Ctx = Awaited<ReturnType<typeof applyOptimistic<WatchlistItem[]>>>;
  const addM = useMutation({
    mutationKey: ["watchlist-add"],
    mutationFn: (underlying: string) => {
      if (!token) throw new Error(NO_TOKEN);
      return addToWatchlist(underlying, token);
    },
    onMutate: (u: string) => applyOptimistic<WatchlistItem[]>(qc, key, old => addWatchlistItem(old, u), []),
    onError: (_e: unknown, _u: string, ctx: Ctx | undefined) => rollback(qc, ctx, ["watchlist-add"]),
    onSettled: invalidate,
  });
  const removeM = useMutation({
    mutationKey: ["watchlist-remove"],
    mutationFn: (underlying: string) => {
      if (!token) throw new Error(NO_TOKEN);
      return removeFromWatchlist(underlying, token);
    },
    onMutate: (u: string) => applyOptimistic<WatchlistItem[]>(qc, key, old => removeWatchlistItem(old, u), []),
    onError: (_e: unknown, _u: string, ctx: Ctx | undefined) => rollback(qc, ctx, ["watchlist-remove"]),
    onSettled: invalidate,
  });

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: key });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, token]);

  return {
    items: token ? q.data ?? [] : [],
    loading: q.isFetching,
    error: q.error,
    refresh,
    add: async (underlying: string) => {
      await addM.mutateAsync(underlying);
    },
    remove: async (underlying: string) => {
      await removeM.mutateAsync(underlying);
    },
  };
}
