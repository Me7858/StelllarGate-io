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
}
