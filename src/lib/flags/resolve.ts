/**
 * Flag resolution engine.
 *
 * Implements the priority chain:
 *   query override  >  env var  >  remote config  >  registry default
 *
 * All functions are pure and synchronous so they can run on both the
 * server (SSR) and the client without flicker.
 */

import { FLAG_MAP, FLAG_NAMES } from "./registry";
import type { FlagName, FlagDefinition } from "./registry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of the remote JSON config endpoint. */
export interface RemoteFlagConfig {
  /** Map of flag name → boolean override. Unknown names are ignored. */
  flags: Partial<Record<FlagName, boolean>>;
  /**
   * Per-flag allowlists supplied by the remote config so they can be
   * updated without a redeploy.
   */
  allowlists?: Partial<Record<FlagName, string[]>>;
}

export interface EvaluationContext {
  /** Connected wallet address, if any. Used for allowlist targeting. */
  walletAddress?: string | null;
  /** Network string from the wallet (e.g. "TESTNET", "MAINNET"). */
  network?: string | null;
  /** Remote config fetched at runtime. null = unreachable (use defaults). */
  remoteConfig?: RemoteFlagConfig | null;
  /**
   * Query-string overrides, parsed from ?flags=name:1,name2:0.
   * Only applied when allowQueryOverride is true.
   */
  queryOverrides?: Partial<Record<FlagName, boolean>>;
  /**
   * Only true in development mode — production builds must never honour
   * query overrides.
   */
  allowQueryOverride?: boolean;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Evaluate a single flag against the full resolution chain.
 * Returns the resolved boolean value.
 */
export function resolveFlag(
  name: FlagName,
  ctx: EvaluationContext = {},
): boolean {
  const def: FlagDefinition = FLAG_MAP[name];

  // 1. Dev-only query override
  if (ctx.allowQueryOverride && ctx.queryOverrides?.[name] !== undefined) {
    return applyTargeting(ctx.queryOverrides[name]!, def, ctx);
  }

  // 2. Environment variable: NEXT_PUBLIC_FLAG_<UPPER_NAME>
  const envKey = `NEXT_PUBLIC_FLAG_${name.toUpperCase()}`;
  const envVal = typeof process !== "undefined" ? process.env[envKey] : undefined;
  if (envVal !== undefined) {
    return applyTargeting(envVal === "1" || envVal === "true", def, ctx);
  }

  // 3. Remote config
  if (ctx.remoteConfig?.flags?.[name] !== undefined) {
    const remoteValue = ctx.remoteConfig.flags[name]!;
    // Remote config may also supply allowlists
    const remoteDef: FlagDefinition = {
      ...def,
      allowlist: ctx.remoteConfig.allowlists?.[name] ?? def.allowlist,
    };
    return applyTargeting(remoteValue, remoteDef, ctx);
  }

  // 4. Registry default
  return applyTargeting(def.defaultValue, def, ctx);
}

/**
 * Evaluate all registered flags at once.
 */
export function resolveAllFlags(
  ctx: EvaluationContext = {},
): Record<FlagName, boolean> {
  return Object.fromEntries(
    FLAG_NAMES.map(name => [name, resolveFlag(name, ctx)]),
  ) as Record<FlagName, boolean>;
}

// ---------------------------------------------------------------------------
// Targeting
// ---------------------------------------------------------------------------

/**
 * Apply network + allowlist targeting on top of an already-resolved value.
 * If the wallet/network doesn't match the targeting rules the flag is forced
 * to false regardless of the resolved value.
 */
function applyTargeting(
  value: boolean,
  def: FlagDefinition,
  ctx: EvaluationContext,
): boolean {
  if (!value) return false; // already off — no need to check targeting

  // Network targeting
  if (def.networks && def.networks.length > 0) {
    const network = ctx.network?.toUpperCase() ?? "";
    const matches = def.networks.some(n => n.toUpperCase() === network);
    if (!matches) return false;
  }

  // Allowlist targeting
  if (def.allowlist && def.allowlist.length > 0) {
    const addr = ctx.walletAddress ?? "";
    if (!def.allowlist.includes(addr)) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Query-string parser
// ---------------------------------------------------------------------------

/**
 * Parse ?flags=name1:1,name2:0 into a partial flag map.
 * Unknown flag names are silently ignored.
 *
 * @param raw  The raw value of the `flags` query parameter.
 */
export function parseQueryOverrides(
  raw: string | null | undefined,
): Partial<Record<FlagName, boolean>> {
  if (!raw) return {};
  const result: Partial<Record<FlagName, boolean>> = {};
  for (const part of raw.split(",")) {
    const [key, val] = part.split(":");
    if (!key || val === undefined) continue;
    const name = key.trim() as FlagName;
    if (FLAG_MAP[name]) {
      result[name] = val.trim() === "1" || val.trim() === "true";
    }
  }
  return result;
}
