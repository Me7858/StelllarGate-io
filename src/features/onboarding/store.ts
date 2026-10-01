import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type TourStatus = "not-started" | "active" | "paused" | "completed" | "skipped";

interface OnboardingState {
  tourStatus: TourStatus;
  /** Index into the tour's steps; persisted so the tour resumes where it stopped. */
  tourStep: number;
  /** Practice mode: confirmations simulate the trade locally instead of sending it. */
  practice: boolean;
  startTour: () => void;
  resumeTour: () => void;
  pauseTour: () => void;
  skipTour: () => void;
  completeTour: () => void;
  goToStep: (step: number) => void;
  setPractice: (on: boolean) => void;
}

// Deliberately *not* namespaced per environment mode (unlike the wallet
// session): tour progress and practice mode describe the person using the
// terminal, not any network's data, so they follow you across modes.
export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      tourStatus: "not-started",
      tourStep: 0,
      practice: false,
      startTour: () => set({ tourStatus: "active", tourStep: 0 }),
      resumeTour: () => set({ tourStatus: "active" }),
      pauseTour: () => set({ tourStatus: "paused" }),
      skipTour: () => set({ tourStatus: "skipped" }),
      completeTour: () => set({ tourStatus: "completed", tourStep: 0 }),
      goToStep: (tourStep) => set({ tourStep: Math.max(0, tourStep) }),
      setPractice: (practice) => set({ practice }),
    }),
    {
      name: "zenith:onboarding",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ tourStatus: s.tourStatus, tourStep: s.tourStep, practice: s.practice }),
      skipHydration: true,
    }
  )
);
