"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useHydrated } from "../../lib/useHydrated";
import { getMessages } from "./i18n";
import { useOnboardingStore } from "./store";
import dynamic from "next/dynamic";

// Only loaded while a tour is actually running.
const TourOverlay = dynamic(() => import("./Tour").then(m => m.TourOverlay), { ssr: false });

/**
 * Mounted once in the root layout. Offers the tour on a first visit to the
 * terminal and renders the tour itself whenever it's active — including
 * after a reload or navigation, since progress is persisted.
 */
export function OnboardingRoot() {
  const hydrated = useHydrated();
  const pathname = usePathname();
  const { tourStatus, startTour, skipTour, setPractice } = useOnboardingStore();

  // Persisted progress isn't known until after mount; render nothing before
  // that so SSR and the first client render agree.
  if (!hydrated) return null;
  if (tourStatus === "active") return <TourOverlay />;
  if (tourStatus === "not-started" && pathname === "/options") {
    return <WelcomeCard onStart={(practice) => { setPractice(practice); startTour(); }} onSkip={skipTour} />;
  }
  return null;
}

function WelcomeCard({ onStart, onSkip }: { onStart: (practice: boolean) => void; onSkip: () => void }) {
  const copy = getMessages().tour.welcome;
  const [practice, setPractice] = useState(false);
  return (
    <div className="tour-card" role="dialog" aria-modal="false" aria-labelledby="tour-welcome-title" data-testid="tour-welcome"
      style={{ right: 16, bottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}>
      <h2 id="tour-welcome-title" style={{ fontSize: 15, fontWeight: 700, color: "var(--text-hi)", marginBottom: 8 }}>{copy.title}</h2>
      <p style={{ fontSize: 12, color: "var(--text-mid)", lineHeight: 1.55, marginBottom: 12 }}>{copy.body}</p>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--text-hi)", marginBottom: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={practice} onChange={e => setPractice(e.target.checked)} style={{ width: 16, height: 16 }} />
        {copy.practiceLabel}
      </label>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="tap" onClick={onSkip} style={{
          fontSize: 12, padding: "6px 12px", background: "none", color: "var(--text-mid)", border: "1px solid var(--border-default)", cursor: "pointer",
        }}>{copy.skip}</button>
        <button type="button" className="tap" data-testid="tour-start" onClick={() => onStart(practice)} style={{
          fontSize: 12, fontWeight: 700, padding: "6px 14px", background: "var(--brand)", color: "var(--bg)", border: "none", cursor: "pointer",
        }}>{copy.start}</button>
      </div>
    </div>
  );
}
