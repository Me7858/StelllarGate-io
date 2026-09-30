"use client";

import React, { createContext, useContext, useCallback, useState, useEffect } from "react";
import { useWalletStore } from "../store/wallet";
import { useHydrated } from "../useHydrated";

// ---------------------------------------------------------------------------
// Types (mirroring src/lib/api/types.ts shapes)
// ---------------------------------------------------------------------------

export interface Account {
  wallet_address: string;
  balance: number;
  collateral_locked: number;
  created_at: string;
}

export interface WatchlistItem {
  wallet_address: string;
  underlying: string;
  added_at: string;
}

// ---------------------------------------------------------------------------
// Context value shape
// ---------------------------------------------------------------------------

export interface BackendDataContextValue {
  /** Null until the first successful fetch, or when not signed in. */
  account: Account | null;
  /** Watchlist entries for the current wallet. */
  watchlist: WatchlistItem[];
  /** Add a symbol to the watchlist (requires bearer token). */
  addToWatchlist: (sym: string) => Promise<void>;
  /** Remove a symbol from the watchlist (requires bearer token). */
  removeFromWatchlist: (sym: string) => Promise<void>;
  /** Manually trigger an account refresh (e.g. after deposit/withdraw). */
  refreshAccount: () => void;
}

const BackendDataContext = createContext<BackendDataContextValue | null>(null);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBackendData(): BackendDataContextValue {
  const ctx = useContext(BackendDataContext);
  if (!ctx) {
    throw new Error("useBackendData must be used within BackendDataProvider");
  }
  return ctx;
}

import { env } from "../../env";

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const API_BASE = env.NEXT_PUBLIC_API_URL;

async function fetchJSON<T>(url: string, token: string | null): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export function BackendDataProvider({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  const token = useWalletStore((s) => s.token);

  const [account, setAccount] = useState<Account | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [accountTick, setAccountTick] = useState(0);

  const refreshAccount = useCallback(() => setAccountTick((t) => t + 1), []);

  // Fetch account
  useEffect(() => {
    if (!hydrated || !token) { setAccount(null); return; }
    let cancelled = false;
    fetchJSON<Account>(`${API_BASE}/api/v1/account`, token)
      .then((a) => { if (!cancelled) setAccount(a); })
      .catch(() => { if (!cancelled) setAccount(null); });
    return () => { cancelled = true; };
  }, [hydrated, token, accountTick]);

  // Fetch watchlist
  useEffect(() => {
    if (!hydrated || !token) { setWatchlist([]); return; }
    let cancelled = false;
    fetchJSON<WatchlistItem[]>(`${API_BASE}/api/v1/watchlist`, token)
      .then((w) => { if (!cancelled) setWatchlist(w); })
      .catch(() => { if (!cancelled) setWatchlist([]); });
    return () => { cancelled = true; };
  }, [hydrated, token]);

  const addToWatchlist = useCallback(async (sym: string) => {
    if (!token) return;
    await fetchJSON(`${API_BASE}/api/v1/watchlist/${sym}`, token);
    setWatchlist((prev) =>
      prev.some((w) => w.underlying === sym)
        ? prev
        : [...prev, { wallet_address: account?.wallet_address ?? "", underlying: sym, added_at: new Date().toISOString() }]
    );
  }, [token, account]);

  const removeFromWatchlist = useCallback(async (sym: string) => {
    if (!token) return;
    await fetch(`${API_BASE}/api/v1/watchlist/${sym}`, {
      method: "DELETE",
      headers: token ? { "Authorization": `Bearer ${token}` } : {},
    });
    setWatchlist((prev) => prev.filter((w) => w.underlying !== sym));
  }, [token]);

  const value: BackendDataContextValue = {
    account,
    watchlist,
    addToWatchlist,
    removeFromWatchlist,
    refreshAccount,
  };

  return (
    <BackendDataContext.Provider value={value}>
      {children}
    </BackendDataContext.Provider>
  );
}

// Export the context object itself so mock providers (Storybook, tests) can
// inject directly into it using <BackendDataContext.Provider value={...}>.
export { BackendDataContext };
