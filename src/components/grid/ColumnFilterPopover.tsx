"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import type { Column, Table } from "@tanstack/react-table";
import type { NumericRangeValue, DateRangeValue, EnumOption } from "./types";

interface ColumnFilterPopoverProps<TData> {
  column: Column<TData, unknown>;
  table: Table<TData>;
}

export function ColumnFilterPopover<TData>({ column, table }: ColumnFilterPopoverProps<TData>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const filterType = column.columnDef.meta?.filterType ?? "text";
  const filterValue = column.getFilterValue();
  const isFiltered = filterValue !== undefined && filterValue !== null && filterValue !== "";

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setIsOpen(false);
      }
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

  // For enum filters, dynamically derive unique options if not statically provided
  const enumOptions = useMemo<EnumOption[]>(() => {
    if (filterType !== "enum") return [];
    if (column.columnDef.meta?.filterOptions) {
      return column.columnDef.meta.filterOptions;
    }
    const uniqueVals = new Set<string>();
    const rows = table.getPreFilteredRowModel().flatRows;
    for (const r of rows) {
      const val = r.getValue(column.id);
      if (val !== undefined && val !== null && val !== "") {
        uniqueVals.add(String(val));
      }
    }
    return Array.from(uniqueVals).sort().map(v => ({ label: v, value: v }));
  }, [filterType, column, table]);

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        type="button"
        aria-label={`Filter by ${column.id}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(v => !v);
        }}
        style={{
          background: isFiltered ? "rgba(181, 150, 101, 0.2)" : "transparent",
          border: isFiltered ? "1px solid var(--brand)" : "1px solid transparent",
          color: isFiltered ? "var(--brand)" : "var(--text-lo)",
          cursor: "pointer",
          padding: "2px 4px",
          fontSize: 10,
          lineHeight: 1,
          borderRadius: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.15s ease",
        }}
        title={isFiltered ? `Filtered: ${JSON.stringify(filterValue)}` : "Filter column"}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label={`Filter options for ${column.id}`}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 100,
            background: "var(--bg-overlay)",
            border: "1px solid var(--border-strong)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            padding: 12,
            minWidth: 220,
            fontSize: 12,
            color: "var(--text-hi)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-hi)", textTransform: "capitalize" }}>
              Filter: {String(column.columnDef.header ?? column.id)}
            </span>
            {isFiltered && (
              <button
                type="button"
                onClick={() => column.setFilterValue(undefined)}
                style={{
                  fontSize: 10,
                  color: "var(--brand)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Reset
              </button>
            )}
          </div>

          {filterType === "text" && (
            <div>
              <input
                type="text"
                autoFocus
                placeholder="Contains text…"
                value={(filterValue as string) ?? ""}
                onChange={(e) => column.setFilterValue(e.target.value || undefined)}
                style={{
                  width: "100%",
                  background: "var(--bg-raised)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-hi)",
                  padding: "6px 8px",
                  fontSize: 11,
                  outline: "none",
                  fontFamily: "var(--font-mono)",
                }}
              />
            </div>
          )}

          {filterType === "enum" && (
            <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              {enumOptions.length === 0 ? (
                <div style={{ color: "var(--text-lo)", fontSize: 11 }}>No values available</div>
              ) : (
                enumOptions.map((opt) => {
                  const currentVals: string[] = Array.isArray(filterValue) ? filterValue : [];
                  const checked = currentVals.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        cursor: "pointer",
                        fontSize: 11,
                        color: checked ? "var(--brand)" : "var(--text-mid)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...currentVals, opt.value]
                            : currentVals.filter((v) => v !== opt.value);
                          column.setFilterValue(next.length > 0 ? next : undefined);
                        }}
                        style={{ accentColor: "var(--brand)" }}
                      />
                      <span>{opt.label}</span>
                    </label>
                  );
                })
              )}
            </div>
          )}

          {filterType === "numericRange" && (
            <div>
              {(() => {
                const range: NumericRangeValue = Array.isArray(filterValue)
                  ? [filterValue[0] ?? null, filterValue[1] ?? null]
                  : [null, null];
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 9, color: "var(--text-lo)", marginBottom: 2 }}>MIN</div>
                      <input
                        type="number"
                        placeholder="Min…"
                        value={range[0] ?? ""}
                        onChange={(e) => {
                          const val = e.target.value === "" ? null : Number(e.target.value);
                          const next: NumericRangeValue = [val, range[1]];
                          column.setFilterValue(next[0] === null && next[1] === null ? undefined : next);
                        }}
                        style={{
                          width: "100%",
                          background: "var(--bg-raised)",
                          border: "1px solid var(--border-default)",
                          color: "var(--text-hi)",
                          padding: "5px 8px",
                          fontSize: 11,
                          fontFamily: "var(--font-mono)",
                        }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: "var(--text-lo)", marginBottom: 2 }}>MAX</div>
                      <input
                        type="number"
                        placeholder="Max…"
                        value={range[1] ?? ""}
                        onChange={(e) => {
                          const val = e.target.value === "" ? null : Number(e.target.value);
                          const next: NumericRangeValue = [range[0], val];
                          column.setFilterValue(next[0] === null && next[1] === null ? undefined : next);
                        }}
                        style={{
                          width: "100%",
                          background: "var(--bg-raised)",
                          border: "1px solid var(--border-default)",
                          color: "var(--text-hi)",
                          padding: "5px 8px",
                          fontSize: 11,
                          fontFamily: "var(--font-mono)",
                        }}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {filterType === "dateRange" && (
            <div>
              {(() => {
                const range: DateRangeValue = Array.isArray(filterValue)
                  ? [filterValue[0] ?? null, filterValue[1] ?? null]
                  : [null, null];
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 9, color: "var(--text-lo)", marginBottom: 2 }}>FROM</div>
                      <input
                        type="date"
                        value={range[0] ?? ""}
                        onChange={(e) => {
                          const val = e.target.value || null;
                          const next: DateRangeValue = [val, range[1]];
                          column.setFilterValue(next[0] === null && next[1] === null ? undefined : next);
                        }}
                        style={{
                          width: "100%",
                          background: "var(--bg-raised)",
                          border: "1px solid var(--border-default)",
                          color: "var(--text-hi)",
                          padding: "4px 8px",
                          fontSize: 11,
                          fontFamily: "var(--font-mono)",
                        }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: "var(--text-lo)", marginBottom: 2 }}>TO</div>
                      <input
                        type="date"
                        value={range[1] ?? ""}
                        onChange={(e) => {
                          const val = e.target.value || null;
                          const next: DateRangeValue = [range[0], val];
                          column.setFilterValue(next[0] === null && next[1] === null ? undefined : next);
                        }}
                        style={{
                          width: "100%",
                          background: "var(--bg-raised)",
                          border: "1px solid var(--border-default)",
                          color: "var(--text-hi)",
                          padding: "4px 8px",
                          fontSize: 11,
                          fontFamily: "var(--font-mono)",
                        }}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
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
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
