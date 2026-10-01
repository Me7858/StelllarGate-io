"use client";

import Link from "next/link";
import {
  CATEGORY_LABEL, NOTIFICATION_CATEGORIES,
  type AppNotification, type NotificationCategory, type NotificationSeverity,
} from "../lib/notifications/types";

export const SEVERITY_COLOR: Record<NotificationSeverity, string> = {
  info: "var(--text-mid)", success: "var(--call)", warning: "var(--atm)", error: "var(--put)",
};

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export type CategoryFilter = NotificationCategory | "all";

export function CategoryFilters({ value, onChange, items }: {
  value: CategoryFilter; onChange: (v: CategoryFilter) => void; items: AppNotification[];
}) {
  const unread = (c: CategoryFilter) => items.filter(n => !n.read && (c === "all" || n.category === c)).length;
  return (
    <div role="group" aria-label="Filter notifications by category" style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
      {(["all", ...NOTIFICATION_CATEGORIES] as CategoryFilter[]).map(c => {
        const count = unread(c);
        return (
          <button key={c} onClick={() => onChange(c)} aria-pressed={value === c} style={{
            padding: "3px 8px", border: "none", cursor: "pointer", fontSize: 10,
            background: value === c ? "var(--atm-dim)" : "transparent",
            color: value === c ? "var(--atm)" : "var(--text-lo)",
          }}>
            {c === "all" ? "All" : CATEGORY_LABEL[c]}{count > 0 ? ` (${count})` : ""}
          </button>
        );
      })}
    </div>
  );
}

export function NotificationList({ items, onOpen, onRemove, emptyText = "No notifications." }: {
  items: AppNotification[];
  onOpen: (n: AppNotification) => void;
  onRemove?: (n: AppNotification) => void;
  emptyText?: string;
}) {
  if (items.length === 0) {
    return <div style={{ padding: "20px 12px", fontSize: 12, color: "var(--text-lo)", textAlign: "center" }}>{emptyText}</div>;
  }
  return (
    <ul style={{ listStyle: "none" }} aria-label="Notifications">
      {items.map(n => {
        const content = (
          <>
            <span aria-hidden="true" style={{
              width: 6, height: 6, borderRadius: "50%", marginTop: 5, flexShrink: 0,
              background: n.read ? "transparent" : SEVERITY_COLOR[n.severity],
              border: `1px solid ${SEVERITY_COLOR[n.severity]}`,
            }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 12, fontWeight: n.read ? 400 : 600, color: n.read ? "var(--text-mid)" : "var(--text-hi)" }}>
                {n.title}
              </span>
              {n.body && <span style={{ display: "block", fontSize: 11, color: "var(--text-lo)", marginTop: 2 }}>{n.body}</span>}
              <span style={{ display: "block", fontSize: 10, color: "var(--text-lo)", marginTop: 3 }}>
                {CATEGORY_LABEL[n.category]} · {timeAgo(n.createdAt)}{n.read ? "" : " · unread"}
              </span>
            </span>
          </>
        );
        const rowStyle: React.CSSProperties = {
          display: "flex", gap: 10, padding: "10px 12px", textDecoration: "none", flex: 1, textAlign: "left",
          background: "none", border: "none", cursor: "pointer", font: "inherit",
        };
        return (
          <li key={n.id} data-testid="notification" style={{ display: "flex", borderBottom: "1px solid var(--border-subtle)",
            background: n.read ? "transparent" : "var(--bg-elevated)" }}>
            {n.href
              ? <Link href={n.href} onClick={() => onOpen(n)} style={rowStyle}>{content}</Link>
              : <button onClick={() => onOpen(n)} style={rowStyle}>{content}</button>}
            {onRemove && (
              <button onClick={() => onRemove(n)} aria-label={`Dismiss: ${n.title}`} style={{
                background: "none", border: "none", color: "var(--text-lo)", fontSize: 14, cursor: "pointer", padding: "0 10px",
              }}>×</button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
