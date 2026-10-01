"use client";

import React, { useRef, useMemo, useState, useCallback, useEffect } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getExpandedRowModel,
  flexRender,
  type ColumnDef,
  type Row,
  type ColumnFiltersState,
  type Table,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useGridPreferences } from "./useGridPreferences";
import { ColumnFilterPopover } from "./ColumnFilterPopover";
import { ColumnVisibilityMenu } from "./ColumnVisibilityMenu";
import {
  numericRangeFilterFn,
  dateRangeFilterFn,
  enumMultiFilterFn,
  textFilterFn,
  globalFuzzyFilterFn,
} from "./filterFns";
import { toCsv, downloadCsv } from "../../lib/csv";
import "./types";
import type { FilterType } from "./types";

export interface DataGridProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, any>[];
  tableId?: string;
  getRowId?: (row: TData, index: number) => string;
  renderSubComponent?: (props: { row: Row<TData> }) => React.ReactNode;
  isRowExpanded?: (row: Row<TData>) => boolean;
  enableGlobalFilter?: boolean;
  enableColumnFilters?: boolean;
  enableExport?: boolean;
  exportFilename?: string;
  emptyMessage?: React.ReactNode;
  rowHeight?: number;
  maxHeight?: number | string;
  height?: number | string;
  toolbarSlot?: React.ReactNode;
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function DataGrid<TData>({
  data,
  columns,
  tableId,
  getRowId,
  renderSubComponent,
  isRowExpanded,
  enableGlobalFilter = true,
  enableColumnFilters = true,
  enableExport = true,
  exportFilename,
  emptyMessage = "No matching records",
  rowHeight = 40,
  maxHeight,
  height,
  toolbarSlot,
  ariaLabel = "Data Grid",
  className = "",
  style,
}: DataGridProps<TData>) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Preferences (order, sizing, visibility, sorting)
  const defaultColumnOrder = useMemo(() => columns.map((c) => (c.id ?? (c as any).accessorKey ?? "") as string), [columns]);
  const {
    columnOrder,
    setColumnOrder,
    columnVisibility,
    setColumnVisibility,
    columnSizing,
    setColumnSizing,
    sorting,
    setSorting,
    resetPreferences,
  } = useGridPreferences(tableId, {
    columnOrder: defaultColumnOrder,
  });

  // TanStack Table Filter Types Registry
  const filterFns = useMemo(
    () => ({
      numericRange: numericRangeFilterFn,
      dateRange: dateRangeFilterFn,
      enum: enumMultiFilterFn,
      text: textFilterFn,
      globalFuzzy: globalFuzzyFilterFn,
    }),
    []
  );

  // Apply default filterFn to columns based on meta.filterType
  const processedColumns = useMemo(() => {
    return columns.map((col) => {
      const meta = col.meta;
      const fType: FilterType | undefined = meta?.filterType;
      let filterFnName: any = "text";
      if (fType === "numericRange") filterFnName = "numericRange";
      else if (fType === "dateRange") filterFnName = "dateRange";
      else if (fType === "enum") filterFnName = "enum";
      else if (fType === "text") filterFnName = "text";

      return {
        ...col,
        filterFn: col.filterFn ?? filterFnName,
      };
    });
  }, [columns]);

  // Table instance with auto-reset disabled to prevent live data updates from resetting sort/scroll
  const table = useReactTable({
    data,
    columns: processedColumns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      columnOrder,
      columnVisibility,
      columnSizing,
      expanded,
    },
    filterFns,
    globalFilterFn: globalFuzzyFilterFn,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onColumnOrderChange: setColumnOrder,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    onExpandedChange: setExpanded,
    columnResizeMode: "onChange",
    enableColumnResizing: true,
    getRowId: getRowId ?? ((row: any, i: number) => row.id ?? `row-${i}`),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    autoResetPageIndex: false,
    autoResetExpanded: false,
  });

  const { rows } = table.getRowModel();
  const visibleColumns = table.getVisibleLeafColumns();

  // Virtualizer setup
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(
      (index: number) => {
        const row = rows[index];
        if (renderSubComponent && row && (isRowExpanded ? isRowExpanded(row) : row.getIsExpanded())) {
          return rowHeight + 110; // Extra room for subcomponent
        }
        return rowHeight;
      },
      [rows, renderSubComponent, isRowExpanded, rowHeight]
    ),
    overscan: 12,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();

  // CSV Export
  const handleExportCsv = useCallback(() => {
    const exportCols = visibleColumns
      .filter((c) => c.id !== "actions" && c.id !== "select" && c.columnDef.meta?.enableExport !== false)
      .map((c) => ({
        header: c.columnDef.meta?.exportHeader ?? (typeof c.columnDef.header === "string" ? c.columnDef.header : c.id),
        value: (row: TData) => {
          if (c.columnDef.meta?.exportValue) {
            return c.columnDef.meta.exportValue(row);
          }
          const val = (row as any)[c.id];
          return val !== undefined && val !== null ? val : "";
        },
      }));

    const filteredData = table.getFilteredRowModel().rows.map((r) => r.original);
    const fileName = exportFilename ?? `export-${tableId ?? "grid"}-${new Date().toISOString().slice(0, 10)}.csv`;
    const csvContent = toCsv(filteredData, exportCols);
    downloadCsv(fileName, csvContent);
  }, [visibleColumns, table, exportFilename, tableId]);

  // Keyboard navigation state: roving focus coordinates [rowIndex, colIndex]
  const [focusedCoords, setFocusedCoords] = useState<{ rowIndex: number; colIndex: number } | null>(null);

  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (rows.length === 0 || visibleColumns.length === 0) return;

      const numRows = rows.length;
      const numCols = visibleColumns.length;

      let nextRow = focusedCoords?.rowIndex ?? 0;
      let nextCol = focusedCoords?.colIndex ?? 0;
      let handled = false;

      switch (e.key) {
        case "ArrowDown":
          nextRow = Math.min(numRows - 1, nextRow + 1);
          handled = true;
          break;
        case "ArrowUp":
          nextRow = Math.max(0, nextRow - 1);
          handled = true;
          break;
        case "ArrowRight":
          nextCol = Math.min(numCols - 1, nextCol + 1);
          handled = true;
          break;
        case "ArrowLeft":
          nextCol = Math.max(0, nextCol - 1);
          handled = true;
          break;
        case "Home":
          nextCol = 0;
          handled = true;
          break;
        case "End":
          nextCol = numCols - 1;
          handled = true;
          break;
        case "PageDown":
          nextRow = Math.min(numRows - 1, nextRow + 10);
          handled = true;
          break;
        case "PageUp":
          nextRow = Math.max(0, nextRow - 10);
          handled = true;
          break;
        default:
          break;
      }

      if (handled) {
        e.preventDefault();
        setFocusedCoords({ rowIndex: nextRow, colIndex: nextCol });
        rowVirtualizer.scrollToIndex(nextRow, { align: "auto" });

        // Focus the target cell element
        setTimeout(() => {
          const el = parentRef.current?.querySelector<HTMLElement>(
            `[data-cell-row="${nextRow}"][data-cell-col="${nextCol}"]`
          );
          el?.focus();
        }, 0);
      }
    },
    [rows.length, visibleColumns.length, focusedCoords, rowVirtualizer]
  );

  const isAnyFilterActive = globalFilter !== "" || columnFilters.length > 0;
  const clearAllFilters = useCallback(() => {
    setGlobalFilter("");
    setColumnFilters([]);
  }, []);

  return (
    <div
      className={`zenith-datagrid-container ${className}`}
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-raised)",
        border: "1px solid var(--border-default)",
        position: "relative",
        width: "100%",
        fontFamily: "var(--font-sans)",
        ...style,
      }}
    >
      {/* Grid Toolbar */}
      <div
        className="zenith-datagrid-toolbar"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          padding: "10px 14px",
          borderBottom: "1px solid var(--border-default)",
          background: "var(--bg)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 260 }}>
          {enableGlobalFilter && (
            <div style={{ position: "relative", display: "flex", alignItems: "center", maxWidth: 280, width: "100%" }}>
              <span
                style={{
                  position: "absolute",
                  left: 8,
                  pointerEvents: "none",
                  display: "flex",
                  alignItems: "center",
                  color: "var(--text-lo)",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder="Search table…"
                aria-label="Search entire table"
                style={{
                  width: "100%",
                  background: "var(--bg-raised)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-hi)",
                  fontSize: 11,
                  padding: "5px 24px 5px 28px",
                  outline: "none",
                  fontFamily: "var(--font-mono)",
                }}
              />
              {globalFilter && (
                <button
                  type="button"
                  onClick={() => setGlobalFilter("")}
                  aria-label="Clear global search"
                  style={{
                    position: "absolute",
                    right: 6,
                    background: "none",
                    border: "none",
                    color: "var(--text-lo)",
                    cursor: "pointer",
                    fontSize: 11,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {isAnyFilterActive && (
            <button
              type="button"
              onClick={clearAllFilters}
              style={{
                fontSize: 10,
                color: "var(--brand)",
                background: "rgba(181,150,101,0.08)",
                border: "1px solid var(--brand)",
                padding: "4px 8px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span>Clear filters</span>
              {columnFilters.length > 0 && <span style={{ opacity: 0.8 }}>({columnFilters.length})</span>}
            </button>
          )}

          <div style={{ fontSize: 11, color: "var(--text-lo)", whiteSpace: "nowrap" }}>
            {rows.length === data.length
              ? `${rows.length.toLocaleString()} row${rows.length === 1 ? "" : "s"}`
              : `${rows.length.toLocaleString()} of ${data.length.toLocaleString()} rows`}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {toolbarSlot}
          <ColumnVisibilityMenu table={table} onResetPreferences={resetPreferences} />
          {enableExport && (
            <button
              type="button"
              onClick={handleExportCsv}
              aria-label="Export grid data to CSV"
              style={{
                fontSize: 11,
                color: "var(--text-mid)",
                background: "var(--bg-raised)",
                border: "1px solid var(--border-default)",
                padding: "5px 12px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Export CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Virtualized Table Viewport */}
      <div
        ref={parentRef}
        tabIndex={0}
        onKeyDown={handleGridKeyDown}
        style={{
          height: height ?? (maxHeight ? undefined : 460),
          maxHeight: maxHeight ?? undefined,
          overflow: "auto",
          position: "relative",
          outline: "none",
        }}
      >
        <table
          role="grid"
          aria-label={ariaLabel}
          aria-rowcount={rows.length}
          aria-colcount={visibleColumns.length}
          style={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "fixed",
            minWidth: "max-content",
          }}
        >
          {/* Sticky Header Group */}
          <thead
            role="rowgroup"
            style={{
              position: "sticky",
              top: 0,
              zIndex: 20,
              background: "var(--bg-overlay)",
              boxShadow: "0 1px 0 var(--border-default)",
            }}
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} role="row" style={{ borderBottom: "1px solid var(--border-default)" }}>
                {headerGroup.headers.map((header, colIndex) => {
                  const canSort = header.column.getCanSort();
                  const isSorted = header.column.getIsSorted();
                  const sortIndex = header.column.getSortIndex();
                  const meta = header.column.columnDef.meta;
                  const align = meta?.headerAlign ?? (meta?.isNumeric ? "right" : "left");
                  const width = header.getSize();

                  return (
                    <th
                      key={header.id}
                      role="columnheader"
                      aria-sort={isSorted ? (isSorted === "asc" ? "ascending" : "descending") : "none"}
                      aria-colindex={colIndex + 1}
                      style={{
                        width,
                        minWidth: meta?.minWidth ?? 40,
                        maxWidth: meta?.maxWidth ?? undefined,
                        padding: "8px 10px",
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: isSorted ? "var(--text-hi)" : "var(--text-lo)",
                        textAlign: align,
                        background: "var(--bg-overlay)",
                        userSelect: "none",
                        position: "relative",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start",
                          gap: 6,
                          width: "100%",
                        }}
                      >
                        <span
                          onClick={canSort ? (e) => header.column.getToggleSortingHandler()?.(e) : undefined}
                          style={{
                            cursor: canSort ? "pointer" : "default",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                          title={canSort ? "Click to sort (Shift+Click for multi-sort)" : undefined}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort && (
                            <span style={{ fontSize: 9, opacity: isSorted ? 1 : 0.35, color: isSorted ? "var(--brand)" : "inherit" }}>
                              {isSorted === "asc" ? "▲" : isSorted === "desc" ? "▼" : "⇅"}
                              {table.getState().sorting.length > 1 && sortIndex >= 0 && (
                                <sup style={{ fontSize: 8, marginLeft: 1 }}>{sortIndex + 1}</sup>
                              )}
                            </span>
                          )}
                        </span>

                        {enableColumnFilters && header.column.getCanFilter() && (
                          <ColumnFilterPopover column={header.column} table={table} />
                        )}
                      </div>

                      {/* Column Resize Handle */}
                      {header.column.getCanResize() && (
                        <div
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          style={{
                            position: "absolute",
                            right: 0,
                            top: 0,
                            height: "100%",
                            width: 5,
                            cursor: "col-resize",
                            userSelect: "none",
                            touchAction: "none",
                            background: header.column.getIsResizing() ? "var(--brand)" : "transparent",
                          }}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          {/* Virtualized Body */}
          <tbody
            role="rowgroup"
            style={{
              position: "relative",
              height: `${rowVirtualizer.getTotalSize()}px`,
            }}
          >
            {rows.length === 0 ? (
              <tr role="row">
                <td
                  colSpan={visibleColumns.length}
                  role="gridcell"
                  style={{
                    textAlign: "center",
                    padding: "48px 16px",
                    color: "var(--text-lo)",
                    fontSize: 13,
                  }}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              virtualRows.map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) return null;
                const isExpanded = isRowExpanded ? isRowExpanded(row) : row.getIsExpanded();

                return (
                  <React.Fragment key={row.id}>
                    <tr
                      role="row"
                      aria-rowindex={virtualRow.index + 1}
                      data-index={virtualRow.index}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                        borderBottom: "1px solid var(--border-subtle)",
                        background: virtualRow.index % 2 === 1 ? "rgba(255,255,255,0.015)" : "transparent",
                        display: "flex",
                        alignItems: "stretch",
                      }}
                    >
                      {row.getVisibleCells().map((cell, colIndex) => {
                        const meta = cell.column.columnDef.meta;
                        const align = meta?.cellAlign ?? (meta?.isNumeric ? "right" : "left");
                        const width = cell.column.getSize();
                        const isFocused =
                          focusedCoords?.rowIndex === virtualRow.index && focusedCoords?.colIndex === colIndex;

                        return (
                          <td
                            key={cell.id}
                            role="gridcell"
                            aria-colindex={colIndex + 1}
                            tabIndex={isFocused ? 0 : -1}
                            data-cell-row={virtualRow.index}
                            data-cell-col={colIndex}
                            onFocus={() => setFocusedCoords({ rowIndex: virtualRow.index, colIndex })}
                            style={{
                              width,
                              minWidth: meta?.minWidth ?? 40,
                              maxWidth: meta?.maxWidth ?? undefined,
                              padding: "8px 10px",
                              fontSize: 11,
                              textAlign: align,
                              display: "flex",
                              alignItems: "center",
                              justifyContent:
                                align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start",
                              overflow: "hidden",
                              whiteSpace: "nowrap",
                              outline: isFocused ? "1px solid var(--brand)" : "none",
                              outlineOffset: -1,
                            }}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Sub-component (inline drawer / expander) */}
                    {renderSubComponent && isExpanded && (
                      <tr
                        role="row"
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          transform: `translateY(${virtualRow.start + rowHeight}px)`,
                          zIndex: 5,
                        }}
                      >
                        <td
                          colSpan={visibleColumns.length}
                          role="gridcell"
                          style={{
                            padding: "12px 16px",
                            background: "var(--bg-elevated)",
                            borderBottom: "1px solid var(--border-subtle)",
                            width: "100%",
                          }}
                        >
                          {renderSubComponent({ row })}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
