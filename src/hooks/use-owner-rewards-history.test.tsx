import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useOwnerRewardsHistory } from "@/hooks/use-owner-rewards-history";
import * as rc from "@/api/rewards-client";

afterEach(() => vi.restoreAllMocks());

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const ZERO_FULL = {
  credit_revenue: { execution_crn: 0, execution_ccn: 0, execution_staker: 0, storage_ccn: 0, storage_staker: 0 },
  holder_tier: { execution_crn: 0, execution_ccn: 0, execution_staker: 0, storage_ccn: 0, storage_staker: 0 },
  wage_subsidy: { crn: 0, ccn: 0, staker: 0 },
};

function bucket(startISO: string, endISO: string, credit: number, holder: number, wage: number) {
  return {
    startSec: Math.floor(Date.parse(startISO) / 1000),
    endSec: Math.floor(Date.parse(endISO) / 1000),
    aleph: credit + holder + wage,
    bySource: { credit_revenue: credit, holder_tier: holder, wage_subsidy: wage },
    full: ZERO_FULL,
  };
}

describe("useOwnerRewardsHistory", () => {
  it("maps 1mo buckets to labeled months and flags the current month partial", async () => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const cur = new Date(Date.UTC(y, m, 1)).toISOString();
    const prev = new Date(Date.UTC(y, m - 1, 1)).toISOString();
    const prevPrev = new Date(Date.UTC(y, m - 2, 1)).toISOString();

    vi.spyOn(rc, "getRewardsTimeSeries").mockResolvedValue({
      address: "0xowner",
      totalAleph: 0,
      bySource: { credit_revenue: 0, holder_tier: 0, wage_subsidy: 0 },
      full: ZERO_FULL,
      buckets: [
        bucket(prevPrev, prev, 100, 10, 5),
        bucket(prev, cur, 120, 400, 5),
        bucket(cur, now.toISOString(), 8, 30, 0.3),
      ],
    });

    const { result } = renderHook(() => useOwnerRewardsHistory("0xOWNER"), { wrapper });
    await waitFor(() => expect(result.current.months.length).toBe(3));
    const months = result.current.months;
    expect(months[0]!.total).toBeCloseTo(115);
    expect(months[1]!.bySource.holder_tier).toBeCloseTo(400);
    expect(months[0]!.partial).toBe(false);
    expect(months[2]!.partial).toBe(true);
    expect(result.current.isError).toBe(false);
  });

  it("is empty and not loading for an empty address", () => {
    const { result } = renderHook(() => useOwnerRewardsHistory(""), { wrapper });
    expect(result.current.months).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });
});
