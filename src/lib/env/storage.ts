import type { StateStorage } from "zustand/middleware";
import type { EnvironmentMode } from "./networks";

// Every piece of mode-specific persisted state lives under
// `zenith:<mode>:<key>`. Nothing mode-specific may be written to an
// un-namespaced key: a paper-trading session token sent to a mainnet
// backend (or mainnet positions cached and shown while on paper) is exactly
// the kind of cross-mode bleed this exists to rule out.

export const STORAGE_PREFIX = "zenith";

export function namespacedKey(mode: EnvironmentMode, key: string): string {
  return `${STORAGE_PREFIX}:${mode}:${key}`;
}

function browserStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    // Storage can throw outright (Safari private mode, blocked site data).
    return null;
  }
}

/** Read/write helpers bound to one mode's namespace. */
export function scopedStorage(mode: EnvironmentMode, backing: () => Storage | null = browserStorage) {
  return {
    getItem(key: string): string | null {
      try {
        return backing()?.getItem(namespacedKey(mode, key)) ?? null;
      } catch {
        return null;
      }
    },
    setItem(key: string, value: string): void {
      try {
        backing()?.setItem(namespacedKey(mode, key), value);
      } catch {
        // Quota exceeded / blocked storage: persisted state is a convenience.
      }
    },
    removeItem(key: string): void {
      try {
        backing()?.removeItem(namespacedKey(mode, key));
      } catch {
        // see setItem
      }
    },
    /** Keys (without the namespace prefix) currently stored for this mode. */
    keys(): string[] {
      const store = backing();
      if (!store) return [];
      const prefix = namespacedKey(mode, "");
      const out: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.startsWith(prefix)) out.push(k.slice(prefix.length));
      }
      return out;
    },
  };
}

/**
 * zustand `persist` storage that resolves the namespace on every access, so a
 * store created once at module load follows the active mode: after a mode
 * switch, `persist.rehydrate()` reads the new mode's copy and later writes go
 * to it too.
 */
export function modeScopedStateStorage(
  getMode: () => EnvironmentMode,
  backing: () => Storage | null = browserStorage
): StateStorage {
  return {
    getItem: (name) => scopedStorage(getMode(), backing).getItem(name),
    setItem: (name, value) => scopedStorage(getMode(), backing).setItem(name, value),
    removeItem: (name) => scopedStorage(getMode(), backing).removeItem(name),
  };
}
