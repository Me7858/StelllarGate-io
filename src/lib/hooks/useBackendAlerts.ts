import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createAlert, deleteAlert, getAlerts } from "../api/alerts";
import { queryKeys } from "../api/queryKeys";
import type { Alert, AlertCondition } from "../api/types";
import { addAlertItem, applyOptimistic, removeAlertById, rollback, tempId } from "../optimistic";

const NO_TOKEN = "Connect and sign in with your wallet first";

/**
 * Alerts from the backend, polled every 5s so a wallet's other tabs (and
 * this one) pick up server-side triggers reasonably quickly — the
 * backend's own check loop runs every 10s. `token` should be `null`
 * pre-hydration, which disables the query.
 */
export function useBackendAlerts(token: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.alerts(token);
  const q = useQuery({
    queryKey: key,
    queryFn: () => getAlerts(token as string),
    enabled: !!token,
    refetchInterval: 5000,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  type Ctx = Awaited<ReturnType<typeof applyOptimistic<Alert[]>>>;
  type AddVars = { underlying: string; condition: AlertCondition; targetPrice: number };
  const addM = useMutation({
    mutationKey: ["alert-add"],
    mutationFn: (params: AddVars) => {
      if (!token) throw new Error(NO_TOKEN);
      return createAlert(params, token);
    },
    onMutate: (v: AddVars) => applyOptimistic<Alert[]>(qc, key, old => addAlertItem(old, v, tempId()), []),
    onError: (_e: unknown, _v: AddVars, ctx: Ctx | undefined) => rollback(qc, ctx, ["alert-add"]),
    onSettled: invalidate,
  });
  const removeM = useMutation({
    mutationKey: ["alert-remove"],
    mutationFn: (id: string) => {
      if (!token) throw new Error(NO_TOKEN);
      return deleteAlert(id, token);
    },
    onMutate: (id: string) => applyOptimistic<Alert[]>(qc, key, old => removeAlertById(old, id), []),
    onError: (_e: unknown, _id: string, ctx: Ctx | undefined) => rollback(qc, ctx, ["alert-remove"]),
    onSettled: invalidate,
  });

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: key });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, token]);

  return {
    alerts: token ? q.data ?? [] : [],
    loading: q.isFetching,
    error: q.error,
    refresh,
    add: addM.mutateAsync,
    remove: async (id: string) => {
      await removeM.mutateAsync(id);
    },
  };
}
