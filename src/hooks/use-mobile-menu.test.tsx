import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useMobileMenu } from "./use-mobile-menu";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
}));

import { usePathname } from "next/navigation";
const usePathnameMock = vi.mocked(usePathname);

describe("useMobileMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePathnameMock.mockReturnValue("/");
    document.body.style.overflow = "";
  });

  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("starts closed", () => {
    const { result } = renderHook(() => useMobileMenu());
    expect(result.current.open).toBe(false);
  });

  it("toggle flips open state", () => {
    const { result } = renderHook(() => useMobileMenu());
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.open).toBe(false);
  });

  it("close sets open to false", () => {
    const { result } = renderHook(() => useMobileMenu());
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
  });

  it("closes when pathname changes", () => {
    const { result, rerender } = renderHook(() => useMobileMenu());
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    usePathnameMock.mockReturnValue("/nodes");
    rerender();
    expect(result.current.open).toBe(false);
  });

  it("Escape key closes the menu while open", () => {
    const { result } = renderHook(() => useMobileMenu());
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(result.current.open).toBe(false);
  });

  it("Escape key is ignored while closed", () => {
    const { result } = renderHook(() => useMobileMenu());
    expect(result.current.open).toBe(false);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(result.current.open).toBe(false);
  });

  it("locks body scroll while open", () => {
    const { result } = renderHook(() => useMobileMenu());
    expect(document.body.style.overflow).toBe("");
    act(() => result.current.toggle());
    expect(document.body.style.overflow).toBe("hidden");
    act(() => result.current.close());
    expect(document.body.style.overflow).toBe("");
  });

  it("restores body scroll on unmount", () => {
    const { result, unmount } = renderHook(() => useMobileMenu());
    act(() => result.current.toggle());
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
