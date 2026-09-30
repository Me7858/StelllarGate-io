// Pure list operations shared by the server-backed and local modes.
import type { NamedWatchlist } from "../api/types";

/** The built-in list mirroring the v1 favorites set (StarButton). */
export const FAVORITES_ID = "favorites";

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Adds at the end; a symbol already in the list is left where it is. */
export function addSymbol(symbols: string[], sym: string): string[] {
  return symbols.includes(sym) ? symbols : [...symbols, sym];
}

export function removeSymbol(symbols: string[], sym: string): string[] {
  return symbols.filter(s => s !== sym);
}

/** Applies a saved order to a set: known symbols in saved order, new ones appended. */
export function applyOrder(symbols: string[], order: string[]): string[] {
  const set = new Set(symbols);
  const ordered = order.filter(s => set.has(s));
  return [...ordered, ...symbols.filter(s => !ordered.includes(s))];
}

export function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 40);
}

// ── Local persistence (used until the server supports multi-list) ──────

interface LocalState {
  version: 1;
  lists: NamedWatchlist[];
  /** Set once the lists have been uploaded to the server. */
  migratedAt?: string;
}

const listsKey = (wallet: string) => `zenith-watchlists:${wallet}`;
const favOrderKey = (wallet: string) => `zenith-favorites-order:${wallet}`;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full/blocked: state still works for this session.
  }
}

export function loadLocal(wallet: string): LocalState {
  const s = read<LocalState>(listsKey(wallet), { version: 1, lists: [] });
  return s.version === 1 && Array.isArray(s.lists) ? s : { version: 1, lists: [] };
}

export function saveLocalLists(wallet: string, lists: NamedWatchlist[]) {
  write(listsKey(wallet), { ...loadLocal(wallet), lists });
}

export function markMigrated(wallet: string) {
  write(listsKey(wallet), { version: 1, lists: [], migratedAt: new Date().toISOString() });
}

export function loadFavoritesOrder(wallet: string): string[] {
  const o = read<unknown>(favOrderKey(wallet), []);
  return Array.isArray(o) ? o.filter((x): x is string => typeof x === "string") : [];
}

export function saveFavoritesOrder(wallet: string, order: string[]) {
  write(favOrderKey(wallet), order);
}

export function newLocalList(name: string, position: number): NamedWatchlist {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return { id, name, symbols: [], position, updated_at: new Date().toISOString() };
}
