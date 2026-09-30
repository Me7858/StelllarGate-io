export const NOTIFICATION_CATEGORIES = ["fill", "alert", "expiry", "session", "feed", "system"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export type NotificationSeverity = "info" | "success" | "warning" | "error";

export const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  fill: "Fills",
  alert: "Alerts",
  expiry: "Expiries",
  session: "Session",
  feed: "Price feed",
  system: "Announcements",
};

/** What a producer publishes. */
export interface NotificationInput {
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body?: string;
  /** In-app route to open when the notification is clicked. */
  href?: string;
  /** Identifies "the same event": a second publish with a key already in
   *  the store is dropped. Lets several tabs (or a reload) re-observe the
   *  same alert trigger or expiry without duplicating it. */
  dedupeKey?: string;
  /** Epoch ms; defaults to now. */
  createdAt?: number;
}

export interface AppNotification extends NotificationInput {
  id: string;
  createdAt: number;
  read: boolean;
}
