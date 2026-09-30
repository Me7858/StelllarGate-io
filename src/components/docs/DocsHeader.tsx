"use client";

import React from "react";
import Link from "next/link";
import { Logo } from "../Logo";
import { DocsSearch } from "./DocsSearch";

export function DocsHeader() {
  return (
    <header
      style={{
        height: 48,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        borderBottom: "1px solid var(--border-default)",
        background: "var(--bg-raised)",
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <Logo size={18} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-hi)", fontFamily: "var(--font-serif)" }}>
            Zenith
          </span>
        </Link>
        <div style={{ width: 1, height: 18, background: "var(--border-default)" }} />
        <Link
          href="/docs"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--brand)",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span>Protocol Docs</span>
          <span
            style={{
              fontSize: 10,
              padding: "1px 5px",
              background: "var(--brand-dim)",
              borderRadius: 2,
              fontFamily: "var(--font-mono)",
            }}
          >
            v1.0
          </span>
        </Link>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <DocsSearch />

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href="/options"
            style={{
              padding: "5px 12px",
              background: "var(--brand)",
              color: "var(--bg)",
              fontSize: 12,
              fontWeight: 700,
              textDecoration: "none",
              borderRadius: 2,
            }}
          >
            Launch Terminal
          </Link>
          <a
            href="https://github.com/Zenith-options/frontend"
            target="_blank"
            rel="noreferrer"
            style={{
              color: "var(--text-mid)",
              fontSize: 12,
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
            onMouseOver={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-hi)")}
            onMouseOut={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-mid)")}
          >
            GitHub ↗
          </a>
        </div>
      </div>
    </header>
  );
}
