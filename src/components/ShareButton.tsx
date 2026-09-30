"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useWalletStore } from "../lib/store/wallet";
import { downloadBlob } from "../lib/csv";
import { DEFAULT_PRIVACY, type SharePrivacy } from "../lib/share/card";

export type ShareRequest =
  | { kind: "trade"; positionId: string; underlying: string }
  | { kind: "strategy"; templateId: string; underlying: string; expiryDays: number; contracts: number };

interface ShareResult {
  url: string;
  imageUrl: string;
}

export function ShareButton({ request, compact = false }: { request: ShareRequest; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" style={{
        fontSize: compact ? 10 : 11, color: "var(--text-lo)", background: "none",
        border: "1px solid var(--border-default)", padding: compact ? "2px 8px" : "5px 12px", cursor: "pointer",
      }}>
        Share
      </button>
      {/* Portaled so it doesn't inherit layout/alignment from a table cell. */}
      {open && createPortal(<ShareDialog request={request} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

export function ShareDialog({ request, onClose }: { request: ShareRequest; onClose: () => void }) {
  const token = useWalletStore(s => s.token);
  const [privacy, setPrivacy] = useState<SharePrivacy>(DEFAULT_PRIVACY);
  const [result, setResult] = useState<ShareResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // A link is signed for one exact set of privacy choices — changing any
  // of them means generating a new one.
  const toggle = (key: keyof SharePrivacy) => {
    setPrivacy(p => ({ ...p, [key]: !p[key] }));
    setResult(null);
    setCopied(false);
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ ...request, privacy }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "Couldn't create a share link");
      setResult({ url: body.url, imageUrl: body.imageUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create a share link");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
    } catch {
      setError("Clipboard unavailable — copy the link manually.");
    }
  };

  const download = async () => {
    if (!result) return;
    try {
      const res = await fetch(result.imageUrl);
      if (!res.ok) throw new Error();
      downloadBlob(`zenith-${request.underlying.toLowerCase()}-${request.kind}.png`, await res.blob());
    } catch {
      setError("Couldn't download the image.");
    }
  };

  const options: { key: keyof SharePrivacy; label: string; hidden?: boolean }[] = [
    // Strategy previews have no realized P&L to hide.
    { key: "hideAbsolutePnl", label: "Hide dollar P&L (show % only)", hidden: request.kind === "strategy" },
    { key: "hideSize", label: "Hide contract size" },
    { key: "showWallet", label: "Show wallet (truncated, e.g. GABC…WXYZ)" },
  ];
  const btn: React.CSSProperties = {
    flex: 1, padding: "8px 0", fontSize: 12, cursor: "pointer", background: "none",
    border: "1px solid var(--border-default)", color: "var(--text-mid)",
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, textAlign: "left",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div role="dialog" aria-modal="true" aria-labelledby="share-title" onClick={e => e.stopPropagation()} style={{
        width: 440, maxWidth: "calc(100vw - 32px)", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", padding: 20,
      }}>
        <div id="share-title" style={{ fontSize: 14, fontWeight: 700, color: "var(--text-hi)", marginBottom: 4 }}>
          Share {request.kind === "trade" ? "trade" : "strategy"} card
        </div>
        <div style={{ fontSize: 11, color: "var(--text-lo)", marginBottom: 14 }}>
          The card is built from your {request.kind === "trade" ? "recorded trade" : "strategy at current prices"} and signed, so it can&apos;t be edited after sharing.
        </div>

        <fieldset style={{ border: "none", display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          <legend style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-lo)", marginBottom: 6 }}>Privacy</legend>
          {options.filter(o => !o.hidden).map(o => (
            <label key={o.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-mid)" }}>
              <input type="checkbox" checked={privacy[o.key]} onChange={() => toggle(o.key)} />
              {o.label}
            </label>
          ))}
        </fieldset>

        {result && (
          // eslint-disable-next-line @next/next/no-img-element -- dynamic OG image, not a static asset
          <img src={result.imageUrl} alt="Share card preview" width={400} height={210}
            style={{ width: "100%", height: "auto", border: "1px solid var(--border-default)", marginBottom: 10 }} />
        )}
        {result && (
          <input readOnly value={result.url} aria-label="Share link" onFocus={e => e.currentTarget.select()} style={{
            width: "100%", marginBottom: 10, background: "var(--bg-overlay)", border: "1px solid var(--border-default)",
            color: "var(--text-hi)", fontFamily: "var(--font-mono)", fontSize: 10, padding: "6px 8px",
          }} />
        )}
        {error && <div role="alert" style={{ fontSize: 11, color: "var(--put)", marginBottom: 10 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onClose} style={btn}>Close</button>
          {!result ? (
            <button type="button" onClick={create} disabled={busy} style={{
              ...btn, background: "var(--brand)", color: "var(--bg)", border: "none", fontWeight: 700, opacity: busy ? 0.6 : 1,
            }}>{busy ? "Creating…" : "Create link"}</button>
          ) : (
            <>
              <button type="button" onClick={copy} style={btn}>{copied ? "Copied ✓" : "Copy link"}</button>
              <button type="button" onClick={download} style={btn}>Download image</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
