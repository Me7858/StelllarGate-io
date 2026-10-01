"use client";

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useWalletStore } from "../store/wallet";
import { useHydrated } from "../useHydrated";
import { sendNotification } from "../notify";
import { subscribeNotifications } from "./bus";
import { getPrefs } from "./prefs";
import { NotificationStore } from "./store";
import type { AppNotification, NotificationCategory } from "./types";

export interface NotificationsValue {
  items: AppNotification[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: (category?: NotificationCategory) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const EMPTY: AppNotification[] = [];
const noop = () => {};

export const NotificationsContext = createContext<NotificationsValue>({
  items: EMPTY, unreadCount: 0, markRead: noop, markAllRead: noop, remove: noop, clear: noop,
});

/**
 * Owns the notification store for the connected wallet (or an
 * "anonymous" bucket before one connects) and is the bus's single
 * subscriber: every published event is persisted, and — if this tab was
 * the one that actually inserted it and the category is opted in — also
 * shown as a browser notification.
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  const address = useWalletStore(s => s.address);
  const wallet = hydrated ? address ?? "anonymous" : null;
  const [store, setStore] = useState<NotificationStore | null>(null);

  useEffect(() => {
    if (!wallet) return;
    const s = new NotificationStore(wallet);
    setStore(s);
    const unsubscribe = subscribeNotifications(input => {
      void s.add(input).then(added => {
        if (added && getPrefs()[added.category]) sendNotification(added.title, added.body ?? "");
      });
    });
    return () => {
      unsubscribe();
      s.destroy();
    };
  }, [wallet]);

  const items = useSyncExternalStore(
    store?.subscribe ?? subscribeNothing,
    store?.getSnapshot ?? emptySnapshot,
    emptySnapshot,
  );

  const value = useMemo<NotificationsValue>(() => ({
    items,
    unreadCount: items.reduce((n, x) => (x.read ? n : n + 1), 0),
    markRead: id => void store?.markRead(id),
    markAllRead: category => void store?.markAllRead(category),
    remove: id => void store?.remove(id),
    clear: () => void store?.clear(),
  }), [items, store]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

const subscribeNothing = () => noop;
const emptySnapshot = () => EMPTY;

export function useNotifications(): NotificationsValue {
  return useContext(NotificationsContext);
}
