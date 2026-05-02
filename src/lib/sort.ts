import type { Column } from "@aleph-front/ds/table";

export type SortDirection = "asc" | "desc";

/**
 * Sort rows by a column's `sortValue` getter.
 *
 * Mirrors the comparison logic the DS Table uses internally — when the
 * Table runs in controlled mode it skips its own sort, so the parent
 * must pre-sort the dataset using the same rules to keep header
 * indicators and row order in sync.
 */
export function applySort<T>(
  rows: T[],
  columns: Column<T>[],
  sortColumn: string | undefined,
  sortDirection: SortDirection,
): T[] {
  if (!sortColumn) return rows;
  const col = columns.find((c) => c.header === sortColumn);
  if (!col?.sortValue) return rows;
  const getValue = col.sortValue;
  const dir = sortDirection === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aVal = getValue(a);
    const bVal = getValue(b);
    if (typeof aVal === "number" && typeof bVal === "number") {
      return (aVal - bVal) * dir;
    }
    return String(aVal).localeCompare(String(bVal)) * dir;
  });
}
