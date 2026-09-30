"use client";

import { useEffect, useMemo, useState } from "react";
import type { Position } from "../lib/api/types";
import { getFullHistory } from "../lib/api/history";
import { downloadBlob, downloadCsv, toCsvChunks } from "../lib/csv";
import {
  STATEMENT_COLUMNS,
  STATEMENT_DISCLAIMER,
  buildLedger,
  customPeriod,
  monthPeriod,
  periodRangeLabel,
  quarterPeriod,
  renderStatementPdf,
  statementFilename,
  summarize,
  yearPeriod,
  type PeriodKind,
  type StatementPeriod,
} from "../lib/statements";
import { ExportButton } from "./ExportButton";

interface Props {
  token: string;
  walletAddress: string | null;
  /** Still-open positions — lets a roll be linked to a replacement that hasn't closed yet. */
  openPositions: Position[];
  /** Injectable for tests; defaults to the current time. */
  now?: Date;
}

const money = (v: number) =>
  `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function StatementsPanel({ token, walletAddress, openPositions, now }: Props) {
  const today = useMemo(() => now ?? new Date(), [now]);
  const thisYear = today.getUTCFullYear();

  const [ledger, setLedger] = useState<Position[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kind, setKind] = useState<PeriodKind>("quarter");
  const [month, setMonth] = useState(`${thisYear}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`);
  const [year, setYear] = useState(thisYear);
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>((Math.floor(today.getUTCMonth() / 3) + 1) as 1 | 2 | 3 | 4);
  const [from, setFrom] = useState(`${thisYear}-01-01`);
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [underlying, setUnderlying] = useState<string>("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // The table above only shows the first page of history; a statement
  // needs every realized lot, so this pages through the whole ledger.
  useEffect(() => {
    let cancelled = false;
    setLedger(null);
    setLoadError(null);
    getFullHistory(token)
      .then(rows => { if (!cancelled) setLedger(rows); })
      .catch(() => { if (!cancelled) setLoadError("Couldn't load the full trade ledger. Try again."); });
    return () => { cancelled = true; };
  }, [token]);

  const period: StatementPeriod | null = useMemo(() => {
    if (kind === "month") {
      const [y, m] = month.split("-").map(Number);
      return y && m ? monthPeriod(y, m - 1) : null;
    }
    if (kind === "quarter") return quarterPeriod(year, quarter);
    if (kind === "year") return yearPeriod(year);
    return customPeriod(from, to);
  }, [kind, month, year, quarter, from, to]);

  const underlyings = useMemo(
    () => Array.from(new Set((ledger ?? []).map(p => p.underlying))).sort(),
    [ledger]
  );
  const filter = useMemo(() => (period ? { period, underlying: underlying || null } : null), [period, underlying]);
  const rows = useMemo(
    () => (ledger && filter ? buildLedger(ledger, filter, openPositions) : []),
    [ledger, filter, openPositions]
  );
  const summary = useMemo(() => summarize(rows), [rows]);

  const years = useMemo(() => {
    const first = (ledger ?? []).reduce((m, p) => Math.min(m, new Date(p.closed_at ?? p.opened_at).getUTCFullYear() || m), thisYear);
    return Array.from({ length: thisYear - first + 1 }, (_, i) => thisYear - i);
  }, [ledger, thisYear]);

  const exportCsv = () => {
    if (!filter) return;
    downloadCsv(statementFilename(filter, "csv"), toCsvChunks(rows, STATEMENT_COLUMNS));
  };

  const exportPdf = async () => {
    if (!filter || pdfBusy) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      // renderStatementPdf imports pdf-lib dynamically, so the library
      // only downloads the first time someone actually exports a PDF.
      const bytes = await renderStatementPdf({ rows, summary, filter, walletAddress, generatedAt: new Date() });
      downloadBlob(statementFilename(filter, "pdf"), new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
    } catch {
      setPdfError("Failed to generate the PDF.");
    } finally {
      setPdfBusy(false);
    }
  };

  const seg = (active: boolean): React.CSSProperties => ({
    padding: "3px 10px", border: "none", cursor: "pointer", fontSize: 11, textTransform: "capitalize",
    background: active ? "var(--atm-dim)" : "transparent", color: active ? "var(--atm)" : "var(--text-lo)",
  });
  const field: React.CSSProperties = {
    background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--text-hi)",
    fontSize: 11, padding: "3px 6px", colorScheme: "dark",
  };

  return (
    <section aria-labelledby="statements-heading" style={{ marginBottom: 24, border: "1px solid var(--border-default)", background: "var(--bg-raised)" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-default)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 id="statements-heading" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-hi)", marginRight: 8 }}>Statements</h2>
        <div role="group" aria-label="Statement period" style={{ display: "flex", gap: 2 }}>
          {(["month", "quarter", "year", "custom"] as const).map(k => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} style={seg(kind === k)}>{k}</button>
          ))}
        </div>
        {kind === "month" && (
          <input type="month" aria-label="Month" value={month} onChange={e => setMonth(e.target.value)} style={field} />
        )}
        {(kind === "quarter" || kind === "year") && (
          <select aria-label="Year" value={year} onChange={e => setYear(Number(e.target.value))} style={field}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
        {kind === "quarter" && (
          <select aria-label="Quarter" value={quarter} onChange={e => setQuarter(Number(e.target.value) as 1 | 2 | 3 | 4)} style={field}>
            {[1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}</option>)}
          </select>
        )}
        {kind === "custom" && (
          <>
            <input type="date" aria-label="From" value={from} onChange={e => setFrom(e.target.value)} style={field} />
            <span style={{ fontSize: 11, color: "var(--text-lo)" }}>to</span>
            <input type="date" aria-label="To" value={to} onChange={e => setTo(e.target.value)} style={field} />
          </>
        )}
        <select aria-label="Underlying" value={underlying} onChange={e => setUnderlying(e.target.value)} style={field}>
          <option value="">All underlyings</option>
          {underlyings.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <ExportButton label="Download CSV" onClick={exportCsv} disabled={!ledger || !filter} />
          <ExportButton label="Download PDF" onClick={exportPdf} disabled={!ledger || !filter} busy={pdfBusy} />
        </div>
      </div>

      <div style={{ padding: "12px 16px" }}>
        {loadError ? (
          <div role="alert" style={{ fontSize: 11, color: "var(--put)" }}>{loadError}</div>
        ) : !ledger ? (
          <div style={{ fontSize: 11, color: "var(--text-lo)" }}>Loading full ledger…</div>
        ) : !period ? (
          <div role="alert" style={{ fontSize: 11, color: "var(--put)" }}>Pick a valid date range (the start must be on or before the end).</div>
        ) : (
          <>
            <div style={{ fontSize: 11, color: "var(--text-mid)", marginBottom: 10 }}>
              {period.label} · {periodRangeLabel(period)} (UTC) · realized lots by close date
            </div>
            <div data-testid="statement-summary" style={{ display: "flex", gap: 0, border: "1px solid var(--border-subtle)" }}>
              {[
                { k: "Lots", v: `${summary.trades}${summary.rolls ? ` (${summary.rolls} rolled)` : ""}`, c: "var(--text-hi)" },
                { k: "Proceeds", v: money(summary.proceeds), c: "var(--text-hi)" },
                { k: "Cost Basis", v: money(summary.costBasis), c: "var(--text-hi)" },
                { k: "Realized P&L", v: money(summary.realizedPnl), c: summary.realizedPnl >= 0 ? "var(--call)" : "var(--put)" },
                { k: "Short-term", v: money(summary.shortTermPnl), c: "var(--text-mid)" },
                { k: "Long-term", v: money(summary.longTermPnl), c: "var(--text-mid)" },
              ].map((s, i) => (
                <div key={s.k} style={{ flex: 1, padding: "8px 12px", borderLeft: i ? "1px solid var(--border-subtle)" : "none" }}>
                  <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-lo)", marginBottom: 3 }}>{s.k}</div>
                  <div className="num" style={{ fontSize: 12, fontWeight: 600, color: s.c }}>{s.v}</div>
                </div>
              ))}
            </div>
          </>
        )}
        {pdfError && <div role="alert" style={{ marginTop: 8, fontSize: 11, color: "var(--put)" }}>{pdfError}</div>}
        <p style={{ marginTop: 10, fontSize: 10, lineHeight: 1.5, color: "var(--text-lo)" }}>{STATEMENT_DISCLAIMER}</p>
      </div>
    </section>
  );
}
