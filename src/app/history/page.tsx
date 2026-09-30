"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useMemo, Suspense } from "react";
import { AppHeader } from "../../components/AppHeader";
import { WalletConnect } from "../../components/WalletConnect";
import { useInfiniteHistory } from "../../lib/hooks/useBackendHistory";
import { useWalletStore } from "../../lib/store/wallet";
import { useHydrated } from "../../lib/useHydrated";
import { fmtN, fmtK } from "../../lib/pricing";
import { toCsv, downloadCsv } from "../../lib/csv";
import { ExportButton } from "../../components/ExportButton";
import { MARKETS } from "../../lib/pricing";
import type { HistoryFilters, OptionType, Position } from "../../lib/api/types";
import { DataGrid } from "../../components/grid";
import type { ColumnDef } from "@tanstack/react-table";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// Convert a local YYYY-MM-DD string to a UTC ISO string at start of day
function localDateToUtc(localDate: string): string {
  if (!localDate) return "";
  const d = new Date(`${localDate}T00:00:00`);
  return d.toISOString();
}

// Convert a UTC ISO string back to a local YYYY-MM-DD for <input type="date">
function utcToLocalDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const UNDERLYINGS = ["", ...MARKETS.map(m => m.sym)];

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

interface FilterBarProps {
  filters: HistoryFilters;
  onChange: (f: HistoryFilters) => void;
}

function FilterBar({ filters, onChange }: FilterBarProps) {
  const inputStyle: React.CSSProperties = {
    background: "var(--bg-overlay)", border: "1px solid var(--border-default)",
    color: "var(--text-hi)", fontSize: 11, padding: "5px 8px",
    fontFamily: "var(--font-mono)", outline: "none", height: 28,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 10, textTransform: "uppercase" as const, letterSpacing: "0.07em",
    color: "var(--text-lo)", marginBottom: 3, display: "block",
  };

  const hasActive = !!(filters.from || filters.to || filters.underlying || filters.option_type || filters.result);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 20 }}>
      <div>
        <span style={labelStyle}>From</span>
        <input
          type="date"
          style={inputStyle}
          value={filters.from ? utcToLocalDate(filters.from) : ""}
          onChange={e => onChange({ ...filters, from: e.target.value ? localDateToUtc(e.target.value) : undefined })}
        />
      </div>
      <div>
        <span style={labelStyle}>To</span>
        <input
          type="date"
          style={inputStyle}
          value={filters.to ? utcToLocalDate(filters.to) : ""}
          onChange={e => onChange({ ...filters, to: e.target.value ? localDateToUtc(e.target.value) : undefined })}
        />
      </div>
      <div>
        <span style={labelStyle}>Asset</span>
        <select
          style={{ ...inputStyle, paddingRight: 24 }}
          value={filters.underlying ?? ""}
          onChange={e => onChange({ ...filters, underlying: e.target.value || undefined })}
        >
          {UNDERLYINGS.map(u => <option key={u} value={u}>{u || "All"}</option>)}
        </select>
      </div>
      <div>
        <span style={labelStyle}>Side</span>
        <select
          style={{ ...inputStyle, paddingRight: 24 }}
          value={filters.option_type ?? ""}
          onChange={e => onChange({ ...filters, option_type: (e.target.value as OptionType) || undefined })}
        >
          <option value="">All</option>
          <option value="call">Call</option>
          <option value="put">Put</option>
        </select>
      </div>
      <div>
        <span style={labelStyle}>Result</span>
        <select
          style={{ ...inputStyle, paddingRight: 24 }}
          value={filters.result ?? ""}
          onChange={e => onChange({ ...filters, result: (e.target.value as "win" | "loss") || undefined })}
        >
          <option value="">All</option>
          <option value="win">Win</option>
          <option value="loss">Loss</option>
        </select>
      </div>
      {hasActive && (
        <button
          style={{
            fontSize: 11, color: "var(--text-lo)", background: "none",
            border: "1px solid var(--border-subtle)", padding: "5px 10px",
            cursor: "pointer", height: 28, alignSelf: "flex-end",
          }}
          onClick={() => onChange({})}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats bar
// ---------------------------------------------------------------------------

interface StatsBarProps {
  tradeCount: number;
  totalPnl: number;
  winRate: number;
  isFiltered: boolean;
}

function StatsBar({ tradeCount, totalPnl, winRate, isFiltered }: StatsBarProps) {
  return (
    <div style={{ display: "flex", gap: 0, marginBottom: 24, border: "1px solid var(--border-default)", background: "var(--bg-raised)" }}>
      {[
        { label: isFiltered ? "Filtered Trades" : "Closed Trades", value: String(tradeCount), color: "var(--text-hi)" },
        {
          label: isFiltered ? "Filtered P&L" : "Total Realized P&L",
          value: `${totalPnl >= 0 ? "+" : "−"}$${fmtN(Math.abs(totalPnl), 2)}`,
          color: totalPnl >= 0 ? "var(--call)" : "var(--put)",
        },
        {
          label: isFiltered ? "Filtered Win Rate" : "Win Rate",
          value: `${tradeCount > 0 ? ((winRate / tradeCount) * 100).toFixed(0) : "0"}%`,
          color: "var(--atm)",
        },
      ].map((s, i) => (
        <div key={s.label} style={{ flex: 1, padding: "14px 18px", borderRight: i < 2 ? "1px solid var(--border-default)" : "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-lo)" }}>
              {s.label}
            </span>
            {isFiltered && (
              <span style={{ fontSize: 9, color: "var(--atm)", border: "1px solid var(--atm)", padding: "1px 5px", letterSpacing: "0.05em" }}>
                filtered
              </span>
            )}
          </div>
          <div className="num" style={{ fontSize: 17, fontWeight: 600, color: s.color }}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page (uses useSearchParams — wrapped in Suspense below)
// ---------------------------------------------------------------------------

function HistoryPageInner() {
  const hydrated = useHydrated();
  const token = useWalletStore(s => s.token);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read filters from URL
  const filters: HistoryFilters = {
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    underlying: searchParams.get("underlying") ?? undefined,
    option_type: (searchParams.get("option_type") as OptionType) ?? undefined,
    result: (searchParams.get("result") as "win" | "loss") ?? undefined,
  };

  const isFiltered = !!(filters.from || filters.to || filters.underlying || filters.option_type || filters.result);

  const {
    trades, stats, totalFiltered,
    loading, loadingMore, hasMore, error,
    newTradeCount, dismissNewTrades,
    loadMore,
  } = useInfiniteHistory(hydrated ? token : null, filters);

  // Write filters back to URL
  const handleFilterChange = useCallback((f: HistoryFilters) => {
    const params = new URLSearchParams();
    if (f.from) params.set("from", f.from);
    if (f.to) params.set("to", f.to);
    if (f.underlying) params.set("underlying", f.underlying);
    if (f.option_type) params.set("option_type", f.option_type);
    if (f.result) params.set("result", f.result);
    const qs = params.toString();
    router.replace(qs ? `/history?${qs}` : "/history", { scroll: false });
  }, [router]);

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting && hasMore && !loadingMore) loadMore(); },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)", overflow: "hidden", fontFamily: "var(--font-sans)" }}>
      <AppHeader>
        <div style={{ marginLeft: "auto" }}>
          <WalletConnect />
        </div>
      </AppHeader>

      <div style={{ flex: 1, overflowY: "auto", position: "relative" }} id="history-scroll-root">
        {/* New trades pill */}
        {newTradeCount > 0 && (
          <div style={{ position: "sticky", top: 8, zIndex: 10, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
            <button
              onClick={dismissNewTrades}
              style={{
                pointerEvents: "all", fontSize: 11, fontWeight: 600,
                background: "var(--brand)", color: "#000", border: "none",
                padding: "6px 14px", cursor: "pointer", borderRadius: 99,
                boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
              }}
            >
              ↑ {newTradeCount} new trade{newTradeCount > 1 ? "s" : ""} — tap to reload
            </button>
          </div>
        )}

        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 24px 64px" }}>
          {/* Header row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 26, fontWeight: 600, marginBottom: 4 }}>Trade History</h1>
              <p style={{ fontSize: 13, color: "var(--text-mid)", marginBottom: 28 }}>
                {!token
                  ? "Connect your wallet to see your trade history."
                  : loading
                    ? "Loading…"
                    : `${totalFiltered} trade${totalFiltered === 1 ? "" : "s"}${isFiltered ? " matching filters" : ""}`}
              </p>
            </div>
            {trades.length > 0 && (
              <ExportButton onClick={() => downloadCsv(
                `zenith-history-${new Date().toISOString().slice(0, 10)}.csv`,
                toCsv(trades, [
                  { header: "Opened", value: r => r.opened_at },
                  { header: "Closed", value: r => r.closed_at ?? "" },
                  { header: "Asset", value: r => r.underlying },
                  { header: "Type", value: r => r.position_type },
                  { header: "Side", value: r => r.option_type },
                  { header: "Status", value: r => r.status },
                  { header: "Strike", value: r => r.strike },
                  { header: "Expiry Days", value: r => r.expiry_days },
                  { header: "Qty", value: r => r.contracts },
                  { header: "Entry Premium", value: r => r.entry_premium },
                  { header: "Close Premium", value: r => r.close_premium ?? "" },
                  { header: "Realized P&L", value: r => r.realized_pnl ?? "" },
                ])
              )} />
            )}
          </div>

          {/* Filter bar */}
          <FilterBar filters={filters} onChange={handleFilterChange} />

          {/* Stats bar (only when there are results) */}
          {stats.trade_count > 0 && (
            <StatsBar
              tradeCount={stats.trade_count}
              totalPnl={stats.total_realized_pnl}
              winRate={stats.win_count}
              isFiltered={isFiltered}
            />
          )}

          {/* Error */}
          {error && (
            <div style={{ padding: "12px 16px", background: "var(--put-dim)", color: "var(--put)", fontSize: 12, marginBottom: 16 }}>
              {error}
            </div>
          )}

          {/* Empty state */}
          {!loading && trades.length === 0 && !error && (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              padding: "80px 0", border: "1px solid var(--border-subtle)", background: "var(--bg-raised)", gap: 12,
            }}>
              <div style={{ fontSize: 14, color: "var(--text-mid)" }}>
                {isFiltered ? "No trades match these filters." : "No trades yet."}
              </div>
              {isFiltered ? (
                <button
                  style={{ fontSize: 13, color: "var(--brand)", background: "none", border: "none", cursor: "pointer" }}
                  onClick={() => handleFilterChange({})}
                >
                  Clear filters
                </button>
              ) : (
                <Link href="/options" style={{ fontSize: 13, color: "var(--brand)", textDecoration: "none" }}>
                  Open the options chain →
                </Link>
              )}
            </div>
          )}

          {/* Table */}
          {trades.length > 0 && (
            <DataGrid<Position>
              data={trades}
              columns={columns}
              tableId="zenith-history-table"
              getRowId={(r) => r.id}
              exportFilename={`zenith-history-${new Date().toISOString().slice(0, 10)}.csv`}
              ariaLabel="Trade History Grid"
              maxHeight="70vh"
            />
          )}

          {/* Infinite scroll sentinel + loading indicator */}
          <div ref={sentinelRef} style={{ height: 1 }} />
          {loadingMore && (
            <div style={{ textAlign: "center", padding: "16px 0", fontSize: 11, color: "var(--text-lo)" }}>
              Loading more…
            </div>
          )}
          {!hasMore && trades.length > 0 && !loadingMore && (
            <div style={{ textAlign: "center", padding: "16px 0", fontSize: 10, color: "var(--text-lo)", letterSpacing: "0.05em" }}>
              — end of history —
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Wrap in Suspense because useSearchParams() requires it in Next.js 14
export default function HistoryPage() {
  return (
    <Suspense>
      <HistoryPageInner />
    </Suspense>
  );
}
