"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { checkModeSwitch, resolveDeepLinkMode, useEnvironmentStore } from "../env/mode";
import { NETWORKS, walletNetworkMatches, type EnvironmentMode, type NetworkConfig } from "../env/networks";
import { envIconDataUri, prefixedTitle } from "../env/icon";
import { scopedStorage } from "../env/storage";
import { useWalletStore } from "../store/wallet";
import { useHydrated } from "../useHydrated";

export type PendingSwitch =
  | { kind: "confirm"; to: EnvironmentMode; source: "selector" | "link" }
  | { kind: "refused"; to: EnvironmentMode; reason: string };

interface EnvironmentValue {
  mode: EnvironmentMode;
  network: NetworkConfig;
  /** False until the persisted mode has been read (first client render
   *  always matches SSR, which renders the default mode). */
  hydrated: boolean;
  /** Ask to change mode. Safe modes switch immediately; mainnet opens the
   *  confirmation dialog; a refused switch opens an explanation instead. */
  requestSwitch: (to: EnvironmentMode, source?: "selector" | "link") => void;
  pendingSwitch: PendingSwitch | null;
  confirmSwitch: () => void;
  cancelSwitch: () => void;
  /** A `?mode=mainnet` link the user hasn't acted on yet. */
  linkPrompt: EnvironmentMode | null;
  dismissLinkPrompt: () => void;
  /** Trading is blocked while the connected wallet's network doesn't match
   *  the mode (e.g. Freighter flipped to TESTNET while on mainnet). */
  tradingBlocked: boolean;
  tradingBlockReason: string | null;
}

const EnvironmentContext = createContext<EnvironmentValue | null>(null);

const NETWORK_POLL_MS = 3000;

/**
 * Switch every mode-scoped thing over atomically. The mode flips first and
 * the in-memory session token is then replaced with the *new* mode's
 * persisted one (or null) in the same tick — so nothing can send the old
 * mode's token to the new mode's backend. Order matters: the wallet store
 * persists on every set, so clearing the token before flipping the mode
 * would overwrite (log out) the old mode's saved session. The data
 * providers are keyed by mode (see AppProviders), so their in-memory caches
 * are discarded by the remount rather than carried over.
 */
export function applyModeSwitch(to: EnvironmentMode) {
  useEnvironmentStore.getState().setMode(to);
  let token: string | null = null;
  try {
    const raw = scopedStorage(to).getItem("wallet");
    const persisted = raw ? JSON.parse(raw)?.state : null;
    token = typeof persisted?.token === "string" ? persisted.token : null;
  } catch {
    token = null;
  }
  useWalletStore.setState({ token, error: null });
}

export function EnvironmentProvider({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  const storeMode = useEnvironmentStore(s => s.mode);
  const mode: EnvironmentMode = storeMode;
  const network = NETWORKS[mode];
  const walletStatus = useWalletStore(s => s.status);
  const walletNetwork = useWalletStore(s => s.network);
  const refreshNetwork = useWalletStore(s => s.refreshNetwork);
  const walletConnected = walletStatus === "connected";

  const [pendingSwitch, setPendingSwitch] = useState<PendingSwitch | null>(null);
  const [linkPrompt, setLinkPrompt] = useState<EnvironmentMode | null>(null);

  const requestSwitch = useCallback(
    (to: EnvironmentMode, source: "selector" | "link" = "selector") => {
      const check = checkModeSwitch({ from: mode, to, walletConnected, walletNetwork });
      if ("reason" in check) {
        setPendingSwitch({ kind: "refused", to, reason: check.reason });
        return;
      }
      if (check.ok && check.needsConfirmation) {
        setPendingSwitch({ kind: "confirm", to, source });
        return;
      }
      applyModeSwitch(to);
    },
    [mode, walletConnected, walletNetwork]
  );

  const confirmSwitch = useCallback(() => {
    if (!pendingSwitch || pendingSwitch.kind !== "confirm") return;
    // Re-check at confirm time: the wallet network may have changed while
    // the dialog was open.
    const check = checkModeSwitch({ from: mode, to: pendingSwitch.to, walletConnected, walletNetwork });
    if ("reason" in check) {
      setPendingSwitch({ kind: "refused", to: pendingSwitch.to, reason: check.reason });
      return;
    }
    applyModeSwitch(pendingSwitch.to);
    setPendingSwitch(null);
    setLinkPrompt(null);
  }, [pendingSwitch, mode, walletConnected, walletNetwork]);

  const cancelSwitch = useCallback(() => setPendingSwitch(null), []);
  const dismissLinkPrompt = useCallback(() => setLinkPrompt(null), []);

  // Deep links: `?mode=testnet` / `?mode=paper` switch directly; `?mode=mainnet`
  // only ever raises a prompt. Read once, after the persisted mode has loaded.
  useEffect(() => {
    if (!hydrated) return;
    const param = new URLSearchParams(window.location.search).get("mode");
    const resolved = resolveDeepLinkMode(param, useEnvironmentStore.getState().mode);
    if (resolved.action === "switch") applyModeSwitch(resolved.mode);
    else if (resolved.action === "prompt") setLinkPrompt(resolved.mode);
  }, [hydrated]);

  // Freighter exposes no network-change event, so poll while connected.
  useEffect(() => {
    if (!walletConnected) return;
    const tick = () => {
      if (document.visibilityState === "visible") void refreshNetwork();
    };
    const id = setInterval(tick, NETWORK_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [walletConnected, refreshNetwork]);

  // Title prefix, favicon and the <html data-env> hook the CSS keys off.
  // Next rewrites <title>/<link rel=icon> on navigation, so re-apply on any
  // <head> mutation rather than once.
  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    root.dataset.env = mode;
    // Lets tests (and anything else) know React is attached before interacting.
    root.dataset.hydrated = "true";
    const icon = envIconDataUri(mode);
    const apply = () => {
      const next = prefixedTitle(document.title, mode);
      if (document.title !== next) document.title = next;
      document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]').forEach(link => {
        if (link.href !== icon) link.href = icon;
      });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["href"] });
    return () => observer.disconnect();
  }, [mode, hydrated]);

  const networkOk = walletNetworkMatches(mode, walletNetwork);
  const tradingBlocked = walletConnected && !networkOk;
  const tradingBlockReason = tradingBlocked
    ? `Wallet is on ${walletNetwork ?? "an unknown network"}, but ${network.label} needs ${network.requiredWalletNetwork}. Trading is blocked until you switch networks in Freighter.`
    : null;

  const value = useMemo<EnvironmentValue>(
    () => ({
      mode, network, hydrated,
      requestSwitch, pendingSwitch, confirmSwitch, cancelSwitch,
      linkPrompt, dismissLinkPrompt,
      tradingBlocked, tradingBlockReason,
    }),
    [mode, network, hydrated, requestSwitch, pendingSwitch, confirmSwitch, cancelSwitch, linkPrompt, dismissLinkPrompt, tradingBlocked, tradingBlockReason]
  );

  return <EnvironmentContext.Provider value={value}>{children}</EnvironmentContext.Provider>;
}

export function useEnvironment(): EnvironmentValue {
  const ctx = useContext(EnvironmentContext);
  if (!ctx) throw new Error("useEnvironment must be used within EnvironmentProvider");
  return ctx;
}

export { EnvironmentContext };
