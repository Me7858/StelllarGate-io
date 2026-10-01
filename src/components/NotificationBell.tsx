"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useNotifications } from "../lib/notifications/NotificationsContext";
import { CategoryFilters, NotificationList, type CategoryFilter } from "./NotificationList";

const DROPDOWN_LIMIT = 20;

export function NotificationBell() {
  const { items, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<CategoryFilter>("all");
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

  const visible = items.filter(n => filter === "all" || n.category === filter).slice(0, DROPDOWN_LIMIT);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 0, color: "var(--text-mid)" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span data-testid="unread-badge" style={{
            position: "absolute", top: -2, right: -4, minWidth: 14, height: 14, padding: "0 3px",
            background: "var(--put)", color: "var(--text-hi)", fontSize: 9, fontWeight: 700, lineHeight: "14px",
            textAlign: "center", borderRadius: 7,
          }}>{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifications" style={{
          position: "absolute", right: 0, top: "calc(100% + 8px)", width: 360, maxHeight: 480, zIndex: 60,
          display: "flex", flexDirection: "column",
          background: "var(--bg-raised)", border: "1px solid var(--border-default)", boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderBottom: "1px solid var(--border-default)" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-hi)" }}>Notifications</span>
            <button onClick={() => markAllRead(filter === "all" ? undefined : filter)} disabled={unreadCount === 0} style={{
              background: "none", border: "none", fontSize: 11, color: "var(--brand)",
              cursor: unreadCount === 0 ? "default" : "pointer", opacity: unreadCount === 0 ? 0.5 : 1,
            }}>Mark all read</button>
          </div>
          <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border-subtle)" }}>
            <CategoryFilters value={filter} onChange={setFilter} items={items} />
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            <NotificationList items={visible} onOpen={n => { markRead(n.id); if (n.href) setOpen(false); }}
              emptyText={filter === "all" ? "You're all caught up." : "Nothing in this category."} />
          </div>
          <Link href="/notifications" onClick={() => setOpen(false)} style={{
            display: "block", padding: "9px 12px", textAlign: "center", fontSize: 11, color: "var(--brand)",
            textDecoration: "none", borderTop: "1px solid var(--border-default)",
          }}>View all notifications →</Link>
        </div>
      )}
    </div>
  );
}
