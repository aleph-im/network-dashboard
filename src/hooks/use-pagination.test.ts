import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { usePagination } from "@/hooks/use-pagination";

describe("usePagination", () => {
  const items = Array.from({ length: 120 }, (_, i) => i);

  it("returns first page of items with default pageSize", () => {
    const { result } = renderHook(() => usePagination(items));
    expect(result.current.page).toBe(1);
    expect(result.current.pageSize).toBe(50);
    expect(result.current.totalPages).toBe(3);
    expect(result.current.pageItems).toEqual(items.slice(0, 50));
    expect(result.current.startItem).toBe(1);
    expect(result.current.endItem).toBe(50);
    expect(result.current.totalItems).toBe(120);
  });

  it("navigates to page 2", () => {
    const { result } = renderHook(() => usePagination(items));
    act(() => result.current.setPage(2));
    expect(result.current.page).toBe(2);
    expect(result.current.pageItems).toEqual(items.slice(50, 100));
    expect(result.current.startItem).toBe(51);
    expect(result.current.endItem).toBe(100);
  });

  it("last page has correct partial slice", () => {
    const { result } = renderHook(() => usePagination(items));
    act(() => result.current.setPage(3));
    expect(result.current.pageItems).toEqual(items.slice(100, 120));
    expect(result.current.endItem).toBe(120);
  });

  it("changes page size and resets to page 1", () => {
    const { result } = renderHook(() => usePagination(items));
    act(() => result.current.setPage(2));
    act(() => result.current.setPageSize(25));
    expect(result.current.page).toBe(1);
    expect(result.current.pageSize).toBe(25);
    expect(result.current.totalPages).toBe(5);
    expect(result.current.pageItems).toEqual(items.slice(0, 25));
  });

  it("clamps page when items shrink", () => {
    const { result, rerender } = renderHook(
      ({ data }) => usePagination(data),
      { initialProps: { data: items } },
    );
    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);
    rerender({ data: items.slice(0, 60) });
    expect(result.current.page).toBe(2);
    expect(result.current.totalPages).toBe(2);
  });

  it("returns all items when total <= pageSize", () => {
    const small = items.slice(0, 10);
    const { result } = renderHook(() => usePagination(small));
    expect(result.current.totalPages).toBe(1);
    expect(result.current.pageItems).toEqual(small);
  });
});
