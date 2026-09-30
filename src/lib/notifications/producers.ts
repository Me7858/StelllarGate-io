// Producers that derive notifications from state the app already has:
// polled alerts, open positions, the wallet session and the spot feed.
// Trade fills are published directly from BackendDataContext's mutation
// wrappers instead, since that's where the result is known.
import { useEffect, useRef } from "react";
import type { Alert, Position } from "../api/types";
import type { SpotFeedStatus } from "../hooks/useSpotFeed";
import { publishNotification } from "./bus";

const HOUR = 3_600_000;
const EXPIRY_WINDOWS = [
  { key: "24h", ms: 24 * HOUR, label: "within 24 hours" },
  { key: "1h", ms: HOUR, label: "within the hour" },
];
const SESSION_WARNING_MS = 10 * 60_000;
/** A feed drop shorter than this is a reconnect blip, not an outage. */
export const FEED_OUTAGE_GRACE_MS = 10_000;

export function publishTriggeredAlerts(alerts: Alert[]): void {
  for (const a of alerts) {
    if (!a.triggered) continue;
    publishNotification({
      category: "alert", severity: "warning",
      title: `${a.underlying} ${a.condition} $${a.target_price.toFixed(4)}`,
      body: "Price alert triggered",
      href: `/options?u=${a.underlying}`,
      dedupeKey: `alert:${a.id}`,
      createdAt: a.triggered_at ? Date.parse(a.triggered_at) : undefined,
    });
  }
}

/** Positions carry opened_at + expiry_days, which is all expiry needs. */
export function publishExpiryReminders(positions: Position[], now = Date.now()): void {
  for (const p of positions) {
    const expiresAt = Date.parse(p.opened_at) + p.expiry_days * 24 * HOUR;
    const remaining = expiresAt - now;
    if (!Number.isFinite(remaining) || remaining <= 0) continue;
    // Only the tightest window that applies, so a position first seen with
    // 30 minutes left gets one reminder rather than two at once.
    const window = [...EXPIRY_WINDOWS].reverse().find(w => remaining <= w.ms);
    if (!window) continue;
    publishNotification({
      category: "expiry", severity: "warning",
      title: `${p.underlying} ${p.option_type} ${p.strike} expires ${window.label}`,
      body: `${p.position_type === "short" ? "Short" : "Long"} ${p.contracts} contract${p.contracts === 1 ? "" : "s"}`,
      href: "/portfolio",
      dedupeKey: `expiry:${p.id}:${window.key}`,
    });
  }
}

/** `exp` claim (epoch ms) of a JWT bearer token, or null if it isn't one. */
export function tokenExpiry(token: string | null): number | null {
  const part = token?.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function useAlertProducer(alerts: Alert[]) {
  useEffect(() => publishTriggeredAlerts(alerts), [alerts]);
}

export function useExpiryProducer(positions: Position[]) {
  useEffect(() => {
    publishExpiryReminders(positions);
    const id = setInterval(() => publishExpiryReminders(positions), 60_000);
    return () => clearInterval(id);
  }, [positions]);
}

export function useSessionProducer(token: string | null, address: string | null) {
  const prevToken = useRef(token);
  useEffect(() => {
    const had = prevToken.current;
    prevToken.current = token;
    // Token lost while the wallet is still connected = the backend session
    // ended (a user-initiated disconnect clears the address too).
    if (had && !token && address) {
      const exp = tokenExpiry(had);
      publishNotification({
        category: "session", severity: "warning",
        title: "Signed out of the trading backend",
        body: "Reconnect your wallet to keep trading.",
        dedupeKey: `session:ended:${exp ?? had.slice(-12)}`,
      });
    }
    const exp = tokenExpiry(token);
    // setTimeout overflows (fires immediately) past ~24.8 days.
    if (!exp || exp - Date.now() > 2 ** 31 - 1) return;
    const warnIn = exp - SESSION_WARNING_MS - Date.now();
    const expireIn = exp - Date.now();
    const timers = [
      setTimeout(() => publishNotification({
        category: "session", severity: "warning", title: "Session expires in 10 minutes",
        body: "Reconnect your wallet to renew it.", dedupeKey: `session:${exp}:soon`,
      }), Math.max(0, warnIn)),
      setTimeout(() => publishNotification({
        category: "session", severity: "error", title: "Session expired",
        body: "Reconnect your wallet to keep trading.", dedupeKey: `session:${exp}:expired`,
      }), Math.max(0, expireIn)),
    ];
    return () => timers.forEach(clearTimeout);
  }, [token, address]);
}

export function useFeedProducer(status: SpotFeedStatus) {
  const everOpen = useRef(false);
  const downSince = useRef<number | null>(null);
  const announced = useRef(false);

  useEffect(() => {
    if (status === "open") {
      if (downSince.current !== null && announced.current) {
        publishNotification({
          category: "feed", severity: "success", title: "Live prices restored",
          dedupeKey: `feed:up:${downSince.current}`,
        });
      }
      everOpen.current = true;
      downSince.current = null;
      announced.current = false;
      return;
    }
    if (!everOpen.current) return;
    downSince.current ??= Date.now();
    const since = downSince.current;
    const id = setTimeout(() => {
      announced.current = true;
      publishNotification({
        category: "feed", severity: "error", title: "Live price feed disconnected",
        body: "Prices shown may be stale while the app reconnects.",
        dedupeKey: `feed:down:${since}`,
      });
    }, Math.max(0, since + FEED_OUTAGE_GRACE_MS - Date.now()));
    return () => clearTimeout(id);
  }, [status]);
}
