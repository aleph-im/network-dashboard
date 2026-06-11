import { describe, it, expect, vi, afterEach } from "vitest";
import { getStableHourRange } from "@/hooks/use-rewards";

afterEach(() => vi.useRealTimers());

describe("getStableHourRange", () => {
  it("truncates the end to the start of the current hour", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-11T14:37:23Z"));
    const { start, end } = getStableHourRange(86400);
    expect(end).toBe(Math.floor(Date.parse("2026-06-11T14:00:00Z") / 1000));
    expect(end - start).toBe(86400);
  });
});
