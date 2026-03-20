import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSlotRoll } from "@/hooks/use-slot-roll";

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSlotRoll", () => {
  it("returns formatted digits for an integer", () => {
    const { result } = renderHook(() => useSlotRoll(847));
    expect(result.current.map((d) => d.char)).toEqual(["8", "4", "7"]);
  });

  it("formats with commas for large numbers", () => {
    const { result } = renderHook(() =>
      useSlotRoll(142847, { formatted: true }),
    );
    expect(result.current.map((d) => d.char)).toEqual([
      "1", "4", "2", ",", "8", "4", "7",
    ]);
  });

  it("handles decimals", () => {
    const { result } = renderHook(() =>
      useSlotRoll(142847.38, { decimals: 2, formatted: true }),
    );
    const chars = result.current.map((d) => d.char);
    expect(chars).toEqual([
      "1", "4", "2", ",", "8", "4", "7", ".", "3", "8",
    ]);
  });

  it("non-digit characters have offset 0 (no animation)", () => {
    const { result } = renderHook(() =>
      useSlotRoll(1234, { formatted: true }),
    );
    const comma = result.current.find((d) => d.char === ",");
    expect(comma?.offset).toBe(0);
  });

  it("returns offset 0 immediately when reduced motion preferred", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true }),
    );
    const { result } = renderHook(() => useSlotRoll(847));
    expect(result.current.every((d) => d.offset === 0)).toBe(true);
  });

  it("returns offset 0 for value 0", () => {
    const { result } = renderHook(() => useSlotRoll(0));
    expect(result.current).toEqual([{ char: "0", offset: 0 }]);
  });
});
