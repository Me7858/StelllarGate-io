"use client";

import Link from "next/link";

export interface StateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

export function ActionButton({ action, primary = false }: { action: StateAction; primary?: boolean }) {
  const style = {
    fontSize: 12, fontWeight: 600, padding: "7px 14px", textDecoration: "none", cursor: "pointer",
    border: primary ? "none" : "1px solid var(--border-strong)",
    background: primary ? "var(--brand)" : "transparent",
    color: primary ? "var(--bg)" : "var(--brand)",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
  } as const;
  if (action.href) return <Link href={action.href} className="tap" style={style}>{action.label}</Link>;
  return <button type="button" className="tap" onClick={action.onClick} style={style}>{action.label}</button>;
}

/** "There's nothing here yet" — always says why, and what to do next. */
export function EmptyState({ title, description, action, compact = false, testId = "empty-state" }: {
  title: string;
  description?: string;
  action?: StateAction;
  compact?: boolean;
  testId?: string;
}) {
  if (compact) {
    return (
      <div data-testid={testId} style={{ fontSize: 11, color: "var(--text-lo)", lineHeight: 1.5 }}>
        {title}{description ? ` ${description}` : ""}
        {action && <> <ActionButton action={action} /></>}
      </div>
    );
  }
  return (
    <div data-testid={testId} className="state-box">
      <div style={{ fontSize: 14, color: "var(--text-mid)" }}>{title}</div>
      {description && <p style={{ fontSize: 12, color: "var(--text-lo)", maxWidth: 360, textAlign: "center", lineHeight: 1.5 }}>{description}</p>}
      {action && <ActionButton action={action} primary />}
    </div>
  );
}
