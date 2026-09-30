"use client";

import { useMemo, useState } from "react";
import type { Expiry } from "../../lib/pricing";
import { fmtN, fmtSpot } from "../../lib/pricing";
import type { PricePoint } from "../../lib/usePriceHistory";
import type { StrategyOutlook } from "../../lib/strategies";
import { StrategyBadges } from "../../components/StrategyPicker";
import { priceCandidate, type Candidate, type FinderInput, type FinderMarket } from "./engine";
import { useStrategyFinder } from "./useStrategyFinder";
import { TargetPriceChart } from "./TargetPriceChart";
import { PayoffThumbnail } from "./PayoffThumbnail";

interface Props {
  sym: string;
  spot: number;
  vol: number;
  strikes: number[];
  expiries: Expiry[];
  priceHistory: PricePoint[];
  onLoad: (candidate: Candidate) => void;
}

const DAY_MS = 86_400_000;
const OUTLOOKS: StrategyOutlook[] = ["bullish", "bearish", "neutral", "volatile"];
const DEFAULT_TARGET: Record<StrategyOutlook, number> = { bullish: 1.1, bearish: 0.9, neutral: 1, volatile: 1.2 };

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const daysUntil = (iso: string, now = Date.now()) =>
  Math.max(1, Math.ceil((new Date(`${iso}T23:59:59Z`).getTime() - now) / DAY_MS));

const inputStyle: React.CSSProperties = {
  width: "100%", background: "var(--bg-overlay)", border: "1px solid var(--border-default)",
  color: "var(--text-hi)", fontFamily: "var(--font-mono)", fontSize: 12, padding: "5px 8px",
};
const labelStyle: React.CSSProperties = {
  fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-lo)", marginBottom: 4, display: "block",
};
const money = (v: number) => (Number.isFinite(v) ? `$${fmtN(v, 2)}` : "Unlimited");

export function StrategyFinder({ sym, spot, vol, strikes, expiries, priceHistory, onLoad }: Props) {
  const [outlook, setOutlook] = useState<StrategyOutlook>("bullish");
  // Seeded once per symbol (the parent keys this component by symbol), so
  // live spot ticks don't keep resetting what the user typed.
  const [target, setTarget] = useState(() => +(spot * DEFAULT_TARGET.bullish).toPrecision(5));
  const [date, setDate] = useState(() => isoDate(new Date(Date.now() + 30 * DAY_MS)));
  const [maxLoss, setMaxLoss] = useState(() => String(+(spot * 0.2).toPrecision(3)));
  const [budget, setBudget] = useState(() => String(+(spot * 2.5).toPrecision(3)));
  const [allowUndefinedRisk, setAllowUndefinedRisk] = useState(false);
  const targetDays = daysUntil(date);

  // Strikes and expiries are snapshotted at the current spot rounded to 3
  // significant figures, so a 2s spot tick doesn't restart the search.
  const spotKey = +spot.toPrecision(3);
  const market = useMemo<FinderMarket | null>(
    () => (strikes.length > 0 && expiries.length > 0 ? { spot: spotKey, vol: +vol.toFixed(3), strikes, expiries } : null),
    [spotKey, vol, strikes, expiries],
  );
  const input = useMemo<FinderInput | null>(() => {
    const ml = parseFloat(maxLoss);
    const b = parseFloat(budget);
    if (!(target > 0) || !(ml > 0) || !(b > 0)) return null;
    return { outlook, targetPrice: target, targetDays, maxLoss: ml, budget: b, allowUndefinedRisk };
  }, [outlook, target, targetDays, maxLoss, budget, allowUndefinedRisk]);

  const { result, error, loading } = useStrategyFinder(input, market);
  const pricedByCandidate = useMemo(
    () => new Map((result?.candidates ?? []).map(c => [c.id, market ? priceCandidate(c.legs, market) : []])),
    [result, market],
  );

  const pickOutlook = (o: StrategyOutlook) => {
    setOutlook(o);
    setTarget(+(spot * DEFAULT_TARGET[o]).toPrecision(5));
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 440px) 1fr", gap: 20, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <span style={labelStyle}>Outlook</span>
          <div role="group" aria-label="Outlook" style={{ display: "flex", gap: 2 }}>
            {OUTLOOKS.map(o => (
              <button key={o} onClick={() => pickOutlook(o)} aria-pressed={outlook === o} style={{
                flex: 1, padding: "6px 0", border: "1px solid var(--border-default)", cursor: "pointer",
                fontSize: 11, textTransform: "capitalize",
                background: outlook === o ? "var(--atm-dim)" : "transparent",
                color: outlook === o ? "var(--atm)" : "var(--text-mid)",
              }}>{o}</button>
            ))}
          </div>
        </div>

        <div>
          <span style={labelStyle}>Target price · drag the marker or use the arrow keys</span>
          <TargetPriceChart history={priceHistory} spot={spot} vol={vol} target={target} targetDays={targetDays}
            onChange={setTarget} width={420} height={150} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label>
            <span style={labelStyle}>Target ({sym})</span>
            <input type="number" step="any" min="0" value={target}
              onChange={e => setTarget(parseFloat(e.target.value) || 0)} style={inputStyle} />
          </label>
          <label>
            <span style={labelStyle}>By date ({targetDays}D)</span>
            <input type="date" value={date} min={isoDate(new Date(Date.now() + DAY_MS))}
              onChange={e => e.target.value && setDate(e.target.value)} style={inputStyle} />
          </label>
          <label>
            <span style={labelStyle}>Max loss ($)</span>
            <input type="number" step="any" min="0" value={maxLoss} onChange={e => setMaxLoss(e.target.value)} style={inputStyle} />
          </label>
          <label>
            <span style={labelStyle}>Budget ($, incl. collateral)</span>
            <input type="number" step="any" min="0" value={budget} onChange={e => setBudget(e.target.value)} style={inputStyle} />
          </label>
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 11, color: "var(--text-mid)", lineHeight: 1.5, cursor: "pointer" }}>
          <input type="checkbox" checked={allowUndefinedRisk} onChange={e => setAllowUndefinedRisk(e.target.checked)} style={{ marginTop: 2 }} />
          <span>
            Include <b style={{ color: "var(--put)" }}>undefined-risk</b> structures (short strangles, ratio spreads, jade lizards).
            Their losses aren&apos;t capped, so they are ranked by capital at risk instead of max loss.
          </span>
        </label>

        <div style={{ fontSize: 10, color: "var(--text-lo)", lineHeight: 1.6 }}>
          Candidates are built from the strategy library across listed strikes and the expiries on or after your date,
          each for one strategy unit. P&amp;L is measured at the position&apos;s nearest expiry; probability of profit uses a
          lognormal distribution at today&apos;s IV ({Math.round(vol * 100)}%).
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-hi)" }}>Top candidates</div>
          <div aria-live="polite" style={{ fontSize: 10, color: "var(--text-lo)" }}>
            {!market ? "Waiting for the chain…"
              : loading ? "Searching…"
              : result ? `${result.generated.toLocaleString()} candidates${result.capped ? " (capped)" : ""} · ${Math.round(result.elapsedMs)} ms` : ""}
          </div>
        </div>

        {error && <div role="alert" style={{ fontSize: 11, color: "var(--put)" }}>{error}</div>}
        {!input && <div style={{ fontSize: 11, color: "var(--put)" }}>Enter a positive target, max loss and budget.</div>}

        {result && result.candidates.length === 0 && !loading && (
          <div style={{ fontSize: 12, color: "var(--text-mid)", padding: "16px 0", lineHeight: 1.6 }}>
            No strategy fits. {result.pruned.budget > 0 && `${result.pruned.budget} were over budget. `}
            {result.pruned.maxLoss > 0 && `${result.pruned.maxLoss} exceeded the max loss. `}
            {result.pruned.unprofitable > 0 && `${result.pruned.unprofitable} wouldn't profit at the target. `}
            {result.pruned.undefinedRisk > 0 && "Undefined-risk structures are excluded. "}
            Try a larger budget or max loss, or a target closer to spot.
          </div>
        )}

        {result && result.candidates.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                {["#", "Strategy", "Payoff", "PoP", "P&L @ target", "Max loss", "Return/risk", "Capital", ""].map(h => (
                  <th key={h} style={{ padding: "6px", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em",
                    color: "var(--text-lo)", textAlign: h === "Strategy" || h === "Payoff" ? "left" : "right" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.candidates.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td className="num" style={{ padding: 6, fontSize: 11, color: "var(--text-lo)", textAlign: "right" }}>{i + 1}</td>
                  <td style={{ padding: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-hi)", marginBottom: 3 }}>{c.name}</div>
                    <StrategyBadges risk={c.risk} volView={c.volView} multiExpiry={new Set(c.legs.map(l => l.expiryDays)).size > 1} />
                    <div className="num" style={{ fontSize: 10, color: "var(--text-mid)", marginTop: 3 }}>
                      {c.legs.map(l => `${l.action === "buy" ? "+" : "−"}${l.ratio > 1 ? l.ratio : ""}${l.side === "call" ? "C" : "P"} ${fmtSpot(l.strike).slice(1)}`).join(" / ")}
                      {" · "}{Array.from(new Set(c.legs.map(l => `${l.expiryDays}D`))).join("/")}
                    </div>
                  </td>
                  <td style={{ padding: 6 }}>
                    <PayoffThumbnail legs={pricedByCandidate.get(c.id) ?? []} spot={spot} target={target} />
                  </td>
                  <td className="num" style={{ padding: 6, fontSize: 11, textAlign: "right", color: "var(--text-hi)" }}>{(c.pop * 100).toFixed(0)}%</td>
                  <td className="num" style={{ padding: 6, fontSize: 11, textAlign: "right", color: "var(--call)" }}>+{money(c.pnlAtTarget)}</td>
                  <td className="num" style={{ padding: 6, fontSize: 11, textAlign: "right", color: "var(--put)" }}>{money(c.maxLoss)}</td>
                  <td className="num" style={{ padding: 6, fontSize: 11, textAlign: "right", color: "var(--text-hi)" }}>{c.returnOnRisk.toFixed(2)}×</td>
                  <td className="num" style={{ padding: 6, fontSize: 11, textAlign: "right", color: "var(--text-mid)" }}>{money(c.capital)}</td>
                  <td style={{ padding: 6, textAlign: "right" }}>
                    <button onClick={() => onLoad(c)} style={{
                      background: "var(--brand)", color: "var(--bg)", border: "none", fontSize: 11, fontWeight: 700,
                      padding: "5px 10px", cursor: "pointer", whiteSpace: "nowrap",
                    }}>Load →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
