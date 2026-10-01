"use client";

import { useEffect } from "react";
import Link from "next/link";
import { utilizationLevel, type UtilizationLevel, type UtilizationThresholds } from "../lib/collateral";
import { sendNotification } from "../lib/notify";

export const LEVEL_COLOR: Record<UtilizationLevel, string> = {
  ok: "var(--call)",
  warning: "var(--atm)",
  critical: "var(--put)",
};

export const LEVEL_LABEL: Record<UtilizationLevel, string> = {
  ok: "Healthy",
  warning: "High",
  critical: "Critical",
};

const LEVEL_RANK: Record<UtilizationLevel, number> = { ok: 0, warning: 1, critical: 2 };

/** Header chip shown only while utilization is at or above the warning threshold. */
export function CollateralWarningBadge({ utilization, thresholds }: { utilization: number; thresholds: UtilizationThresholds }) {
  const level = utilizationLevel(utilization, thresholds);
  if (level === "ok") return null;
  return (
    <Link
      href="/portfolio#collateral"
      role="status"
      title={`Collateral utilization is at or above your ${level} threshold (${Math.round(thresholds[level] * 100)}%)`}
      style={{
        display: "flex", alignItems: "center", gap: 5, padding: "2px 8px", textDecoration: "none",
        whiteSpace: "nowrap", flexShrink: 0,
        border: `1px solid ${LEVEL_COLOR[level]}`, color: LEVEL_COLOR[level],
        background: level === "critical" ? "var(--put-dim)" : "var(--atm-dim)", fontSize: 10, fontWeight: 600,
      }}
    >
      <span aria-hidden>⚠</span>
      <span>{LEVEL_LABEL[level]} collateral use</span>
      <span className="num">{(utilization * 100).toFixed(0)}%</span>
    </Link>
  );
}

// Module-level rather than a ref: AppHeader remounts on every page
// navigation, and a ref would re-fire the same notification each time.
let lastNotifiedLevel: UtilizationLevel = "ok";

/** Test hook — resets the per-session notification memory. */
export function resetCollateralNotificationState() {
  lastNotifiedLevel = "ok";
}

/**
 * Sends one browser notification each time utilization escalates to a
 * higher level (ok → warning, warning → critical). Dropping back down
 * re-arms it, so a later re-crossing notifies again.
 */
export function useCollateralNotifications(
  utilization: number,
  thresholds: UtilizationThresholds,
  { enabled, active }: { enabled: boolean; active: boolean }
) {
  const level = utilizationLevel(utilization, thresholds);
  useEffect(() => {
    if (!active) return;
    if (LEVEL_RANK[level] > LEVEL_RANK[lastNotifiedLevel] && enabled) {
      sendNotification(
        `Collateral utilization ${LEVEL_LABEL[level].toLowerCase()}: ${(utilization * 100).toFixed(0)}%`,
        `Above your ${Math.round(thresholds[level as "warning" | "critical"] * 100)}% ${level} threshold. Close or roll positions to free capital.`
      );
    }
    lastNotifiedLevel = level;
  }, [level, active, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}
