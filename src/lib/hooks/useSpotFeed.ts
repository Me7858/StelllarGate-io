import { useEffect, useSyncExternalStore } from "react";
import { realtime, type RealtimeStatus } from "../realtime";
import type { SpotResponse } from "../api/types";

export type SpotFeedStatus = "connecting" | "open" | "closed";

// Module-level store: the latest snapshot is buffered and published at
// most once per animation frame, so bursts of ticks cause one React update.
let latest: SpotResponse | null = null;
let published: SpotResponse | null = null;
let lastTickAt: number | null = null;
let frame: number | null = null;
const dataListeners = new Set<() => void>();
let users = 0;
let unsubscribe: (() => void) | null = null;

function onTick(update: unknown) {
  latest = update as SpotResponse;
  lastTickAt = Date.now();
  if (frame !== null) return;
  const flush = () => {
    frame = null;
    published = latest;
    dataListeners.forEach((l) => l());
  };
  frame = typeof requestAnimationFrame === "function" ? requestAnimationFrame(flush) : (setTimeout(flush, 16) as unknown as number);
}

const subscribeData = (l: () => void) => {
  dataListeners.add(l);
  return () => {
    dataListeners.delete(l);
  };
};

/** Detailed feed health for UI (pill, provenance). */
export function useFeedStatus(): RealtimeStatus {
  return useSyncExternalStore(realtime.subscribeStatus, realtime.getStatus, () => "connecting" as RealtimeStatus);
}

export function getLastTickAt() {
  return lastTickAt;
}

/**
 * Public API unchanged: shared spot feed data + coarse status. Now backed
 * by the ref-counted RealtimeClient (reconnect, stale detection, backoff).
 */
export function useSpotFeed(): { data: SpotResponse | null; status: SpotFeedStatus } {
  const data = useSyncExternalStore(subscribeData, () => published, () => null);
  const rt = useFeedStatus();

  useEffect(() => {
    if (users++ === 0) unsubscribe = realtime.subscribe("spot", null, onTick);
    return () => {
      if (--users === 0) {
        unsubscribe?.();
        unsubscribe = null;
      }
    };
  }, []);

  const status: SpotFeedStatus = rt === "open" ? "open" : rt === "connecting" ? "connecting" : "closed";
  return { data, status };
}
