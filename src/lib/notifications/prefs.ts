// Per-category opt-in for OS-level browser notifications. Every category
// is always recorded in the in-app center; this only controls whether a
// new one also pops a system notification.
import { useSyncExternalStore } from "react";
import type { NotificationCategory } from "./types";

export type BrowserNotificationPrefs = Record<NotificationCategory, boolean>;

export const DEFAULT_PREFS: BrowserNotificationPrefs = {
  fill: true, alert: true, expiry: true, session: true, feed: false, system: true,
};

const KEY = "zenith-notification-prefs";
const listeners = new Set<() => void>();
let cached: BrowserNotificationPrefs | null = null;

export function getPrefs(): BrowserNotificationPrefs {
  if (cached) return cached;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    cached = { ...DEFAULT_PREFS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    cached = { ...DEFAULT_PREFS };
  }
  return cached!;
}

export function setPref(category: NotificationCategory, enabled: boolean): void {
  cached = { ...getPrefs(), [category]: enabled };
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    // Storage blocked: the preference still applies for this session.
  }
  listeners.forEach(l => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useNotificationPrefs(): BrowserNotificationPrefs {
  return useSyncExternalStore(subscribe, getPrefs, () => DEFAULT_PREFS);
}
