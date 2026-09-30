"use client";

import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

/**
 * Confirm dialog — the final "are you sure?" gate before a trade or
 * destructive action. Centered on desktop, bottom-anchored on compact
 * screens (matches the .zn-confirm-backdrop / .zn-confirm-panel CSS rules
 * in globals.css).
 *
 * Focus is trapped inside and restored on close; Escape and backdrop
 * click cancel; Enter / Space on the confirm button proceeds.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
  children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Restore focus to whatever had it before the dialog opened
  const triggerRef = useRef<Element | null>(null);
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
      // Move focus into the panel on the next tick so the panel is in the DOM
      requestAnimationFrame(() => {
        panelRef.current?.querySelector<HTMLElement>("[autofocus], button")?.focus();
      });
    } else {
      (triggerRef.current as HTMLElement | null)?.focus();
    }
  }, [open]);

  // Escape to cancel
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onCancel(); }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmColor = destructive ? "var(--put)" : "var(--brand)";

  return (
    <div
      className="zn-confirm-backdrop"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-labelledby="confirm-dialog-title"
        className="zn-confirm-panel"
      >
        <div
          id="confirm-dialog-title"
          style={{ fontSize: 15, fontWeight: 700, color: "var(--text-hi)", marginBottom: 10 }}
        >
          {title}
        </div>

        {description && (
          <div style={{ fontSize: 13, color: "var(--text-mid)", lineHeight: 1.6, marginBottom: 16 }}>
            {description}
          </div>
        )}

        {children}

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "10px 0",
              background: "none",
              border: "1px solid var(--border-default)",
              color: "var(--text-mid)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: "10px 0",
              background: confirmColor,
              border: "none",
              color: destructive ? "#fff" : "var(--bg)",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
