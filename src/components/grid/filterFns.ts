import type { FilterFn } from "@tanstack/react-table";
import type { NumericRangeValue, DateRangeValue } from "./types";

export const numericRangeFilterFn: FilterFn<any> = (row, columnId, filterValue: NumericRangeValue) => {
  if (!filterValue) return true;
  const [min, max] = filterValue;
  if (min === null && max === null) return true;

  const rawValue = row.getValue(columnId);
  if (rawValue === null || rawValue === undefined || rawValue === "") return false;
  const numValue = Number(rawValue);
  if (Number.isNaN(numValue)) return false;

  if (min !== null && numValue < min) return false;
  if (max !== null && numValue > max) return false;
  return true;
};

export const dateRangeFilterFn: FilterFn<any> = (row, columnId, filterValue: DateRangeValue) => {
  if (!filterValue) return true;
  const [start, end] = filterValue;
  if (!start && !end) return true;

  const rawValue = row.getValue(columnId);
  if (!rawValue) return false;
  const rowTime = new Date(rawValue as string).getTime();
  if (Number.isNaN(rowTime)) return false;

  if (start) {
    const startTime = new Date(start).getTime();
    if (!Number.isNaN(startTime) && rowTime < startTime) return false;
  }
  if (end) {
    // Treat end of day for date strings like YYYY-MM-DD
    const endDate = new Date(end);
    if (!end.includes("T")) {
      endDate.setHours(23, 59, 59, 999);
    }
    const endTime = endDate.getTime();
    if (!Number.isNaN(endTime) && rowTime > endTime) return false;
  }
  return true;
};

export const enumMultiFilterFn: FilterFn<any> = (row, columnId, filterValue: string[]) => {
  if (!filterValue || filterValue.length === 0) return true;
  const rawValue = row.getValue(columnId);
  if (rawValue === null || rawValue === undefined) return false;
  return filterValue.includes(String(rawValue));
};

export const textFilterFn: FilterFn<any> = (row, columnId, filterValue: string) => {
  if (!filterValue) return true;
  const rawValue = row.getValue(columnId);
  if (rawValue === null || rawValue === undefined) return false;
  return String(rawValue).toLowerCase().includes(filterValue.toLowerCase().trim());
};

export const globalFuzzyFilterFn: FilterFn<any> = (row, _columnId, filterValue: string) => {
  if (!filterValue) return true;
  const needle = filterValue.toLowerCase().trim();
  if (!needle) return true;

  // Search across visible cell values
  const cells = row.getAllCells();
  for (const cell of cells) {
    const val = cell.getValue();
    if (val !== null && val !== undefined && String(val).toLowerCase().includes(needle)) {
      return true;
    }
  }
  return false;
};
