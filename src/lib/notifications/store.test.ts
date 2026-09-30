import { beforeEach, describe, expect, it } from "vitest";
import { createStore, type UseStore } from "idb-keyval";
import { NotificationStore, type ChannelLike } from "./store";
import type { NotificationInput } from "./types";

// In-process stand-in for BroadcastChannel: every channel on the hub sees
// every other channel's messages, like tabs of the same origin.
function hub() {
  const channels = new Set<ChannelLike>();
  return () => {
    const ch: ChannelLike = {
      onmessage: null,
      postMessage: msg => channels.forEach(c => { if (c !== ch) c.onmessage?.({ data: msg }); }),
      close: () => channels.delete(ch),
    };
    channels.add(ch);
    return ch;
  };
}

const fill = (title: string, extra: Partial<NotificationInput> = {}): NotificationInput =>
  ({ category: "fill", severity: "success", title, ...extra });

let idb: UseStore;
let dbN = 0;
beforeEach(() => {
  idb = createStore(`test-db-${dbN++}`, "notifications");
});

describe("NotificationStore", () => {
  it("adds newest-first as unread and persists across instances", async () => {
    const a = new NotificationStore("GABC", { idb, channel: null });
    await a.add(fill("one", { createdAt: 1 }));
    await a.add(fill("two", { createdAt: 2 }));
    expect(a.getSnapshot().map(n => [n.title, n.read])).toEqual([["two", false], ["one", false]]);

    const b = new NotificationStore("GABC", { idb, channel: null });
    await b.ready;
    expect(b.getSnapshot().map(n => n.title)).toEqual(["two", "one"]);
  });

  it("drops a second event with the same dedupe key", async () => {
    const s = new NotificationStore("GABC", { idb, channel: null });
    expect(await s.add(fill("alert", { dedupeKey: "alert:1" }))).not.toBeNull();
    expect(await s.add(fill("alert again", { dedupeKey: "alert:1" }))).toBeNull();
    expect(s.getSnapshot()).toHaveLength(1);
  });

  it("keeps only the most recent `max` items", async () => {
    const s = new NotificationStore("GABC", { idb, channel: null, max: 5 });
    for (let i = 0; i < 8; i++) await s.add(fill(`n${i}`, { createdAt: i }));
    expect(s.getSnapshot().map(n => n.title)).toEqual(["n7", "n6", "n5", "n4", "n3"]);
  });

  it("marks one, a category, or everything read", async () => {
    const s = new NotificationStore("GABC", { idb, channel: null });
    const f = (await s.add(fill("f")))!;
    await s.add({ category: "alert", severity: "warning", title: "a" });
    await s.add({ category: "feed", severity: "error", title: "d" });

    await s.markRead(f.id);
    expect(s.getSnapshot().find(n => n.id === f.id)!.read).toBe(true);
    await s.markAllRead("alert");
    expect(s.getSnapshot().filter(n => !n.read).map(n => n.title)).toEqual(["d"]);
    await s.markAllRead();
    expect(s.getSnapshot().every(n => n.read)).toBe(true);
  });

  it("removes and clears", async () => {
    const s = new NotificationStore("GABC", { idb, channel: null });
    const a = (await s.add(fill("a")))!;
    await s.add(fill("b"));
    await s.remove(a.id);
    expect(s.getSnapshot().map(n => n.title)).toEqual(["b"]);
    await s.clear();
    expect(s.getSnapshot()).toEqual([]);
  });

  it("keeps wallets separate", async () => {
    const a = new NotificationStore("WALLET_A", { idb, channel: null });
    const b = new NotificationStore("WALLET_B", { idb, channel: null });
    await a.add(fill("for A"));
    await b.ready;
    expect(b.getSnapshot()).toEqual([]);
  });

  it("syncs other tabs of the same wallet, and dedupes across them", async () => {
    const connect = hub();
    const tab1 = new NotificationStore("GABC", { idb, channel: connect() });
    const tab2 = new NotificationStore("GABC", { idb, channel: connect() });
    await Promise.all([tab1.ready, tab2.ready]);

    const updated = new Promise<void>(resolve => { const off = tab2.subscribe(() => { off(); resolve(); }); });
    await tab1.add(fill("from tab 1", { dedupeKey: "k" }));
    await updated;
    expect(tab2.getSnapshot().map(n => n.title)).toEqual(["from tab 1"]);

    // Both tabs observed the same event: only one copy is stored.
    const [r1, r2] = await Promise.all([
      tab1.add(fill("same", { dedupeKey: "alert:9" })),
      tab2.add(fill("same", { dedupeKey: "alert:9" })),
    ]);
    expect([r1, r2].filter(Boolean)).toHaveLength(1);
  });

  it("notifies subscribers", async () => {
    const s = new NotificationStore("GABC", { idb, channel: null });
    await s.ready;
    let calls = 0;
    s.subscribe(() => calls++);
    await s.add(fill("x"));
    expect(calls).toBeGreaterThan(0);
  });

  it("works in memory when IndexedDB isn't available", async () => {
    const s = new NotificationStore("GABC", { idb: null, channel: null });
    await s.add(fill("mem"));
    expect(s.getSnapshot().map(n => n.title)).toEqual(["mem"]);
  });
});
