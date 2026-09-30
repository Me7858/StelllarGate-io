import type { RowData } from "@tanstack/react-table";

export type FilterType = "text" | "enum" | "numericRange" | "dateRange";

export interface EnumOption {
  label: string;
  value: string;
}

export type NumericRangeValue = [number | null, number | null];
export type DateRangeValue = [string | null, string | null];

export interface ColumnMetaCustom<TData extends RowData = any> {
  filterType?: FilterType;
  filterOptions?: EnumOption[];
  headerAlign?: "left" | "center" | "right";
  cellAlign?: "left" | "center" | "right";
  enableExport?: boolean;
  exportHeader?: string;
  exportValue?: (row: TData) => string | number;
  className?: string;
  isNumeric?: boolean;
  minWidth?: number;
  maxWidth?: number;
}

declare module "@tanstack/table-core" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> extends ColumnMetaCustom<TData> {}
}

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> extends ColumnMetaCustom<TData> {}
}

export interface GridPreferences {
  columnOrder: string[];
  columnVisibility: Record<string, boolean>;
  columnSizing: Record<string, number>;
  sorting?: Array<{ id: string; desc: boolean }>;
}
