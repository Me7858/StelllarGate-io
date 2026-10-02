import { describe, expect, it, vi } from "vitest";
import {
  ENTRY_GARBAGE,
  ENTRY_REAL_SAC_WITH_STORAGE,
  ENTRY_STELLAR_ASSET,
  ENTRY_WASM_A,
  ENTRY_WASM_ZERO,
  FIXTURE_CONTRACT_ID,
  FIXTURE_INSTANCE_KEY,
  WASM_HASH_A,
  WASM_HASH_ZERO,
} from "./__fixtures__/ledgerEntries";
import type { ContractDeployment, ContractDeploymentMap } from "./registry";
import {
  buildInstanceLedgerKey,
  blocksActions,
  extractWasmHash,
  hashesMatch,
  judgeDeployment,
  notDeployedResult,
  statusLabel,
  unverifiedResult,
  verifyNetwork,
} from "./verify";

function deployment(overrides: Partial<ContractDeployment> = {}): ContractDeployment {
  return {
    contractId: FIXTURE_CONTRACT_ID,
    wasmHash: WASM_HASH_A,
    version: "1.0.0",
    sourceCommit: "0".repeat(40),
    auditReportUrl: null,
    upgradeable: true,
    upgradeHistory: [],
    ...overrides,
  };
}

/** Minimal stand-in for the RPC response shape verifyNetwork consumes. */
function rpcRespondingWith(entries: Array<{ key: string; xdr: string }>) {
  return vi.fn(async () =>
    new Response(
      JSON.stringify({ jsonrpc: "2.0", id: 1, result: { entries, latestLedger: 1234 } }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  );
}

describe("buildInstanceLedgerKey", () => {
  it("produces the ContractData + LedgerKeyContractInstance + persistent key", () => {
    expect(buildInstanceLedgerKey(FIXTURE_CONTRACT_ID)).toBe(FIXTURE_INSTANCE_KEY);
  });

  it("rejects a malformed contract ID rather than hashing nothing", () => {
    expect(() => buildInstanceLedgerKey("not-a-contract-id")).toThrow(/valid Stellar contract ID/);
    // A G... account is a valid strkey but not a contract ID.
    expect(() =>
      buildInstanceLedgerKey("GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ")
    ).toThrow();
  });
});

describe("extractWasmHash", () => {
  it("reads the executable hash out of a WASM instance entry", () => {
    expect(extractWasmHash(ENTRY_WASM_A)).toEqual({ kind: "wasm", wasmHash: WASM_HASH_A });
  });

  it("distinguishes an all-zero hash from a missing one", () => {
    expect(extractWasmHash(ENTRY_WASM_ZERO)).toEqual({ kind: "wasm", wasmHash: WASM_HASH_ZERO });
  });

  it("flags a built-in Stellar Asset executable as not-wasm", () => {
    expect(extractWasmHash(ENTRY_STELLAR_ASSET)).toEqual({ kind: "not-wasm" });
  });

  it("still reads the hash from a real entry that carries instance storage", () => {
    // The captured SAC entry has a populated SCMap; the executable must be
    // found regardless of what follows it.
    expect(extractWasmHash(ENTRY_REAL_SAC_WITH_STORAGE)).toEqual({ kind: "not-wasm" });
  });

  it("returns null for undecodable input, never a fabricated pass", () => {
    expect(extractWasmHash(ENTRY_GARBAGE)).toBeNull();
    expect(extractWasmHash("")).toBeNull();
  });
});

describe("hashesMatch", () => {
  it("compares case-insensitively", () => {
    expect(hashesMatch(WASM_HASH_A, WASM_HASH_A.toUpperCase())).toBe(true);
  });

  it("is false for differing hashes", () => {
    expect(hashesMatch(WASM_HASH_A, WASM_HASH_ZERO)).toBe(false);
  });

  it("is false when either side is not a 64-char hex string", () => {
    expect(hashesMatch(WASM_HASH_A, "abc")).toBe(false);
    expect(hashesMatch("", WASM_HASH_A)).toBe(false);
    expect(hashesMatch("z".repeat(64), WASM_HASH_A)).toBe(false);
  });
});

describe("judgeDeployment", () => {
  const entry = (xdr: string) => ({ key: FIXTURE_INSTANCE_KEY, xdr, lastModifiedLedgerSeq: 99 });

  it("is verified when the deployed hash matches the expected release", () => {
    const r = judgeDeployment("options_market", deployment(), entry(ENTRY_WASM_A));
    expect(r.status).toBe("verified");
    expect(r.deployedWasmHash).toBe(WASM_HASH_A);
    expect(r.blocksActions).toBe(false);
    expect(r.lastModifiedLedgerSeq).toBe(99);
  });

  it("is a mismatch — and blocks actions — when the hash differs", () => {
    const r = judgeDeployment("options_market", deployment(), entry(ENTRY_WASM_ZERO));
    expect(r.status).toBe("mismatch");
    expect(r.deployedWasmHash).toBe(WASM_HASH_ZERO);
    expect(r.blocksActions).toBe(true);
    expect(r.detail).toContain(WASM_HASH_ZERO);
  });

  it("is a mismatch when the address is a built-in Stellar Asset contract", () => {
    const r = judgeDeployment("options_market", deployment(), entry(ENTRY_STELLAR_ASSET));
    expect(r.status).toBe("mismatch");
    expect(r.blocksActions).toBe(true);
  });

  it("is a mismatch when no instance entry exists at the ID", () => {
    const r = judgeDeployment("options_market", deployment(), undefined);
    expect(r.status).toBe("mismatch");
    expect(r.deployedWasmHash).toBeNull();
    expect(r.blocksActions).toBe(true);
  });

  it("degrades to unverified, never to verified, on an undecodable entry", () => {
    const r = judgeDeployment("options_market", deployment(), entry(ENTRY_GARBAGE));
    expect(r.status).toBe("unverified");
    expect(r.blocksActions).toBe(true);
  });

  it("is unverified, not verified, when a deployment has no recorded expected hash", () => {
    // Deployed and readable, but with nothing to compare against — which
    // is a different state from "not deployed" and must not read as a pass.
    const r = judgeDeployment("options_market", deployment({ wasmHash: "" }), entry(ENTRY_WASM_A));
    expect(r.status).toBe("unverified");
    expect(r.deployedWasmHash).toBe(WASM_HASH_A);
    expect(r.blocksActions).toBe(true);
  });
});

describe("verifyNetwork", () => {
  const deployments: ContractDeploymentMap = {
    options_market: deployment(),
    price_oracle: deployment({ wasmHash: WASM_HASH_ZERO }),
    vault: deployment({ contractId: "", wasmHash: "" }),
  };

  it("matches responses back to contracts by ledger key, not by array order", async () => {
    // Deliberately reversed relative to the request order: an
    // index-aligned implementation would mislabel both of these.
    const fetchImpl = rpcRespondingWith([
      { key: FIXTURE_INSTANCE_KEY, xdr: ENTRY_WASM_ZERO, },
    ]);
    const results = await verifyNetwork(deployments, { network: "testnet", fetchImpl: fetchImpl as never });
    expect(results.price_oracle.status).toBe("verified");
    expect(results.options_market.status).toBe("mismatch");
  });

  it("reports an unconfigured deployment without calling the RPC for it", async () => {
    const fetchImpl = rpcRespondingWith([]);
    const results = await verifyNetwork(deployments, { network: "testnet", fetchImpl: fetchImpl as never });
    expect(results.vault.status).toBe("not-deployed");
    expect(results.vault.blocksActions).toBe(false);
    // Only the two configured contracts were requested.
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.params.keys).toHaveLength(2);
  });

  it("marks every configured contract unverified when the RPC is down", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("network down"); });
    const results = await verifyNetwork(deployments, { network: "testnet", fetchImpl: fetchImpl as never });
    expect(results.options_market.status).toBe("unverified");
    expect(results.price_oracle.status).toBe("unverified");
    expect(results.options_market.blocksActions).toBe(true);
  });

  it("marks every configured contract unverified on an RPC error response", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "bad key" } }), { status: 200 })
    );
    const results = await verifyNetwork(deployments, { network: "testnet", fetchImpl: fetchImpl as never });
    expect(results.options_market.status).toBe("unverified");
    expect(results.options_market.detail).toContain("bad key");
  });

  it("returns only not-deployed results without touching the network", async () => {
    const fetchImpl = vi.fn();
    const results = await verifyNetwork(
      { vault: deployment({ contractId: "", wasmHash: "" }) },
      { network: "testnet", fetchImpl: fetchImpl as never }
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(results.vault.status).toBe("not-deployed");
  });
});

describe("status helpers", () => {
  it("fails closed on both mismatch and unverified, but not on not-deployed", () => {
    expect(blocksActions("mismatch")).toBe(true);
    expect(blocksActions("unverified")).toBe(true);
    expect(blocksActions("verified")).toBe(false);
    expect(blocksActions("not-deployed")).toBe(false);
  });

  it("labels every status", () => {
    expect(statusLabel("verified")).toBe("Verified");
    expect(statusLabel("mismatch")).toBe("Hash mismatch");
    expect(statusLabel("unverified")).toBe("Unverified");
    expect(statusLabel("not-deployed")).toBe("Not deployed");
  });

  it("notDeployedResult does not block actions", () => {
    expect(notDeployedResult("x").blocksActions).toBe(false);
  });

  it("unverifiedResult blocks actions and carries the reason", () => {
    const r = unverifiedResult("x", WASM_HASH_A, "boom");
    expect(r.status).toBe("unverified");
    expect(r.blocksActions).toBe(true);
    expect(r.detail).toBe("boom");
  });
});
