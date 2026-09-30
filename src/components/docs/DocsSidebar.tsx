"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOCS_MANIFEST, type DocPage } from "../../lib/docs/manifest";

const CATEGORIES = [
  "Getting Started",
  "Protocol Mechanics",
  "Risk & Collateral",
  "Architecture & Reference",
] as const;

export function DocsSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const normalizedPath = pathname === "/docs" ? "/docs" : pathname.replace(/\/$/, "");

  return (
    <>
      {/* Mobile Menu Toggle Bar */}
      <div
        style={{
          display: "none",
          padding: "8px 16px",
          background: "var(--bg-raised)",
          borderBottom: "1px solid var(--border-default)",
          alignItems: "center",
          justifyContent: "space-between",
        }}
        className="docs-mobile-bar"
      >
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "none",
            border: "1px solid var(--border-default)",
            color: "var(--text-hi)",
            padding: "4px 8px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          <span>☰</span>
          <span>Documentation Menu</span>
        </button>
      </div>

      <aside
        style={{
          width: 260,
          flexShrink: 0,
          borderRight: "1px solid var(--border-default)",
          background: "var(--bg-raised)",
          padding: "24px 16px",
          minHeight: "calc(100vh - 48px)",
          position: "sticky",
          top: 48,
          alignSelf: "flex-start",
          height: "calc(100vh - 48px)",
          overflowY: "auto",
        }}
        className={`docs-sidebar ${mobileOpen ? "open" : ""}`}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {CATEGORIES.map((category) => {
            const pages = DOCS_MANIFEST.filter((doc) => doc.category === category);
            if (pages.length === 0) return null;

            return (
              <div key={category}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--text-lo)",
                    marginBottom: 8,
                    paddingLeft: 8,
                  }}
                >
                  {category}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {pages.map((page) => {
                    const isActive = normalizedPath === page.slug;
                    return (
                      <Link
                        key={page.slug}
                        href={page.slug}
                        onClick={() => setMobileOpen(false)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "6px 10px",
                          borderRadius: 2,
                          textDecoration: "none",
                          fontSize: 13,
                          fontWeight: isActive ? 600 : 400,
                          color: isActive ? "var(--brand)" : "var(--text-mid)",
                          background: isActive ? "var(--brand-dim)" : "transparent",
                          borderLeft: isActive ? "2px solid var(--brand)" : "2px solid transparent",
                          transition: "color 100ms, background 100ms",
                        }}
                      >
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {page.title}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            fontFamily: "var(--font-mono)",
                            color: isActive ? "var(--brand)" : "var(--text-lo)",
                            flexShrink: 0,
                            marginLeft: 6,
                          }}
                        >
                          {page.readTime.replace(" read", "")}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      <style jsx global>{`
        @media (max-width: 820px) {
          .docs-mobile-bar {
            display: flex !important;
          }
          .docs-sidebar {
            position: fixed !important;
            top: 48px !important;
            left: 0 !important;
            bottom: 0 !important;
            z-index: 80 !important;
            width: 280px !important;
            transform: translateX(-100%);
            transition: transform 200ms ease;
            box-shadow: 20px 0 40px rgba(0, 0, 0, 0.6);
          }
          .docs-sidebar.open {
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}
