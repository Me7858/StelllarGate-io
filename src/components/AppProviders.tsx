"use client";

import { BackendDataProvider } from "../lib/context/BackendDataContext";
import { SpotFeedProvider } from "../lib/context/SpotFeedContext";
import { useEnvironmentStore } from "../lib/env/mode";

/**
 * Data providers, keyed by environment mode. Changing the key unmounts the
 * whole subtree, so every in-memory cache — account, positions, watchlist,
 * alerts, the WebSocket feed, the chain a page last fetched — is thrown
 * away on a mode switch instead of being shown (even briefly) under the
 * new mode. This is what "data never bleeds between modes" rests on for
 * in-memory state; persisted state is namespaced in src/lib/env/storage.ts.
 */
export function ModeScopedProviders({ children }: { children: React.ReactNode }) {
  const mode = useEnvironmentStore(s => s.mode);
  return (
    <SpotFeedProvider key={mode}>
      <BackendDataProvider>{children}</BackendDataProvider>
    </SpotFeedProvider>
  );
}
