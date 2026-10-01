// Period statements over the realized trade ledger: filtering, per-lot
// ledger rows with cost basis / proceeds / holding period, period
// summaries, and CSV + PDF output.
//
// All dates are UTC. Period boundaries are UTC midnights and every
// timestamp is written as ISO-8601 with a Z suffix, so a statement comes
// out identical no matter which time zone it's generated in.
//
// A "lot" is one position row: opened once, closed (or rolled) once.
// The ledger only contains realized lots — closed or rolled — and a lot
// belongs to the period its *close* falls in.
//
// Rolls: the backend implements a roll as two ledger events — the old
// lot is closed with status "rolled" (a realized event with its own P&L)
// and a brand-new lot is opened at the same instant. The replacement is
// never merged into the original: its holding period starts at the roll,
// not at the original open. `linkedId` cross-references the two lots.
import type { Position } from "./api/types";
import type { CsvColumn } from "./csv";

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

export type PeriodKind = "month" | "quarter" | "year" | "custom";

export interface StatementPeriod {
  kind: PeriodKind;
  /** Inclusive, UTC. */
  start: Date;
  /** Exclusive, UTC. */
  end: Date;
  label: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const utc = (y: number, m: number, d = 1) => new Date(Date.UTC(y, m, d));

export function monthPeriod(year: number, month0: number): StatementPeriod {
  return { kind: "month", start: utc(year, month0), end: utc(year, month0 + 1), label: `${MONTHS[month0]} ${year}` };
}

export function quarterPeriod(year: number, quarter: 1 | 2 | 3 | 4): StatementPeriod {
  const m = (quarter - 1) * 3;
  return { kind: "quarter", start: utc(year, m), end: utc(year, m + 3), label: `Q${quarter} ${year}` };
}

export function yearPeriod(year: number): StatementPeriod {
  return { kind: "year", start: utc(year, 0), end: utc(year + 1, 0), label: `${year}` };
}

/** `from`/`to` are YYYY-MM-DD, both inclusive. Returns null if either is invalid or reversed. */
export function customPeriod(from: string, to: string): StatementPeriod | null {
  const re = /^(\d{4})-(\d{2})-(\d{2})$/;
  const a = re.exec(from);
  const b = re.exec(to);
  if (!a || !b) return null;
  const start = utc(+a[1], +a[2] - 1, +a[3]);
  const end = utc(+b[1], +b[2] - 1, +b[3] + 1);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  return { kind: "custom", start, end, label: `${from} to ${to}` };
}

/** "2026-01-01 to 2026-03-31" — the inclusive date range a period covers. */
export function periodRangeLabel(p: StatementPeriod): string {
  return `${isoDate(p.start)} to ${isoDate(lastDay(p))}`;
}

/** The last calendar day a period includes (its end is exclusive). */
export function lastDay(p: StatementPeriod): Date {
  return new Date(p.end.getTime() - 86_400_000);
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Second-precision UTC timestamp, e.g. 2026-03-04T05:06:07Z. */
export function isoUtc(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ---------------------------------------------------------------------------
// Ledger rows
// ---------------------------------------------------------------------------

export type LedgerEvent = "close" | "roll";
export type HoldingTerm = "short-term" | "long-term";

export interface LedgerRow {
  id: string;
  event: LedgerEvent;
  openedAt: string;
  closedAt: string;
  underlying: string;
  positionType: Position["position_type"];
  optionType: Position["option_type"];
  strike: number;
  contracts: number;
  premiumPaid: number;
  premiumReceived: number;
  fees: number;
  costBasis: number;
  proceeds: number;
  realizedPnl: number;
  holdingDays: number;
  term: HoldingTerm;
  /** The other lot of a roll: the replacement for a "roll" row, the original for a rolled-in lot. */
  linkedId: string;
}

const DAY_MS = 86_400_000;
/** A roll's close and re-open happen in one DB transaction; allow for clock skew between the two statements. */
const ROLL_LINK_WINDOW_MS = 5_000;

/** Whole days held, by elapsed time. */
export function holdingDays(openedIso: string, closedIso: string): number {
  return Math.max(0, Math.floor((Date.parse(closedIso) - Date.parse(openedIso)) / DAY_MS));
}

/**
 * Long-term if closed more than one calendar year after opening (so a
 * lot opened 2024-02-29 is long-term from 2025-03-01). This is a common
 * convention, not a jurisdiction-specific rule.
 */
export function holdingTerm(openedIso: string, closedIso: string): HoldingTerm {
  const o = new Date(openedIso);
  const anniversary = Date.UTC(o.getUTCFullYear() + 1, o.getUTCMonth(), o.getUTCDate(),
    o.getUTCHours(), o.getUTCMinutes(), o.getUTCSeconds(), o.getUTCMilliseconds());
  return Date.parse(closedIso) > anniversary ? "long-term" : "short-term";
}

/**
 * Pairs each rolled lot with the lot the roll opened: same underlying,
 * option/position type, contracts and strategy, opened within a few
 * seconds of the roll. `candidates` should include still-open positions,
 * since a replacement that hasn't closed yet isn't in the ledger.
 */
export function linkRolls(ledger: Position[], candidates: Position[]): Map<string, string> {
  const links = new Map<string, string>();
  const pool = new Map<string, Position>();
  for (const p of [...ledger, ...candidates]) pool.set(p.id, p);
  const taken = new Set<string>();
  const rolled = ledger
    .filter(p => p.status === "rolled" && p.closed_at)
    .sort((a, b) => Date.parse(a.closed_at!) - Date.parse(b.closed_at!) || a.id.localeCompare(b.id));
  for (const r of rolled) {
    const rolledAt = Date.parse(r.closed_at!);
    let best: Position | null = null;
    let bestGap = Infinity;
    for (const c of Array.from(pool.values())) {
      if (c.id === r.id || taken.has(c.id)) continue;
      if (c.underlying !== r.underlying || c.option_type !== r.option_type || c.position_type !== r.position_type) continue;
      if (c.contracts !== r.contracts || (c.strategy_id ?? null) !== (r.strategy_id ?? null)) continue;
      const gap = Date.parse(c.opened_at) - rolledAt;
      if (gap < -ROLL_LINK_WINDOW_MS || gap > ROLL_LINK_WINDOW_MS) continue;
      if (Math.abs(gap) < bestGap || (Math.abs(gap) === bestGap && best && c.id < best.id)) {
        best = c;
        bestGap = Math.abs(gap);
      }
    }
    if (best) {
      taken.add(best.id);
      links.set(r.id, best.id);
      links.set(best.id, r.id);
    }
  }
  return links;
}

/**
 * Premium paid/received from the lot's own perspective:
 * - long:  paid at open (entry premium), received at close (close premium)
 * - short: received at open (entry premium), paid to buy back at close
 * Cost basis = paid + fees, proceeds = received, realized = proceeds − cost basis.
 * The backend charges no fees today, so fees are always 0.
 */
export function toLedgerRow(p: Position, linkedId = ""): LedgerRow | null {
  if ((p.status !== "closed" && p.status !== "rolled") || !p.closed_at || p.close_premium === null) return null;
  const entry = p.entry_premium * p.contracts;
  const exit = p.close_premium * p.contracts;
  const premiumPaid = p.position_type === "long" ? entry : exit;
  const premiumReceived = p.position_type === "long" ? exit : entry;
  const fees = 0;
  const costBasis = premiumPaid + fees;
  const proceeds = premiumReceived;
  return {
    id: p.id,
    event: p.status === "rolled" ? "roll" : "close",
    openedAt: isoUtc(p.opened_at),
    closedAt: isoUtc(p.closed_at),
    underlying: p.underlying,
    positionType: p.position_type,
    optionType: p.option_type,
    strike: p.strike,
    contracts: p.contracts,
    premiumPaid, premiumReceived, fees, costBasis, proceeds,
    realizedPnl: proceeds - costBasis,
    holdingDays: holdingDays(p.opened_at, p.closed_at),
    term: holdingTerm(p.opened_at, p.closed_at),
    linkedId,
  };
}

export interface StatementFilter {
  period: StatementPeriod;
  /** null = every underlying. */
  underlying: string | null;
}

/**
 * Ledger rows realized inside the period (by close time), optionally for
 * one underlying, sorted by close time then id so output is deterministic.
 */
export function buildLedger(history: Position[], filter: StatementFilter, openPositions: Position[] = []): LedgerRow[] {
  const links = linkRolls(history, openPositions);
  const start = filter.period.start.getTime();
  const end = filter.period.end.getTime();
  const rows: LedgerRow[] = [];
  for (const p of history) {
    if (filter.underlying && p.underlying !== filter.underlying) continue;
    const closed = p.closed_at ? Date.parse(p.closed_at) : NaN;
    if (!(closed >= start && closed < end)) continue;
    const row = toLedgerRow(p, links.get(p.id) ?? "");
    if (row) rows.push(row);
  }
  return rows.sort((a, b) => a.closedAt.localeCompare(b.closedAt) || a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export interface UnderlyingSummary {
  underlying: string;
  trades: number;
  costBasis: number;
  proceeds: number;
  realizedPnl: number;
}

export interface StatementSummary {
  trades: number;
  rolls: number;
  wins: number;
  losses: number;
  premiumPaid: number;
  premiumReceived: number;
  fees: number;
  costBasis: number;
  proceeds: number;
  realizedPnl: number;
  shortTermPnl: number;
  longTermPnl: number;
  byUnderlying: UnderlyingSummary[];
}

export function summarize(rows: LedgerRow[]): StatementSummary {
  const s: StatementSummary = {
    trades: 0, rolls: 0, wins: 0, losses: 0, premiumPaid: 0, premiumReceived: 0, fees: 0,
    costBasis: 0, proceeds: 0, realizedPnl: 0, shortTermPnl: 0, longTermPnl: 0, byUnderlying: [],
  };
  const by = new Map<string, UnderlyingSummary>();
  for (const r of rows) {
    s.trades += 1;
    if (r.event === "roll") s.rolls += 1;
    if (r.realizedPnl > 0) s.wins += 1;
    if (r.realizedPnl < 0) s.losses += 1;
    s.premiumPaid += r.premiumPaid;
    s.premiumReceived += r.premiumReceived;
    s.fees += r.fees;
    s.costBasis += r.costBasis;
    s.proceeds += r.proceeds;
    s.realizedPnl += r.realizedPnl;
    if (r.term === "long-term") s.longTermPnl += r.realizedPnl;
    else s.shortTermPnl += r.realizedPnl;
    const u = by.get(r.underlying) ?? { underlying: r.underlying, trades: 0, costBasis: 0, proceeds: 0, realizedPnl: 0 };
    u.trades += 1;
    u.costBasis += r.costBasis;
    u.proceeds += r.proceeds;
    u.realizedPnl += r.realizedPnl;
    by.set(r.underlying, u);
  }
  s.byUnderlying = Array.from(by.values()).sort((a, b) => a.underlying.localeCompare(b.underlying));
  return s;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * Fixed 8-decimal money formatting with trailing zeros trimmed (minimum
 * two decimals) — enough precision for sub-cent XLM premiums without
 * float noise like 0.30000000000000004 leaking into the file.
 */
export function fmtAmount(v: number): string {
  const fixed = (Math.abs(v) < 5e-9 ? 0 : v).toFixed(8);
  return fixed.replace(/(\.\d\d\d*?)0+$/, "$1");
}

/**
 * Statement CSV columns, in order. Documented in the README
 * ("Statements") — keep the two in sync.
 */
export const STATEMENT_COLUMNS: CsvColumn<LedgerRow>[] = [
  { header: "Position ID", value: r => r.id },
  { header: "Event", value: r => r.event },
  { header: "Opened (UTC)", value: r => r.openedAt },
  { header: "Closed (UTC)", value: r => r.closedAt },
  { header: "Underlying", value: r => r.underlying },
  { header: "Type", value: r => r.positionType },
  { header: "Side", value: r => r.optionType },
  { header: "Strike", value: r => fmtAmount(r.strike) },
  { header: "Contracts", value: r => fmtAmount(r.contracts) },
  { header: "Premium Paid", value: r => fmtAmount(r.premiumPaid) },
  { header: "Premium Received", value: r => fmtAmount(r.premiumReceived) },
  { header: "Fees", value: r => fmtAmount(r.fees) },
  { header: "Cost Basis", value: r => fmtAmount(r.costBasis) },
  { header: "Proceeds", value: r => fmtAmount(r.proceeds) },
  { header: "Realized P&L", value: r => fmtAmount(r.realizedPnl) },
  { header: "Holding Days", value: r => r.holdingDays },
  { header: "Term", value: r => r.term },
  { header: "Linked Position", value: r => r.linkedId },
];

export const STATEMENT_DISCLAIMER =
  "For information only; not tax advice. This statement lists realized gains and losses on positions as recorded by the Zenith backend. " +
  "The short-/long-term flag uses a simple one-year holding-period threshold; jurisdiction-specific rules (e.g. wash sales, " +
  "Section 1256 contracts, straddle rules) are not applied. Consult a qualified tax professional.";

export function statementFilename(filter: StatementFilter, ext: "csv" | "pdf"): string {
  const scope = filter.underlying ? `-${filter.underlying.replace(/[^A-Za-z0-9]/g, "")}` : "";
  return `zenith-statement-${isoDate(filter.period.start)}_${isoDate(lastDay(filter.period))}${scope}.${ext}`;
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

export interface StatementDocument {
  rows: LedgerRow[];
  summary: StatementSummary;
  filter: StatementFilter;
  walletAddress: string | null;
  /** Printed on the statement and used as the PDF's metadata dates — pass a fixed value for reproducible bytes. */
  generatedAt: Date;
}

/** Thousands-grouped, 2 decimals at or above 1, up to 6 decimals below — locale-independent. */
export function fmtPdfAmount(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 && abs >= 5e-7 ? "-" : "";
  if (abs >= 1) {
    const [int, dec] = abs.toFixed(2).split(".");
    return `${sign}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${dec}`;
  }
  const s = abs.toFixed(6).replace(/0+$/, "").replace(/\.$/, ".00");
  return sign + (/\.\d$/.test(s) ? s + "0" : s);
}

// The standard PDF fonts only cover WinAnsi — anything else would throw
// at draw time, so strip it to "?" up front.
const winAnsi = (s: string) => s.replace(/[^\x20-\x7E]/g, "?");

/**
 * Renders the statement as a PDF: a summary page followed by the detail
 * ledger. pdf-lib is imported lazily so it's only downloaded when a user
 * actually exports. Output is byte-for-byte deterministic for the same
 * input (fixed metadata dates, no random IDs).
 */
export async function renderStatementPdf(doc: StatementDocument): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create({ updateMetadata: false });
  pdf.setTitle(`Zenith trade statement - ${winAnsi(doc.filter.period.label)}`);
  pdf.setAuthor("Zenith");
  pdf.setCreator("Zenith");
  pdf.setProducer("Zenith statements (pdf-lib)");
  pdf.setCreationDate(doc.generatedAt);
  pdf.setModificationDate(doc.generatedAt);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.42, 0.42, 0.42);
  const rule = rgb(0.8, 0.8, 0.8);
  const green = rgb(0.18, 0.45, 0.25);
  const red = rgb(0.6, 0.2, 0.14);

  const W = 792; // US Letter, landscape
  const H = 612;
  const M = 36;

  type Font = typeof regular;
  const text = (page: ReturnType<typeof pdf.addPage>, s: string, x: number, y: number, size: number, font: Font = regular, color = ink) =>
    page.drawText(winAnsi(s), { x, y, size, font, color });
  const textRight = (page: ReturnType<typeof pdf.addPage>, s: string, xRight: number, y: number, size: number, font: Font = regular, color = ink) => {
    const t = winAnsi(s);
    page.drawText(t, { x: xRight - font.widthOfTextAtSize(t, size), y, size, font, color });
  };
  const wrap = (s: string, size: number, maxWidth: number): string[] => {
    const lines: string[] = [];
    let line = "";
    for (const word of winAnsi(s).split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (regular.widthOfTextAtSize(next, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };
  const pnlColor = (v: number) => (v > 0 ? green : v < 0 ? red : ink);

  const { summary, filter } = doc;
  const generated = doc.generatedAt.toISOString().replace(/\.\d{3}Z$/, "Z");

  // ---- Summary page ----
  const first = pdf.addPage([W, H]);
  let y = H - M - 10;
  text(first, "Zenith Trade Statement", M, y, 20, bold);
  y -= 24;
  text(first, `${filter.period.label}  (${periodRangeLabel(filter.period)}, UTC)`, M, y, 11, regular, muted);
  y -= 26;
  const meta: [string, string][] = [
    ["Account", doc.walletAddress ?? "-"],
    ["Underlying", filter.underlying ?? "All"],
    ["Basis", "Realized lots, by close date"],
    ["Generated", generated],
  ];
  for (const [k, v] of meta) {
    text(first, k, M, y, 9, bold, muted);
    text(first, v, M + 90, y, 9);
    y -= 14;
  }

  y -= 14;
  text(first, "Period summary", M, y, 12, bold);
  y -= 8;
  first.drawLine({ start: { x: M, y }, end: { x: M + 330, y }, thickness: 0.5, color: rule });
  y -= 16;
  const totals: [string, string, number | null][] = [
    ["Realized lots", `${summary.trades}  (${summary.rolls} rolled)`, null],
    ["Winning / losing lots", `${summary.wins} / ${summary.losses}`, null],
    ["Proceeds", fmtPdfAmount(summary.proceeds), null],
    ["Cost basis", fmtPdfAmount(summary.costBasis), null],
    ["Fees", fmtPdfAmount(summary.fees), null],
    ["Net realized P&L", fmtPdfAmount(summary.realizedPnl), summary.realizedPnl],
    ["  Short-term", fmtPdfAmount(summary.shortTermPnl), summary.shortTermPnl],
    ["  Long-term", fmtPdfAmount(summary.longTermPnl), summary.longTermPnl],
  ];
  for (const [k, v, sign] of totals) {
    text(first, k, M, y, 10, k === "Net realized P&L" ? bold : regular);
    textRight(first, v, M + 330, y, 10, k === "Net realized P&L" ? bold : regular, sign === null ? ink : pnlColor(sign));
    y -= 15;
  }

  // Per-underlying breakdown, right-hand column.
  const bx = M + 390;
  let by = H - M - 10 - 24 - 26 - 14 * meta.length - 14;
  text(first, "By underlying", bx, by, 12, bold);
  by -= 8;
  first.drawLine({ start: { x: bx, y: by }, end: { x: W - M, y: by }, thickness: 0.5, color: rule });
  by -= 14;
  // Right edges of the numeric columns (the first column is left-aligned at bx).
  const uRight = [0, bx + 100, bx + 175, bx + 255, W - M];
  ["Underlying", "Lots", "Proceeds", "Cost basis", "Realized P&L"].forEach((h, i) =>
    i === 0 ? text(first, h, bx, by, 8, bold, muted) : textRight(first, h, uRight[i], by, 8, bold, muted));
  by -= 14;
  if (summary.byUnderlying.length === 0) {
    text(first, "No realized lots in this period.", bx, by, 9, regular, muted);
  }
  for (const u of summary.byUnderlying) {
    text(first, u.underlying, bx, by, 9);
    textRight(first, String(u.trades), uRight[1], by, 9);
    textRight(first, fmtPdfAmount(u.proceeds), uRight[2], by, 9);
    textRight(first, fmtPdfAmount(u.costBasis), uRight[3], by, 9);
    textRight(first, fmtPdfAmount(u.realizedPnl), uRight[4], by, 9, regular, pnlColor(u.realizedPnl));
    by -= 13;
  }

  // Disclaimer at the foot of the summary page.
  let dy = M + 70;
  text(first, "Disclaimer", M, dy, 9, bold, muted);
  dy -= 12;
  for (const line of wrap(STATEMENT_DISCLAIMER, 8, W - 2 * M)) {
    text(first, line, M, dy, 8, regular, muted);
    dy -= 10;
  }

  // ---- Detail pages ----
  const cols: { h: string; w: number; right?: boolean; get: (r: LedgerRow) => string }[] = [
    { h: "Closed (UTC)", w: 62, get: r => r.closedAt.slice(0, 10) },
    { h: "Opened (UTC)", w: 62, get: r => r.openedAt.slice(0, 10) },
    { h: "Asset", w: 38, get: r => r.underlying },
    { h: "Type", w: 34, get: r => r.positionType },
    { h: "Side", w: 28, get: r => r.optionType },
    { h: "Event", w: 34, get: r => r.event },
    { h: "Strike", w: 62, right: true, get: r => fmtPdfAmount(r.strike) },
    { h: "Qty", w: 42, right: true, get: r => fmtPdfAmount(r.contracts) },
    { h: "Paid", w: 70, right: true, get: r => fmtPdfAmount(r.premiumPaid) },
    { h: "Received", w: 70, right: true, get: r => fmtPdfAmount(r.premiumReceived) },
    { h: "Realized P&L", w: 74, right: true, get: r => fmtPdfAmount(r.realizedPnl) },
    { h: "Days", w: 34, right: true, get: r => String(r.holdingDays) },
    { h: "Term", w: 52, get: r => r.term },
    { h: "Position", w: 58, get: r => r.id.slice(0, 8) },
  ];
  const ROW_H = 14;
  const rowsPerPage = Math.floor((H - 2 * M - 60) / ROW_H);
  const detailPages = Math.max(1, Math.ceil(doc.rows.length / rowsPerPage));
  const totalPages = 1 + detailPages;

  for (let pageIdx = 0; pageIdx < detailPages; pageIdx++) {
    const page = pdf.addPage([W, H]);
    let py = H - M - 10;
    text(page, `Ledger detail - ${filter.period.label}${filter.underlying ? ` - ${filter.underlying}` : ""}`, M, py, 12, bold);
    py -= 22;
    let x = M;
    for (const c of cols) {
      if (c.right) textRight(page, c.h, x + c.w - 4, py, 7.5, bold, muted);
      else text(page, c.h, x, py, 7.5, bold, muted);
      x += c.w;
    }
    py -= 5;
    page.drawLine({ start: { x: M, y: py }, end: { x: W - M, y: py }, thickness: 0.5, color: rule });
    py -= 11;
    const slice = doc.rows.slice(pageIdx * rowsPerPage, (pageIdx + 1) * rowsPerPage);
    if (slice.length === 0) text(page, "No realized lots in this period.", M, py, 9, regular, muted);
    for (const r of slice) {
      x = M;
      for (const c of cols) {
        const v = c.get(r);
        const color = c.h === "Realized P&L" ? pnlColor(r.realizedPnl) : ink;
        if (c.right) textRight(page, v, x + c.w - 4, py, 8, regular, color);
        else text(page, v, x, py, 8, regular, color);
        x += c.w;
      }
      py -= ROW_H;
    }
  }

  // Footers once the page count is known.
  pdf.getPages().forEach((page, i) => {
    text(page, `Zenith trade statement - ${filter.period.label} - not tax advice`, M, M - 14, 7, regular, muted);
    textRight(page, `Page ${i + 1} of ${totalPages}`, W - M, M - 14, 7, regular, muted);
  });

  return pdf.save({ useObjectStreams: false });
}
