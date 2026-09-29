import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAccount } from "../api/positions";
import { queryKeys } from "../api/queryKeys";

/**
 * Account balance/collateral from the backend. `token` should be `null`
 * whenever the caller hasn't finished its own hydration-safety check —
 * the query is disabled until then, so nothing is fetched or rendered that
 * the server-rendered HTML didn't have (see useHydrated in the README).
 * Failures surface as `error` rather than a silent null account.
 */
export function useBackendAccount(token: string | null) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: queryKeys.account(token),
    queryFn: () => getAccount(token as string),
    enabled: !!token,
  });
  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: queryKeys.account(token) });
  }, [qc, token]);
  return { account: token ? q.data ?? null : null, loading: q.isFetching, error: q.error, refresh };
}
