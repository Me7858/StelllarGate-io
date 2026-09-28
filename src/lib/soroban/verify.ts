// Live verification of a contract's deployed WASM against the expected release.
//
// The check is deliberately narrow: it reads the contract *instance*
// ledger entry and compares the executable's WASM hash against the hash
// recorded in the registry. It answers exactly one question — "is the code
// running at this contract ID the release we say it is?" — and is
// deliberately not a reproducible-build check (explicitly out of scope).
//
// How the hash is read (per the getLedgerEntries RPC method):
//
//   A Soroban contract's instance lives in a CONTRACT_DATA ledger entry
//   whose key is the ScVal `LedgerKeyContractInstance` (not a user-chosen
//   symbol) with Persistent durability. Reading it yields a
//   ContractDataEntry whose `val` is an ScContractInstance, and that
//   struct's `executable` is either a WASM hash or — for built-in
//   Stellar Asset contracts — a no-payload STELLAR_ASSET variant with no
//   hash at all.
//
// The important consequence of the narrow framing: this verifies that the
// address holds the expected *code*. It says nothing about a contract's
// storage contents, its admin, or its source, all of which can be changed
// by an authorized call without altering this hash.

import { StrKey, xdr } from "@stellar/stellar-sdk";
import type { ContractDeployment, ContractDeploymentMap } from "./registry";
import { hasContractId, isWasmHash } from "./registry";
import type { NetworkId } from "./networks";
import { rpcUrlFor } from "./networks";

export type VerificationStatus =
  /** Deployed executable hash equals the expected release hash. */
  | "verified"
  /** Deployed executable hash differs from the expected release hash. */
  | "mismatch"
  /** RPC unreachable, timed out, or returned something unparseable. */
  | "unverified"
  /** No contract ID / expected hash configured for this network yet. */
  | "not-deployed"
  /** Check is in flight. */
  | "loading";

export interface ContractVerification {
  contractKey: string;
  status: VerificationStatus;
  /** Hash actually on-chain right now, when it could be read. */
  deployedWasmHash: string | null;
  /** Hash the registry expects, when configured. */
  expectedWasmHash: string | null;
  /** Human-readable explanation, always populated for a non-verified state. */
  detail: string;
  /** Ledger the entry was last modified in, when the RPC reported one. */
  lastModifiedLedgerSeq: number | null;
  /** True when on-chain actions against this contract must be refused. */
  blocksActions: boolean;
}

/**
 * Fail-closed. A contract whose code we could not confirm must not be
 * transacted against: "unverified" is not evidence of safety, it is an
 * absence of evidence, and treating an RPC outage as a green light is
 * exactly how a supply-chain swap gets through during an incident. This
 * never gates *reading* — the page renders either way.
 */
export function blocksActions(status: VerificationStatus): boolean {
  return status === "mismatch" || status === "unverified";
}

const RPC_TIMEOUT_MS = 10_000;
/** getLedgerEntries caps a single request at 200 keys. */
const MAX_KEYS_PER_REQUEST = 200;

/**
 * Build the base64 XDR LedgerKey for a contract's instance entry.
 *
 * Throws if the contract ID is not a valid strkey `C...` address — a
 * malformed ID in the registry is a configuration bug we want surfaced,
 * not silently turned into a hash comparison against nothing.
 */
export function buildInstanceLedgerKey(contractId: string): string {
  let raw: Buffer;
  try {
    raw = Buffer.from(StrKey.decodeContract(contractId));
  } catch {
    throw new Error(`not a valid Stellar contract ID: ${contractId}`);
  }
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new xdr.ScAddressContract(new xdr.ContractId(raw.toString("hex"))),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent,
    })
  ).toXDR("base64");
}

export type ExecutableInfo =
  | { kind: "wasm"; wasmHash: string }
  /** Built-in Stellar Asset contract — real code, but not a WASM release. */
  | { kind: "not-wasm" };

/**
 * Pull the executable's WASM hash out of a base64 XDR contract instance
 * ledger entry, or null if the payload is not a contract instance entry we
 * recognise (which the caller should treat as unverifiable, never as a
 * pass).
 */
export function extractWasmHash(entryXdr: string): ExecutableInfo | null {
  let entry;
  try {
    entry = xdr.LedgerEntryData.fromXDR(entryXdr, "base64");
  } catch {
    return null;
  }
  if (entry.contractData === undefined) return null;

  try {
    const executable = entry.contractData.val.instance.executable;
    if (executable.type === "contractExecutableWasm") {
      return { kind: "wasm", wasmHash: Buffer.from(executable.wasmHash).toString("hex") };
    }
    return { kind: "not-wasm" };
  } catch {
    return null;
  }
}

/** Case-insensitive hex comparison; false if either side is malformed. */
export function hashesMatch(expected: string, actual: string): boolean {
  if (!isWasmHash(expected) || !isWasmHash(actual)) return false;
  return expected.toLowerCase() === actual.toLowerCase();
}

interface RpcEntry {
  key: string;
  xdr: string;
  lastModifiedLedgerSeq?: number;
}

async function rpcGetLedgerEntries(
  rpcUrl: string,
  keys: string[],
  signal?: AbortSignal
): Promise<{ entries: RpcEntry[]; latestLedger: number | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getLedgerEntries",
        params: { keys },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`RPC responded ${res.status}`);
    const body = await res.json();
    if (body?.error) throw new Error(body.error.message ?? "RPC error");
    return { entries: body?.result?.entries ?? [], latestLedger: body?.result?.latestLedger ?? null };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Pure comparison of one contract's deployed executable against its expectation. */
export function judgeDeployment(
  contractKey: string,
  deployment: ContractDeployment,
  entry: RpcEntry | undefined
): ContractVerification {
  const expected = deployment.wasmHash || null;
  const base = { contractKey, expectedWasmHash: expected };

  if (!entry) {
    // The instance entry is absent: either the ID is not a contract on this
    // network, or the entry has been archived out of the RPC's retention
    // window. Either way there is no code of ours running there.
    return {
      ...base,
      status: "mismatch",
      deployedWasmHash: null,
      lastModifiedLedgerSeq: null,
      blocksActions: true,
      detail:
        "No contract instance entry found at this ID on this network. The address is either not a deployed contract, or its entry is outside the RPC's retention window.",
    };
  }

  const executable = extractWasmHash(entry.xdr);
  if (!executable) {
    return {
      ...base,
      status: "unverified",
      deployedWasmHash: null,
      lastModifiedLedgerSeq: entry.lastModifiedLedgerSeq ?? null,
      blocksActions: true,
      detail: "Ledger entry could not be decoded as a contract instance. Treating as unverified.",
    };
  }
  if (executable.kind === "not-wasm") {
    return {
      ...base,
      status: "mismatch",
      deployedWasmHash: null,
      lastModifiedLedgerSeq: entry.lastModifiedLedgerSeq ?? null,
      blocksActions: true,
      detail:
        "This ID is a built-in Stellar Asset contract, not a Zenith WASM contract. Do not transact against it.",
    };
  }

  if (!expected) {
    // We found the contract and read its code, but have nothing to compare
    // it against. That is not a pass.
    return {
      ...base,
      status: "unverified",
      deployedWasmHash: executable.wasmHash,
      lastModifiedLedgerSeq: entry.lastModifiedLedgerSeq ?? null,
      blocksActions: true,
      detail:
        "Read the deployed executable, but no expected WASM hash is recorded for this deployment, so it cannot be confirmed.",
    };
  }

  const ok = hashesMatch(expected, executable.wasmHash);
  return {
    ...base,
    status: ok ? "verified" : "mismatch",
    deployedWasmHash: executable.wasmHash,
    lastModifiedLedgerSeq: entry.lastModifiedLedgerSeq ?? null,
    blocksActions: !ok,
    detail: ok
      ? "Deployed executable matches the expected release."
      : `Deployed executable is ${executable.wasmHash}, which is not the expected release hash.`,
  };
}

/** Placeholder result for a network with no deployment recorded. */
export function notDeployedResult(contractKey: string): ContractVerification {
  return {
    contractKey,
    status: "not-deployed",
    deployedWasmHash: null,
    expectedWasmHash: null,
    detail: "No contract ID or expected WASM hash is recorded for this network yet.",
    lastModifiedLedgerSeq: null,
    blocksActions: false,
  };
}

/** Placeholder result for when the RPC could not be reached at all. */
export function unverifiedResult(contractKey: string, expected: string | null, reason: string): ContractVerification {
  return {
    contractKey,
    status: "unverified",
    deployedWasmHash: null,
    expectedWasmHash: expected,
    detail: reason,
    lastModifiedLedgerSeq: null,
    blocksActions: true,
  };
}

export interface VerifyNetworkOptions {
  network: NetworkId;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  rpcUrl?: string;
  signal?: AbortSignal;
}

/**
 * Verify every configured contract on a network.
 *
 * Batched into a single `getLedgerEntries` call (the method accepts up to
 * 200 keys) so the page costs one round trip, not one per contract. An
 * RPC failure degrades every contract to `unverified` — never to
 * `verified` — so a flaky endpoint can look broken but can never look safe.
 */
export async function verifyNetwork(
  deployments: ContractDeploymentMap,
  { network, rpcUrl, signal }: VerifyNetworkOptions
): Promise<Record<string, ContractVerification>> {
  const keys = Object.keys(deployments);
  const results: Record<string, ContractVerification> = {};

  const configured = keys.filter(k => hasContractId(deployments[k]));
  for (const key of keys) {
    if (!hasContractId(deployments[key])) results[key] = notDeployedResult(key);
  }
  if (configured.length === 0) return results;

  const url = rpcUrl ?? rpcUrlFor(network);

  try {
    for (let i = 0; i < configured.length; i += MAX_KEYS_PER_REQUEST) {
      const batch = configured.slice(i, i + MAX_KEYS_PER_REQUEST);
      const ledgerKeys = batch.map(k => buildInstanceLedgerKey(deployments[k].contractId));
      const { entries } = await rpcGetLedgerEntries(url, ledgerKeys, signal);

      // The response does not echo our ordering, so match on the key we
      // asked with rather than assuming index alignment.
      const byKey = new Map(entries.map(e => [e.key, e]));
      batch.forEach((key, idx) => {
        results[key] = judgeDeployment(key, deployments[key], byKey.get(ledgerKeys[idx]));
      });
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    for (const key of configured) {
      results[key] = unverifiedResult(key, deployments[key].wasmHash || null, `RPC unavailable: ${reason}`);
    }
  }

  return results;
}

/** Human-readable label for a status, used by the page. */
export function statusLabel(status: VerificationStatus): string {
  switch (status) {
    case "verified": return "Verified";
    case "mismatch": return "Hash mismatch";
    case "unverified": return "Unverified";
    case "not-deployed": return "Not deployed";
    case "loading": return "Checking…";
  }
}
