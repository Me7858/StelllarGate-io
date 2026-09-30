import { render } from "@testing-library/react";
import { vi } from "vitest";
import { BackendDataContext, type AuthStatus, type BackendData } from "../lib/context/BackendDataContext";
import { EnvironmentContext } from "../lib/context/EnvironmentContext";
import { SpotFeedContext } from "../lib/context/SpotFeedContext";
import { NETWORKS, type EnvironmentMode } from "../lib/env/networks";
import type { QueryState, QueryStatus } from "../lib/query";
import type { Account, Alert, Position, WatchlistItem } from "../lib/api/types";
import type { PositionsData } from "../lib/hooks/useBackendPositions";

export function makeQuery<T>(status: QueryStatus, data?: T, error: Error | null = null): QueryState<T> {
  return { status, data, error, isFetching: status === "loading", refetch: vi.fn() };
}

/** The four states every data surface must handle, as (auth, query status) pairs. */
export type SurfaceState = "loading" | "signed-out" | "error" | "empty" | "success";

export const ACCOUNT: Account = { wallet_address: "GABC", balance: 1234.5, collateral_locked: 100, created_at: "2026-01-01T00:00:00Z" };

export const POSITION: Position = {
  id: "p1", wallet_address: "GABC", underlying: "XLM", strike: 0.12, expiry_days: 30,
  option_type: "call", position_type: "long", contracts: 2, entry_premium: 0.01, entry_spot: 0.1182,
  collateral: 0, status: "open", close_premium: null, close_spot: null, realized_pnl: null,
  opened_at: "2026-01-01T00:00:00Z", closed_at: null, strategy_id: null,
};

export const ALERT: Alert = {
  id: "a1", wallet_address: "GABC", underlying: "XLM", condition: "above", target_price: 0.2,
  triggered: false, created_at: "2026-01-01T00:00:00Z", triggered_at: null,
};

export const WATCH: WatchlistItem = { wallet_address: "GABC", underlying: "BTC", added_at: "2026-01-01T00:00:00Z" };

const GREEKS = { delta: 0.5, gamma: 0.01, theta: -0.001, vega: 0.02 };

/** Build a BackendData value where every query is in the given state. */
export function backendDataFor(state: SurfaceState, overrides: Partial<BackendData> = {}): BackendData {
  const err = new Error("backend exploded");
  const auth: AuthStatus = state === "signed-out" ? "signed-out" : "signed-in";
  const q = <T,>(full: T, empty: T): QueryState<T> =>
    state === "loading" ? makeQuery<T>("loading")
    : state === "signed-out" ? makeQuery<T>("idle")
    : state === "error" ? makeQuery<T>("error", undefined, err)
    : makeQuery<T>("success", state === "empty" ? empty : full);

  const accountQuery = q<Account>(ACCOUNT, ACCOUNT);
  const positionsQuery = q<PositionsData>({ positions: [POSITION], greeks: GREEKS }, { positions: [], greeks: { delta: 0, gamma: 0, theta: 0, vega: 0 } });
  const watchlistQuery = q<WatchlistItem[]>([WATCH], []);
  const alertsQuery = q<Alert[]>([ALERT], []);

  return {
    authStatus: auth,
    accountQuery, positionsQuery, watchlistQuery, alertsQuery,
    account: accountQuery.data ?? null, accountLoading: state === "loading", refreshAccount: vi.fn(),
    positions: positionsQuery.data?.positions ?? [], greeks: positionsQuery.data?.greeks ?? { delta: 0, gamma: 0, theta: 0, vega: 0 },
    positionsLoading: state === "loading", refreshPositions: vi.fn(),
    open: vi.fn(), openStrategy: vi.fn(), close: vi.fn(), roll: vi.fn(),
    watchlist: watchlistQuery.data ?? [], watchlistLoading: state === "loading",
    addToWatchlist: vi.fn(), removeFromWatchlist: vi.fn(),
    alerts: alertsQuery.data ?? [], alertsLoading: state === "loading", addAlert: vi.fn(), removeAlert: vi.fn(),
    ...overrides,
  };
}

export function renderWithProviders(ui: React.ReactElement, opts: { data?: BackendData; mode?: EnvironmentMode } = {}) {
  const mode = opts.mode ?? "paper";
  const env = {
    mode, network: NETWORKS[mode], hydrated: true,
    requestSwitch: vi.fn(), pendingSwitch: null, confirmSwitch: vi.fn(), cancelSwitch: vi.fn(),
    linkPrompt: null, dismissLinkPrompt: vi.fn(), tradingBlocked: false, tradingBlockReason: null,
  };
  return render(
    <EnvironmentContext.Provider value={env}>
      <SpotFeedContext.Provider value={{ data: null, status: "connecting" }}>
        <BackendDataContext.Provider value={opts.data ?? backendDataFor("success")}>{ui}</BackendDataContext.Provider>
      </SpotFeedContext.Provider>
    </EnvironmentContext.Provider>
  );
}
