import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { backendDataFor, makeQuery, renderWithProviders, type SurfaceState } from "../../test/renderWithProviders";
import { AccountChip } from "../AppHeader";
import { AlertsPanel } from "../AlertsPanel";
import { PortfolioRiskPanel } from "../PortfolioRiskPanel";
import { PositionsView } from "../../features/options/PositionsView";
import { ChainView } from "../../features/options/ChainView";
import { modelChain, type ChainResult, type ChainRow } from "../../features/options/useChain";
import PortfolioPage from "../../app/portfolio/page";
import HistoryPage from "../../app/history/page";
import Home from "../../app/page";
import type { HistoryResponse } from "../../lib/api/types";
import { POSITION } from "../../test/renderWithProviders";
import { bs } from "../../lib/pricing";

// History has its own hook (not part of BackendDataContext) — drive it directly.
const historyState: { current: ReturnType<typeof makeQuery<HistoryResponse>> } = { current: makeQuery("loading") };
vi.mock("../../lib/hooks/useBackendHistory", () => ({
  useBackendHistory: () => {
    const data = historyState.current.data ?? { trades: [], stats: { trade_count: 0, win_count: 0, loss_count: 0, total_realized_pnl: 0 } };
    return { ...data, loading: historyState.current.status === "loading", refresh: historyState.current.refetch, query: historyState.current };
  },
}));

const STATES: SurfaceState[] = ["loading", "signed-out", "error", "empty", "success"];
const liveGreeks = () => bs(0.1182, 0.12, 0.8, 30 / 365, true);

/** Assertions shared by every authed surface. */
function expectState(state: SurfaceState, root: HTMLElement, opts: { success: () => void; empty: () => void }) {
  const r = within(root);
  if (state === "loading") {
    expect(r.getAllByRole("status").some(el => el.getAttribute("aria-busy") === "true")).toBe(true);
    expect(root.textContent).not.toMatch(/\$0\.00/);
  } else if (state === "signed-out") {
    expect(r.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
  } else if (state === "error") {
    expect(r.getAllByRole("alert").some(el => /backend exploded/.test(el.textContent ?? ""))).toBe(true);
    expect(r.getAllByRole("button", { name: /retry/i }).length).toBeGreaterThan(0);
  } else if (state === "empty") {
    opts.empty();
  } else {
    opts.success();
  }
}

describe.each(STATES)("state: %s", (state) => {
  it("account chip", () => {
    const { container } = renderWithProviders(<AccountChip />, { data: backendDataFor(state) });
    const chip = screen.getByTestId("account-chip");
    const expected = { loading: "loading", "signed-out": "signed-out", error: "error", empty: "ready", success: "ready" }[state];
    expect(chip).toHaveAttribute("data-state", expected);
    if (state === "loading") expect(container.textContent).not.toMatch(/\$0\.00/);
    if (state === "success") expect(chip).toHaveTextContent("$1234.50");
  });

  it("positions (terminal quick view)", () => {
    const { container } = renderWithProviders(<PositionsView liveGreeks={liveGreeks} onBackToChain={() => {}} />, { data: backendDataFor(state) });
    expectState(state, container, {
      empty: () => expect(screen.getByTestId("positions-empty")).toHaveTextContent("No open positions"),
      success: () => expect(screen.getByTestId("positions")).toHaveTextContent("XLM"),
    });
  });

  it("alerts panel", () => {
    const { container } = renderWithProviders(<AlertsPanel sym="XLM" spot={0.1182} />, { data: backendDataFor(state) });
    expectState(state, container, {
      empty: () => expect(screen.getByTestId("alerts-empty")).toHaveTextContent("No alerts set for XLM"),
      success: () => expect(screen.getByTestId("alerts-list")).toHaveTextContent("≥ $0.2000"),
    });
  });

  it("risk panel", () => {
    const { container } = renderWithProviders(
      <PortfolioRiskPanel query={backendDataFor(state).positionsQuery} auth={backendDataFor(state).authStatus} spots={{ XLM: 0.1182 }} />,
      { data: backendDataFor(state) }
    );
    expectState(state, container, {
      empty: () => expect(screen.getByTestId("risk-empty")).toBeInTheDocument(),
      success: () => expect(screen.getByTestId("risk-content")).toHaveTextContent(/Max Loss/),
    });
  });

  it("portfolio page", () => {
    const { container } = renderWithProviders(<PortfolioPage />, { data: backendDataFor(state) });
    expectState(state, container, {
      empty: () => expect(screen.getByTestId("portfolio-empty")).toHaveTextContent("No open positions"),
      success: () => expect(screen.getByTestId("portfolio-positions")).toHaveTextContent("XLM"),
    });
  });

  it("history page", () => {
    const data = { trades: [{ ...POSITION, status: "closed" as const, realized_pnl: 12, close_premium: 0.02, closed_at: "2026-01-02T00:00:00Z" }], stats: { trade_count: 1, win_count: 1, loss_count: 0, total_realized_pnl: 12 } };
    historyState.current =
      state === "loading" ? makeQuery("loading")
      : state === "signed-out" ? makeQuery("idle")
      : state === "error" ? makeQuery("error", undefined, new Error("backend exploded"))
      : makeQuery("success", state === "empty" ? { trades: [], stats: { trade_count: 0, win_count: 0, loss_count: 0, total_realized_pnl: 0 } } : data);
    const { container } = renderWithProviders(<HistoryPage />, { data: backendDataFor(state) });
    expectState(state, container, {
      empty: () => expect(screen.getByTestId("history-empty")).toHaveTextContent("No trades yet"),
      success: () => expect(screen.getByTestId("history-stats")).toHaveTextContent("+$12.00"),
    });
  });

  it("watchlist (home page)", () => {
    renderWithProviders(<Home />, { data: backendDataFor(state) });
    const section = screen.getByText("Watchlist").parentElement!;
    expectState(state, section, {
      empty: () => expect(screen.getByTestId("watchlist-empty")).toHaveTextContent(/watchlist is empty/i),
      success: () => expect(screen.getByTestId("watchlist")).toHaveTextContent("BTC"),
    });
  });
});

describe("error states retry", () => {
  it("calls refetch when Retry is pressed", async () => {
    const data = backendDataFor("error");
    renderWithProviders(<PositionsView liveGreeks={liveGreeks} onBackToChain={() => {}} />, { data });
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(data.positionsQuery.refetch).toHaveBeenCalled();
  });

  it("keeps showing last good data when a background refresh fails, and says so", () => {
    const data = backendDataFor("success");
    data.positionsQuery = { ...data.positionsQuery, status: "error", error: new Error("backend exploded") };
    renderWithProviders(<PositionsView liveGreeks={liveGreeks} onBackToChain={() => {}} />, { data });
    expect(screen.getByTestId("positions")).toHaveTextContent("XLM");
    expect(screen.getByRole("alert")).toHaveTextContent(/showing last loaded data/i);
  });
});

describe("options chain states (public data: no auth state)", () => {
  const rows = modelChain(0.1182, 0.82, 30 / 365);
  const chain = (over: Partial<ChainResult>): ChainResult => ({ query: makeQuery<ChainRow[]>("success", rows), rows, source: "backend", ...over });
  const render = (c: ChainResult) => renderWithProviders(<ChainView chain={c} sym="XLM" expiryLabel="30D" onTrade={vi.fn()} />);

  it("loading: layout-matching skeleton", () => {
    render(chain({ query: makeQuery("loading"), rows: [], source: "none" }));
    expect(screen.getByTestId("chain-skeleton")).toHaveAttribute("aria-busy", "true");
  });

  it("error: falls back to model prices, says so, and can retry", async () => {
    const q = makeQuery<ChainRow[]>("error", undefined, new TypeError("Failed to fetch"));
    render(chain({ query: q, source: "model" }));
    expect(screen.getByTestId("chain-error")).toHaveTextContent(/showing model prices/i);
    expect(screen.getByTestId("chain")).toHaveAttribute("data-source", "model");
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(q.refetch).toHaveBeenCalled();
  });

  it("empty: explains there are no strikes", () => {
    render(chain({ query: makeQuery("success", []), rows: [] }));
    expect(screen.getByTestId("chain-empty")).toHaveTextContent("No strikes listed for XLM 30D");
  });

  it("success: tradeable bid/ask buttons for both layouts", async () => {
    const onTrade = vi.fn();
    renderWithProviders(<ChainView chain={chain({})} sym="XLM" expiryLabel="30D" onTrade={onTrade} />);
    const buys = screen.getAllByRole("button", { name: /^Buy XLM .* call at ask/ });
    expect(buys.length).toBe(rows.length * 2); // desktop grid + phone list
    await userEvent.click(buys[0]);
    expect(onTrade).toHaveBeenCalledWith(rows[0], "call", "buy");
  });
});
