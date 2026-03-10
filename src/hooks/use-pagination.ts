import { useState, useMemo } from "react";

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

type UsePaginationResult<T> = {
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  startItem: number;
  endItem: number;
  pageItems: T[];
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  pageSizeOptions: readonly number[];
};

export function usePagination<T>(
  items: T[],
  initialPageSize = DEFAULT_PAGE_SIZE,
): UsePaginationResult<T> {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(initialPageSize);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const clampedPage = Math.min(page, totalPages);
  if (clampedPage !== page) {
    setPage(clampedPage);
  }

  const pageItems = useMemo(() => {
    const start = (clampedPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, clampedPage, pageSize]);

  const startItem =
    totalItems === 0 ? 0 : (clampedPage - 1) * pageSize + 1;
  const endItem = Math.min(clampedPage * pageSize, totalItems);

  function handleSetPageSize(size: number) {
    setPageSizeRaw(size);
    setPage(1);
  }

  return {
    page: clampedPage,
    pageSize,
    totalPages,
    totalItems,
    startItem,
    endItem,
    pageItems,
    setPage,
    setPageSize: handleSetPageSize,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
  };
}
