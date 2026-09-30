import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Position } from "../../../lib/api/types";

vi.mock("../../../lib/api/history", () => ({ getHistory: vi.fn() }));
vi.mock("../../../lib/api/market", () => ({ getSpot: vi.fn() }));

import { getHistory } from "../../../lib/api/history";
import { getSpot } from "../../../lib/api/market";
import { ApiError } from "../../../lib/api/client";
import { verifyShareId } from "../../../lib/share/payload";
import { POST } from "./route";

const SECRET = "route-test-secret-0123456789abcdef0123456789";
const closed: Position = {
  id: "p1", wallet_address: "GCKFBEIYV2U22IO2BJ4KVJOIP7XPWQGQFKKWXR6DOSJBV7STMAQSMTGG", underlying: "BTC", strike: 60000,
  expiry_days: 30, option_type: "put", position_type: "short", contracts: 0.5, entry_premium: 1200, entry_spot: 65000,
  collateral: 33000, status: "closed", close_premium: 600, close_spot: 66000, realized_pnl: 300,
  opened_at: "2026-09-01T00:00:00Z", closed_at: "2026-09-20T00:00:00Z", strategy_id: null,
};
const stats = { trade_count: 1, win_count: 1, loss_count: 0, total_realized_pnl: 300 };

const post = (body: unknown, token?: string) =>
  POST(new Request("http://localhost:3000/api/share", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }));

beforeEach(() => {
  vi.stubEnv("SHARE_SIGNING_SECRET", SECRET);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://zenith.example");
  vi.mocked(getHistory).mockReset().mockResolvedValue({ trades: [closed], stats, has_more: false });
  vi.mocked(getSpot).mockReset().mockResolvedValue({ prices: { ETH: 3500 }, vols: { ETH: 0.72 } });
});

describe("POST /api/share", () => {
  it("signs a card built from the sharer's own ledger, ignoring client-sent numbers", async () => {
    const res = await post({ kind: "trade", positionId: "p1", pnlPct: 9000, privacy: { hideAbsolutePnl: false } }, "tok");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(vi.mocked(getHistory)).toHaveBeenCalledWith("tok", expect.objectContaining({ offset: 0 }));
    expect(body.url).toBe(`https://zenith.example/share/${body.id}`);
    expect(body.imageUrl).toBe(`https://zenith.example/api/og/trade?id=${body.id}`);
    const card = await verifyShareId(body.id, SECRET);
    expect(card?.pnlPct).toBe(50);
    expect(card?.pnlAbs).toBe(300);
    expect(card).not.toHaveProperty("contracts");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("pages through history to find older trades", async () => {
    const filler = Array.from({ length: 200 }, (_, i) => ({ ...closed, id: `f${i}` }));
    vi.mocked(getHistory)
      .mockResolvedValueOnce({ trades: filler, stats, has_more: true })
      .mockResolvedValueOnce({ trades: [closed], stats, has_more: false });
    const res = await post({ kind: "trade", positionId: "p1" }, "tok");
    expect(res.status).toBe(200);
    expect(vi.mocked(getHistory)).toHaveBeenCalledTimes(2);
  });

  it("requires sign-in for trades", async () => {
    expect((await post({ kind: "trade", positionId: "p1" })).status).toBe(401);
  });

  it("404s for a trade not in the sharer's history", async () => {
    expect((await post({ kind: "trade", positionId: "someone-elses" }, "tok")).status).toBe(404);
  });

  it("maps an expired backend session to 401", async () => {
    vi.mocked(getHistory).mockRejectedValue(new ApiError(401, "expired"));
    expect((await post({ kind: "trade", positionId: "p1" }, "tok")).status).toBe(401);
  });

  it("prices strategy previews server-side", async () => {
    const res = await post({ kind: "strategy", templateId: "iron-condor", underlying: "ETH", expiryDays: 30, contracts: 2 });
    expect(res.status).toBe(200);
    const card = await verifyShareId((await res.json()).id, SECRET);
    expect(card?.structure).toBe("Iron Condor");
    expect(card?.legs[0].strike).toBeCloseTo(3500 * 0.85, 4);
  });

  it("validates strategy input", async () => {
    expect((await post({ kind: "strategy", templateId: "nope", underlying: "ETH", expiryDays: 30 })).status).toBe(400);
    expect((await post({ kind: "strategy", templateId: "straddle", underlying: "DOGE", expiryDays: 30 })).status).toBe(400);
    expect((await post({ kind: "strategy", templateId: "straddle", underlying: "ETH", expiryDays: 0 })).status).toBe(400);
    expect((await post({ kind: "other" })).status).toBe(400);
  });

  it("returns 503 when the signing secret isn't configured", async () => {
    vi.stubEnv("SHARE_SIGNING_SECRET", "");
    expect((await post({ kind: "strategy", templateId: "straddle", underlying: "ETH", expiryDays: 30 })).status).toBe(503);
  });
});
