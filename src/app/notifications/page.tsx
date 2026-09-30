"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "../../components/AppHeader";
import { WalletConnect } from "../../components/WalletConnect";
import { CategoryFilters, NotificationList, type CategoryFilter } from "../../components/NotificationList";
import { useNotifications } from "../../lib/notifications/NotificationsContext";
import { setPref, useNotificationPrefs } from "../../lib/notifications/prefs";
import { CATEGORY_LABEL, NOTIFICATION_CATEGORIES } from "../../lib/notifications/types";
import { MAX_NOTIFICATIONS } from "../../lib/notifications/store";
import { requestNotificationPermission } from "../../lib/notify";

export default function NotificationsPage() {
  const { items, unreadCount, markRead, markAllRead, remove, clear } = useNotifications();
  const prefs = useNotificationPrefs();
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  const visible = items.filter(n => (filter === "all" || n.category === filter) && (!unreadOnly || !n.read));

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-sans)" }}>
      <AppHeader>
        <div style={{ marginLeft: "auto" }}><WalletConnect /></div>
      </AppHeader>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: 24, display: "grid", gridTemplateColumns: "1fr 280px", gap: 24, alignItems: "start" }}>
        <section style={{ border: "1px solid var(--border-default)", background: "var(--bg-raised)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border-default)", gap: 12, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-hi)" }}>
              Notifications{unreadCount > 0 ? ` · ${unreadCount} unread` : ""}
            </h1>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <label style={{ fontSize: 11, color: "var(--text-mid)", display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                <input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} /> Unread only
              </label>
              <button onClick={() => markAllRead(filter === "all" ? undefined : filter)} style={{ background: "none", border: "none", fontSize: 11, color: "var(--brand)", cursor: "pointer" }}>
                Mark all read
              </button>
              <button onClick={() => { if (window.confirm("Delete every notification for this wallet?")) clear(); }}
                style={{ background: "none", border: "none", fontSize: 11, color: "var(--text-lo)", cursor: "pointer" }}>
                Clear all
              </button>
            </div>
          </div>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
            <CategoryFilters value={filter} onChange={setFilter} items={items} />
          </div>
          <NotificationList items={visible} onOpen={n => markRead(n.id)} onRemove={n => remove(n.id)}
            emptyText={unreadOnly ? "No unread notifications." : "Nothing here yet. Fills, triggered alerts, expiry reminders and connection events will show up here."} />
          <div style={{ padding: "8px 16px", fontSize: 10, color: "var(--text-lo)" }}>
            Stored in this browser, per wallet. The most recent {MAX_NOTIFICATIONS} are kept.
          </div>
        </section>

        <aside style={{ border: "1px solid var(--border-default)", background: "var(--bg-raised)", padding: 16 }}>
          <h2 style={{ fontSize: 12, fontWeight: 600, color: "var(--text-hi)", marginBottom: 4 }}>Browser notifications</h2>
          <p style={{ fontSize: 11, color: "var(--text-lo)", lineHeight: 1.5, marginBottom: 12 }}>
            Everything is always recorded here. Choose which categories also pop a system notification.
          </p>
          {permission !== "granted" && (
            <div style={{ fontSize: 11, color: "var(--atm)", marginBottom: 12, lineHeight: 1.5 }}>
              {permission === "unsupported" ? "This browser doesn't support notifications."
                : permission === "denied" ? "Notifications are blocked for this site in your browser settings."
                : (
                  <button onClick={() => { requestNotificationPermission(); setTimeout(() => setPermission(Notification.permission), 1500); }}
                    style={{ background: "var(--brand)", color: "var(--bg)", border: "none", fontSize: 11, fontWeight: 700, padding: "5px 10px", cursor: "pointer" }}>
                    Allow browser notifications
                  </button>
                )}
            </div>
          )}
          {NOTIFICATION_CATEGORIES.map(c => (
            <label key={c} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0",
              borderBottom: "1px solid var(--border-subtle)", fontSize: 12, color: "var(--text-mid)", cursor: "pointer" }}>
              {CATEGORY_LABEL[c]}
              <input type="checkbox" checked={prefs[c]} onChange={e => setPref(c, e.target.checked)} aria-label={`Browser notifications for ${CATEGORY_LABEL[c]}`} />
            </label>
          ))}
        </aside>
      </main>
    </div>
  );
}
