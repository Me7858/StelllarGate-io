"use client";

import { useEffect, useRef, useState } from "react";
import { WatchlistPanel } from "./WatchlistPanel";

export function WatchlistMenu({ align = "left" }: { align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="dialog" style={{
        background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
        color: open ? "var(--text-hi)" : "var(--text-mid)", padding: "4px 6px",
      }}>★ Watchlist ▾</button>
      {open && (
        <div role="dialog" aria-label="Watchlists" style={{
          position: "absolute", top: "calc(100% + 8px)", [align]: 0, zIndex: 60, maxHeight: 520, overflowY: "auto",
          background: "var(--bg-raised)", border: "1px solid var(--border-default)", boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
        }}>
          <WatchlistPanel onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
