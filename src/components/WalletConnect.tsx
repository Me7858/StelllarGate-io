"use client";

import { useEffect } from "react";
import { useWalletStore } from "../lib/store/wallet";
import { useAccountReadiness } from "../lib/hooks/useAccountReadiness";

const truncate = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

export function WalletConnect() {
  const { status, address, connect, disconnect, checkConnection } = useWalletStore();
  const { readiness, loading: readinessLoading } = useAccountReadiness();

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  if (status === "connected" && address) {
    const readyColor = readinessLoading
      ? "var(--text-lo)"
      : readiness.isReady
      ? "var(--call)"
      : "var(--atm)";
    const readyTitle = readinessLoading
      ? "Checking on-chain readiness…"
      : readiness.isReady
      ? "On-chain ready"
      : "Account setup required — click Portfolio for details";
    return (
      <button
        onClick={disconnect}
        title="Click to disconnect"
        style={{
          padding: "5px 12px", background: "var(--bg-elevated)", color: "var(--text-hi)",
          border: "1px solid var(--border-default)", borderRadius: 0, fontSize: 12,
          fontFamily: "var(--font-mono)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--call)" }} />
        {truncate(address)}
        <span
          aria-label={readyTitle}
          title={readyTitle}
          style={{
            width: 6, height: 6, borderRadius: "50%",
            background: readyColor,
            marginLeft: 2,
          }}
        />
      </button>
    );
  }

  if (status === "not-installed") {
    return (
      <a
        href="https://www.freighter.app/"
        target="_blank"
        rel="noreferrer"
        style={{
          padding: "5px 12px", background: "transparent", color: "var(--text-mid)",
          border: "1px solid var(--border-strong)", borderRadius: 0, fontSize: 12,
          fontWeight: 600, cursor: "pointer", textDecoration: "none",
        }}
      >
        Install Freighter
      </a>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={status === "connecting"}
      style={{
        padding: "5px 12px", background: "var(--brand)", color: "var(--bg)",
        border: "none", borderRadius: 0, fontSize: 12, fontWeight: 700,
        cursor: status === "connecting" ? "default" : "pointer",
        opacity: status === "connecting" ? 0.6 : 1,
      }}
    >
      {status === "connecting" ? "Connecting…" : status === "error" ? "Retry" : "Connect"}
    </button>
  );
}
