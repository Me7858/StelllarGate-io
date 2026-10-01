"use client";

import { useWalletStore } from "../../lib/store/wallet";

/**
 * The not-signed-in state: explains what signing in unlocks and offers the
 * one action that gets there (install Freighter / connect / sign in).
 */
export function AuthGate({ title = "Connect your wallet", description, compact = false, testId = "auth-gate" }: {
  title?: string;
  description?: string;
  compact?: boolean;
  testId?: string;
}) {
  const status = useWalletStore(s => s.status);
  const connect = useWalletStore(s => s.connect);
  const signIn = useWalletStore(s => s.signIn);
  const error = useWalletStore(s => s.error);

  const cta =
    status === "not-installed" ? (
      <a href="https://www.freighter.app/" target="_blank" rel="noreferrer" className="tap auth-cta">Install Freighter</a>
    ) : status === "connected" ? (
      <button type="button" className="tap auth-cta" onClick={() => void signIn()}>Sign in with wallet</button>
    ) : (
      <button type="button" className="tap auth-cta" onClick={() => void connect()}>Connect wallet</button>
    );

  if (compact) {
    return (
      <div data-testid={testId} style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
        <span style={{ fontSize: 11, color: "var(--text-lo)", lineHeight: 1.5 }}>{description ?? title}</span>
        {cta}
      </div>
    );
  }
  return (
    <div data-testid={testId} className="state-box">
      <div style={{ fontSize: 14, color: "var(--text-hi)" }}>{title}</div>
      {description && <p style={{ fontSize: 12, color: "var(--text-mid)", maxWidth: 360, textAlign: "center", lineHeight: 1.5 }}>{description}</p>}
      {cta}
      {status === "connected" && error && <p style={{ fontSize: 11, color: "var(--put)" }}>{error}</p>}
    </div>
  );
}
