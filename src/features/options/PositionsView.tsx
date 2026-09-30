"use client";

import Link from "next/link";
import { DataBoundary, EmptyState, SkeletonRows } from "../../components/states";
import { AuthGate } from "../../components/states/AuthGate";
import { ExpandableCard } from "../../components/ExpandableCard";
import { useBackendData } from "../../lib/context/BackendDataContext";
import { fmtK, type Greeks } from "../../lib/pricing";
import type { Position } from "../../lib/api/types";
import { Term } from "../onboarding/Term";
import type { GlossaryId } from "../onboarding/i18n";

const HEAD: { label: string; term?: GlossaryId }[] = [
  { label: "Asset" }, { label: "Type" }, { label: "Side" }, { label: "Strike", term: "strike" }, { label: "Expiry", term: "expiry" },
  { label: "Qty" }, { label: "Δ", term: "delta" }, { label: "Γ", term: "gamma" }, { label: "Θ", term: "theta" }, { label: "V", term: "vega" }, { label: "" },
];

function Badge({ tone, children }: { tone: "call" | "put"; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "2px 6px", textTransform: "uppercase",
      background: tone === "call" ? "var(--call-dim)" : "var(--put-dim)", color: tone === "call" ? "var(--call)" : "var(--put)",
    }}>{children}</span>
  );
}

/** Quick view of open positions on the terminal; "Manage →" goes to /portfolio. */
export function PositionsView({ liveGreeks, onBackToChain }: {
  liveGreeks: (p: Position) => Greeks;
  onBackToChain: () => void;
}) {
  const { authStatus, positionsQuery } = useBackendData();

  return (
    <DataBoundary
      query={positionsQuery}
      auth={authStatus}
      skeleton={<SkeletonRows rows={6} rowHeight={36} columns={8} label="Loading positions" testId="positions-skeleton" />}
      signedOut={<AuthGate title="Connect your wallet to see positions" description="Open positions are tied to your wallet's session on this environment." />}
      errorTitle="Couldn't load positions"
      isEmpty={d => d.positions.length === 0}
      empty={
        <EmptyState
          title="No open positions"
          description="Buy or write an option from the chain and it'll show up here."
          action={{ label: "← Back to chain", onClick: onBackToChain }}
          testId="positions-empty"
        />
      }
    >
      {({ positions }) => (
        <div className="responsive-list" data-testid="positions">
          <table className="rl-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                {HEAD.map((h, i) => (
                  <th key={i} style={{ padding: "6px 8px", fontSize: 10, fontWeight: 500, textTransform: "uppercase",
                    letterSpacing: "0.05em", color: "var(--text-lo)", textAlign: "right", background: "var(--bg-raised)" }}>
                    {h.term ? <Term id={h.term}>{h.label}</Term> : h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positions.map(pos => {
                const sign = pos.position_type === "short" ? -1 : 1;
                const g = liveGreeks(pos);
                return (
                  <tr key={pos.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "8px", fontSize: 12, fontWeight: 600, color: "var(--text-hi)" }}>{pos.underlying}</td>
                    <td style={{ padding: "8px 4px" }}><Badge tone={pos.position_type === "short" ? "put" : "call"}>{pos.position_type}</Badge></td>
                    <td style={{ padding: "8px 4px" }}><Badge tone={pos.option_type}>{pos.option_type}</Badge></td>
                    {[fmtK(pos.strike), `${pos.expiry_days}D`, pos.contracts.toFixed(0),
                      (sign * g.delta * pos.contracts).toFixed(3), (sign * g.gamma * pos.contracts).toFixed(4),
                      (sign * g.theta * pos.contracts).toFixed(4), (sign * g.vega * pos.contracts).toFixed(3),
                    ].map((v, j) => (
                      <td key={j} className="num" style={{ padding: "8px", fontSize: 11, textAlign: "right", color: j === 5 ? "var(--put)" : "var(--text-hi)" }}>{v}</td>
                    ))}
                    <td style={{ padding: "4px 8px", textAlign: "right" }}>
                      <Link href="/portfolio" style={{ fontSize: 10, color: "var(--brand)", textDecoration: "none" }}>Manage →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="rl-cards" style={{ padding: 8 }}>
            {positions.map(pos => {
              const sign = pos.position_type === "short" ? -1 : 1;
              const g = liveGreeks(pos);
              return (
                <ExpandableCard
                  key={pos.id}
                  testId="position-card"
                  title={<>{pos.underlying} <Badge tone={pos.position_type === "short" ? "put" : "call"}>{pos.position_type}</Badge> <Badge tone={pos.option_type}>{pos.option_type}</Badge></>}
                  meta={<span className="num">K={fmtK(pos.strike)} · {pos.expiry_days}D · {pos.contracts} contracts</span>}
                  fields={[
                    { label: <Term id="delta">Δ Delta</Term>, value: (sign * g.delta * pos.contracts).toFixed(3) },
                    { label: <Term id="gamma">Γ Gamma</Term>, value: (sign * g.gamma * pos.contracts).toFixed(4) },
                    { label: <Term id="theta">Θ Theta</Term>, value: (sign * g.theta * pos.contracts).toFixed(4) },
                    { label: <Term id="vega">V Vega</Term>, value: (sign * g.vega * pos.contracts).toFixed(3) },
                  ]}
                  actions={<Link href="/portfolio" className="tap auth-cta">Manage in portfolio →</Link>}
                />
              );
            })}
          </div>
        </div>
      )}
    </DataBoundary>
  );
}
