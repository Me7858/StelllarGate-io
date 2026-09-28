// Machine-readable mirror of the contract registry.
//
// Same source of truth as the /contracts page, so an integrator can diff
// what this app claims against what they observe on-chain without scraping
// the UI. Static per build (the deployed IDs and expected hashes are
// compile-time data) — the *live* hash reading is a per-request thing and
// deliberately not baked in here; point `getLedgerEntries` at the contract
// instance key to obtain it independently, which is the whole point.

import { NextResponse } from "next/server";
import { NETWORKS, NETWORK_IDS } from "../../lib/soroban/networks";
import { CONTRACTS, deploymentsFor } from "../../lib/soroban/registry";

export const dynamic = "force-static";

export async function GET() {
  const networks = Object.fromEntries(
    NETWORK_IDS.map(id => [
      id,
      {
        label: NETWORKS[id].label,
        passphrase: NETWORKS[id].passphrase,
        rpcUrl: NETWORKS[id].defaultRpcUrl,
        explorer: NETWORKS[id].contractUrl("{contractId}").replace("{contractId}", ""),
        deployed: NETWORKS[id].deployed,
        contracts: Object.fromEntries(
          CONTRACTS.map(contract => {
            const d = deploymentsFor(id)[contract.key];
            return [
              contract.key,
              d
                ? {
                    contractId: d.contractId,
                    wasmHash: d.wasmHash,
                    version: d.version,
                    sourceCommit: d.sourceCommit,
                    auditReportUrl: d.auditReportUrl,
                    upgradeable: d.upgradeable,
                    upgradeHistory: d.upgradeHistory,
                    sourceUrl: contract.sourceUrl,
                    explorerUrl: NETWORKS[id].contractUrl(d.contractId),
                  }
                : null,
            ];
          })
        ),
      },
    ])
  );

  return NextResponse.json(
    {
      schema: "zenith.contract-registry/1",
      generatedAt: new Date().toISOString(),
      verification: {
        method: "getLedgerEntries",
        description:
          "Reads each contract's instance ledger entry (ContractData, ScVal::LedgerKeyContractInstance, persistent durability) and compares the instance's executable WASM hash against the wasmHash above. An instance whose executable is the built-in Stellar Asset variant has no WASM hash and is not a Zenith contract.",
        expectedOutcome: ["verified", "mismatch", "unverified"],
      },
      networks,
    },
    { headers: { "access-control-allow-origin": "*" } }
  );
}
