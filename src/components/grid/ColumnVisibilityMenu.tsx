"use client";

import { useEffect, useRef, useState } from "react";
import type { Table } from "@tanstack/react-table";

interface ColumnVisibilityMenuProps<TData> {
  table: Table<TData>;
  onResetPreferences?: () => void;
}

export function ColumnVisibilityMenu<TData>({ table, onResetPreferences }: ColumnVisibilityMenuProps<TData>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const allColumns = table.getAllLeafColumns().filter((col) => col.id !== "actions" && col.id !== "select");
  const visibleCount = allColumns.filter((col) => col.getIsVisible()).length;

  const handleMoveColumn = (colId: string, direction: -1 | 1) => {
    const currentOrder = table.getState().columnOrder.length > 0
      ? [...table.getState().columnOrder]
      : table.getAllLeafColumns().map((c) => c.id);

    const idx = currentOrder.indexOf(colId);
    if (idx === -1) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= currentOrder.length) return;

    const temp = currentOrder[idx];
    currentOrder[idx] = currentOrder[targetIdx];
    currentOrder[targetIdx] = temp;
    table.setColumnOrder(currentOrder);
  };

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
        style={{
          fontSize: 11,
          color: "var(--text-mid)",
          background: "var(--bg-raised)",
          border: "1px solid var(--border-default)",
          padding: "5px 10px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7m0-18H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7m0-18v18" />
        </svg>
        <span>Columns ({visibleCount}/{allColumns.length})</span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Column visibility and order settings"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 100,
            background: "var(--bg-overlay)",
            border: "1px solid var(--border-strong)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
            padding: 12,
            minWidth: 240,
            fontSize: 11,
            color: "var(--text-hi)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--border-default)" }}>
            <span style={{ fontWeight: 600 }}>Columns & Layout</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => table.toggleAllColumnsVisible(true)}
                style={{ fontSize: 10, color: "var(--brand)", background: "none", border: "none", cursor: "pointer" }}
              >
                All
              </button>
              {onResetPreferences && (
                <button
                  type="button"
                  onClick={() => {
                    onResetPreferences();
                    setIsOpen(false);
                  }}
                  style={{ fontSize: 10, color: "var(--text-lo)", background: "none", border: "none", cursor: "pointer" }}
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {allColumns.map((col, idx) => {
              const headerText = typeof col.columnDef.header === "string" ? col.columnDef.header : col.id;
              const isVisible = col.getIsVisible();
              return (
                <div
                  key={col.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "3px 4px",
                    background: isVisible ? "transparent" : "rgba(0,0,0,0.15)",
                  }}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1, minWidth: 0 }}>
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={col.getToggleVisibilityHandler()}
                      style={{ accentColor: "var(--brand)" }}
                    />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isVisible ? "var(--text-hi)" : "var(--text-lo)" }}>
                      {headerText}
                    </span>
                  </label>

                  <div style={{ display: "flex", gap: 2, marginLeft: 8 }}>
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveColumn(col.id, -1)}
                      title="Move left/up"
                      style={{
                        padding: "1px 4px",
                        fontSize: 9,
                        background: "none",
                        border: "1px solid var(--border-default)",
                        color: idx === 0 ? "var(--text-lo)" : "var(--text-mid)",
                        cursor: idx === 0 ? "default" : "pointer",
                      }}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={idx === allColumns.length - 1}
                      onClick={() => handleMoveColumn(col.id, 1)}
                      title="Move right/down"
                      style={{
                        padding: "1px 4px",
                        fontSize: 9,
                        background: "none",
                        border: "1px solid var(--border-default)",
                        color: idx === allColumns.length - 1 ? "var(--text-lo)" : "var(--text-mid)",
                        cursor: idx === allColumns.length - 1 ? "default" : "pointer",
                      }}
                    >
                      ▼
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 10, paddingTop: 6, borderTop: "1px solid var(--border-subtle)", textAlign: "right" }}>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{
                background: "var(--brand)",
                color: "var(--bg)",
                border: "none",
                fontSize: 10,
                fontWeight: 600,
                padding: "4px 10px",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
