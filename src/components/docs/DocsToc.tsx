"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { getDocBySlug } from "../../lib/docs/manifest";

export function DocsToc() {
  const pathname = usePathname();
  const currentDoc = getDocBySlug(pathname);

  if (!currentDoc || !currentDoc.headings || currentDoc.headings.length === 0) {
    return null;
  }

  const scrollToHeading = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.pushState(null, "", `#${id}`);
    }
  };

  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        padding: "24px 16px",
        position: "sticky",
        top: 48,
        alignSelf: "flex-start",
        maxHeight: "calc(100vh - 48px)",
        overflowY: "auto",
        fontSize: 12,
      }}
      className="docs-toc"
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-lo)",
          marginBottom: 12,
        }}
      >
        On This Page
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {currentDoc.headings.map((h) => (
          <a
            key={h.id}
            href={`#${h.id}`}
            onClick={(e) => {
              e.preventDefault();
              scrollToHeading(h.id);
            }}
            style={{
              textDecoration: "none",
              color: "var(--text-mid)",
              lineHeight: 1.4,
              paddingLeft: h.level === 3 ? 12 : 0,
              fontSize: h.level === 3 ? 11 : 12,
              borderLeft: "1px solid var(--border-subtle)",
              paddingBottom: 2,
              paddingTop: 2,
            }}
            onMouseOver={(e) => {
              (e.currentTarget as HTMLElement).style.color = "var(--text-hi)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--brand)";
            }}
            onMouseOut={(e) => {
              (e.currentTarget as HTMLElement).style.color = "var(--text-mid)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border-subtle)";
            }}
          >
            {h.title}
          </a>
        ))}
      </nav>

      <div style={{ marginTop: 20, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-lo)",
            fontSize: 11,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
          onMouseOver={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--brand)")}
          onMouseOut={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-lo)")}
        >
          ↑ Back to top
        </button>
      </div>

      <style jsx global>{`
        @media (max-width: 1100px) {
          .docs-toc {
            display: none !important;
          }
        }
      `}</style>
    </aside>
  );
}
