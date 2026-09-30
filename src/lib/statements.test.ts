import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Position } from "./api/types";
import { csvCell, toCsv, toCsvChunks } from "./csv";
import {
  STATEMENT_COLUMNS,
  buildLedger,
  customPeriod,
  fmtAmount,
  fmtPdfAmount,
  holdingDays,
  holdingTerm,
  linkRolls,
  monthPeriod,
  quarterPeriod,
  renderStatementPdf,
  statementFilename,
  summarize,
  yearPeriod,
} from "./statements";

const fixture = JSON.parse(readFileSync(join(__dirname, "__fixtures__/ledger.json"), "utf8")) as {
  history: Position[];
  open: Position[];
};
const q1 = { period: quarterPeriod(2026, 1), underlying: null };
const id = (n: number) => `a1b2c3d4-000${n}-4000-8000-00000000000${n}`;

// Set UPDATE_GOLDEN=1 to regenerate after an intentional format change,
// then review the diff of the .golden.csv file before committing.
function golden(name: string, actual: string) {
  const path = join(__dirname, "__fixtures__", name);
  if (process.env.UPDATE_GOLDEN) writeFileSync(path, actual);
  expect(actual).toBe(readFileSync(path, "utf8"));
}

describe("statement CSV (golden files)", () => {
  it("Q1 2026, all underlyings", () => {
    const rows = buildLedger(fixture.history, q1, fixture.open);
    golden("statement-2026Q1.golden.csv", toCsv(rows, STATEMENT_COLUMNS) + "\n");
  });

  it("Q1 2026, BTC only", () => {
    const rows = buildLedger(fixture.history, { ...q1, underlying: "BTC" }, fixture.open);
    golden("statement-2026Q1-BTC.golden.csv", toCsv(rows, STATEMENT_COLUMNS) + "\n");
  });

  it("chunked output is byte-identical to the single-string output", () => {
    const rows = buildLedger(fixture.history, q1, fixture.open);
    expect(toCsvChunks(rows, STATEMENT_COLUMNS, 2).join("")).toBe(toCsv(rows, STATEMENT_COLUMNS));
  });
});

describe("CSV injection", () => {
  it.each(["=1+1", "+SUM(A1)", "-2+3", "@cmd", "\tx", "\rx", "=HYPERLINK(\"http://evil\",\"x\")"])("neutralizes %j", payload => {
    const cell = csvCell(payload);
    expect(cell.startsWith("\"'")).toBe(true);
    // Once unquoted, the value must not start with a formula trigger.
    const unquoted = cell.slice(1, -1).replace(/""/g, "\"");
    expect(unquoted[0]).toBe("'");
  });

  it("leaves plain numbers alone, including negatives", () => {
    expect(csvCell(-12.5)).toBe("-12.5");
    expect(csvCell("-12.50")).toBe("-12.50");
    expect(csvCell("1e-7")).toBe("1e-7");
  });

  it("still escapes a leading + even on a number-like string (OWASP)", () => {
    expect(csvCell("+3")).toBe("\"'+3\"");
  });

  it("quotes commas, quotes and newlines", () => {
    expect(csvCell("a,b")).toBe("\"a,b\"");
    expect(csvCell("say \"hi\"")).toBe("\"say \"\"hi\"\"\"");
    expect(csvCell("a\nb")).toBe("\"a\nb\"");
  });

  it("applies to every text column of a statement", () => {
    const evil: Position = { ...fixture.history[0], id: "=cmd|' /C calc'!A0", underlying: "@SUM(1)" };
    const csv = toCsv(buildLedger([evil], q1), STATEMENT_COLUMNS);
    const line = csv.split("\n")[1];
    expect(line.startsWith("\"'=cmd")).toBe(true);
    expect(line).toContain("\"'@SUM(1)\"");
  });
});

describe("periods", () => {
  it("builds UTC month / quarter / year boundaries", () => {
    expect(monthPeriod(2026, 1).start.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(monthPeriod(2026, 1).end.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(monthPeriod(2026, 11).end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(quarterPeriod(2026, 4).start.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(yearPeriod(2026).end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("custom periods include both end dates and reject bad input", () => {
    const p = customPeriod("2026-02-10", "2026-02-10")!;
    expect(p.start.toISOString()).toBe("2026-02-10T00:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-02-11T00:00:00.000Z");
    expect(customPeriod("2026-02-11", "2026-02-10")).toBeNull();
    expect(customPeriod("garbage", "2026-02-10")).toBeNull();
  });

  it("assigns lots by close time with an exclusive period end", () => {
    const ids = buildLedger(fixture.history, q1).map(r => r.id);
    expect(ids).not.toContain(id(6)); // closed exactly at 2026-04-01T00:00Z
    expect(ids).not.toContain(id(7)); // closed 2025-12-31T23:59:59.999Z
    expect(buildLedger(fixture.history, { period: quarterPeriod(2026, 2), underlying: null }).map(r => r.id)).toEqual([id(6)]);
    expect(buildLedger(fixture.history, { period: yearPeriod(2025), underlying: null }).map(r => r.id)).toEqual([id(7)]);
  });

  it("does not depend on the machine's time zone", () => {
    // All boundary math uses Date.UTC — TZ only changes local getters.
    const before = process.env.TZ;
    process.env.TZ = "Pacific/Kiritimati";
    try {
      expect(buildLedger(fixture.history, q1).length).toBe(5);
    } finally {
      process.env.TZ = before;
    }
  });

  it("names files after the inclusive range and filter", () => {
    expect(statementFilename(q1, "csv")).toBe("zenith-statement-2026-01-01_2026-03-31.csv");
    expect(statementFilename({ ...q1, underlying: "BTC" }, "pdf")).toBe("zenith-statement-2026-01-01_2026-03-31-BTC.pdf");
  });
});

describe("ledger rows", () => {
  const rows = buildLedger(fixture.history, q1, fixture.open);
  const byId = new Map(rows.map(r => [r.id, r]));

  it("computes cost basis and proceeds from each side's perspective", () => {
    const longCall = byId.get(id(1))!;
    expect(longCall.costBasis).toBeCloseTo(3.1, 10);
    expect(longCall.proceeds).toBeCloseTo(5.2, 10);
    const shortPut = byId.get(id(2))!;
    expect(shortPut.proceeds).toBeCloseTo(600.25, 10);
    expect(shortPut.costBasis).toBeCloseTo(900.125, 10);
  });

  it("matches the backend's realized P&L for every lot", () => {
    for (const p of fixture.history) {
      const r = buildLedger([p], { period: customPeriod("2000-01-01", "2100-01-01")!, underlying: null })[0];
      expect(r.realizedPnl).toBeCloseTo(p.realized_pnl!, 9);
    }
  });

  it("treats a roll as two ledger events and links them", () => {
    const rolledOut = byId.get(id(2))!;
    const rolledIn = byId.get(id(3))!;
    expect(rolledOut.event).toBe("roll");
    expect(rolledIn.event).toBe("close");
    expect(rolledOut.linkedId).toBe(id(3));
    expect(rolledIn.linkedId).toBe(id(2));
    // The replacement's holding period starts at the roll, not the original open.
    expect(rolledIn.openedAt).toBe("2026-02-20T10:00:00Z");
  });

  it("links a roll to a still-open replacement, matching strategy", () => {
    // 0008 matches (same strategy, 20ms later); 0009 is a decoy with no strategy.
    expect(byId.get(id(4))!.linkedId).toBe(id(8));
    expect(linkRolls(fixture.history, fixture.open).has(id(9))).toBe(false);
  });

  it("leaves rolls unlinked when nothing opened within the window", () => {
    const lone = fixture.history.filter(p => p.id === id(2));
    expect(linkRolls(lone, []).size).toBe(0);
  });
});

describe("holding period", () => {
  it("counts whole elapsed days", () => {
    expect(holdingDays("2026-01-01T12:00:00Z", "2026-01-02T11:59:59Z")).toBe(0);
    expect(holdingDays("2026-01-01T12:00:00Z", "2026-01-02T12:00:00Z")).toBe(1);
  });

  it("is long-term only strictly after the one-year anniversary", () => {
    expect(holdingTerm("2025-03-01T10:00:00Z", "2026-03-01T10:00:00Z")).toBe("short-term");
    expect(holdingTerm("2025-03-01T10:00:00Z", "2026-03-01T10:00:01Z")).toBe("long-term");
  });

  it("handles a leap-day open", () => {
    // Date.UTC(2025, 1, 29) rolls over to 2025-03-01.
    expect(holdingTerm("2024-02-29T00:00:00Z", "2025-02-28T23:59:59Z")).toBe("short-term");
    expect(holdingTerm("2024-02-29T00:00:00Z", "2025-03-01T00:00:01Z")).toBe("long-term");
  });
});

describe("summary", () => {
  it("totals the period and splits short/long-term", () => {
    const s = summarize(buildLedger(fixture.history, q1, fixture.open));
    expect(s.trades).toBe(5);
    expect(s.rolls).toBe(2);
    expect(s.wins).toBe(4);
    expect(s.losses).toBe(1);
    expect(s.realizedPnl).toBeCloseTo(2.1 - 299.875 + 599.95 + 29.8 + 0.6, 9);
    expect(s.longTermPnl).toBeCloseTo(0.6, 12);
    expect(s.shortTermPnl + s.longTermPnl).toBeCloseTo(s.realizedPnl, 12);
    expect(s.proceeds - s.costBasis - s.fees).toBeCloseTo(s.realizedPnl, 9);
    expect(s.byUnderlying.map(u => u.underlying)).toEqual(["BTC", "ETH", "SOL", "XLM"]);
  });

  it("is empty for an empty period", () => {
    expect(summarize([]).trades).toBe(0);
  });
});

describe("number formatting", () => {
  it("fmtAmount trims float noise and trailing zeros", () => {
    expect(fmtAmount(0.1 + 0.2)).toBe("0.30");
    expect(fmtAmount(12.5)).toBe("12.50");
    expect(fmtAmount(0.0012)).toBe("0.0012");
    expect(fmtAmount(-299.875)).toBe("-299.875");
    expect(fmtAmount(-1e-12)).toBe("0.00");
  });

  it("fmtPdfAmount groups thousands without locale APIs", () => {
    expect(fmtPdfAmount(1234567.891)).toBe("1,234,567.89");
    expect(fmtPdfAmount(-299.875)).toBe("-299.88");
    expect(fmtPdfAmount(0.0052)).toBe("0.0052");
    expect(fmtPdfAmount(0.5)).toBe("0.50");
    expect(fmtPdfAmount(0)).toBe("0.00");
  });
});

describe("PDF statement", () => {
  const doc = () => {
    const rows = buildLedger(fixture.history, q1, fixture.open);
    return { rows, summary: summarize(rows), filter: q1, walletAddress: "GTESTWALLETADDRESS", generatedAt: new Date("2026-04-02T09:00:00Z") };
  };

  it("is a PDF with a summary page and a detail page", async () => {
    const bytes = await renderStatementPdf(doc());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const { PDFDocument } = await import("pdf-lib");
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(2);
    expect(parsed.getTitle()).toBe("Zenith trade statement - Q1 2026");
  });

  it("is byte-for-byte deterministic", async () => {
    const [a, b] = await Promise.all([renderStatementPdf(doc()), renderStatementPdf(doc())]);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it("paginates large ledgers", async () => {
    const base = fixture.history[0];
    const many: Position[] = Array.from({ length: 1000 }, (_, i) => ({
      ...base, id: `bulk-${String(i).padStart(4, "0")}`,
      closed_at: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
    }));
    const rows = buildLedger(many, q1);
    const bytes = await renderStatementPdf({ ...doc(), rows, summary: summarize(rows) });
    const { PDFDocument } = await import("pdf-lib");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(20);
  }, 30_000);

  it("survives non-WinAnsi text", async () => {
    const d = doc();
    await expect(renderStatementPdf({ ...d, walletAddress: "G…ünïcødé→" })).resolves.toBeInstanceOf(Uint8Array);
  });
});
