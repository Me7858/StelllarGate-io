"use client";

/**
 * <FlagGate flag="soroban_execution">
 *   <SorobanButton />
 * </FlagGate>
 *
 * Renders children only when the flag is enabled.
 * Optionally renders a `fallback` when the flag is off.
 */

import { useFlag } from "./FlagsContext";
import type { FlagName } from "./registry";

interface FlagGateProps {
  flag: FlagName;
  children: React.ReactNode;
  /** Rendered when the flag is off. Defaults to null. */
  fallback?: React.ReactNode;
}

export function FlagGate({ flag, children, fallback = null }: FlagGateProps) {
  const enabled = useFlag(flag);
  return <>{enabled ? children : fallback}</>;
}
