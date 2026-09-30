// Contract for server-pushed notifications. Not wired up yet: the backend
// doesn't expose this channel today. When it does, the client should
// subscribe to it the same way as the spot feed and pass each frame
// through `fromServerFrame` into `publishNotification`.
//
//   Channel:  WS  /api/v1/ws/notifications?token=<bearer token>
//   Server → client frames (JSON), one per event:
//     {
//       "type": "notification",
//       "id": "uuid",                        // stable; used as the dedupe key
//       "category": "fill" | "alert" | "expiry" | "session" | "feed" | "system",
//       "severity": "info" | "success" | "warning" | "error",
//       "title": "string",
//       "body": "string" | null,
//       "href": "/portfolio" | null,         // in-app route, never an external URL
//       "created_at": "RFC 3339 timestamp"
//     }
//   Unknown `type`s must be ignored so the server can add frame types
//   (e.g. read-state sync) without breaking older clients.
import { NOTIFICATION_CATEGORIES, type NotificationInput, type NotificationSeverity } from "./types";

export interface ServerNotificationFrame {
  type: "notification";
  id: string;
  category: string;
  severity: string;
  title: string;
  body: string | null;
  href: string | null;
  created_at: string;
}

const SEVERITIES: NotificationSeverity[] = ["info", "success", "warning", "error"];

/** Validates a raw frame; returns null for anything malformed or unknown. */
export function fromServerFrame(raw: unknown): NotificationInput | null {
  const f = raw as Partial<ServerNotificationFrame> | null;
  if (!f || f.type !== "notification" || typeof f.id !== "string" || typeof f.title !== "string") return null;
  const category = (NOTIFICATION_CATEGORIES as readonly string[]).includes(f.category ?? "") ? f.category : "system";
  const severity = SEVERITIES.includes(f.severity as NotificationSeverity) ? f.severity : "info";
  const createdAt = f.created_at ? Date.parse(f.created_at) : NaN;
  return {
    category: category as NotificationInput["category"],
    severity: severity as NotificationSeverity,
    title: f.title,
    body: f.body ?? undefined,
    // Only in-app routes: a pushed notification must not be able to link out.
    href: typeof f.href === "string" && f.href.startsWith("/") && !f.href.startsWith("//") ? f.href : undefined,
    dedupeKey: `server:${f.id}`,
    createdAt: Number.isFinite(createdAt) ? createdAt : undefined,
  };
}
