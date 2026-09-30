// Minimal CSV serialization — no external dependency needed for the shapes
// this app exports (flat objects).

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number;
}

const PLAIN_NUMBER = /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i;
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * Serializes one cell. Guards against CSV/formula injection per OWASP: a
 * text cell starting with =, +, -, @, tab or CR is prefixed with a single
 * quote so spreadsheet apps show it as text instead of evaluating it.
 * Plain numbers (including negative ones like "-12.50") can't be
 * formulas and are left alone so they still import as numbers.
 */
export function csvCell(v: string | number): string {
  let s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : String(v);
  if (typeof v === "string" && FORMULA_TRIGGER.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) || s.startsWith("'") ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvHeaderLine<T>(columns: CsvColumn<T>[]): string {
  return columns.map(c => csvCell(c.header)).join(",");
}

export function csvLine<T>(row: T, columns: CsvColumn<T>[]): string {
  return columns.map(c => csvCell(c.value(row))).join(",");
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  return [csvHeaderLine(columns), ...rows.map(row => csvLine(row, columns))].join("\n");
}

/**
 * Same output as toCsv, split into string chunks of `chunkRows` lines
 * each — a Blob built from the parts never needs one giant concatenated
 * string, which matters for large ledgers.
 */
export function toCsvChunks<T>(rows: T[], columns: CsvColumn<T>[], chunkRows = 1000): string[] {
  const parts: string[] = [csvHeaderLine(columns)];
  for (let i = 0; i < rows.length; i += chunkRows) {
    parts.push("\n" + rows.slice(i, i + chunkRows).map(row => csvLine(row, columns)).join("\n"));
  }
  return parts;
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoke on the next tick — some browsers cancel the download if the
  // URL is revoked synchronously inside the click.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadCsv(filename: string, csv: string | string[]) {
  downloadBlob(filename, new Blob(Array.isArray(csv) ? csv : [csv], { type: "text/csv;charset=utf-8;" }));
}
