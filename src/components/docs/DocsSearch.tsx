"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { searchDocs, type DocPage } from "../../lib/docs/manifest";

export function DocsSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const results: DocPage[] = query.trim() ? searchDocs(query) : [];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "6px 12px",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          color: "var(--text-mid)",
          fontSize: 12,
          cursor: "pointer",
          borderRadius: 2,
          width: 240,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span style={{ flex: 1, textAlign: "left" }}>Search documentation...</span>
        <kbd
          style={{
            background: "var(--bg-overlay)",
            border: "1px solid var(--border-strong)",
            padding: "1px 5px",
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            color: "var(--text-lo)",
            borderRadius: 2,
          }}
        >
          ⌘K
        </kbd>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setIsOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(4px)",
            zIndex: 100,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: "12vh",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 580,
              background: "var(--bg-raised)",
              border: "1px solid var(--border-strong)",
              boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "12px 16px",
                borderBottom: "1px solid var(--border-default)",
                gap: 12,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                placeholder="Search mechanics, pricing, collateral, greeks..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--text-hi)",
                  fontSize: 14,
                  fontFamily: "var(--font-sans)",
                }}
              />
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-lo)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                ESC
              </button>
            </div>

            <div style={{ maxHeight: 380, overflowY: "auto", padding: 8 }}>
              {query.trim().length === 0 ? (
                <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-lo)", fontSize: 13 }}>
                  Type keywords to search protocol mechanics, formulas, and calculators.
                </div>
              ) : results.length === 0 ? (
                <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-mid)", fontSize: 13 }}>
                  No documentation found matching &ldquo;{query}&rdquo;
                </div>
              ) : (
                results.map((doc) => (
                  <Link
                    key={doc.slug}
                    href={doc.slug}
                    onClick={() => setIsOpen(false)}
                    style={{
                      display: "block",
                      padding: "10px 12px",
                      textDecoration: "none",
                      borderBottom: "1px solid var(--border-subtle)",
                      borderRadius: 2,
                    }}
                    onMouseOver={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)";
                    }}
                    onMouseOut={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-hi)" }}>{doc.title}</span>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          background: "var(--brand-dim)",
                          color: "var(--brand)",
                          borderRadius: 2,
                        }}
                      >
                        {doc.category}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-mid)", lineHeight: 1.4 }}>{doc.description}</div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
