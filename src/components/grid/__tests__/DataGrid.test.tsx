/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import axe from "axe-core";
import { DataGrid } from "../DataGrid";
import type { ColumnDef } from "@tanstack/react-table";

// Mock HTMLElement offsetWidth / clientWidth / scrollHeight for jsdom virtualizer
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, value: 400 });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 400 });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, value: 4000 });
});

interface SampleItem {
  id: string;
  asset: string;
  type: "call" | "put";
  strike: number;
  qty: number;
  date: string;
}

const SAMPLE_DATA: SampleItem[] = [
  { id: "1", asset: "XLM", type: "call", strike: 0.12, qty: 10, date: "2026-03-01" },
  { id: "2", asset: "BTC", type: "call", strike: 65000, qty: 2, date: "2026-03-05" },
  { id: "3", asset: "ETH", type: "put", strike: 3500, qty: 5, date: "2026-03-10" },
  { id: "4", asset: "XLM", type: "put", strike: 0.10, qty: 20, date: "2026-03-15" },
  { id: "5", asset: "SOL", type: "call", strike: 150, qty: 8, date: "2026-03-20" },
];

const COLUMNS: ColumnDef<SampleItem, any>[] = [
  {
    accessorKey: "asset",
    header: "Asset",
    size: 100,
    meta: {
      filterType: "enum",
      filterOptions: [
        { label: "XLM", value: "XLM" },
        { label: "BTC", value: "BTC" },
        { label: "ETH", value: "ETH" },
        { label: "SOL", value: "SOL" },
      ],
    },
  },
  {
    accessorKey: "type",
    header: "Type",
    size: 80,
    meta: {
      filterType: "enum",
    },
  },
  {
    accessorKey: "strike",
    header: "Strike",
    size: 90,
    meta: {
      filterType: "numericRange",
      isNumeric: true,
    },
  },
  {
    accessorKey: "qty",
    header: "Qty",
    size: 70,
    meta: {
      filterType: "numericRange",
      isNumeric: true,
    },
  },
  {
    accessorKey: "date",
    header: "Date",
    size: 110,
    meta: {
      filterType: "dateRange",
    },
  },
];

describe("DataGrid Component", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("renders with ARIA grid roles and column headers", () => {
    render(<DataGrid data={SAMPLE_DATA} columns={COLUMNS} tableId="test-grid" ariaLabel="Test Grid" />);

    const grid = screen.getByRole("grid", { name: "Test Grid" });
    expect(grid).toBeInTheDocument();

    const columnHeaders = screen.getAllByRole("columnheader");
    expect(columnHeaders.length).toBe(5);
    expect(screen.getByText("Asset")).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Strike")).toBeInTheDocument();
    expect(screen.getByText("Qty")).toBeInTheDocument();
    expect(screen.getByText("Date")).toBeInTheDocument();
  });

  test("sorts single column on click and multi-sorts with Shift key", async () => {
    render(<DataGrid data={SAMPLE_DATA} columns={COLUMNS} tableId="test-sort-grid" />);

    const assetHeader = screen.getByText("Asset");
    // Click to sort ascending
    fireEvent.click(assetHeader);

    const assetCol = assetHeader.closest("th");
    expect(assetCol).toHaveAttribute("aria-sort", "ascending");

    // Click again for descending
    fireEvent.click(assetHeader);
    expect(assetCol).toHaveAttribute("aria-sort", "descending");

    // Shift-click Strike header for multi-sort
    const strikeHeader = screen.getByText("Strike");
    fireEvent.click(strikeHeader, { shiftKey: true });

    const strikeCol = strikeHeader.closest("th");
    expect(strikeCol).toHaveAttribute("aria-sort", "descending");
    expect(assetCol).toHaveAttribute("aria-sort", "descending");
  });

  test("filters data using global search input", async () => {
    render(<DataGrid data={SAMPLE_DATA} columns={COLUMNS} tableId="test-filter-grid" />);

    const searchInput = screen.getByPlaceholderText("Search table…");
    fireEvent.change(searchInput, { target: { value: "SOL" } });

    await waitFor(() => {
      expect(screen.getByText("1 of 5 rows")).toBeInTheDocument();
      expect(screen.getByText("SOL")).toBeInTheDocument();
      expect(screen.queryByText("BTC")).not.toBeInTheDocument();
    });

    // Clear search
    const clearBtn = screen.getByLabelText("Clear global search");
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.getByText("5 rows")).toBeInTheDocument();
      expect(screen.getByText("BTC")).toBeInTheDocument();
    });
  });

  test("filters data by numeric range and enum in column filter popover", async () => {
    render(<DataGrid data={SAMPLE_DATA} columns={COLUMNS} tableId="test-col-filter" />);

    // Open Strike column filter popover
    const strikeFilterBtn = screen.getByLabelText("Filter by strike");
    fireEvent.click(strikeFilterBtn);

    const minInput = screen.getByPlaceholderText("Min…");
    fireEvent.change(minInput, { target: { value: "100" } });

    await waitFor(() => {
      // BTC (65000), ETH (3500), SOL (150) are >= 100
      expect(screen.getByText("3 of 5 rows")).toBeInTheDocument();
      expect(screen.getByText("BTC")).toBeInTheDocument();
      expect(screen.queryByText("XLM")).not.toBeInTheDocument();
    });

    // Clear filter
    const clearFiltersBtn = screen.getByText(/Clear filters/i);
    fireEvent.click(clearFiltersBtn);

    await waitFor(() => {
      expect(screen.getByText("5 rows")).toBeInTheDocument();
    });
  });

  test("persists column preferences to localStorage hydration-safely", async () => {
    const { rerender } = render(<DataGrid data={SAMPLE_DATA} columns={COLUMNS} tableId="persisted-table" />);

    // Open Columns menu
    const colMenuBtn = screen.getByRole("button", { name: /Columns/i });
    fireEvent.click(colMenuBtn);

    // Toggle Date column visibility off
    const dateCheckbox = screen.getByLabelText("Date");
    fireEvent.click(dateCheckbox);

    await waitFor(() => {
      const stored = localStorage.getItem("zenith_grid_prefs_v1_persisted-table");
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.columnVisibility.date).toBe(false);
    });

    // Re-render and ensure saved preference persisted
    rerender(<DataGrid data={SAMPLE_DATA} columns={COLUMNS} tableId="persisted-table" />);

    await waitFor(() => {
      const headers = screen.getAllByRole("columnheader");
      expect(headers.length).toBe(4); // Date is hidden
      expect(screen.queryByRole("columnheader", { name: /Date/i })).not.toBeInTheDocument();
    });
  });

  test("supports keyboard navigation with arrow keys and roving tabIndex", async () => {
    render(<DataGrid data={SAMPLE_DATA} columns={COLUMNS} tableId="test-keyboard" />);

    const grid = screen.getByRole("grid");
    grid.focus();

    // Navigate right
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    // Navigate down
    fireEvent.keyDown(grid, { key: "ArrowDown" });

    // Cell at row 1, col 1 should receive focus/data attributes
    await waitFor(() => {
      const activeCell = grid.querySelector('[data-cell-row="1"][data-cell-col="1"]');
      expect(activeCell).toHaveAttribute("tabindex", "0");
    });
  });

  test("renders 10,000 rows smoothly via virtualization", () => {
    // Generate 10k rows
    const largeDataset: SampleItem[] = Array.from({ length: 10000 }, (_, i) => ({
      id: `row-${i}`,
      asset: i % 2 === 0 ? "XLM" : "BTC",
      type: i % 3 === 0 ? "call" : "put",
      strike: 100 + (i % 500),
      qty: (i % 10) + 1,
      date: "2026-03-01",
    }));

    const startTime = performance.now();
    render(
      <DataGrid
        data={largeDataset}
        columns={COLUMNS}
        tableId="perf-10k-grid"
        height={500}
        rowHeight={36}
      />
    );
    const duration = performance.now() - startTime;

    // Fast initial render time
    expect(duration).toBeLessThan(1500);

    // Verify row count text displays 10,000
    expect(screen.getByText("10,000 rows")).toBeInTheDocument();

    // Virtualization: DOM only contains rendered window of rows, not all 10,000 rows simultaneously
    const renderedRows = screen.getAllByRole("row").filter((r) => r.hasAttribute("data-index"));
    expect(renderedRows.length).toBeLessThan(100);
    expect(renderedRows.length).toBeGreaterThan(0);
  });

  test("passes accessibility scan with zero axe violations", async () => {
    const { container } = render(
      <DataGrid data={SAMPLE_DATA} columns={COLUMNS} tableId="a11y-grid" ariaLabel="Accessible Portfolio Grid" />
    );

    const results = await axe.run(container, {
      rules: {
        // In jsdom environment, color-contrast cannot be computed
        "color-contrast": { enabled: false },
      },
    });

    if (results.violations.length > 0) {
      console.error("Axe violations:", results.violations);
    }
    const criticalOrSerious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(criticalOrSerious.length).toBe(0);
    expect(results.violations.length).toBe(0);
  });
});
