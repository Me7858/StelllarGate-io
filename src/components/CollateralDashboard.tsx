"use client";

import { useMemo, useState } from "react";
import type { Account } from "../lib/api/types";
import {
  accountCollateralSummary,
  collateralRows,
  reconcileCollateral,
  sortCollateralRows,
  utilizationLevel,
  whatIfClose,
  whatIfWrite,
  type CollateralSortKey,
  type MarkedCollateralInput,
  type UtilizationThresholds,
  type WhatIf,
} from "../lib/collateral";
import { MARKETS, bs, fmtK, smileVol } from "../lib/pricing";
import { requestNotificationPermission } from "../lib/notify";
import { useCollateralSettings } from "../lib/store/collateralSettings";
import { LEVEL_COLOR, LEVEL_LABEL } from "./CollateralWarning";

interface Props {
  account: Account | null;
  /** Open positions, marked to market. */
  items: MarkedCollateralInput[];
  spots: Record<string, number>;
  vols: Record<string, number>;
  /** Injectable for tests; defaults to the current time. */
  now?: Date;
}

const usd = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const label: React.CSSProperties = { fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-lo)", marginBottom: 4 };

export function UtilizationGauge({ utilization, thresholds, size = 168 }: { utilization: number; thresholds: UtilizationThresholds; size?: number }) {
  const level = utilizationLevel(utilization, thresholds);
  const r = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2;
  const pt = (f: number, rad = r) => {
    const a = Math.PI * (1 - Math.min(1, Math.max(0, f)));
    return { x: cx + rad * Math.cos(a), y: cy - rad * Math.sin(a) };
  };
  const arc = (f: number) => {
    const end = pt(f);
    return `M${cx - r},${cy} A${r},${r} 0 0 1 ${end.x.toFixed(2)},${end.y.toFixed(2)}`;
  };
  return (
    <div
      role="meter"
      aria-label="Collateral utilization"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(utilization * 100)}
      aria-valuetext={`${pct(utilization, 0)} — ${LEVEL_LABEL[level]}`}
      data-level={level}
      style={{ width: size, textAlign: "center" }}
    >
      <svg width={size} height={size / 2 + 8} viewBox={`0 0 ${size} ${size / 2 + 8}`}>
        <path d={arc(1)} fill="none" stroke="var(--bg-overlay)" strokeWidth={10} />
        {utilization > 0 && (
          <path d={arc(utilization)} fill="none" stroke={LEVEL_COLOR[level]} strokeWidth={10} />
        )}
        {(["warning", "critical"] as const).map(k => {
          const a = pt(thresholds[k], r - 8);
          const b = pt(thresholds[k], r + 8);
          return <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={LEVEL_COLOR[k]} strokeWidth={2} />;
        })}
      </svg>
      <div className="num" style={{ fontSize: 20, fontWeight: 600, color: "var(--text-hi)", marginTop: -28 }}>{pct(utilization, 0)}</div>
      <div style={{ fontSize: 10, color: LEVEL_COLOR[level], fontWeight: 600, marginTop: 2 }}>
        {level !== "ok" && <span aria-hidden>⚠ </span>}{LEVEL_LABEL[level]}
      </div>
    </div>
  );
}

const COLUMNS: { key: CollateralSortKey; label: string; title?: string }[] = [
  { key: "underlying", label: "Position" },
  { key: "collateral", label: "Collateral", title: "Amount locked at entry (calls: contracts × entry spot; puts: 110% of strike). Not re-marked as spot moves." },
  { key: "share", label: "% of Total" },
  { key: "premiumYield", label: "Prem. Yield", title: "Premium received at entry ÷ collateral" },
  { key: "returnOnCollateral", label: "RoC", title: "Unrealized P&L ÷ collateral" },
  { key: "daysHeld", label: "Days Held" },
  { key: "freedOnClose", label: "Frees on Close", title: "Change in buying power if closed now: collateral released minus the buy-to-close cost" },
];

export function CollateralDashboard({ account, items, spots, vols, now }: Props) {
  const { warning, critical, notify, setThresholds, setNotify } = useCollateralSettings();
  const thresholds = useMemo(() => ({ warning, critical }), [warning, critical]);
  const summary = useMemo(() => accountCollateralSummary(account), [account]);
  const level = utilizationLevel(summary.utilization, thresholds);

  const [sort, setSort] = useState<{ key: CollateralSortKey; dir: "asc" | "desc" }>({ key: "collateral", dir: "desc" });
  const rows = useMemo(
    () => sortCollateralRows(collateralRows(items, now ?? new Date()), sort.key, sort.dir),
    [items, now, sort]
  );
  const recon = useMemo(
    () => reconcileCollateral(items.map(i => i.position), summary.locked),
    [items, summary.locked]
  );

  const toggleSort = (key: CollateralSortKey) =>
    setSort(s => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "underlying" ? "asc" : "desc" }));

  if (!account) return null;

  return (
    <section id="collateral" aria-labelledby="collateral-heading" style={{ marginBottom: 24, border: "1px solid var(--border-default)", background: "var(--bg-raised)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--border-default)", gap: 12, flexWrap: "wrap" }}>
        <h2 id="collateral-heading" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-hi)" }}>Collateral &amp; Margin</h2>
        <ThresholdSettings
          warning={warning} critical={critical} notify={notify}
          onChange={setThresholds}
          onNotify={v => { if (v) requestNotificationPermission(); setNotify(v); }}
        />
      </div>

      <div style={{ display: "flex", gap: 32, padding: 16, alignItems: "center", flexWrap: "wrap" }}>
        <UtilizationGauge utilization={summary.utilization} thresholds={thresholds} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(140px, 1fr))", gap: "12px 32px" }}>
          {[
            { k: "Balance", v: usd(summary.balance), c: "var(--text-hi)" },
            { k: "Locked Collateral", v: usd(summary.locked), c: "var(--atm)" },
            { k: "Free Capital", v: usd(summary.free), c: summary.free < 0 ? "var(--put)" : "var(--text-hi)" },
            { k: "Utilization", v: pct(summary.utilization), c: LEVEL_COLOR[level] },
          ].map(s => (
            <div key={s.k}>
              <div style={label}>{s.k}</div>
              <div className="num" style={{ fontSize: 15, fontWeight: 600, color: s.c }}>{s.v}</div>
            </div>
          ))}
        </div>
        <div style={{ flex: "1 1 220px", fontSize: 11 }}>
          {recon.ok ? (
            <div role="status" style={{ color: "var(--text-mid)" }}>
              <span aria-hidden style={{ color: "var(--call)" }}>✓ </span>
              Reconciled: positions sum to {usd(recon.positionsTotal)}, matching the account&apos;s locked collateral.
            </div>
          ) : (
            <div role="alert" style={{ color: "var(--put)", border: "1px solid var(--put)", background: "var(--put-dim)", padding: "8px 10px" }}>
              <span aria-hidden>⚠ </span>
              Reconciliation mismatch: open positions sum to {usd(recon.positionsTotal)} but the account reports {usd(recon.accountLocked)} locked
              ({recon.difference > 0 ? "+" : "−"}{usd(Math.abs(recon.difference))}).
            </div>
          )}
        </div>
      </div>

      {rows.length > 0 ? (
        <div style={{ borderTop: "1px solid var(--border-default)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr>
                {COLUMNS.map(c => (
                  <th
                    key={c.key}
                    aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    style={{ padding: 0, background: "var(--bg-overlay)", textAlign: c.key === "underlying" ? "left" : "right" }}
                  >
                    <button type="button" onClick={() => toggleSort(c.key)} title={c.title} style={{
                      width: "100%", padding: "8px 10px", background: "none", border: "none", cursor: "pointer",
                      fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em",
                      color: sort.key === c.key ? "var(--text-hi)" : "var(--text-lo)", textAlign: "inherit",
                    }}>
                      {c.label}{sort.key === c.key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const p = r.position;
                const drift = r.currentRequirement - r.collateral;
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "8px 10px", fontSize: 11, color: "var(--text-hi)" }}>
                      <span style={{ fontWeight: 600 }}>{p.underlying}</span>{" "}
                      <span style={{ color: "var(--text-mid)", textTransform: "capitalize" }}>{p.position_type} {p.option_type}</span>{" "}
                      <span className="num" style={{ color: "var(--text-mid)" }}>K={fmtK(p.strike)} × {p.contracts}</span>
                    </td>
                    <td className="num" style={{ padding: "8px 10px", fontSize: 11, textAlign: "right", color: "var(--text-hi)" }}
                      title={`At today's spot this write would lock ${usd(r.currentRequirement)} (${drift >= 0 ? "+" : "−"}${usd(Math.abs(drift))})`}>
                      {usd(r.collateral)}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                        <div aria-hidden style={{ width: 48, height: 4, background: "var(--bg-overlay)" }}>
                          <div style={{ width: `${r.share * 100}%`, height: "100%", background: "var(--atm)" }} />
                        </div>
                        <span className="num" style={{ fontSize: 11, color: "var(--text-mid)", minWidth: 42 }}>{pct(r.share)}</span>
                      </div>
                    </td>
                    <td className="num" style={{ padding: "8px 10px", fontSize: 11, textAlign: "right", color: "var(--text-mid)" }}>{pct(r.premiumYield, 2)}</td>
                    <td className="num" style={{ padding: "8px 10px", fontSize: 11, textAlign: "right", color: r.returnOnCollateral >= 0 ? "var(--call)" : "var(--put)" }}>
                      {r.returnOnCollateral >= 0 ? "+" : ""}{pct(r.returnOnCollateral, 2)}
                    </td>
                    <td className="num" style={{ padding: "8px 10px", fontSize: 11, textAlign: "right", color: "var(--text-mid)" }}>{r.daysHeld.toFixed(1)}</td>
                    <td className="num" style={{ padding: "8px 10px", fontSize: 11, textAlign: "right", color: "var(--text-hi)" }}>{usd(r.freedOnClose)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ borderTop: "1px solid var(--border-default)", padding: "12px 16px", fontSize: 11, color: "var(--text-lo)" }}>
          No collateral locked — only written (short) options lock collateral.
        </div>
      )}

      <WhatIfPanel summary={summary} items={items} spots={spots} vols={vols} thresholds={thresholds} />
    </section>
  );
}

// Local draft string so the field can be cleared and retyped — a
// controlled number input bound straight to the store would snap back to
// the old value on every intermediate keystroke ("" → 80, "7" → 807).
function ThresholdInput({ value, text, onCommit }: { value: number; text: string; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--text-lo)" }}>
      {text}
      <input
        type="number" min={1} max={100} step={1}
        value={draft ?? String(Math.round(value * 100))}
        aria-label={`${text} threshold percent`}
        onChange={e => {
          setDraft(e.target.value);
          const v = parseFloat(e.target.value);
          if (v >= 1 && v <= 100) onCommit(v / 100);
        }}
        onBlur={() => setDraft(null)}
        style={{ width: 44, background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--text-hi)", fontFamily: "var(--font-mono)", fontSize: 11, padding: "2px 4px" }}
      />%
    </label>
  );
}

function ThresholdSettings({ warning, critical, notify, onChange, onNotify }: {
  warning: number; critical: number; notify: boolean;
  onChange: (t: Partial<UtilizationThresholds>) => void;
  onNotify: (v: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <ThresholdInput value={warning} text="Warn at" onCommit={v => onChange({ warning: v })} />
      <ThresholdInput value={critical} text="Critical at" onCommit={v => onChange({ critical: v })} />
      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--text-lo)" }}>
        <input type="checkbox" checked={notify} onChange={e => onNotify(e.target.checked)} />
        Notify
      </label>
    </div>
  );
}

function WhatIfPanel({ summary, items, spots, vols, thresholds }: {
  summary: ReturnType<typeof accountCollateralSummary>;
  items: MarkedCollateralInput[];
  spots: Record<string, number>;
  vols: Record<string, number>;
  thresholds: UtilizationThresholds;
}) {
  const [mode, setMode] = useState<"write" | "close">("write");
  const [sym, setSym] = useState(MARKETS[0].sym);
  const [side, setSide] = useState<"call" | "put">("put");
  const [strikePct, setStrikePct] = useState(100);
  const [contracts, setContracts] = useState("1");
  const [closeId, setCloseId] = useState<string>("");

  // Any open position can be closed; longs lock no collateral but still
  // raise cash, which moves free capital and utilization.
  const closable = items;
  const closeItem = closable.find(i => i.position.id === closeId) ?? closable[0];

  const result: (WhatIf & { detail: string }) | null = useMemo(() => {
    if (mode === "write") {
      const spot = spots[sym] ?? MARKETS.find(m => m.sym === sym)?.price ?? 0;
      const baseVol = vols[sym] ?? MARKETS.find(m => m.sym === sym)?.vol ?? 0.5;
      const qty = Math.max(0, parseFloat(contracts) || 0);
      if (!(spot > 0) || qty <= 0) return null;
      const strike = Math.round(spot * (strikePct / 100) * 10000) / 10000;
      // Same 30D tenor the chain opens on — premium only moves the cash
      // side here, the collateral itself doesn't depend on expiry.
      const premium = bs(spot, strike, smileVol(baseVol, strike / spot), 30 / 365, side === "call").premium;
      return {
        ...whatIfWrite(summary, { side, contracts: qty, strike, spot, premium }),
        detail: `Write ${qty} ${sym} ${side} @ ${fmtK(strike)} (30D) · premium ${usd(premium * qty)}`,
      };
    }
    if (!closeItem) return null;
    const p = closeItem.position;
    return {
      ...whatIfClose(summary, p, closeItem.currentPremium),
      detail: `Close ${p.position_type} ${p.underlying} ${p.option_type} @ ${fmtK(p.strike)} · ${p.position_type === "short" ? "cost" : "proceeds"} ${usd(closeItem.currentPremium)}`,
    };
  }, [mode, sym, side, strikePct, contracts, closeItem, spots, vols, summary]);

  const afterLevel = result ? utilizationLevel(result.after.utilization, thresholds) : "ok";
  const seg = (active: boolean): React.CSSProperties => ({
    padding: "3px 10px", border: "none", cursor: "pointer", fontSize: 11,
    background: active ? "var(--atm-dim)" : "transparent", color: active ? "var(--atm)" : "var(--text-lo)",
  });
  const field: React.CSSProperties = {
    background: "var(--bg-overlay)", border: "1px solid var(--border-default)", color: "var(--text-hi)", fontSize: 11, padding: "3px 6px",
  };

  return (
    <div style={{ borderTop: "1px solid var(--border-default)", padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-lo)" }}>What-if</div>
        <div role="group" aria-label="What-if scenario" style={{ display: "flex", gap: 2 }}>
          <button type="button" aria-pressed={mode === "write"} onClick={() => setMode("write")} style={seg(mode === "write")}>New write</button>
          <button type="button" aria-pressed={mode === "close"} onClick={() => setMode("close")} style={seg(mode === "close")} disabled={closable.length === 0}>Close position</button>
        </div>
        {mode === "write" ? (
          <>
            <select aria-label="Underlying" value={sym} onChange={e => setSym(e.target.value)} style={field}>
              {MARKETS.map(m => <option key={m.sym} value={m.sym}>{m.sym}</option>)}
            </select>
            <select aria-label="Option type" value={side} onChange={e => setSide(e.target.value as "call" | "put")} style={field}>
              <option value="put">Put</option>
              <option value="call">Call</option>
            </select>
            <label style={{ fontSize: 10, color: "var(--text-lo)", display: "flex", alignItems: "center", gap: 4 }}>
              Strike
              <input aria-label="Strike as percent of spot" type="number" min={1} step={1} value={strikePct} onChange={e => setStrikePct(parseFloat(e.target.value) || 0)} style={{ ...field, width: 56, fontFamily: "var(--font-mono)" }} />% of spot
            </label>
            <label style={{ fontSize: 10, color: "var(--text-lo)", display: "flex", alignItems: "center", gap: 4 }}>
              Qty
              <input aria-label="Contracts" type="number" min={0.01} step={0.01} value={contracts} onChange={e => setContracts(e.target.value)} style={{ ...field, width: 64, fontFamily: "var(--font-mono)" }} />
            </label>
          </>
        ) : (
          <select aria-label="Position to close" value={closeItem?.position.id ?? ""} onChange={e => setCloseId(e.target.value)} style={field}>
            {closable.map(i => (
              <option key={i.position.id} value={i.position.id}>
                {i.position.underlying} {i.position.position_type} {i.position.option_type} K={fmtK(i.position.strike)} × {i.position.contracts}
              </option>
            ))}
          </select>
        )}
      </div>

      {result && (
        <div data-testid="what-if-result" style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ fontSize: 11, color: "var(--text-mid)", flexBasis: "100%" }}>{result.detail}</div>
          <div>
            <div style={label}>{result.collateralDelta >= 0 ? "Collateral consumed" : "Collateral released"}</div>
            <div className="num" style={{ fontSize: 13, fontWeight: 600, color: "var(--atm)" }}>{usd(Math.abs(result.collateralDelta))}</div>
          </div>
          <div>
            <div style={label}>Free capital</div>
            <div className="num" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-hi)" }}>
              {usd(result.before.free)} → <span style={{ color: result.after.free < 0 ? "var(--put)" : "var(--text-hi)" }}>{usd(result.after.free)}</span>
            </div>
          </div>
          <div>
            <div style={label}>Utilization</div>
            <div className="num" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-hi)" }}>
              {pct(result.before.utilization)} → <span style={{ color: LEVEL_COLOR[afterLevel] }}>{pct(result.after.utilization)}</span>
            </div>
          </div>
          {(result.insufficient || afterLevel !== "ok") && (
            <div role="alert" style={{ fontSize: 11, color: result.insufficient ? "var(--put)" : LEVEL_COLOR[afterLevel] }}>
              <span aria-hidden>⚠ </span>
              {result.insufficient
                ? "Insufficient buying power — the backend would reject this trade."
                : `Utilization after this trade: ${LEVEL_LABEL[afterLevel].toLowerCase()} (≥ ${Math.round(thresholds[afterLevel as "warning" | "critical"] * 100)}% threshold).`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
