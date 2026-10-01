"use client";

/**
 * Dev-only flags panel — toggle flags locally without a redeploy.
 * Opens/closes with Ctrl+Shift+F.
 * Rendered conditionally in layout.tsx — tree-shaken out of production builds.
 */

import { useEffect, useState } from "react";
import { useFlagsContext } from "./FlagsContext";
import { FLAG_REGISTRY } from "./registry";
import type { FlagName } from "./registry";

export function FlagsDevPanel() {
  const [open, setOpen] = useState(false);
  const { flags, localOverrides, setLocalOverride, remoteConfig, refetch } =
    useFlagsContext();

  // Keyboard shortcut: Ctrl+Shift+F
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "F") {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!open) return null;

  const panelStyle: React.CSSProperties = {
    position: "fixed",
    bottom: 16,
    right: 16,
    zIndex: 9999,
    width: 380,
    maxHeight: "80vh",
    overflowY: "auto",
    background: "#0e0e10",
    border: "1px solid rgba(201,151,76,0.4)",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 11,
    color: "#e0e0e0",
    boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
  };

  return (
    <div style={panelStyle} role="dialog" aria-label="Feature flags dev panel">
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(201,151,76,0.08)",
      }}>
        <span style={{ fontWeight: 700, letterSpacing: "0.06em", color: "rgba(201,151,76,0.9)" }}>
          🏴 Feature Flags
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={refetch}
            title="Re-fetch remote config"
            style={btnStyle}
          >
            ↻ refresh
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{ ...btnStyle, color: "rgba(255,255,255,0.4)" }}
            aria-label="Close flags panel"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Remote config status */}
      <div style={{ padding: "6px 14px", fontSize: 10, color: "rgba(255,255,255,0.3)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        Remote config: {remoteConfig ? "✓ loaded" : "✗ unavailable (using defaults)"}
      </div>

      {/* Hint */}
      <div style={{ padding: "5px 14px 0", fontSize: 10, color: "rgba(201,151,76,0.5)" }}>
        Local overrides only — not persisted. Also settable via ?flags=name:1
      </div>

      {/* Flag rows */}
      <div style={{ padding: "8px 0" }}>
        {FLAG_REGISTRY.map(def => {
          const resolved = flags[def.name];
          const hasOverride = localOverrides[def.name] !== undefined;

          return (
            <div
              key={def.name}
              style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "7px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                background: hasOverride ? "rgba(201,151,76,0.05)" : "transparent",
              }}
            >
              {/* Toggle */}
              <button
                onClick={() => {
                  // Cycle: no override → on → off → no override
                  const curr = localOverrides[def.name];
                  if (curr === undefined) setLocalOverride(def.name as FlagName, true);
                  else if (curr === true) setLocalOverride(def.name as FlagName, false);
                  else setLocalOverride(def.name as FlagName, null);
                }}
                style={{
                  flexShrink: 0,
                  width: 36, height: 18,
                  borderRadius: 9,
                  border: "none",
                  cursor: "pointer",
                  background: resolved
                    ? "rgba(92,154,107,0.8)"
                    : "rgba(255,255,255,0.1)",
                  position: "relative",
                  transition: "background 0.15s",
                }}
                aria-label={`Toggle ${def.name}`}
                title={`Click to cycle: inherit → on → off → inherit`}
              >
                <span style={{
                  position: "absolute",
                  top: 2, left: resolved ? 20 : 2,
                  width: 14, height: 14,
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left 0.15s",
                  display: "block",
                }} />
              </button>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, color: resolved ? "#5C9A6B" : "rgba(255,255,255,0.5)" }}>
                    {def.name}
                  </span>
                  {hasOverride && (
                    <span style={{ fontSize: 9, color: "rgba(201,151,76,0.8)", border: "1px solid rgba(201,151,76,0.3)", padding: "0 4px" }}>
                      local
                    </span>
                  )}
                  {def.networks && (
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>
                      {def.networks.join("/")}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2, lineHeight: 1.4 }}>
                  {def.description}
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", marginTop: 1 }}>
                  owner: {def.owner}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reset all */}
      <div style={{ padding: "8px 14px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <button
          onClick={() => {
            FLAG_REGISTRY.forEach(def =>
              setLocalOverride(def.name as FlagName, null),
            );
          }}
          style={{ ...btnStyle, color: "rgba(182,86,64,0.8)" }}
        >
          Reset all local overrides
        </button>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "none", border: "1px solid rgba(255,255,255,0.1)",
  color: "rgba(255,255,255,0.5)", padding: "3px 8px", cursor: "pointer",
  fontSize: 10, fontFamily: "inherit",
};
