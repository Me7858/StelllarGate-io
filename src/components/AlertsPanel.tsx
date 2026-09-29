"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useBackendData } from "../lib/context/BackendDataContext";
import { useWalletStore } from "../lib/store/wallet";
import { ApiError } from "../lib/api/client";
import { requestNotificationPermission, sendNotification } from "../lib/notify";
import type { AlertCondition } from "../lib/api/types";
import {
  evaluate,
  hrefForMetric,
  loadRules,
  loadTriggers,
  newRuleId,
  saveRules,
  saveTriggers,
  type AlertMetric,
  type AlertOperator,
  type AlertRule,
  type TriggerEvent,
} from "../lib/alertRules";
import { MARKETS, smileVol, bs } from "../lib/pricing";
import { useSpotFeedContext } from "../lib/context/SpotFeedContext";

const METRICS: { value: AlertMetric; label: string }[] = [
  { value: "spot", label: "Spot" },
  { value: "iv", label: "IV %" },
  { value: "position_pnl_pct", label: "Position P&L %" },
  { value: "portfolio_delta", label: "Portfolio Δ" },
  { value: "portfolio_gamma", label: "Portfolio Γ" },
  { value: "portfolio_vega", label: "Portfolio V" },
  { value: "dte", label: "Days to expiry" },
];

const OPERATORS: { value: AlertOperator; label: string }[] = [
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
];

const inputStyle: CSSProperties = {
  background: "var(--bg-overlay)",
  border: "1px solid var(--border-default)",
  color: "var(--text-hi)",
  fontSize: 11,
  padding: "4px 6px",
  width: "100%",
};

export function AlertsPanel({ sym, spot }: { sym: string; spot: number }) {
  const token = useWalletStore(s => s.token);
  const { alerts: allAlerts, addAlert, removeAlert, positions, greeks } = useBackendData();
  const { data: spotFeed, status: feedStatus } = useSpotFeedContext();
  const lastTickRef = useRef<number>(Date.now());
  useEffect(() => {
    if (spotFeed) lastTickRef.current = Date.now();
  }, [spotFeed]);
  const alerts = allAlerts.filter(a => a.underlying === sym);

  // —— Legacy spot alerts (backend) ——
  const [price, setPrice] = useState(() => spot.toFixed(4));
  const [condition, setCondition] = useState<AlertCondition>("above");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPrice(spot.toFixed(4));
  }, [sym]); // eslint-disable-line react-hooks/exhaustive-deps

  const seenTriggered = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const a of allAlerts) {
      if (!a.triggered || seenTriggered.current.has(a.id)) continue;
      seenTriggered.current.add(a.id);
      sendNotification(`${a.underlying} ${a.condition} $${a.target_price.toFixed(4)}`, "Alert triggered");
    }
  }, [allAlerts]);

  const submitSpot = async () => {
    const target = parseFloat(price);
    if (!target || target <= 0 || !token) return;
    setError(null);
    requestNotificationPermission();
    try {
      await addAlert({ underlying: sym, condition, targetPrice: target });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create alert");
    }
  };

  // —— Client-side rule engine ——
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [triggers, setTriggers] = useState<TriggerEvent[]>([]);
  const [metric, setMetric] = useState<AlertMetric>("spot");
  const [operator, setOperator] = useState<AlertOperator>("gt");
  const [threshold, setThreshold] = useState("");
  const [useAnd, setUseAnd] = useState(false);
  const [andMetric, setAndMetric] = useState<AlertMetric>("iv");
  const [andOperator, setAndOperator] = useState<AlertOperator>("gt");
  const [andThreshold, setAndThreshold] = useState("");
  const [cooldownMin, setCooldownMin] = useState("5");
  const [hysteresis, setHysteresis] = useState("0");
  const [positionId, setPositionId] = useState("");
  const [ruleName, setRuleName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setRules(loadRules());
    setTriggers(loadTriggers());
  }, []);

  const spots = spotFeed?.prices ?? Object.fromEntries(MARKETS.map(m => [m.sym, m.price]));
  const vols = spotFeed?.vols ?? Object.fromEntries(MARKETS.map(m => [m.sym, m.vol]));

  const portfolioState = useMemo(() => {
    const marked = positions.map(p => {
      const s = spots[p.underlying] ?? 0;
      const baseVol = vols[p.underlying] ?? 0.5;
      const t = p.expiry_days / 365;
      const vol = smileVol(baseVol, p.strike / Math.max(s, 1e-9));
      const g = bs(s, p.strike, vol, t, p.option_type === "call");
      const entryTotal = p.entry_premium * p.contracts;
      const current = g.premium * p.contracts;
      const pnl = p.position_type === "short" ? entryTotal - current : current - entryTotal;
      const pnlPct = entryTotal > 0 ? (pnl / entryTotal) * 100 : 0;
      return {
        id: p.id,
        underlying: p.underlying,
        pnlPct,
        dte: p.expiry_days,
        status: p.status as "open" | "closed" | "rolled",
      };
    });
    return {
      netDelta: greeks.delta,
      netGamma: greeks.gamma,
      netVega: greeks.vega,
      positions: marked,
    };
  }, [positions, spots, vols, greeks]);

  // Stale when the socket is down or we haven't seen a tick recently.
  const feedAgeMs = feedStatus !== "open" ? 60_000 : Date.now() - lastTickRef.current;

  // Evaluate client rules on each feed / portfolio tick.
  useEffect(() => {
    if (rules.length === 0) return;
    const market = { spots, vols, feedAgeMs };
    let changed = false;
    const nextRules = rules.map(r => {
      const res = evaluate(r, market, portfolioState);
      if (res.fired) {
        changed = true;
        const ev: TriggerEvent = {
          id: `trig_${Date.now()}_${r.id}`,
          ruleId: r.id,
          ruleName: r.name,
          timestamp: new Date().toISOString(),
          value: res.value ?? 0,
          metric: r.condition.metric,
          href: hrefForMetric(r.condition.metric, r.condition.underlying),
        };
        setTriggers(prev => {
          const next = [ev, ...prev].slice(0, 100);
          saveTriggers(next);
          return next;
        });
        sendNotification(r.name, `${r.condition.metric} = ${res.value?.toFixed?.(4) ?? res.value}`);
        return { ...r, ...res.next };
      }
      if (res.next.armed !== r.armed || res.next.lastFiredAt !== r.lastFiredAt) {
        changed = true;
        return { ...r, ...res.next };
      }
      return r;
    });
    if (changed) {
      setRules(nextRules);
      saveRules(nextRules);
    }
  }, [spots, vols, portfolioState, feedAgeMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const persistRules = (next: AlertRule[]) => {
    setRules(next);
    saveRules(next);
  };

  const validateAndAdd = () => {
    setFormError(null);
    const thr = parseFloat(threshold);
    if (!Number.isFinite(thr)) {
      setFormError("Threshold is required");
      return;
    }
    if ((metric === "spot" || metric === "iv" || metric === "dte") && !sym) {
      setFormError("Underlying required");
      return;
    }
    if (metric === "position_pnl_pct" && !positionId) {
      setFormError("Select a position for P&L % rules");
      return;
    }
    if (useAnd) {
      const at = parseFloat(andThreshold);
      if (!Number.isFinite(at)) {
        setFormError("AND threshold is required");
        return;
      }
    }
    const cd = Math.max(0, parseFloat(cooldownMin) || 0) * 60_000;
    const hys = Math.abs(parseFloat(hysteresis) || 0);
    requestNotificationPermission();
    const rule: AlertRule = {
      id: newRuleId(),
      name: ruleName.trim() || `${metric} ${operator} ${thr}`,
      condition: {
        metric,
        operator,
        threshold: thr,
        underlying: sym,
        positionId: positionId || undefined,
      },
      and: useAnd
        ? {
            metric: andMetric,
            operator: andOperator,
            threshold: parseFloat(andThreshold),
            underlying: sym,
            positionId: positionId || undefined,
          }
        : undefined,
      cooldownMs: cd,
      hysteresis: hys,
      enabled: true,
      createdAt: new Date().toISOString(),
      lastFiredAt: null,
      armed: false,
    };
    persistRules([rule, ...rules]);
    setThreshold("");
    setAndThreshold("");
    setRuleName("");
  };

  const openPositions = positions.filter(p => p.underlying === sym);

  return (
    <div>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-lo)", marginBottom: 8 }}>
        Alerts
      </div>

      {/* Backend spot alerts */}
      <div style={{ fontSize: 10, color: "var(--text-lo)", marginBottom: 6 }}>Server spot alerts</div>
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        <select
          aria-label="Spot alert condition"
          value={condition}
          onChange={e => setCondition(e.target.value as AlertCondition)}
          style={{ ...inputStyle, width: "auto" }}
        >
          <option value="above">Above</option>
          <option value="below">Below</option>
        </select>
        <input
          aria-label="Spot alert target price"
          value={price}
          onChange={e => setPrice(e.target.value)}
          type="number"
          step="any"
          style={{ ...inputStyle, flex: 1, width: 0 }}
        />
        <button
          aria-label="Add server spot alert"
          onClick={submitSpot}
          disabled={!token}
          title={!token ? "Connect your wallet to set alerts" : undefined}
          style={{
            background: "var(--brand)", color: "var(--bg)", border: "none", fontSize: 11, fontWeight: 700,
            padding: "4px 10px", cursor: token ? "pointer" : "default", opacity: token ? 1 : 0.5,
          }}
        >
          Add
        </button>
      </div>
      {error && <div style={{ fontSize: 10, color: "var(--put)", marginBottom: 8 }}>{error}</div>}
      {alerts.filter(a => !a.triggered).map(a => (
        <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
          <span className="num" style={{ fontSize: 11, color: "var(--text-mid)" }}>
            {a.condition === "above" ? "≥" : "≤"} ${a.target_price.toFixed(4)}
          </span>
          <button aria-label={`Remove alert ${a.id}`} onClick={() => removeAlert(a.id)} style={{ background: "none", border: "none", color: "var(--text-lo)", fontSize: 14, cursor: "pointer", padding: "0 4px" }}>×</button>
        </div>
      ))}

      {/* Client rule builder */}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
        <div style={{ fontSize: 10, color: "var(--atm)", marginBottom: 6 }}>
          Rule builder · <span title="Evaluated in-browser against the live feed">only while the app is open</span>
        </div>

        <label style={{ display: "block", fontSize: 10, color: "var(--text-lo)", marginBottom: 2 }}>
          Name
          <input aria-label="Alert rule name" value={ruleName} onChange={e => setRuleName(e.target.value)} style={{ ...inputStyle, marginTop: 2 }} placeholder="Optional label" />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 56px 1fr", gap: 4, marginTop: 6 }}>
          <label style={{ fontSize: 10, color: "var(--text-lo)" }}>
            Metric
            <select aria-label="Alert metric" value={metric} onChange={e => setMetric(e.target.value as AlertMetric)} style={{ ...inputStyle, marginTop: 2 }}>
              {METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 10, color: "var(--text-lo)" }}>
            Op
            <select aria-label="Alert operator" value={operator} onChange={e => setOperator(e.target.value as AlertOperator)} style={{ ...inputStyle, marginTop: 2 }}>
              {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 10, color: "var(--text-lo)" }}>
            Threshold
            <input aria-label="Alert threshold" value={threshold} onChange={e => setThreshold(e.target.value)} type="number" step="any" style={{ ...inputStyle, marginTop: 2 }} />
          </label>
        </div>

        {(metric === "position_pnl_pct" || metric === "dte") && (
          <label style={{ display: "block", fontSize: 10, color: "var(--text-lo)", marginTop: 6 }}>
            Position
            <select aria-label="Alert position" value={positionId} onChange={e => setPositionId(e.target.value)} style={{ ...inputStyle, marginTop: 2 }}>
              <option value="">Select…</option>
              {openPositions.map(p => (
                <option key={p.id} value={p.id}>
                  {p.option_type} {p.strike} ({p.position_type})
                </option>
              ))}
            </select>
          </label>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-mid)", marginTop: 8 }}>
          <input aria-label="Add AND condition" type="checkbox" checked={useAnd} onChange={e => setUseAnd(e.target.checked)} />
          AND condition
        </label>

        {useAnd && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 56px 1fr", gap: 4, marginTop: 4 }}>
            <select aria-label="AND alert metric" value={andMetric} onChange={e => setAndMetric(e.target.value as AlertMetric)} style={inputStyle}>
              {METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select aria-label="AND alert operator" value={andOperator} onChange={e => setAndOperator(e.target.value as AlertOperator)} style={inputStyle}>
              {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <input aria-label="AND alert threshold" value={andThreshold} onChange={e => setAndThreshold(e.target.value)} type="number" step="any" style={inputStyle} />
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 6 }}>
          <label style={{ fontSize: 10, color: "var(--text-lo)" }}>
            Cooldown (min)
            <input aria-label="Alert cooldown minutes" value={cooldownMin} onChange={e => setCooldownMin(e.target.value)} type="number" min={0} style={{ ...inputStyle, marginTop: 2 }} />
          </label>
          <label style={{ fontSize: 10, color: "var(--text-lo)" }}>
            Hysteresis
            <input aria-label="Alert hysteresis" value={hysteresis} onChange={e => setHysteresis(e.target.value)} type="number" step="any" style={{ ...inputStyle, marginTop: 2 }} />
          </label>
        </div>

        {formError && <div style={{ fontSize: 10, color: "var(--put)", marginTop: 6 }}>{formError}</div>}

        <button
          aria-label="Add client-side alert rule"
          onClick={validateAndAdd}
          style={{
            marginTop: 8, width: "100%", background: "var(--bg-overlay)", border: "1px solid var(--border-default)",
            color: "var(--text-hi)", fontSize: 11, fontWeight: 600, padding: "6px", cursor: "pointer",
          }}
        >
          Add rule
        </button>

        {rules.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {rules.map(r => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "4px 0", gap: 6 }}>
                <div style={{ fontSize: 11, color: "var(--text-mid)" }}>
                  <div style={{ color: "var(--text-hi)" }}>{r.name}</div>
                  <div className="num" style={{ fontSize: 10 }}>
                    {r.condition.metric} {r.condition.operator} {r.condition.threshold}
                    {r.and ? ` AND ${r.and.metric} ${r.and.operator} ${r.and.threshold}` : ""}
                  </div>
                </div>
                <button
                  aria-label={`Remove rule ${r.name}`}
                  onClick={() => persistRules(rules.filter(x => x.id !== r.id))}
                  style={{ background: "none", border: "none", color: "var(--text-lo)", fontSize: 14, cursor: "pointer" }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {triggers.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--atm)", marginBottom: 4 }}>
            Trigger history
          </div>
          {triggers.slice(0, 8).map(t => (
            <div key={t.id} style={{ fontSize: 10, color: "var(--text-mid)", padding: "3px 0", display: "flex", justifyContent: "space-between", gap: 6 }}>
              <span>
                {new Date(t.timestamp).toLocaleString()} · {t.ruleName} · <span className="num">{typeof t.value === "number" ? t.value.toFixed(4) : t.value}</span>
              </span>
              <Link href={t.href} style={{ color: "var(--brand)", textDecoration: "none", flexShrink: 0 }}>View</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
