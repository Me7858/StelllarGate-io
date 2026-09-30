import { afterEach, describe, expect, it } from "vitest";
import { publishExpiryReminders, publishTriggeredAlerts, tokenExpiry } from "./producers";
import { subscribeNotifications } from "./bus";
import { fromServerFrame } from "./serverContract";
import type { Alert, Position } from "../api/types";
import type { NotificationInput } from "./types";

let off: (() => void) | null = null;
const capture = () => {
  const got: NotificationInput[] = [];
  off = subscribeNotifications(n => got.push(n));
  return got;
};
afterEach(() => off?.());

const position = (p: Partial<Position>): Position => ({
  id: "p1", wallet_address: "G", underlying: "XLM", strike: 0.12, expiry_days: 7, option_type: "call",
  position_type: "long", contracts: 2, entry_premium: 0.01, entry_spot: 0.12, collateral: 0, status: "open",
  close_premium: null, close_spot: null, realized_pnl: null, opened_at: "2026-01-01T00:00:00Z", closed_at: null,
  strategy_id: null, ...p,
});

describe("producers", () => {
  it("publishes only triggered alerts, keyed by alert id", () => {
    const got = capture();
    const alert = (id: string, triggered: boolean): Alert => ({
      id, wallet_address: "G", underlying: "BTC", condition: "above", target_price: 70000,
      triggered, created_at: "2026-01-01T00:00:00Z", triggered_at: triggered ? "2026-01-02T00:00:00Z" : null,
    });
    publishTriggeredAlerts([alert("a", true), alert("b", false)]);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ category: "alert", dedupeKey: "alert:a", href: "/options?u=BTC" });
  });

  it("reminds once per window as expiry approaches", () => {
    const got = capture();
    const opened = Date.parse("2026-01-01T00:00:00Z");
    const expiresAt = opened + 7 * 86_400_000;
    publishExpiryReminders([position({})], expiresAt - 30 * 3_600_000);
    expect(got).toHaveLength(0);
    publishExpiryReminders([position({})], expiresAt - 20 * 3_600_000);
    expect(got.map(n => n.dedupeKey)).toEqual(["expiry:p1:24h"]);
    publishExpiryReminders([position({})], expiresAt - 30 * 60_000);
    expect(got.map(n => n.dedupeKey)).toEqual(["expiry:p1:24h", "expiry:p1:1h"]);
    publishExpiryReminders([position({})], expiresAt + 1);
    expect(got).toHaveLength(2);
  });

  it("reads the exp claim of a JWT and ignores anything else", () => {
    const payload = btoa(JSON.stringify({ exp: 1_800_000_000 })).replace(/=+$/, "");
    expect(tokenExpiry(`h.${payload}.s`)).toBe(1_800_000_000_000);
    expect(tokenExpiry("opaque-token")).toBeNull();
    expect(tokenExpiry(null)).toBeNull();
  });
});

describe("server notification contract", () => {
  const frame = {
    type: "notification", id: "n1", category: "system", severity: "info",
    title: "Maintenance tonight", body: null, href: "/history", created_at: "2026-03-01T12:00:00Z",
  };

  it("maps a valid frame", () => {
    expect(fromServerFrame(frame)).toEqual({
      category: "system", severity: "info", title: "Maintenance tonight", body: undefined,
      href: "/history", dedupeKey: "server:n1", createdAt: Date.parse("2026-03-01T12:00:00Z"),
    });
  });

  it("rejects unknown frame types and external links", () => {
    expect(fromServerFrame({ ...frame, type: "read_state" })).toBeNull();
    expect(fromServerFrame({ ...frame, href: "https://evil.example" })!.href).toBeUndefined();
    expect(fromServerFrame({ ...frame, href: "//evil.example" })!.href).toBeUndefined();
    expect(fromServerFrame({ ...frame, category: "bogus" })!.category).toBe("system");
  });
});
