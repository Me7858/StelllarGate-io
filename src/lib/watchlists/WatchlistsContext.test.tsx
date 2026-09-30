import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { WatchlistsProvider, useWatchlists, type WatchlistsValue } from "./WatchlistsContext";
import type { NamedWatchlist } from "../api/types";

const API = "http://localhost:8081/api/v1/watchlists";
const list = (id: string, name: string, symbols: string[], position = 0): NamedWatchlist =>
  ({ id, name, symbols, position, updated_at: "2026-01-01T00:00:00Z" });

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => localStorage.clear());

let ctx: WatchlistsValue;
function Probe() {
  ctx = useWatchlists();
  return <div data-testid="mode">{ctx.mode}</div>;
}
const renderProvider = (token: string | null = "tok", favorites: string[] = []) =>
  render(
    <WatchlistsProvider wallet="GWALLET" token={token} favorites={favorites} addFavorite={vi.fn()} removeFavorite={vi.fn()}>
      <Probe />
    </WatchlistsProvider>,
  );
const custom = () => ctx.lists.filter(l => l.id !== "favorites");

describe("WatchlistsProvider (server mode)", () => {
  it("loads lists from the server, after Favorites", async () => {
    server.use(http.get(API, () => HttpResponse.json([list("b", "Second", ["ETH"], 1), list("a", "Majors", ["BTC", "ETH"], 0)])));
    renderProvider("tok", ["XLM"]);
    await waitFor(() => expect(screen.getByTestId("mode")).toHaveTextContent("server"));
    expect(ctx.lists.map(l => l.name)).toEqual(["Favorites", "Majors", "Second"]);
    expect(ctx.lists[0].symbols).toEqual(["XLM"]);
  });

  it("saves a reorder as the full ordered symbol array", async () => {
    let patched: unknown = null;
    server.use(
      http.get(API, () => HttpResponse.json([list("a", "Majors", ["BTC", "ETH", "SOL"])])),
      http.patch(`${API}/a`, async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json(list("a", "Majors", (patched as { symbols: string[] }).symbols));
      }),
    );
    renderProvider();
    await waitFor(() => expect(ctx.mode).toBe("server"));
    await act(() => ctx.moveSymbol("a", 2, 0));
    expect(patched).toEqual({ symbols: ["SOL", "BTC", "ETH"] });
    expect(custom()[0].symbols).toEqual(["SOL", "BTC", "ETH"]);
  });

  it("applies a reorder optimistically and rolls it back when the server rejects it", async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    server.use(
      http.get(API, () => HttpResponse.json([list("a", "Majors", ["BTC", "ETH"])])),
      http.patch(`${API}/a`, async () => {
        await gate;
        return HttpResponse.json({ error: "conflict" }, { status: 409 });
      }),
    );
    renderProvider();
    await waitFor(() => expect(ctx.mode).toBe("server"));
    let pending!: Promise<void>;
    act(() => { pending = ctx.moveSymbol("a", 1, 0); });
    await waitFor(() => expect(custom()[0].symbols).toEqual(["ETH", "BTC"]));
    release();
    await act(() => pending);
    expect(custom()[0].symbols).toEqual(["BTC", "ETH"]);
    expect(ctx.error).toMatch(/conflict/);
  });

  it("uploads locally saved lists the first time the server has none (migration)", async () => {
    localStorage.setItem("zenith-watchlists:GWALLET", JSON.stringify({ version: 1, lists: [list("local-1", "Alts", ["SOL", "XLM"])] }));
    const created: unknown[] = [];
    server.use(
      http.get(API, () => HttpResponse.json([])),
      http.post(API, async ({ request }) => {
        const body = (await request.json()) as { name: string; symbols: string[] };
        created.push(body);
        return HttpResponse.json(list("srv-1", body.name, body.symbols), { status: 201 });
      }),
    );
    renderProvider();
    await waitFor(() => expect(ctx.mode).toBe("server"));
    expect(created).toEqual([{ name: "Alts", symbols: ["SOL", "XLM"] }]);
    expect(custom().map(l => l.id)).toEqual(["srv-1"]);
    expect(JSON.parse(localStorage.getItem("zenith-watchlists:GWALLET")!).lists).toEqual([]);
  });
});

describe("WatchlistsProvider (local mode)", () => {
  it("falls back to this browser when the server has no multi-list API", async () => {
    server.use(http.get(API, () => HttpResponse.json({ error: "not found" }, { status: 404 })));
    renderProvider();
    await waitFor(() => expect(ctx.mode).toBe("local"));
    expect(ctx.error).toBeNull();

    await act(async () => { await ctx.createList("  Alts "); });
    const id = custom()[0].id;
    await act(() => ctx.addSymbol(id, "SOL"));
    await act(() => ctx.addSymbol(id, "SOL")); // duplicate within a list is ignored
    await act(() => ctx.addSymbol(id, "XLM"));
    expect(custom()[0]).toMatchObject({ name: "Alts", symbols: ["SOL", "XLM"] });
    const saved = JSON.parse(localStorage.getItem("zenith-watchlists:GWALLET")!);
    expect(saved.lists[0].symbols).toEqual(["SOL", "XLM"]);
  });

  it("works signed out without touching the network", async () => {
    renderProvider(null);
    await waitFor(() => expect(ctx.mode).toBe("local"));
    expect(ctx.canEditFavorites).toBe(false);
  });

  it("allows the same symbol in different lists, and deletes a list", async () => {
    renderProvider(null);
    await waitFor(() => expect(ctx.mode).toBe("local"));
    await act(async () => { await ctx.createList("One"); await ctx.createList("Two"); });
    const [one, two] = custom();
    await act(async () => { await ctx.addSymbol(one.id, "BTC"); await ctx.addSymbol(two.id, "BTC"); });
    expect(custom().map(l => l.symbols)).toEqual([["BTC"], ["BTC"]]);
    await act(() => ctx.deleteList(one.id));
    expect(custom().map(l => l.name)).toEqual(["Two"]);
  });

  it("keeps a local order for Favorites (the v1 set has none)", async () => {
    renderProvider(null, ["BTC", "ETH", "XLM"]);
    await waitFor(() => expect(ctx.mode).toBe("local"));
    await act(() => ctx.moveSymbol("favorites", 2, 0));
    expect(ctx.lists[0].symbols).toEqual(["XLM", "BTC", "ETH"]);
    expect(JSON.parse(localStorage.getItem("zenith-favorites-order:GWALLET")!)).toEqual(["XLM", "BTC", "ETH"]);
  });
});
