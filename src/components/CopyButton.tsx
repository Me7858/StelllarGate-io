"use client";

import { useState } from "react";

/**
 * Copy-to-clipboard button. Falls back to a hidden textarea +
 * document.execCommand on browsers (and insecure origins) where the async
 * Clipboard API is unavailable, and always clears the "copied" flag so the
 * label cannot get stuck claiming a copy that never happened.
 */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const el = document.createElement("textarea");
        el.value = value;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard permission denied or no secure context — leave the
      // button unacknowledged rather than lying about having copied.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied to clipboard" : label}
      style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase",
        color: copied ? "var(--call)" : "var(--text-lo)",
        background: "none", border: "1px solid var(--border-default)",
        padding: "2px 6px", cursor: "pointer", flexShrink: 0,
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

/** A monospace value with a copy affordance, used for IDs and hashes. */
export function CopyableValue({ value, title }: { value: string; title?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      <span
        className="num"
        title={title ?? value}
        style={{
          fontSize: 11, color: "var(--text-hi)", overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
      <CopyButton value={value} />
    </div>
  );
}
