import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_MODE, NETWORKS, isEnvironmentMode, walletNetworkMatches, type EnvironmentMode } from "./networks";

interface EnvironmentState {
  mode: EnvironmentMode;
  /** Low-level setter. UI code must go through EnvironmentProvider's
   *  requestSwitch(), which runs checkModeSwitch() and the mainnet
   *  confirmation first. */
  setMode: (mode: EnvironmentMode) => void;
}

// The selected mode itself is the one piece of environment state that is
// deliberately *not* namespaced — it's what picks the namespace.
export const useEnvironmentStore = create<EnvironmentState>()(
  persist(
    (set) => ({
      mode: DEFAULT_MODE,
      setMode: (mode) => set({ mode }),
    }),
    {
      name: "zenith:mode",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ mode: s.mode }),
      skipHydration: true,
      // A tampered/obsolete persisted value must never leave the app in an
      // undefined mode.
      merge: (persisted, current) => {
        const mode = (persisted as { mode?: unknown } | undefined)?.mode;
        return { ...current, mode: isEnvironmentMode(mode) ? mode : current.mode };
      },
    }
  )
);

/** Non-React accessor, for the API client and persisted-store namespacing. */
export function getCurrentMode(): EnvironmentMode {
  return useEnvironmentStore.getState().mode;
}

export function getCurrentNetwork() {
  return NETWORKS[getCurrentMode()];
}

export type SwitchCheck =
  | { ok: true; needsConfirmation: boolean }
  | { ok: false; reason: string };

/**
 * Whether switching from `from` to `to` is allowed right now. Switching into
 * a real-funds mode always needs explicit confirmation, and is refused
 * outright while a connected wallet is on the wrong network.
 */
export function checkModeSwitch(params: {
  from: EnvironmentMode;
  to: EnvironmentMode;
  walletConnected: boolean;
  walletNetwork: string | null;
}): SwitchCheck {
  const { from, to, walletConnected, walletNetwork } = params;
  if (from === to) return { ok: true, needsConfirmation: false };
  const target = NETWORKS[to];
  if (target.realFunds && walletConnected && !walletNetworkMatches(to, walletNetwork)) {
    return {
      ok: false,
      reason: `Your wallet is on ${walletNetwork ?? "an unknown network"}. Switch Freighter to ${target.requiredWalletNetwork} before entering ${target.label}.`,
    };
  }
  return { ok: true, needsConfirmation: target.realFunds };
}

/**
 * How a `?mode=` deep link should be handled. Links may move you to a
 * non-real-funds mode directly, but never into mainnet: that is always
 * surfaced as a prompt the user has to act on.
 */
export function resolveDeepLinkMode(
  param: string | null,
  current: EnvironmentMode
): { action: "none" } | { action: "switch"; mode: EnvironmentMode } | { action: "prompt"; mode: EnvironmentMode } {
  if (!isEnvironmentMode(param) || param === current) return { action: "none" };
  if (NETWORKS[param].realFunds) return { action: "prompt", mode: param };
  return { action: "switch", mode: param };
}
