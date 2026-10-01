"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getMessages } from "./i18n";
import { useOnboardingStore } from "./store";
import { useHydrated } from "../../lib/useHydrated";

/** Header "?" menu: start/resume/restart the tour, toggle practice mode. */
export function HelpMenu() {
  const copy = getMessages().tour.help;
  const hydrated = useHydrated();
  const { tourStatus, practice, startTour, resumeTour, setPractice } = useOnboardingStore();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const goToTerminal = () => {
    if (pathname !== "/options") router.push("/options");
  };
  const canResume = hydrated && tourStatus === "paused";
  const item = { display: "block", width: "100%", textAlign: "left", padding: "10px 12px", fontSize: 12, background: "none", border: "none", color: "var(--text-hi)", cursor: "pointer" } as const;

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="tap"
        aria-label={copy.button}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        data-testid="help-menu"
        onClick={() => setOpen(o => !o)}
        style={{
          width: 24, height: 24, borderRadius: "50%", border: "1px solid var(--border-strong)", background: "none",
          color: hydrated && practice ? "var(--call)" : "var(--text-mid)", fontSize: 12, fontWeight: 700, cursor: "pointer",
        }}
      >?</button>
      {open && (
        <div id={menuId} role="menu" style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 80, minWidth: 200,
          background: "var(--bg-elevated)", border: "1px solid var(--border-strong)", boxShadow: "0 6px 24px rgba(0,0,0,0.45)",
        }}>
          {canResume && (
            <button type="button" role="menuitem" className="tap" style={item} onClick={() => { resumeTour(); goToTerminal(); setOpen(false); }}>
              {copy.resume}
            </button>
          )}
          <button type="button" role="menuitem" className="tap" style={item} data-testid="help-start-tour" onClick={() => { startTour(); goToTerminal(); setOpen(false); }}>
            {tourStatus === "not-started" || !hydrated ? copy.start : copy.restart}
          </button>
          <button type="button" role="menuitemcheckbox" aria-checked={practice} className="tap" style={item} data-testid="help-practice" onClick={() => setPractice(!practice)}>
            {practice ? copy.practiceOn : copy.practiceOff}
          </button>
        </div>
      )}
    </div>
  );
}
