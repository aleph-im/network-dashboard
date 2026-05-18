import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useMobileDrawer } from "./use-mobile-drawer";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
}));

import { usePathname } from "next/navigation";
const usePathnameMock = vi.mocked(usePathname);

describe("useMobileDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePathnameMock.mockReturnValue("/");
  });

  it("starts closed", () => {
    const { result } = renderHook(() => useMobileDrawer());
    expect(result.current.open).toBe(false);
  });

  it("openDrawer sets open to true", () => {
    const { result } = renderHook(() => useMobileDrawer());
    act(() => result.current.openDrawer());
    expect(result.current.open).toBe(true);
  });

  it("closeDrawer sets open to false", () => {
    const { result } = renderHook(() => useMobileDrawer());
    act(() => result.current.openDrawer());
    act(() => result.current.closeDrawer());
    expect(result.current.open).toBe(false);
  });

  it("toggle flips open state", () => {
    const { result } = renderHook(() => useMobileDrawer());
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.open).toBe(false);
  });

  it("closes when pathname changes", () => {
    const { result, rerender } = renderHook(() => useMobileDrawer());
    act(() => result.current.openDrawer());
    expect(result.current.open).toBe(true);
    usePathnameMock.mockReturnValue("/nodes");
    rerender();
    expect(result.current.open).toBe(false);
  });
});
