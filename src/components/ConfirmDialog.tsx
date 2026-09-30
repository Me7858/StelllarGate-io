"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useOnline } from "../lib/hooks/useOnline";
import type { ReviewedTransaction } from "../lib/soroban/tx";
import { TransactionSummary } from "./TransactionSummary";

interface Props {
  title: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
  disabledReason?: string;
  /**
   * Clear-signing (#119): the decoded, verified assembled transaction. When
   * present it is shown before the wallet prompt, and a failed intent check
   * disables the confirm button.
   */
  review?: ReviewedTransaction | null;
  children?: React.ReactNode;
}

export function ConfirmDialog({ title, confirmLabel, onConfirm, onCancel, disabled: disabledProp, disabledReason: reasonProp, review, children }: Props) {
  const t = useTranslations();
  const online = useOnline();
  const mismatch = !!review && !review.verification.ok;
  const disabled = disabledProp || !online || mismatch;
  const disabledReason = !online
    ? t("common.offline")
    : mismatch
      ? t("confirm.blocked")
      : reasonProp;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter" && !disabled) onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onConfirm, disabled]);

  return (
    <div onClick={onCancel} className="zn-confirm-backdrop">
      <div onClick={e => e.stopPropagation()} className="zn-confirm-panel" role="dialog" aria-modal="true" aria-label={title}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-hi)", marginBottom: 14 }}>{title}</div>
        {children}
        {review && (
          <div style={{ marginTop: children ? 12 : 0 }}>
            <TransactionSummary review={review} />
          </div>
        )}
        {disabled && disabledReason && (
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--put)" }}>{disabledReason}</div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: "9px 0", background: "none", border: "1px solid var(--border-default)",
            color: "var(--text-mid)", fontSize: 12, cursor: "pointer",
          }}>{t("common.cancel")}</button>
          <button onClick={onConfirm} disabled={disabled} style={{
            flex: 1, padding: "9px 0", background: "var(--brand)", border: "none",
            color: "var(--bg)", fontSize: 12, fontWeight: 700,
            cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
