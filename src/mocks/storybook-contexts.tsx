/**
 * Mock context providers for Storybook stories.
 *
 * These replace the real BackendDataContext and SpotFeedContext so stories
 * render without a running backend or WebSocket connection. All values are
 * static by default; individual stories can override via the `overrides` prop.
 *
 * Usage in a story file:
 *
 *   import { AllProviders, seedWalletStore } from '../../mocks/storybook-contexts';
 *
 *   const meta: Meta<typeof MyComponent> = {
 *     component: MyComponent,
 *     decorators: [
 *       (Story) => (
 *         <AllProviders>
 *           <Story />
 *         </AllProviders>
 *       ),
 *     ],
 *   };
 *
 * To test a signed-in state, call seedWalletStore() inside a decorator:
 *
 *   decorators: [
 *     (Story) => {
 *       seedWalletStore();
 *       return <AllProviders><Story /></AllProviders>;
 *     },
 *   ],
 */
'use client';

import React, { useMemo } from 'react';
// Inject into the real context objects so all hook calls inside components
// automatically receive mock values without modifying source files.
import { BackendDataContext, type BackendDataContextValue } from '../lib/context/BackendDataContext';
import { SpotFeedContext } from '../lib/context/SpotFeedContext';
import { mockAccount, mockWatchlist, mockPositions } from './handlers';

// ---------------------------------------------------------------------------
// SpotFeedContext mock
// ---------------------------------------------------------------------------

interface SpotResponse {
  prices: Record<string, number>;
  vols: Record<string, number>;
}

export type SpotFeedStatus = 'open' | 'connecting' | 'closed' | 'stale';

interface SpotFeedContextValue {
  data: SpotResponse | null;
  status: SpotFeedStatus;
  request: () => void;
}

const defaultSpotData: SpotResponse = {
  prices: { XLM: 0.1182, BTC: 62_450.00, ETH: 3_120.00 },
  vols:   { XLM: 0.83,   BTC: 0.62,       ETH: 0.71      },
};

const defaultSpotValue: SpotFeedContextValue = {
  data: defaultSpotData,
  status: 'open',
  request: () => { /* no-op */ },
};

export interface MockSpotFeedProviderProps {
  children: React.ReactNode;
  /**
   * Per-story overrides for the spot feed state.
   *
   * @example
   * // Story showing "connecting" skeleton:
   * overrides={{ data: null, status: 'connecting' }}
   */
  overrides?: Partial<SpotFeedContextValue>;
}

export function MockSpotFeedProvider({ children, overrides = {} }: MockSpotFeedProviderProps) {
  const value = useMemo<SpotFeedContextValue>(
    () => ({ ...defaultSpotValue, ...overrides }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(overrides)],
  );
  return (
    // SpotFeedContext.Provider value type matches SpotFeedContextValue structurally
    // @ts-expect-error — our inline type mirrors the real SpotFeedData shape exactly
    <SpotFeedContext.Provider value={value}>
      {children}
    </SpotFeedContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// BackendDataContext mock
// ---------------------------------------------------------------------------

const defaultBackendValue: BackendDataContextValue = {
  account: mockAccount,
  watchlist: mockWatchlist,
  addToWatchlist: async (_sym: string) => { /* no-op */ },
  removeFromWatchlist: async (_sym: string) => { /* no-op */ },
  refreshAccount: () => { /* no-op */ },
};

export interface MockBackendDataProviderProps {
  children: React.ReactNode;
  /**
   * Per-story overrides — any subset of BackendDataContextValue. Merged
   * shallowly over the defaults so you only need to specify what changes.
   *
   * @example
   * // Story showing unauthenticated (no account):
   * overrides={{ account: null }}
   */
  overrides?: Partial<BackendDataContextValue>;
}

export function MockBackendDataProvider({ children, overrides = {} }: MockBackendDataProviderProps) {
  const value = useMemo<BackendDataContextValue>(
    () => ({ ...defaultBackendValue, ...overrides }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(overrides)],
  );
  return (
    <BackendDataContext.Provider value={value}>
      {children}
    </BackendDataContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Wallet store seeding
// ---------------------------------------------------------------------------

export interface WalletSeedState {
  address?: string;
  token?: string;
  tokenExpiresAt?: number;
}

/**
 * Pre-seeds the zustand wallet store with a mock connected + signed-in state
 * so components that call `useWalletStore(s => s.token)` see a real bearer
 * token without going through the Freighter sign-in flow.
 *
 * Call this inside a Storybook decorator or play() function — NOT at module
 * level, because the store may not be initialised yet at import time.
 */
export function seedWalletStore(overrides: WalletSeedState = {}): void {
  const address = overrides.address ?? mockAccount.wallet_address;
  const token   = overrides.token   ?? 'mock-bearer-token-for-storybook';
  const tokenExpiresAt = overrides.tokenExpiresAt ?? (Date.now() + 60 * 60 * 1000); // 1h

  try {
    // Dynamic require keeps this file from crashing when the wallet store is
    // an empty stub. If the store is not yet initialised, the seed is a no-op.
    // Using require() rather than import() so it runs synchronously inside decorators.
    /* eslint-disable */
    const mod = require('../lib/store/wallet') as {
      useWalletStore?: { setState: (partial: Record<string, unknown>) => void };
    };
    /* eslint-enable */
    const store = mod.useWalletStore;
    if (store && typeof store.setState === 'function') {
      store.setState({ address, token, tokenExpiresAt, sessionExpired: false });
    }
  } catch {
    // Wallet store stub — skip seeding silently.
  }
}

// ---------------------------------------------------------------------------
// Combined provider
// ---------------------------------------------------------------------------

export interface AllProvidersProps {
  children: React.ReactNode;
  backendOverrides?: Partial<BackendDataContextValue>;
  spotOverrides?: Partial<SpotFeedContextValue>;
}

/**
 * Wraps children in both `MockSpotFeedProvider` and `MockBackendDataProvider`.
 * Use this as a Storybook decorator when the component under test consumes
 * either or both contexts.
 *
 * SpotFeedProvider is the outer wrapper because in production the app layout
 * mounts it above BackendDataProvider.
 */
export function AllProviders({ children, backendOverrides, spotOverrides }: AllProvidersProps) {
  return (
    <MockSpotFeedProvider overrides={spotOverrides}>
      <MockBackendDataProvider overrides={backendOverrides}>
        {children}
      </MockBackendDataProvider>
    </MockSpotFeedProvider>
  );
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------
export { mockAccount, mockWatchlist, mockPositions } from './handlers';
