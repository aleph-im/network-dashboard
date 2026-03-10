"use client";

import { Pagination } from "@aleph-front/ds/pagination";
import { Select } from "@aleph-front/ds/select";

const PAGE_SIZE_OPTIONS = [
  { value: "25", label: "25" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
];

type TablePaginationProps = {
  page: number;
  totalPages: number;
  pageSize: number;
  startItem: number;
  endItem: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

export function TablePagination({
  page,
  totalPages,
  pageSize,
  startItem,
  endItem,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: TablePaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="my-12 flex flex-wrap items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground tabular-nums">
        Showing {startItem}–{endItem} of {totalItems}
      </span>
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Rows
          </span>
          <Select
            size="sm"
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
            options={PAGE_SIZE_OPTIONS}
          />
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      </div>
    </div>
  );
}
