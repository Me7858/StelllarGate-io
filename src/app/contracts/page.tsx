"use client";

import { useState } from "react";
import { AppHeader } from "../../components/AppHeader";
import { CopyButton, CopyableValue } from "../../components/CopyButton";
import { useContractVerification } from "../../lib/hooks/useContractVerification";
import { NETWORKS, NETWORK_IDS, rpcUrlFor } from "../../lib/soroban/networks";
import type { NetworkId } from "../../lib/soroban/networks";
import { CONTRACTS, deploymentFor } from "../../lib/soroban/registry";
import type { ContractDeployment, ContractRegistryEntry } from "../../lib/soroban/registry";
import type { VerificationStatus } from "../../lib/soroban/verify";
import { statusLabel } from "../../lib/soroban/verify";

const STATUS_COLOR: Record<VerificationStatus, { fg: string; bg: string }> = {
  verified: { fg: "var(--call)", bg: "var(--call-dim)" },
  mismatch: { fg: "var(--put)", bg: "var(--put-dim)" },
  unverified: { fg: "var(--atm)", bg: "var(--atm-dim)" },
  "not-deployed": { fg: "var(--text-lo)", bg: "var(--bg-overlay)" },
  loading: { fg: "var(--text-mid)", bg: "var(--bg-overlay)" },
};

function StatusPill({ status }: { status: VerificationStatus }) {
  const c = STATUS_COLOR[status];
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
      color: c.fg, background: c.bg, padding: "3px 8px", whiteSpace: "nowrap",
    }}>
      {statusLabel(status)}
    </span>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: "var(--brand)", textDecoration: "none", borderBottom: "1px solid transparent" }}
      onMouseEnter={e => (e.currentTarget.style.borderBottomColor = "var(--brand)")}
      onMouseLeave={e => (e.currentTarget.style.borderBottomColor = "transparent")}
    >
      {children}
    </a>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em",
        color: "var(--text-lo)", marginBottom: 5,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function UpgradeHistory({ deployment }: { deployment: ContractDeployment }) {
  if (!deployment.upgradeable) {
    return <span style={{ fontSize: 11, color: "var(--text-lo)" }}>Not upgradable</span>;
  }
  if (deployment.upgradeHistory.length === 0) {
    return <span style={{ fontSize: 11, color: "var(--text-lo)" }}>Upgradable — no prior upgrades recorded</span>;
  }
  return (
    <ol style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
      {[...deployment.upgradeHistory].reverse().map(u => (
        <li key={`${u.version}-${u.wasmHash}`} style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
          <span className="num" style={{ fontSize: 11, color: "var(--text-hi)", fontWeight: 600 }}>{u.version}</span>
          <span className="num" style={{ fontSize: 10, color: "var(--text-lo)" }}>{u.deployedAt ?? "—"}</span>
          <span className="num" style={{ fontSize: 10, color: "var(--text-mid)", wordBreak: "break-all" }}>
            {u.wasmHash}
          </span>
          {u.note && <span style={{ fontSize: 10, color: "var(--text-lo)" }}>{u.note}</span>}
        </li>
      ))}
    </ol>
  );
}

function ContractCard({
  contract,
  network,
  status,
  deployedWasmHash,
  detail,
  blocksActions,
  lastModifiedLedgerSeq,
}: {
  contract: ContractRegistryEntry;
  network: NetworkId;
  status: VerificationStatus;
  deployedWasmHash: string | null;
  detail: string;
  blocksActions: boolean;
  lastModifiedLedgerSeq: number | null;
}) {
  const deployment = deploymentFor(network, contract.key);
  const net = NETWORKS[network];

  return (
    <div style={{
      border: "1px solid var(--border-default)", background: "var(--bg-raised)",
      padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16,
      borderLeft: `3px solid ${STATUS_COLOR[status].fg}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
            <h2 className="serif" style={{ fontSize: 16, fontWeight: 600, color: "var(--text-hi)" }}>
              {contract.name}
            </h2>
            <code style={{ fontSize: 10, color: "var(--text-lo)" }}>{contract.key}</code>
          </div>
          <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-mid)", maxWidth: 680 }}>
            {contract.description}
          </p>
        </div>
        <StatusPill status={status} />
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 16, paddingTop: 14, borderTop: "1px solid var(--border-subtle)",
      }}>
        <Field label="Contract ID">
          {deployment?.contractId
            ? <CopyableValue value={deployment.contractId} />
            : <span style={{ fontSize: 11, color: "var(--text-lo)" }}>—</span>}
        </Field>
        <Field label="Deployed WASM hash (on-chain)">
          {deployedWasmHash
            ? <CopyableValue value={deployedWasmHash} />
            : <span style={{ fontSize: 11, color: "var(--text-lo)" }}>—</span>}
        </Field>
        <Field label="Expected WASM hash (registry)">
          {deployment?.wasmHash
            ? <CopyableValue value={deployment.wasmHash} />
            : <span style={{ fontSize: 11, color: "var(--text-lo)" }}>—</span>}
        </Field>
        <Field label="Deployed version">
          <span className="num" style={{ fontSize: 12, color: "var(--text-hi)" }}>
            {deployment?.version ?? "—"}
          </span>
        </Field>
        <Field label="Source">
          {deployment?.sourceCommit
            ? <ExternalLink href={`${contract.sourceUrl}/tree/${deployment.sourceCommit}`}>{deployment.sourceCommit.slice(0, 10)}</ExternalLink>
            : <ExternalLink href={contract.sourceUrl}>Zenith-options/contracts</ExternalLink>}
        </Field>
        <Field label="Audit">
          {deployment?.auditReportUrl
            ? <ExternalLink href={deployment.auditReportUrl}>Audit report</ExternalLink>
            : <span style={{ fontSize: 11, color: "var(--text-lo)" }}>No published audit</span>}
        </Field>
        <Field label="Explorer">
          {deployment?.contractId
            ? <ExternalLink href={net.contractUrl(deployment.contractId)}>stellar.expert ↗</ExternalLink>
            : <span style={{ fontSize: 11, color: "var(--text-lo)" }}>—</span>}
        </Field>
        <Field label="Upgrade history">
          {deployment ? <UpgradeHistory deployment={deployment} /> : <span style={{ fontSize: 11, color: "var(--text-lo)" }}>—</span>}
        </Field>
      </div>

      <div style={{
        display: "flex", flexWrap: "wrap", gap: "6px 16px", alignItems: "baseline",
        paddingTop: 12, borderTop: "1px solid var(--border-subtle)",
      }}>
        <span style={{ fontSize: 11, color: blocksActions ? STATUS_COLOR[status].fg : "var(--text-mid)", flex: 1, minWidth: 240 }}>
          {detail}
        </span>
        {lastModifiedLedgerSeq !== null && (
          <span className="num" style={{ fontSize: 10, color: "var(--text-lo)" }}>
            entry last modified in ledger {lastModifiedLedgerSeq}
          </span>
        )}
        {blocksActions && status !== "loading" && (
          <span style={{
            fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
            color: "var(--put)", border: "1px solid var(--put-dim)", padding: "2px 6px",
          }}>
            On-chain actions disabled
          </span>
        )}
      </div>
    </div>
  );
}

export default function ContractsPage() {
  const [network, setNetwork] = useState<NetworkId>("testnet");
  const { results, loading, checkedAt, refresh } = useContractVerification(network);

  const mismatches = CONTRACTS.filter(c => results[c.key]?.status === "mismatch");
  const unverified = CONTRACTS.filter(c => results[c.key]?.status === "unverified");
  const verified = CONTRACTS.filter(c => results[c.key]?.status === "verified");
  const notDeployed = CONTRACTS.filter(c => results[c.key]?.status === "not-deployed");
  const deployed = CONTRACTS.length - notDeployed.length;

  const banner =
    mismatches.length > 0
      ? { fg: "var(--put)", bg: "var(--put-dim)", text:
          `${mismatches.length} contract${mismatches.length === 1 ? "" : "s"} did not match the expected release: ` +
          mismatches.map(c => c.name).join(", ") + ". On-chain actions for " +
          (mismatches.length === 1 ? "it is" : "them are") + " disabled. Do not transact until this is resolved." }
      : unverified.length > 0
      ? { fg: "var(--atm)", bg: "var(--atm-dim)", text:
          `Could not verify ${unverified.length} contract${unverified.length === 1 ? "" : "s"} — the RPC did not answer. ` +
          "This is not a pass: on-chain actions remain disabled for them." }
      : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)", overflow: "hidden", fontFamily: "var(--font-sans)" }}>
      <AppHeader />

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 24px 64px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
            <div style={{ minWidth: 280 }}>
              <h1 className="serif" style={{ fontSize: 26, fontWeight: 600, marginBottom: 4 }}>
                Contract Registry
              </h1>
              <p style={{ fontSize: 13, color: "var(--text-mid)", maxWidth: 640, lineHeight: 1.6 }}>
                Every Zenith contract, where it is deployed, and a live check that the code running at
                each address is the release we published. Verification reads the contract instance
                ledger entry over RPC and compares the deployed executable&apos;s WASM hash against
                the hash below.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ExternalLink href="/contracts.json">/contracts.json ↗</ExternalLink>
            </div>
          </div>

          <div style={{ display: "flex", gap: 2, margin: "24px 0 16px", flexWrap: "wrap" }}>
            {NETWORK_IDS.map(id => (
              <button
                key={id}
                type="button"
                onClick={() => setNetwork(id)}
                style={{
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: network === id ? "var(--brand-dim)" : "none",
                  border: "1px solid var(--border-default)",
                  color: network === id ? "var(--text-hi)" : "var(--text-mid)",
                  borderBottom: network === id ? "2px solid var(--brand)" : "2px solid transparent",
                  padding: "6px 14px",
                }}
              >
                {NETWORKS[id].label}
                {!NETWORKS[id].deployed && (
                  <span style={{ marginLeft: 6, fontSize: 9, color: "var(--text-lo)" }}>no deployment</span>
                )}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={refresh}
              style={{
                fontSize: 11, color: "var(--text-mid)", background: "none",
                border: "1px solid var(--border-default)", padding: "5px 12px", cursor: "pointer",
              }}
            >
              {loading ? "Checking…" : "Re-check"}
            </button>
          </div>

          <div style={{
            display: "flex", gap: 0, marginBottom: 16,
            border: "1px solid var(--border-default)", background: "var(--bg-raised)",
            flexWrap: "wrap",
          }}>
            {[
              { label: "Verified", value: verified.length, color: "var(--call)" },
              { label: "Mismatch", value: mismatches.length, color: "var(--put)" },
              { label: "Unverified", value: unverified.length, color: "var(--atm)" },
              { label: "Not deployed", value: notDeployed.length, color: "var(--text-lo)" },
            ].map((s, i) => (
              <div key={s.label} style={{
                flex: 1, minWidth: 120, padding: "12px 16px",
                borderRight: i < 3 ? "1px solid var(--border-default)" : "none",
              }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-lo)", marginBottom: 5 }}>
                  {s.label}
                </div>
                <div className="num" style={{ fontSize: 17, fontWeight: 600, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {banner && (
            <div role="alert" style={{
              border: `1px solid ${banner.fg}`, background: banner.bg, color: banner.fg,
              padding: "12px 16px", fontSize: 12, lineHeight: 1.6, marginBottom: 16, fontWeight: 600,
            }}>
              {banner.text}
            </div>
          )}

          {deployed === 0 && !loading && (
            <div style={{
              border: "1px solid var(--border-subtle)", background: "var(--bg-raised)",
              padding: "20px", fontSize: 12, lineHeight: 1.7, color: "var(--text-mid)", marginBottom: 16,
            }}>
              <p style={{ marginBottom: 10 }}>
                Zenith has no public deployment on {NETWORKS[network].label} yet — the backend this app
                talks to is still a paper-trading API — so there are no contract IDs or expected WASM
                hashes recorded for this network. The registry structure, the live check, and this page
                are all live; they have nothing to compare against yet.
              </p>
              <p>
                To record one, fill in <code style={{ color: "var(--text-hi)" }}>deployments</code> for the
                network in <code style={{ color: "var(--text-hi)" }}>src/lib/soroban/registry.ts</code>.
                An integrator running against their own deployment can override the same shape via the{" "}
                <code style={{ color: "var(--text-hi)" }}>NEXT_PUBLIC_ZENITH_DEPLOYMENTS</code> env var.
              </p>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {CONTRACTS.map(contract => {
              const r = results[contract.key];
              return (
                <ContractCard
                  key={contract.key}
                  contract={contract}
                  network={network}
                  status={r?.status ?? "loading"}
                  deployedWasmHash={r?.deployedWasmHash ?? null}
                  detail={r?.detail ?? "Checking the deployed executable against the registry…"}
                  blocksActions={r?.blocksActions ?? false}
                  lastModifiedLedgerSeq={r?.lastModifiedLedgerSeq ?? null}
                />
              );
            })}
          </div>

          <div style={{
            marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border-subtle)",
            fontSize: 11, lineHeight: 1.8, color: "var(--text-lo)",
          }}>
            <p>
              RPC endpoint: <span className="num" style={{ color: "var(--text-mid)" }}>{rpcUrlFor(network)}</span>
              {" · "}Network passphrase: <span className="num" style={{ color: "var(--text-mid)" }}>{NETWORKS[network].passphrase}</span>
            </p>
            {checkedAt !== null && (
              <p>Last checked {new Date(checkedAt).toLocaleString("en-US")}. Results are a point-in-time reading and are not re-polled.</p>
            )}
            <p>
              This page verifies that the code at each address is the expected release. It does not
              verify a contract&apos;s storage, admin, or source, all of which an authorized call can
              change without altering this hash, and it is not a reproducible-build check.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
