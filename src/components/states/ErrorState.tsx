"use client";

import { ApiError, NOT_CONFIGURED_STATUS } from "../../lib/api/client";

export function describeError(error: Error | null): string {
  if (!error) return "Something went wrong.";
  if (error instanceof ApiError) {
    if (error.status === NOT_CONFIGURED_STATUS) return error.message;
    if (error.status >= 500) return `The server had a problem (${error.status}). ${error.message}`;
    return error.message;
  }
  // fetch() rejects with a bare TypeError when the backend is unreachable.
  if (error instanceof TypeError) return "Couldn't reach the Zenith backend. Check your connection or try again.";
  return error.message || "Something went wrong.";
}

/** A failure the user can recover from — always offers a retry. */
export function ErrorState({ title = "Couldn't load this", error, onRetry, compact = false, retrying = false, testId = "error-state" }: {
  title?: string;
  error: Error | null;
  onRetry?: () => void;
  compact?: boolean;
  retrying?: boolean;
  testId?: string;
}) {
  const message = describeError(error);
  const retry = onRetry && (
    <button type="button" className="tap" onClick={onRetry} disabled={retrying} style={{
      fontSize: 11, fontWeight: 600, padding: compact ? "2px 8px" : "7px 14px", cursor: retrying ? "default" : "pointer",
      background: "transparent", color: "var(--put)", border: "1px solid var(--put)", opacity: retrying ? 0.6 : 1,
    }}>{retrying ? "Retrying…" : "Retry"}</button>
  );
  if (compact) {
    return (
      <div role="alert" data-testid={testId} style={{
        display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap",
        fontSize: 11, color: "var(--put)", padding: "6px 8px", border: "1px solid var(--put-dim)", background: "var(--put-dim)",
      }}>
        <span><strong>{title}.</strong> {message}</span>
        {retry}
      </div>
    );
  }
  return (
    <div role="alert" data-testid={testId} className="state-box" style={{ borderColor: "var(--put-dim)" }}>
      <div style={{ fontSize: 14, color: "var(--put)" }}>{title}</div>
      <p style={{ fontSize: 12, color: "var(--text-mid)", maxWidth: 380, textAlign: "center", lineHeight: 1.5 }}>{message}</p>
      {retry}
    </div>
  );
}
