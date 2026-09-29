import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getHistory } from "../api/history";
import { queryKeys } from "../api/queryKeys";
import type { HistoryResponse } from "../api/types";

const EMPTY: HistoryResponse = { trades: [], stats: { trade_count: 0, win_count: 0, loss_count: 0, total_realized_pnl: 0 } };

/**
 * Closed/rolled positions + win/loss/pnl stats from the backend. A
 * standalone hook rather than part of BackendDataContext — nothing else
 * needs it at the same time. Failures surface as `error`.
 */
export function useBackendHistory(token: string | null) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: queryKeys.history(token),
    queryFn: () => getHistory(token as string),
    enabled: !!token,
  });
  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: queryKeys.history(token) });
  }, [qc, token]);
  const data = token ? q.data ?? EMPTY : EMPTY;
  return { ...data, loading: q.isFetching, error: q.error, refresh };
}
