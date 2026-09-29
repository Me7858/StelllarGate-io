"use client";

import { createContext, useContext } from "react";
import { useBackendAccount } from "../hooks/useBackendAccount";
import { useBackendPositions } from "../hooks/useBackendPositions";
import { useBackendWatchlist } from "../hooks/useBackendWatchlist";
import { useBackendAlerts } from "../hooks/useBackendAlerts";
import { useWalletStore } from "../store/wallet";
import { useHydrated } from "../useHydrated";
import type { Account } from "../api/types";

interface BackendData {
  account: Account | null;
  accountLoading: boolean;
  accountError: unknown;
  refreshAccount: () => void;
  positions: ReturnType<typeof useBackendPositions>["positions"];
  greeks: ReturnType<typeof useBackendPositions>["greeks"];
  positionsLoading: boolean;
  positionsError: unknown;
  refreshPositions: () => void;
  open: ReturnType<typeof useBackendPositions>["open"];
  openStrategy: ReturnType<typeof useBackendPositions>["openStrategy"];
  close: ReturnType<typeof useBackendPositions>["close"];
  roll: ReturnType<typeof useBackendPositions>["roll"];
  watchlist: ReturnType<typeof useBackendWatchlist>["items"];
  watchlistLoading: boolean;
  watchlistError: unknown;
  addToWatchlist: ReturnType<typeof useBackendWatchlist>["add"];
  removeFromWatchlist: ReturnType<typeof useBackendWatchlist>["remove"];
  alerts: ReturnType<typeof useBackendAlerts>["alerts"];
  alertsLoading: boolean;
  alertsError: unknown;
  addAlert: ReturnType<typeof useBackendAlerts>["add"];
  removeAlert: ReturnType<typeof useBackendAlerts>["remove"];
}

const BackendDataContext = createContext<BackendData | null>(null);

/**
 * Thin compatibility shim over the TanStack Query hooks (the query cache
 * now does the sharing/invalidation; mutations invalidate account too).
 * Originally: single shared instance of the account/positions/watchlist/alerts hooks,
 * mounted once at the root — every consumer (AppHeader's balance chip,
 * StarButton, AlertsPanel, the options and portfolio pages) reads the
 * same state instead of each running its own independent fetch. That
 * matters specifically because each hook's mutation methods only refresh
 * *their own* instance's data; without a shared instance, e.g.
 * AppHeader's balance would go stale after a trade made through a
 * different component's copy of the hook until the next full remount.
 */
export function BackendDataProvider({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  const token = useWalletStore(s => s.token);
  // Same reasoning as every other persisted-store read on this page tree:
  // pass null until this component's own mount effect has fired, so the
  // first client render matches SSR regardless of when the wallet store
  // itself rehydrates.
  const effectiveToken = hydrated ? token : null;

  const { account, loading: accountLoading, error: accountError, refresh: refreshAccount } = useBackendAccount(effectiveToken);
  const {
    positions, greeks, loading: positionsLoading, error: positionsError, refresh: refreshPositions,
    open, openStrategy, close, roll,
  } = useBackendPositions(effectiveToken);
  const {
    items: watchlist, loading: watchlistLoading, error: watchlistError,
    add: addToWatchlist, remove: removeFromWatchlist,
  } = useBackendWatchlist(effectiveToken);
  const { alerts, loading: alertsLoading, error: alertsError, add: addAlert, remove: removeAlert } = useBackendAlerts(effectiveToken);

  return (
    <BackendDataContext.Provider
      value={{
        account, accountLoading, accountError, refreshAccount,
        positions, greeks, positionsLoading, positionsError, refreshPositions,
        open, openStrategy, close, roll,
        watchlist, watchlistLoading, watchlistError, addToWatchlist, removeFromWatchlist,
        alerts, alertsLoading, alertsError, addAlert, removeAlert,
      }}
    >
      {children}
    </BackendDataContext.Provider>
  );
}

export function useBackendData(): BackendData {
  const ctx = useContext(BackendDataContext);
  if (!ctx) throw new Error("useBackendData must be used within BackendDataProvider");
  return ctx;
}
