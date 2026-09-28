// The contract registry: every Zenith contract, and where it lives.
//
// This file is the single source of truth the contracts page renders, and
// the same data backs the machine-readable /contracts.json route — so an
// integrator can diff what this app claims against what they see on-chain
// without scraping the UI.
//
// Deployment coordinates (contract ID + expected WASM hash) are, as of
// this writing, **not populated**: the protocol has no public deployment
// yet and the backend is still a paper-trading API. Rather than ship
// plausible-looking placeholder IDs — which for a page whose entire job is
// "is this the genuine contract?" would be actively harmful — an
// unconfigured deployment is reported as `not-deployed` and clearly
// labelled as such.
//
// To record a real deployment, fill in the `deployments` block for the
// network. Nothing else needs to change: the page, the JSON route and the
// live hash check all read from here.
//
// `NEXT_PUBLIC_ZENITH_DEPLOYMENTS` accepts a JSON object of the same shape
// as a per-network deployments map, which is how a fork (or a local
// network) can point the page at its own contracts without editing this
// file:
//
//   {"testnet":{"options_market":{"contractId":"C...","wasmHash":"..."}}}
//
// NOTE: an env override is a *deployment* fact, not a trust anchor. It
// changes what the page checks against; it does not make the contract
// genuine. Auditors and integrators should read the committed values.

import type { NetworkId } from "./networks";

export interface ContractUpgrade {
  version: string;
  wasmHash: string;
  /** ISO-8601 date the upgrade was applied, when known. */
  deployedAt: string | null;
  note?: string;
}

export interface ContractDeployment {
  /** Stellar contract ID ("C..."), or "" when unconfigured. */
  contractId: string;
  /**
   * Expected SHA-256 of the deployed WASM, 64 lowercase hex characters.
   * This is the value the live check compares the on-chain executable
   * against; it must be the hash of the exact release that was audited.
   */
  wasmHash: string;
  version: string;
  /** Commit in Zenith-options/contracts that the deployed wasm was built from. */
  sourceCommit: string;
  /** Audit report covering `wasmHash`, if one has been published. */
  auditReportUrl: string | null;
  /** Whether `upgrade(new_wasm_hash)` is exposed on this contract. */
  upgradeable: boolean;
  /** Older releases, newest last. Empty until the first upgrade. */
  upgradeHistory: ContractUpgrade[];
}

export type Deployments = Partial<Record<NetworkId, ContractDeployment>>;

/**
 * Deployments for one network, keyed by contract key (not by network) —
 * this is the shape the verification pass iterates over, so the two
 * deliberately do not share a type.
 */
export type ContractDeploymentMap = Partial<Record<string, ContractDeployment>>;

export interface ContractRegistryEntry {
  /** Stable identifier, matches the crate name in Zenith-options/contracts. */
  key: string;
  name: string;
  description: string;
  sourceUrl: string;
  deployments: Deployments;
}

const CONTRACTS_SOURCE = "https://github.com/Zenith-options/contracts/tree/main";

export const CONTRACTS: ContractRegistryEntry[] = [
  {
    key: "options_market",
    name: "Options Market",
    description:
      "European-style put/call options on XLM, BTC, ETH and SOL. Premium is set by the admin, writers lock collateral, buyers pay premium, settlement happens at expiry against an oracle-reported price.",
    sourceUrl: `${CONTRACTS_SOURCE}/options_market`,
    deployments: {},
  },
  {
    key: "price_oracle",
    name: "Price Oracle",
    description:
      "Admin-authorized feeders report per-symbol prices, aggregated as a median across whatever is still fresh and gated by a minimum quorum of fresh reports so no single feeder can set the aggregate alone.",
    sourceUrl: `${CONTRACTS_SOURCE}/price_oracle`,
    deployments: {},
  },
  {
    key: "vault",
    name: "Vault",
    description:
      "Per-tag escrow ledger for a single token. deposit/withdraw are scoped to a caller-defined tag, so a withdrawal can never draw down more than was specifically deposited under that tag.",
    sourceUrl: `${CONTRACTS_SOURCE}/vault`,
    deployments: {},
  },
  {
    key: "multisig",
    name: "Multisig",
    description:
      "M-of-N approval tracking for opaque, caller-defined actions. is_approved(action_id) flips true once enough signers approve; the action id itself is never interpreted, only counted.",
    sourceUrl: `${CONTRACTS_SOURCE}/multisig`,
    deployments: {},
  },
];

function parseOverride(raw: string | undefined): Record<string, Deployments> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // A malformed override should degrade to "no override", not take the
    // page down — this is a build-time env var, not user input, but the
    // page must still render if someone fat-fingers it.
  }
  return {};
}

/** Deployments for a network, keyed by contract key, with the env override applied. */
export function deploymentsFor(network: NetworkId): ContractDeploymentMap {
  const override = parseOverride(process.env.NEXT_PUBLIC_ZENITH_DEPLOYMENTS)[network];
  const base: ContractDeploymentMap = {};
  for (const contract of CONTRACTS) {
    const d = contract.deployments[network];
    if (d) base[contract.key] = d;
  }
  return { ...base, ...(override ?? {}) };
}

/** The deployment of one contract on one network, or undefined if unconfigured. */
export function deploymentFor(network: NetworkId, contractKey: string): ContractDeployment | undefined {
  return deploymentsFor(network)[contractKey];
}

/**
 * Whether we know where this contract lives, independently of whether we
 * know what should be running there. A deployment with an ID but no
 * recorded expected hash is a real deployment we cannot confirm — which is
 * a different thing from "not deployed", and is reported as such.
 */
export function hasContractId(deployment: ContractDeployment | undefined): boolean {
  return Boolean(deployment && deployment.contractId);
}

/** A 64-char lowercase hex string. */
export function isWasmHash(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}
