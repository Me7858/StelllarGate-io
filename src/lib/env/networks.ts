// Typed registry of the environments the terminal can run against. Every
// piece of per-network configuration (API base URL, Soroban RPC, network
// passphrase, contract IDs, visual treatment) lives here so there is exactly
// one place that decides "which backend/network does this mode talk to".

export type EnvironmentMode = "paper" | "testnet" | "mainnet";

export const ENVIRONMENT_MODES: EnvironmentMode[] = ["paper", "testnet", "mainnet"];

/** What Freighter reports from getNetworkDetails().network for each Stellar network. */
export type FreighterNetwork = "TESTNET" | "PUBLIC";

export interface ContractIds {
  optionsVault: string | null;
  oracle: string | null;
}

export interface NetworkConfig {
  mode: EnvironmentMode;
  label: string;
  shortLabel: string;
  /** Prefixed onto document.title so a tab is identifiable at a glance. */
  titlePrefix: string;
  /** Backend base URL. null means no backend is configured for this mode —
   *  API calls fail loudly instead of silently falling back to another
   *  mode's backend (which would mix data across modes). */
  apiUrl: string | null;
  sorobanRpcUrl: string | null;
  networkPassphrase: string | null;
  /** Network the connected Freighter wallet must be on to trade. null = any
   *  (paper trading only uses the wallet to sign in, never to transact). */
  requiredWalletNetwork: FreighterNetwork | null;
  contracts: ContractIds;
  /** True when trades in this mode move real value. */
  realFunds: boolean;
  color: string;
  colorDim: string;
  description: string;
}

const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
const MAINNET_PASSPHRASE = "Public Global Stellar Network ; September 2015";

const env = (v: string | undefined): string | null => (v && v.trim() ? v.trim() : null);

// NEXT_PUBLIC_* vars must be referenced literally for Next to inline them
// into the client bundle — no dynamic process.env[name] lookups.
export const NETWORKS: Record<EnvironmentMode, NetworkConfig> = {
  paper: {
    mode: "paper",
    label: "Paper Trading",
    shortLabel: "Paper",
    titlePrefix: "[PAPER]",
    apiUrl: env(process.env.NEXT_PUBLIC_API_URL) ?? "http://localhost:8081",
    sorobanRpcUrl: null,
    networkPassphrase: null,
    requiredWalletNetwork: null,
    contracts: { optionsVault: null, oracle: null },
    realFunds: false,
    color: "#8FA3B8",
    colorDim: "rgba(143,163,184,0.14)",
    description: "Simulated fills against the paper-trading backend. No on-chain transactions.",
  },
  testnet: {
    mode: "testnet",
    label: "Soroban Testnet",
    shortLabel: "Testnet",
    titlePrefix: "[TESTNET]",
    apiUrl: env(process.env.NEXT_PUBLIC_TESTNET_API_URL),
    sorobanRpcUrl: env(process.env.NEXT_PUBLIC_TESTNET_RPC_URL) ?? "https://soroban-testnet.stellar.org",
    networkPassphrase: TESTNET_PASSPHRASE,
    requiredWalletNetwork: "TESTNET",
    contracts: {
      optionsVault: env(process.env.NEXT_PUBLIC_TESTNET_VAULT_CONTRACT_ID),
      oracle: env(process.env.NEXT_PUBLIC_TESTNET_ORACLE_CONTRACT_ID),
    },
    realFunds: false,
    color: "#E0A526",
    colorDim: "rgba(224,165,38,0.16)",
    description: "Stellar test network. Test tokens only, with no real value.",
  },
  mainnet: {
    mode: "mainnet",
    label: "Soroban Mainnet",
    shortLabel: "Mainnet",
    titlePrefix: "[MAINNET]",
    apiUrl: env(process.env.NEXT_PUBLIC_MAINNET_API_URL),
    sorobanRpcUrl: env(process.env.NEXT_PUBLIC_MAINNET_RPC_URL),
    networkPassphrase: MAINNET_PASSPHRASE,
    requiredWalletNetwork: "PUBLIC",
    contracts: {
      optionsVault: env(process.env.NEXT_PUBLIC_MAINNET_VAULT_CONTRACT_ID),
      oracle: env(process.env.NEXT_PUBLIC_MAINNET_ORACLE_CONTRACT_ID),
    },
    realFunds: true,
    color: "#E5484D",
    colorDim: "rgba(229,72,77,0.16)",
    description: "Stellar public network. Trades move real funds.",
  },
};

export const DEFAULT_MODE: EnvironmentMode = "paper";

export function isEnvironmentMode(v: unknown): v is EnvironmentMode {
  return typeof v === "string" && (ENVIRONMENT_MODES as string[]).includes(v);
}

/**
 * Whether a connected wallet's network is acceptable for trading in `mode`.
 * An unknown wallet network (null — e.g. Freighter didn't report one) is
 * treated as a mismatch for modes that require a specific network: when
 * real value could be at stake, "can't tell" must mean "don't trade".
 */
export function walletNetworkMatches(mode: EnvironmentMode, walletNetwork: string | null): boolean {
  const required = NETWORKS[mode].requiredWalletNetwork;
  if (!required) return true;
  return walletNetwork === required;
}
