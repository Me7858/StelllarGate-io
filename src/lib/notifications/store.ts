// Per-wallet notification history persisted in IndexedDB. Every mutation
// is a single idb-keyval `update` (one readwrite transaction), so two tabs
// adding the same deduped event at once can't both insert it; the other
// tabs are told to reload over a BroadcastChannel.
import { createStore, get, update, type UseStore } from "idb-keyval";
import type { AppNotification, NotificationCategory, NotificationInput } from "./types";

export const MAX_NOTIFICATIONS = 500;
/** Kept after a quota error forces a trim. */
const QUOTA_FALLBACK_SIZE = 100;
const CHANNEL_NAME = "zenith-notifications";

export interface ChannelLike {
  postMessage(msg: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  close(): void;
}

let idbStore: UseStore | null = null;
function defaultIdb(): UseStore | null {
  if (typeof indexedDB === "undefined") return null;
  idbStore ??= createStore("zenith", "notifications");
  return idbStore;
}

function defaultChannel(): ChannelLike | null {
  return typeof BroadcastChannel === "undefined" ? null : (new BroadcastChannel(CHANNEL_NAME) as unknown as ChannelLike);
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function isQuotaError(err: unknown): boolean {
  return err instanceof Error && (err.name === "QuotaExceededError" || /quota/i.test(err.message));
}

export interface NotificationStoreOptions {
  /** null = memory only (no IndexedDB in this environment). */
  idb?: UseStore | null;
  channel?: ChannelLike | null;
  max?: number;
}

export class NotificationStore {
  readonly key: string;
  private items: AppNotification[] = [];
  private listeners = new Set<() => void>();
  private idb: UseStore | null;
  private channel: ChannelLike | null;
  private max: number;
  readonly ready: Promise<void>;

  constructor(wallet: string, opts: NotificationStoreOptions = {}) {
    this.key = `notifications:${wallet}`;
    this.idb = opts.idb !== undefined ? opts.idb : defaultIdb();
    this.channel = opts.channel !== undefined ? opts.channel : defaultChannel();
    this.max = opts.max ?? MAX_NOTIFICATIONS;
    if (this.channel) {
      this.channel.onmessage = (e) => {
        const msg = e.data as { key?: string } | null;
        if (msg?.key === this.key) void this.reload();
      };
    }
    this.ready = this.reload();
  }

  getSnapshot = (): AppNotification[] => this.items;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  destroy(): void {
    this.channel?.close();
    this.listeners.clear();
  }

  async reload(): Promise<void> {
    if (!this.idb) return;
    try {
      this.set((await get<AppNotification[]>(this.key, this.idb)) ?? []);
    } catch {
      // IndexedDB unavailable (private mode, blocked storage): stay in memory.
      this.idb = null;
    }
  }

  /** Returns the stored notification, or null if it was a duplicate. */
  async add(input: NotificationInput): Promise<AppNotification | null> {
    await this.ready;
    const n: AppNotification = { ...input, id: newId(), createdAt: input.createdAt ?? Date.now(), read: false };
    let added = false;
    await this.mutate(list => {
      if (n.dedupeKey && list.some(x => x.dedupeKey === n.dedupeKey)) return list;
      added = true;
      return [n, ...list].sort((a, b) => b.createdAt - a.createdAt).slice(0, this.max);
    });
    return added ? n : null;
  }

  markRead(id: string) {
    return this.mutate(list => list.map(n => (n.id === id && !n.read ? { ...n, read: true } : n)));
  }

  markAllRead(category?: NotificationCategory) {
    return this.mutate(list => list.map(n => (!n.read && (!category || n.category === category) ? { ...n, read: true } : n)));
  }

  remove(id: string) {
    return this.mutate(list => list.filter(n => n.id !== id));
  }

  clear() {
    return this.mutate(() => []);
  }

  private set(items: AppNotification[]) {
    this.items = items;
    this.listeners.forEach(l => l());
  }

  private async mutate(fn: (list: AppNotification[]) => AppNotification[]): Promise<void> {
    if (!this.idb) {
      this.set(fn(this.items));
      return;
    }
    let next: AppNotification[] = this.items;
    const write = (limit: number) =>
      update<AppNotification[]>(this.key, (cur) => (next = fn(cur ?? []).slice(0, limit)), this.idb!);
    try {
      await write(this.max);
    } catch (err) {
      if (!isQuotaError(err)) {
        this.idb = null;
        this.set(fn(this.items));
        return;
      }
      try {
        await write(QUOTA_FALLBACK_SIZE);
      } catch {
        this.idb = null;
        this.set(fn(this.items).slice(0, QUOTA_FALLBACK_SIZE));
        return;
      }
    }
    this.set(next);
    this.channel?.postMessage({ key: this.key });
  }
}
