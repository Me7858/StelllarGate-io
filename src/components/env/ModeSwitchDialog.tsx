"use client";

import { useEffect, useState } from "react";
import { useEnvironment } from "../../lib/context/EnvironmentContext";
import { NETWORKS } from "../../lib/env/networks";
import { useWalletStore } from "../../lib/store/wallet";
import { ConfirmDialog } from "../ConfirmDialog";

/**
 * The guard in front of real-funds modes: an explicit acknowledgement
 * checkbox plus a live readout of the connected wallet's network. Rendered
 * once, at the root, whenever EnvironmentProvider has a pending switch.
 */
export function ModeSwitchDialog() {
  const { pendingSwitch, confirmSwitch, cancelSwitch, network: current } = useEnvironment();
  const walletStatus = useWalletStore(s => s.status);
  const walletNetwork = useWalletStore(s => s.network);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => setAcknowledged(false), [pendingSwitch]);

  if (!pendingSwitch) return null;
  const target = NETWORKS[pendingSwitch.to];

  if (pendingSwitch.kind === "refused") {
    return (
      <ConfirmDialog
        title={`Can't switch to ${target.label}`}
        confirmLabel="OK"
        onConfirm={cancelSwitch}
        onCancel={cancelSwitch}
      >
        <p data-testid="mode-switch-refused" style={{ fontSize: 12, color: "var(--put)", lineHeight: 1.5 }}>{pendingSwitch.reason}</p>
      </ConfirmDialog>
    );
  }

  const connected = walletStatus === "connected";
  return (
    <ConfirmDialog
      title={`Switch to ${target.label}?`}
      confirmLabel={`Switch to ${target.shortLabel}`}
      onConfirm={confirmSwitch}
      onCancel={cancelSwitch}
      disabled={!acknowledged}
      disabledReason="Tick the acknowledgement to continue."
      enterToConfirm={false}
    >
      <div data-testid="mainnet-confirm" style={{ fontSize: 12, color: "var(--text-mid)", lineHeight: 1.55 }}>
        <p style={{ marginBottom: 8 }}>
          You are leaving <strong style={{ color: current.color }}>{current.label}</strong>.
          On <strong style={{ color: target.color }}>{target.label}</strong>, trades settle on the Stellar public
          network and <strong style={{ color: "var(--text-hi)" }}>move real funds</strong>. Positions, sessions and
          cached data from {current.shortLabel} will not carry over.
        </p>
        <p style={{ marginBottom: 10 }}>
          Wallet network:{" "}
          {connected ? (
            <strong style={{ color: walletNetwork === target.requiredWalletNetwork ? "var(--call)" : "var(--put)" }}>
              {walletNetwork ?? "unknown"}
            </strong>
          ) : (
            <span>not connected. You&apos;ll need Freighter on {target.requiredWalletNetwork} before you can trade.</span>
          )}
        </p>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", color: "var(--text-hi)", cursor: "pointer" }}>
          <input
            type="checkbox"
            data-testid="mainnet-ack"
            checked={acknowledged}
            onChange={e => setAcknowledged(e.target.checked)}
            style={{ marginTop: 2, width: 16, height: 16 }}
          />
          I understand that trades on {target.label} use real funds.
        </label>
      </div>
    </ConfirmDialog>
  );
}
