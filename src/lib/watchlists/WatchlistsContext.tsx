"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../api/client";
import type { NamedWatchlist } from "../api/types";
import { createWatchlist, deleteWatchlist, listWatchlists, updateWatchlist } from "../api/watchlists";
import { useBackendData } from "../context/BackendDataContext";
import { useWalletStore } from "../store/wallet";
import { useHydrated } from "../useHydrated";
import {
  FAVORITES_ID, addSymbol as addSym, applyOrder, cleanName, loadFavoritesOrder, loadLocal, markMigrated,
  moveItem, newLocalList, removeSymbol as removeSym, saveFavoritesOrder, saveLocalLists,
} from "./model";

/** "server": v2 multi-list API; "local": this browser only (API missing or signed out). */
export type WatchlistsMode = "loading" | "server" | "local";

export interface WatchlistsValue {
  mode: WatchlistsMode;
  /** Favorites first, then the user's own lists by position. */
  lists: NamedWatchlist[];
  /** Favorites is the v1 server set and needs a signed-in wallet to edit. */
  canEditFavorites: boolean;
  error: string | null;
  clearError: () => void;
  createList: (name: string) => Promise<NamedWatchlist | null>;
  renameList: (id: string, name: string) => Promise<void>;
  deleteList: (id: string) => Promise<void>;
  addSymbol: (listId: string, sym: string) => Promise<void>;
  removeSymbol: (listId: string, sym: string) => Promise<void>;
  moveSymbol: (listId: string, from: number, to: number) => Promise<void>;
}

const WatchlistsContext = createContext<WatchlistsValue | null>(null);

// Statuses meaning "this server doesn't have the multi-list API".
const UNSUPPORTED = new Set([404, 405, 501]);

const messageOf = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export interface WatchlistsProviderProps {
  /** Storage bucket: wallet address or "anonymous"; null until hydrated. */
  wallet: string | null;
  token: string | null;
  favorites: string[];
  addFavorite: (sym: string) => Promise<void>;
  removeFavorite: (sym: string) => Promise<void>;
  children: React.ReactNode;
}

export function WatchlistsProvider({ wallet, token, favorites, addFavorite, removeFavorite, children }: WatchlistsProviderProps) {
  const [mode, setMode] = useState<WatchlistsMode>("loading");
  const [lists, setListsState] = useState<NamedWatchlist[]>([]);
  const [favOrder, setFavOrder] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Mutations read the latest lists synchronously (for rollback snapshots)
  // without waiting for a re-render.
  const listsRef = useRef<NamedWatchlist[]>([]);
  const setLists = useCallback((next: NamedWatchlist[] | ((cur: NamedWatchlist[]) => NamedWatchlist[])) => {
    listsRef.current = typeof next === "function" ? next(listsRef.current) : next;
    setListsState(listsRef.current);
  }, []);

  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    setFavOrder(loadFavoritesOrder(wallet));
    const fallBackToLocal = () => {
      if (cancelled) return;
      setLists(loadLocal(wallet).lists);
      setMode("local");
    };
    if (!token) {
      fallBackToLocal();
      return;
    }
    setMode("loading");
    listWatchlists(token)
      .then(async serverLists => {
        const local = loadLocal(wallet).lists;
        // Migration path: lists made while the API didn't exist move up to
        // the server the first time it answers with nothing of its own.
        if (serverLists.length === 0 && local.length > 0) {
          const uploaded: NamedWatchlist[] = [];
          for (const l of local) uploaded.push(await createWatchlist({ name: l.name, symbols: l.symbols }, token));
          markMigrated(wallet);
          return uploaded;
        }
        return serverLists;
      })
      .then(serverLists => {
        if (cancelled) return;
        setLists(serverLists);
        setMode("server");
      })
      .catch(err => {
        if (!(err instanceof ApiError && UNSUPPORTED.has(err.status))) {
          setError("Couldn't reach the watchlist server — showing lists saved in this browser.");
        }
        fallBackToLocal();
      });
    return () => {
      cancelled = true;
    };
  }, [wallet, token, setLists]);

  const persistLocal = useCallback((next: NamedWatchlist[]) => {
    if (wallet) saveLocalLists(wallet, next);
  }, [wallet]);

  /** Optimistically replaces one list, then saves; on failure restores just that list. */
  const changeList = useCallback(async (id: string, change: Partial<Pick<NamedWatchlist, "name" | "symbols">>) => {
    const before = listsRef.current.find(l => l.id === id);
    if (!before) return;
    setLists(cur => cur.map(l => (l.id === id ? { ...l, ...change, updated_at: new Date().toISOString() } : l)));
    if (mode !== "server" || !token) {
      persistLocal(listsRef.current);
      return;
    }
    try {
      const saved = await updateWatchlist(id, change, token);
      setLists(cur => cur.map(l => (l.id === id ? saved : l)));
    } catch (err) {
      setLists(cur => cur.map(l => (l.id === id ? before : l)));
      setError(`Couldn't save "${before.name}": ${messageOf(err, "request failed")}. Change undone.`);
    }
  }, [mode, token, persistLocal, setLists]);

  const createList = useCallback(async (rawName: string) => {
    const name = cleanName(rawName);
    if (!name) return null;
    const position = Math.max(0, ...listsRef.current.map(l => l.position + 1));
    if (mode === "server" && token) {
      try {
        const created = await createWatchlist({ name, symbols: [] }, token);
        setLists(cur => [...cur, created]);
        return created;
      } catch (err) {
        setError(`Couldn't create "${name}": ${messageOf(err, "request failed")}`);
        return null;
      }
    }
    const created = newLocalList(name, position);
    setLists(cur => [...cur, created]);
    persistLocal(listsRef.current);
    return created;
  }, [mode, token, persistLocal, setLists]);

  const renameList = useCallback(async (id: string, rawName: string) => {
    const name = cleanName(rawName);
    if (name && id !== FAVORITES_ID) await changeList(id, { name });
  }, [changeList]);

  const deleteList = useCallback(async (id: string) => {
    if (id === FAVORITES_ID) return;
    const before = listsRef.current;
    setLists(cur => cur.filter(l => l.id !== id));
    if (mode !== "server" || !token) {
      persistLocal(listsRef.current);
      return;
    }
    try {
      await deleteWatchlist(id, token);
    } catch (err) {
      setLists(before);
      setError(`Couldn't delete the list: ${messageOf(err, "request failed")}. Restored.`);
    }
  }, [mode, token, persistLocal, setLists]);

  const favoriteSymbols = useMemo(() => applyOrder(favorites, favOrder), [favorites, favOrder]);

  const addSymbol = useCallback(async (listId: string, sym: string) => {
    if (listId === FAVORITES_ID) {
      if (favorites.includes(sym)) return;
      try {
        await addFavorite(sym);
      } catch (err) {
        setError(`Couldn't add ${sym} to Favorites: ${messageOf(err, "request failed")}`);
      }
      return;
    }
    const list = listsRef.current.find(l => l.id === listId);
    if (list && !list.symbols.includes(sym)) await changeList(listId, { symbols: addSym(list.symbols, sym) });
  }, [favorites, addFavorite, changeList]);

  const removeSymbol = useCallback(async (listId: string, sym: string) => {
    if (listId === FAVORITES_ID) {
      try {
        await removeFavorite(sym);
      } catch (err) {
        setError(`Couldn't remove ${sym} from Favorites: ${messageOf(err, "request failed")}`);
      }
      return;
    }
    const list = listsRef.current.find(l => l.id === listId);
    if (list) await changeList(listId, { symbols: removeSym(list.symbols, sym) });
  }, [removeFavorite, changeList]);

  const moveSymbol = useCallback(async (listId: string, from: number, to: number) => {
    if (listId === FAVORITES_ID) {
      // v1 favorites have no server-side order; it's kept per wallet here.
      const next = moveItem(favoriteSymbols, from, to);
      setFavOrder(next);
      if (wallet) saveFavoritesOrder(wallet, next);
      return;
    }
    const list = listsRef.current.find(l => l.id === listId);
    if (!list) return;
    const next = moveItem(list.symbols, from, to);
    if (next !== list.symbols) await changeList(listId, { symbols: next });
  }, [favoriteSymbols, wallet, changeList]);

  const value = useMemo<WatchlistsValue>(() => ({
    mode,
    lists: [
      { id: FAVORITES_ID, name: "Favorites", symbols: favoriteSymbols, position: -1, updated_at: "" },
      ...[...lists].sort((a, b) => a.position - b.position),
    ],
    canEditFavorites: !!token,
    error,
    clearError: () => setError(null),
    createList, renameList, deleteList, addSymbol, removeSymbol, moveSymbol,
  }), [mode, favoriteSymbols, lists, token, error, createList, renameList, deleteList, addSymbol, removeSymbol, moveSymbol]);

  return <WatchlistsContext.Provider value={value}>{children}</WatchlistsContext.Provider>;
}

/** The app's provider: wallet/token from the wallet store, favorites from BackendDataContext. */
export function AppWatchlistsProvider({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  const address = useWalletStore(s => s.address);
  const token = useWalletStore(s => s.token);
  const { watchlist, addToWatchlist, removeFromWatchlist } = useBackendData();
  const favorites = useMemo(() => watchlist.map(w => w.underlying), [watchlist]);
  return (
    <WatchlistsProvider wallet={hydrated ? address ?? "anonymous" : null} token={hydrated ? token : null}
      favorites={favorites} addFavorite={addToWatchlist} removeFavorite={removeFromWatchlist}>
      {children}
    </WatchlistsProvider>
  );
}

export function useWatchlists(): WatchlistsValue {
  const ctx = useContext(WatchlistsContext);
  if (!ctx) throw new Error("useWatchlists must be used within WatchlistsProvider");
  return ctx;
}
