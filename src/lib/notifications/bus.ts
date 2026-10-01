// Producers (trade mutations, alert polling, expiry timers, the spot feed)
// publish here without knowing anything about how notifications are
// stored or displayed; NotificationsProvider is the one subscriber that
// persists them. Publishing with no subscriber is a harmless no-op.
import type { NotificationInput } from "./types";

type Listener = (n: NotificationInput) => void;

const listeners = new Set<Listener>();

export function publishNotification(n: NotificationInput): void {
  listeners.forEach(l => l(n));
}

export function subscribeNotifications(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
