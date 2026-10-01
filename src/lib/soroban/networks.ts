// Soroban network definitions for the contract registry.
//
// Everything the contracts page needs to know about "where is this deployed
// and how do I look it up" lives here, so adding a network is a single
// entry rather than a set of coordinated edits across the page.
//
// RPC endpoints are overridable through NEXT_PUBLIC_SOROBAN_RPC_<NETWORK>
// so a deployment (or a contributor running against a local node) can point
// the live verification at a different endpoint without touching code.

export type NetworkId = "testnet" | "futurenet" | "mainnet";

export interface SorobanNetwork {
  id: NetworkId;
  label: string;
  /** Network passphrase, as reported by the `getNetwork` RPC method. */
  passphrase: string;
  /** Default public RPC endpoint used when no env override is set. */
  defaultRpcUrl: string;
  /** Stellar Expert permalink for a contract ID on this network. */
  contractUrl: (contractId: string) => string;
  /**
   * True once the protocol is actually deployed here. Mainnet is `false`
   * until that happens — the page says so explicitly rather than rendering
   * an empty table that reads like a broken link.
   */
  deployed: boolean;
}

const EXPLORER = "https://stellar.expert/explorer/public";

function envRpc(network: NetworkId): string | undefined {
  // process.env is inlined at build time by Next.js, so this must be a
  // static property access — a computed key would not be substituted.
  switch (network) {
    case "testnet": return process.env.NEXT_PUBLIC_SOROBAN_RPC_TESTNET;
    case "futurenet": return process.env.NEXT_PUBLIC_SOROBAN_RPC_FUTURENET;
    case "mainnet": return process.env.NEXT_PUBLIC_SOROBAN_RPC_MAINNET;
  }
}

export const NETWORKS: Record<NetworkId, SorobanNetwork> = {
  testnet: {
    id: "testnet",
    label: "Testnet",
    passphrase: "Test SDF Network ; September 2022",
    defaultRpcUrl: "https://soroban-testnet.stellar.org",
    contractUrl: id => `${EXPLORER}/testnet/contract/${id}`,
    deployed: true,
  },
  futurenet: {
    id: "futurenet",
    label: "Futurenet",
    passphrase: "Test SDF Future Network ; October 2022",
    defaultRpcUrl: "https://rpc-futurenet.stellar.luxsor.tech",
    contractUrl: id => `${EXPLORER}/futurenet/contract/${id}`,
    deployed: false,
  },
  mainnet: {
    id: "mainnet",
    label: "Mainnet",
    passphrase: "Public Global Stellar Network ; September 2015",
    defaultRpcUrl: "https://soroban-rpc.mainnet.stellar.gateway.fm",
    contractUrl: id => `${EXPLORER}/mainnet/contract/${id}`,
    deployed: false,
  },
};

export const NETWORK_IDS: NetworkId[] = ["testnet", "futurenet", "mainnet"];

/** The RPC endpoint to use for a network, honouring the env override. */
export function rpcUrlFor(network: NetworkId): string {
  return envRpc(network) || NETWORKS[network].defaultRpcUrl;
}

export function getNetwork(id: NetworkId): SorobanNetwork {
  return NETWORKS[id];
/**
 * networks.ts — Issue #67.
 *
 * Network registry: RPC URLs, network passphrases, and contract IDs for
 * each environment (testnet, mainnet, futurenet, local). Contract IDs are
 * read from environment variables and validated at startup — the app fails
 * loudly if a required ID is missing for the active network.
 */

export type SorobanNetwork = "testnet" | "mainnet" | "futurenet" | "local";

export interface NetworkConfig {
  name: SorobanNetwork;
  /** Human-readable display name */
  displayName: string;
  rpcUrl: string;
  networkPassphrase: string;
  /** Horizon URL for account lookups */
  horizonUrl: string;
  /** Zenith protocol contract IDs, resolved from env vars */
  contracts: ZenithContracts;
}

/**
 * Zenith protocol contract addresses.
 * Each field maps to a NEXT_PUBLIC_CONTRACT_<FIELD>_<NETWORK> env var.
 */
export interface ZenithContracts {
  /** Options market / clearing contract */
  market: string;
  /** Collateral vault contract */
  vault: string;
  /** Oracle price feed contract */
  oracle: string;
}

// ── Default RPC + horizon endpoints ─────────────────────────────────────────

const TESTNET_RPC      = process.env.NEXT_PUBLIC_SOROBAN_RPC_TESTNET   ?? "https://soroban-testnet.stellar.org";
const MAINNET_RPC      = process.env.NEXT_PUBLIC_SOROBAN_RPC_MAINNET   ?? "https://mainnet.sorobanrpc.com";
const FUTURENET_RPC    = process.env.NEXT_PUBLIC_SOROBAN_RPC_FUTURENET ?? "https://rpc-futurenet.stellar.org";
const LOCAL_RPC        = process.env.NEXT_PUBLIC_SOROBAN_RPC_LOCAL     ?? "http://localhost:8000";

// ── Contract ID helpers ──────────────────────────────────────────────────────

function contractId(name: keyof ZenithContracts, network: SorobanNetwork): string {
  const key = `NEXT_PUBLIC_CONTRACT_${name.toUpperCase()}_${network.toUpperCase()}` as keyof NodeJS.ProcessEnv;
  return (process.env[key] as string | undefined) ?? "";
}

function resolveContracts(network: SorobanNetwork): ZenithContracts {
  return {
    market: contractId("market", network),
    vault:  contractId("vault",  network),
    oracle: contractId("oracle", network),
  };
}

// ── Network configurations ───────────────────────────────────────────────────

export const NETWORKS: Record<SorobanNetwork, NetworkConfig> = {
  testnet: {
    name: "testnet",
    displayName: "Stellar Testnet",
    rpcUrl: TESTNET_RPC,
    networkPassphrase: "Test SDF Network ; September 2015",
    horizonUrl: "https://horizon-testnet.stellar.org",
    contracts: resolveContracts("testnet"),
  },
  mainnet: {
    name: "mainnet",
    displayName: "Stellar Mainnet",
    rpcUrl: MAINNET_RPC,
    networkPassphrase: "Public Global Stellar Network ; September 2015",
    horizonUrl: "https://horizon.stellar.org",
    contracts: resolveContracts("mainnet"),
  },
  futurenet: {
    name: "futurenet",
    displayName: "Stellar Futurenet",
    rpcUrl: FUTURENET_RPC,
    networkPassphrase: "Test SDF Future Network ; October 2022",
    horizonUrl: "https://horizon-futurenet.stellar.org",
    contracts: resolveContracts("futurenet"),
  },
  local: {
    name: "local",
    displayName: "Local Standalone",
    rpcUrl: LOCAL_RPC,
    networkPassphrase: "Standalone Network ; February 2017",
    horizonUrl: LOCAL_RPC,
    contracts: resolveContracts("local"),
  },
};

/**
 * Returns the active network from NEXT_PUBLIC_STELLAR_NETWORK env var.
 * Defaults to testnet.
 */
export function getActiveNetwork(): SorobanNetwork {
  const env = process.env.NEXT_PUBLIC_STELLAR_NETWORK as SorobanNetwork | undefined;
  if (env && env in NETWORKS) return env;
  return "testnet";
}

export function getActiveNetworkConfig(): NetworkConfig {
  return NETWORKS[getActiveNetwork()];
}

// ── Startup validation ───────────────────────────────────────────────────────

const REQUIRED_CONTRACT_KEYS: Array<keyof ZenithContracts> = ["market", "vault", "oracle"];

export interface ValidationResult {
  ok: boolean;
  missing: string[];
  network: SorobanNetwork;
}

/**
 * Validates that all required contract IDs are set for the active network.
 * Called at startup; logs a loud warning (dev) or throws (if strict=true).
 */
export function validateContractIds(strict = false): ValidationResult {
  const network = getActiveNetwork();
  const cfg = NETWORKS[network];
  const missing: string[] = [];

  for (const key of REQUIRED_CONTRACT_KEYS) {
    if (!cfg.contracts[key]) {
      missing.push(`NEXT_PUBLIC_CONTRACT_${key.toUpperCase()}_${network.toUpperCase()}`);
    }
  }

  const result: ValidationResult = { ok: missing.length === 0, missing, network };

  if (!result.ok) {
    const msg = `[Soroban] Missing contract IDs for ${network}: ${missing.join(", ")}`;
    if (strict) throw new Error(msg);
    // In dev: warn loudly so the developer sees it immediately.
    if (typeof console !== "undefined") console.warn(msg);
  }

  return result;
}
