/**
 * Flag registry — the single source of truth for every feature flag.
 *
 * HOW TO ADD A FLAG
 * -----------------
 * 1. Add an entry to FLAG_REGISTRY below.
 * 2. Set `defaultValue: false` for anything that shouldn't ship live yet.
 * 3. Set `networks` and/or `allowlist` for targeted roll-outs.
 * 4. Use `useFlag("your_flag")` in any component, or wrap an entire
 *    subtree with `<FlagGate flag="your_flag">`.
 *
 * RESOLUTION ORDER (highest → lowest priority)
 * --------------------------------------------
 * 1. Dev-only query override  (?flags=soroban_execution:1,vaults:0)
 *    — disabled entirely in production builds.
 * 2. Environment variable     (NEXT_PUBLIC_FLAG_<NAME>=1)
 * 3. Remote JSON config       (fetched at runtime, short revalidate)
 * 4. Registry default         (this file)
 *
 * TARGETING
 * ---------
 * `networks`  — only activate when wallet.network matches one of these strings.
 *               Leave undefined to match all networks.
 * `allowlist`  — only activate for wallets in this list.
 *               Leave undefined to match all wallets.
 */

export type FlagName =
  | "soroban_execution"
  | "governance"
  | "vaults"
  | "new_order_types"
  | "portfolio_scenarios"
  | "advanced_analytics";

export interface FlagDefinition {
  /** Stable identifier — must match the FlagName union. */
  name: FlagName;
  /** Human-readable description shown in the dev panel. */
  description: string;
  /** Team / person responsible for this flag. */
  owner: string;
  /** Safe default when nothing else overrides it. */
  defaultValue: boolean;
  /**
   * If set, the flag is only active when the connected wallet's network
   * matches one of these strings (e.g. "TESTNET", "MAINNET").
   * Case-insensitive comparison.
   */
  networks?: string[];
  /**
   * If set, the flag is only active for wallets in this list.
   * Stellar G-addresses. Exact string match.
   */
  allowlist?: string[];
}

export const FLAG_REGISTRY: FlagDefinition[] = [
  {
    name: "soroban_execution",
    description: "Enable on-chain Soroban transaction signing and submission.",
    owner: "protocol",
    defaultValue: false,
    networks: ["TESTNET"],
  },
  {
    name: "governance",
    description: "Show governance voting UI and proposal creation.",
    owner: "protocol",
    defaultValue: false,
  },
  {
    name: "vaults",
    description: "Yield vault deposits and strategy automation.",
    owner: "vaults",
    defaultValue: false,
  },
  {
    name: "new_order_types",
    description: "Limit orders and stop-loss wrapping for options.",
    owner: "trading",
    defaultValue: false,
    networks: ["TESTNET"],
  },
  {
    name: "portfolio_scenarios",
    description: "Multi-scenario stress testing grid in the portfolio view.",
    owner: "risk",
    defaultValue: false,
  },
  {
    name: "advanced_analytics",
    description: "Greeks surface, vol cone, and historical analytics panel.",
    owner: "analytics",
    defaultValue: true,
  },
];

/** Quick lookup map. */
export const FLAG_MAP = Object.fromEntries(
  FLAG_REGISTRY.map(f => [f.name, f]),
) as Record<FlagName, FlagDefinition>;

/** All flag names as a typed array. */
export const FLAG_NAMES = FLAG_REGISTRY.map(f => f.name) as FlagName[];
