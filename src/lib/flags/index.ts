/**
 * Public API for the feature flags system.
 *
 * Import from here rather than the individual files.
 *
 * Usage:
 *   import { useFlag, FlagGate } from "@/lib/flags";
 *   const enabled = useFlag("soroban_execution");
 */

export { useFlag, useFlags, FlagsProvider } from "./FlagsContext";
export { FlagGate } from "./FlagGate";
export type { FlagName, FlagDefinition } from "./registry";
export { FLAG_REGISTRY, FLAG_NAMES, FLAG_MAP } from "./registry";
export type { RemoteFlagConfig, EvaluationContext } from "./resolve";
export { resolveFlag, resolveAllFlags, parseQueryOverrides } from "./resolve";
