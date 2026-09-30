"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { SortingState, VisibilityState, ColumnOrderState, ColumnSizingState } from "@tanstack/react-table";
import type { GridPreferences } from "./types";

const STORAGE_PREFIX = "zenith_grid_prefs_v1_";

export function useGridPreferences(
  tableId: string | undefined,
  initialDefaults: {
    columnOrder?: string[];
    columnVisibility?: VisibilityState;
    columnSizing?: ColumnSizingState;
    sorting?: SortingState;
  }
) {
  const [isHydrated, setIsHydrated] = useState(false);

  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(initialDefaults.columnOrder ?? []);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(initialDefaults.columnVisibility ?? {});
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(initialDefaults.columnSizing ?? {});
  const [sorting, setSorting] = useState<SortingState>(initialDefaults.sorting ?? []);

  const initialDefaultsRef = useRef(initialDefaults);
  initialDefaultsRef.current = initialDefaults;

  // Hydrate from localStorage once on mount
  useEffect(() => {
    if (!tableId || typeof window === "undefined") {
      setIsHydrated(true);
      return;
    }

    try {
      const stored = localStorage.getItem(`${STORAGE_PREFIX}${tableId}`);
      if (stored) {
        const parsed: Partial<GridPreferences> = JSON.parse(stored);
        if (Array.isArray(parsed.columnOrder) && parsed.columnOrder.length > 0) {
          setColumnOrder(parsed.columnOrder);
        }
        if (parsed.columnVisibility && typeof parsed.columnVisibility === "object") {
          setColumnVisibility(parsed.columnVisibility);
        }
        if (parsed.columnSizing && typeof parsed.columnSizing === "object") {
          setColumnSizing(parsed.columnSizing);
        }
        if (Array.isArray(parsed.sorting)) {
          setSorting(parsed.sorting);
        }
      }
    } catch (e) {
      console.warn(`Failed to read grid preferences for ${tableId}:`, e);
    } finally {
      setIsHydrated(true);
    }
  }, [tableId]);

  // Persist to localStorage whenever preferences change (after hydration)
  useEffect(() => {
    if (!isHydrated || !tableId || typeof window === "undefined") return;

    try {
      const prefs: GridPreferences = {
        columnOrder,
        columnVisibility,
        columnSizing,
        sorting,
      };
      localStorage.setItem(`${STORAGE_PREFIX}${tableId}`, JSON.stringify(prefs));
    } catch (e) {
      console.warn(`Failed to save grid preferences for ${tableId}:`, e);
    }
  }, [tableId, isHydrated, columnOrder, columnVisibility, columnSizing, sorting]);

  const resetPreferences = useCallback(() => {
    const defaults = initialDefaultsRef.current;
    setColumnOrder(defaults.columnOrder ?? []);
    setColumnVisibility(defaults.columnVisibility ?? {});
    setColumnSizing(defaults.columnSizing ?? {});
    setSorting(defaults.sorting ?? []);
    if (tableId && typeof window !== "undefined") {
      try {
        localStorage.removeItem(`${STORAGE_PREFIX}${tableId}`);
      } catch (e) {
        console.warn(`Failed to clear grid preferences for ${tableId}:`, e);
      }
    }
  }, [tableId]);

  return {
    isHydrated,
    columnOrder,
    setColumnOrder,
    columnVisibility,
    setColumnVisibility,
    columnSizing,
    setColumnSizing,
    sorting,
    setSorting,
    resetPreferences,
  };
}
