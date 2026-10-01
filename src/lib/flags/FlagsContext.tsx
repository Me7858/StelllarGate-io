"use client";

/**
 * FlagsContext — provides resolved flag values to the entire client tree.
 *
 * The provider is mounted once in layout.tsx. It receives the initial
 * resolved values from the server (via props) so the first render is
 * flicker-free, then re-evaluates on the client when the wallet connects
 * or query overrides change.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { resolveAllFlags, parseQueryOverrides } from "./resolve";
import { FLAG_NAMES } from "./registry";
import type { FlagName } from "./registry";
import type { RemoteFlagConfig } from "./resolve";
import { useWalletStore } from "../store/wallet";
import { useHydrated } from "../useHydrated";

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface FlagsContextValue {
  flags: Record<FlagName, boolean>;
  /** Force a local override for dev panel use. Noop in production. */
  setLocalOverride: (name: FlagName, value: boolean | null) => void;
  /** All current local overrides (dev only). */
  localOverrides: Partial<Record<FlagName, boolean>>;
  /** Latest remote config (for display in dev panel). */
  remoteConfig: RemoteFlagConfig | null;
  /** Re-fetch remote config on demand. */
  refetch: () => void;
}

const FlagsContext = createContext<FlagsContextValue>({
  flags: Object.fromEntries(FLAG_NAMES.map(n => [n, false])) as Record<FlagName, boolean>,
  setLocalOverride: () => {},
  localOverrides: {},
  remoteConfig: null,
  refetch: () => {},
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const IS_DEV = process.env.NODE_ENV !== "production";

interface FlagsProviderProps {
  children: React.ReactNode;
  /** Initial values resolved server-side. Prevents first-render flicker. */
  initialFlags: Record<FlagName, boolean>;
  /** Remote config passed down from the server component. */
  initialRemoteConfig: RemoteFlagConfig | null;
}

export function FlagsProvider({
  children,
  initialFlags,
  initialRemoteConfig,
}: FlagsProviderProps) {
  const hydrated = useHydrated();
  const walletAddress = useWalletStore(s => s.address);
  const network = useWalletStore(s => s.network);

  const [remoteConfig, setRemoteConfig] = useState<RemoteFlagConfig | null>(initialRemoteConfig);
  const [localOverrides, setLocalOverrides] = useState<Partial<Record<FlagName, boolean>>>({});
  const [queryOverrides, setQueryOverrides] = useState<Partial<Record<FlagName, boolean>>>({});

  // Parse ?flags= from the URL on the client (dev only)
  useEffect(() => {
    if (!IS_DEV || !hydrated) return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("flags");
    if (raw) setQueryOverrides(parseQueryOverrides(raw));
  }, [hydrated]);

  // Re-fetch remote config periodically (every 60 s)
  const fetchRemote = useCallback(async () => {
    try {
      const res = await fetch("/api/flags", { next: { revalidate: 60 } } as RequestInit);
      if (res.ok) {
        const data: RemoteFlagConfig = await res.json();
        setRemoteConfig(data);
      }
    } catch {
      // Remote unreachable — keep current config (or null on first load)
    }
  }, []);

  // Only start polling after hydration to avoid SSR mismatch
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!hydrated) return;
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchRemote();
    }
    const id = setInterval(fetchRemote, 60_000);
    return () => clearInterval(id);
  }, [hydrated, fetchRemote]);

  // Merge local overrides (dev only) into query overrides
  const mergedQueryOverrides = useMemo(
    () => (IS_DEV ? { ...queryOverrides, ...localOverrides } : queryOverrides),
    [queryOverrides, localOverrides],
  );

  // Re-resolve on every relevant change
  const flags = useMemo<Record<FlagName, boolean>>(() => {
    if (!hydrated) return initialFlags;
    return resolveAllFlags({
      walletAddress,
      network,
      remoteConfig,
      queryOverrides: mergedQueryOverrides,
      allowQueryOverride: IS_DEV,
    });
  }, [hydrated, walletAddress, network, remoteConfig, mergedQueryOverrides, initialFlags]);

  const setLocalOverride = useCallback((name: FlagName, value: boolean | null) => {
    if (!IS_DEV) return;
    setLocalOverrides(prev => {
      const next = { ...prev };
      if (value === null) delete next[name];
      else next[name] = value;
      return next;
    });
  }, []);

  const value = useMemo<FlagsContextValue>(() => ({
    flags,
    setLocalOverride,
    localOverrides,
    remoteConfig,
    refetch: fetchRemote,
  }), [flags, setLocalOverride, localOverrides, remoteConfig, fetchRemote]);

  return (
    <FlagsContext.Provider value={value}>
      {children}
    </FlagsContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns the resolved boolean value for a single flag. SSR-safe. */
export function useFlag(name: FlagName): boolean {
  const { flags } = useContext(FlagsContext);
  return flags[name] ?? false;
}

/** Returns the full resolved flags map. */
export function useFlags(): Record<FlagName, boolean> {
  return useContext(FlagsContext).flags;
}

/** Internal: exposes the full context (used by the dev panel). */
export function useFlagsContext(): FlagsContextValue {
  return useContext(FlagsContext);
}
