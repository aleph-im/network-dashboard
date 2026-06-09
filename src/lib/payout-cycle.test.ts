import { describe, it, expect } from "vitest";
import { CYCLE_LENGTH_SEC, nextPaymentEstimate, cycleProgress } from "@/lib/payout-cycle";

describe("payout-cycle", () => {
  it("estimates next payment ~10 days after cycle end", () => {
    const end = 1_000_000;
    expect(nextPaymentEstimate(end)).toBe(end + CYCLE_LENGTH_SEC);
  });

  it("clamps progress to [0,1]", () => {
    const start = 0;
    const next = CYCLE_LENGTH_SEC;
    expect(cycleProgress(start, next, -10)).toBe(0);
    expect(cycleProgress(start, next, CYCLE_LENGTH_SEC / 2)).toBeCloseTo(0.5);
    expect(cycleProgress(start, next, CYCLE_LENGTH_SEC * 2)).toBe(1);
  });

  it("handles a zero-length window without NaN", () => {
    expect(cycleProgress(5, 5, 5)).toBe(1);
  });
});
