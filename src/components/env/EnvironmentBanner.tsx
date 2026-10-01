"use client";

import { useEnvironment } from "../../lib/context/EnvironmentContext";
import { ENVIRONMENT_MODES, NETWORKS } from "../../lib/env/networks";

/**
 * Persistent, full-width environment strip plus a page frame, on every page.
 *
 * The color/label are driven by `<html data-env>` in CSS (see globals.css),
 * which an inline <head> script sets from localStorage before first paint —
 * so a mainnet session never flashes the default paper styling while React
 * hydrates. All three labels are rendered and CSS shows the matching one,
 * which keeps SSR and the first client render identical.
 */
export function EnvironmentBanner() {
  const { hydrated, tradingBlocked, tradingBlockReason, linkPrompt, dismissLinkPrompt, requestSwitch, network } = useEnvironment();

  return (
    <>
      <div className="env-frame" aria-hidden />
      <div className="env-banner" role="status" aria-live="polite" data-testid="env-banner">
        {ENVIRONMENT_MODES.map(m => (
          <span key={m} className={`env-banner-label env-${m}`}>
            <span className="env-dot" aria-hidden />
            <strong>{NETWORKS[m].label}</strong>
            <span className="env-banner-desc">{NETWORKS[m].description}</span>
          </span>
        ))}
      </div>
      {hydrated && tradingBlocked && (
        <div role="alert" className="env-alert" data-testid="network-mismatch">
          {tradingBlockReason}
        </div>
      )}
      {hydrated && linkPrompt && (
        <div role="alert" className="env-alert env-alert-prompt" data-testid="mainnet-link-prompt">
          <span>
            This link asks to open <strong>{NETWORKS[linkPrompt].label}</strong>. You are still on {network.label} —
            links never switch you onto real funds automatically.
          </span>
          <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button type="button" className="tap" onClick={() => requestSwitch(linkPrompt, "link")}>Review switch</button>
            <button type="button" className="tap" onClick={dismissLinkPrompt}>Stay on {network.shortLabel}</button>
          </span>
        </div>
      )}
    </>
  );
}
