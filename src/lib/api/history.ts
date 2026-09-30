import { apiGet } from "./client";
import type { HistoryResponse, HistoryPage, HistoryFilters, HistoryStats, Position } from "./types";

// ---------------------------------------------------------------------------
// Feature detection
//
// The backend currently returns the full ledger in one shot. Until it ships
// cursor pagination, we fetch once and slice client-side. To switch to the
// real paginated endpoint, set NEXT_PUBLIC_HISTORY_PAGINATION=1 in .env.
//
// Backend contract (when implemented):
//   GET /api/v1/history?cursor=<opaque>&limit=<n>&from=<ISO>&to=<ISO>
//                       &underlying=<sym>&option_type=call|put&result=win|loss
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

export const PAGINATION_ENABLED =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_HISTORY_PAGINATION === "1";

// ---------------------------------------------------------------------------
// Legacy: full fetch (used when pagination is not enabled)
// ---------------------------------------------------------------------------

export function getHistory(token: string): Promise<HistoryResponse> {
  return apiGet("/api/v1/history", token);
}

// ---------------------------------------------------------------------------
// Client-side adapter: cursor is the index into the sorted+filtered array.
// When the real paginated endpoint ships, replace this function body only.
// ---------------------------------------------------------------------------

function buildQueryString(
  cursor: string | null,
  limit: number,
  filters: HistoryFilters,
): string {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (cursor) params.set("cursor", cursor);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.underlying) params.set("underlying", filters.underlying);
  if (filters.option_type) params.set("option_type", filters.option_type);
  if (filters.result) params.set("result", filters.result);
  return params.toString();
}

// Client adapter: fetches the full ledger once per filter change, then
// slices it. cursor = stringified offset index.
let _cache: { token: string; data: HistoryResponse } | null = null;

async function fetchWithClientAdapter(
  token: string,
  cursor: string | null,
  filters: HistoryFilters,
): Promise<HistoryPage> {
  // Fetch full ledger if we don't have it cached for this token
  if (!_cache || _cache.token !== token) {
    const raw = await getHistory(token);
    _cache = { token, data: raw };
  }

  const { trades: allTrades } = _cache.data;

  // Apply filters client-side
  const filtered = applyFilters(allTrades, filters);

  // Compute stats over the filtered set
  const stats = computeStats(filtered);

  // Paginate by offset cursor
  const offset = cursor ? parseInt(cursor, 10) : 0;
  const page = filtered.slice(offset, offset + PAGE_SIZE);
  const nextOffset = offset + page.length;
  const hasMore = nextOffset < filtered.length;

  return {
    trades: page,
    stats,
    next_cursor: hasMore ? String(nextOffset) : null,
    total_filtered: filtered.length,
  };
}

// Real paginated endpoint (used when PAGINATION_ENABLED=1)
async function fetchFromServer(
  token: string,
  cursor: string | null,
  filters: HistoryFilters,
): Promise<HistoryPage> {
  const qs = buildQueryString(cursor, PAGE_SIZE, filters);
  return apiGet<HistoryPage>(`/api/v1/history?${qs}`, token);
}

export function getHistoryPage(
  token: string,
  cursor: string | null,
  filters: HistoryFilters,
): Promise<HistoryPage> {
  if (PAGINATION_ENABLED) {
    return fetchFromServer(token, cursor, filters);
  }
  return fetchWithClientAdapter(token, cursor, filters);
}

// Invalidate the client-side cache (e.g. after a new trade closes)
export function invalidateHistoryCache() {
  _cache = null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function applyFilters(trades: Position[], filters: HistoryFilters): Position[] {
  return trades.filter(t => {
    const closedAt = t.closed_at ? new Date(t.closed_at).getTime() : null;

    if (filters.from) {
      const fromMs = new Date(filters.from).getTime();
      if (!closedAt || closedAt < fromMs) return false;
    }
    if (filters.to) {
      // "to" is end of day — add 24h
      const toMs = new Date(filters.to).getTime() + 86_400_000;
      if (!closedAt || closedAt > toMs) return false;
    }
    if (filters.underlying && t.underlying !== filters.underlying) return false;
    if (filters.option_type && t.option_type !== filters.option_type) return false;
    if (filters.result === "win" && (t.realized_pnl ?? 0) <= 0) return false;
    if (filters.result === "loss" && (t.realized_pnl ?? 0) >= 0) return false;
    return true;
  });
}

export function computeStats(trades: Position[]): HistoryStats {
  let win_count = 0;
  let loss_count = 0;
  let total_realized_pnl = 0;
  for (const t of trades) {
    const pnl = t.realized_pnl ?? 0;
    total_realized_pnl += pnl;
    if (pnl > 0) win_count++;
    else if (pnl < 0) loss_count++;
  }
  return { trade_count: trades.length, win_count, loss_count, total_realized_pnl };
}

