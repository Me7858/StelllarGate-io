import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_THRESHOLDS, type UtilizationThresholds } from "../collateral";

interface CollateralSettingsState extends UtilizationThresholds {
  /** Browser notification when utilization crosses into a higher level. */
  notify: boolean;
  setThresholds: (t: Partial<UtilizationThresholds>) => void;
  setNotify: (notify: boolean) => void;
}

const clamp = (v: number) => Math.min(1, Math.max(0.01, v));

// Per-browser preference, so localStorage rather than the backend. Same
// skipHydration + StoreHydrator arrangement as wallet.ts, so the first
// client render matches the server's default-threshold markup.
export const useCollateralSettings = create<CollateralSettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_THRESHOLDS,
      notify: true,
      setThresholds: (t) => {
        const warning = clamp(t.warning ?? get().warning);
        // Critical can never sit below warning, or "warning" would be unreachable.
        const critical = Math.max(warning, clamp(t.critical ?? get().critical));
        set({ warning, critical });
      },
      setNotify: (notify) => set({ notify }),
    }),
    {
      name: "zenith-collateral-settings",
      partialize: (s) => ({ warning: s.warning, critical: s.critical, notify: s.notify }),
      skipHydration: true,
    }
  )
);
