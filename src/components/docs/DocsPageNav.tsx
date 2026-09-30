"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getDocBySlug, getDocNeighbors } from "../../lib/docs/manifest";

export function DocsPageNav() {
  const pathname = usePathname();
  const currentDoc = getDocBySlug(pathname);
  const { prev, next } = getDocNeighbors(pathname);

  return (
    <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid var(--border-default)" }}>
      {/* Source Reference Callout */}
      {currentDoc?.sourceReference && (
        <div
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            borderLeft: "3px solid var(--brand)",
            padding: "14px 16px",
            marginBottom: 32,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-hi)" }}>
              Direct Production Implementation
            </div>
            <div style={{ fontSize: 11, color: "var(--text-mid)", marginTop: 2 }}>
              The mathematical formulas on this page correspond directly to production code in{" "}
              <code style={{ color: "var(--brand)" }}>{currentDoc.sourceReference.file}</code>
              {currentDoc.sourceReference.lines && ` (lines ${currentDoc.sourceReference.lines})`}.
            </div>
          </div>
          <a
            href={currentDoc.sourceReference.url}
            target="_blank"
            rel="noreferrer"
            style={{
              padding: "4px 10px",
              background: "var(--brand-dim)",
              color: "var(--brand)",
              border: "1px solid var(--brand)",
              fontSize: 11,
              fontWeight: 600,
              textDecoration: "none",
              borderRadius: 2,
            }}
          >
            Inspect Source Code ↗
          </a>
        </div>
      )}

      {/* Prev / Next Page Buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {prev ? (
          <Link
            href={prev.slug}
            style={{
              display: "block",
              padding: 16,
              background: "var(--bg-raised)",
              border: "1px solid var(--border-default)",
              borderRadius: 2,
              textDecoration: "none",
              transition: "border-color 120ms",
            }}
            onMouseOver={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--brand)")}
            onMouseOut={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--border-default)")}
          >
            <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-lo)", letterSpacing: "0.05em" }}>
              ← Previous
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-hi)", marginTop: 4 }}>{prev.title}</div>
            <div style={{ fontSize: 11, color: "var(--text-mid)", marginTop: 2 }}>{prev.category}</div>
          </Link>
        ) : (
          <div />
        )}

        {next ? (
          <Link
            href={next.slug}
            style={{
              display: "block",
              padding: 16,
              background: "var(--bg-raised)",
              border: "1px solid var(--border-default)",
              borderRadius: 2,
              textDecoration: "none",
              textAlign: "right",
              transition: "border-color 120ms",
            }}
            onMouseOver={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--brand)")}
            onMouseOut={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--border-default)")}
          >
            <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--text-lo)", letterSpacing: "0.05em" }}>
              Next →
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-hi)", marginTop: 4 }}>{next.title}</div>
            <div style={{ fontSize: 11, color: "var(--text-mid)", marginTop: 2 }}>{next.category}</div>
          </Link>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}
