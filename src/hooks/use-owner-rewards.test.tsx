import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useOwnerRewards } from "@/hooks/use-owner-rewards";
import * as rc from "@/api/rewards-client";
import * as ce from "@/hooks/use-credit-expenses";
import * as ns from "@/hooks/use-node-state";

afterEach(() => vi.restoreAllMocks());

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useOwnerRewards", () => {
  it("assembles cycle + totals + lastPaid for an address", async () => {
    vi.spyOn(rc, "getDistributions").mockResolvedValue({
      startSec: 1000, endSec: 2000,
      rewards: new Map([["0xowner", 82.28]]),
      onChain: new Map([["0xowner", { txHash: "0xtx", status: "pending" }]]),
    });
    vi.spyOn(rc, "getRewardsTimeSeries").mockResolvedValue({
      address: "0xowner", totalAleph: 60,
      bySource: { credit_revenue: 50, holder_tier: 0, wage_subsidy: 10 },
      full: { credit_revenue: { execution_crn: 0, execution_ccn: 0, execution_staker: 50, storage_ccn: 0, storage_staker: 0 }, holder_tier: { execution_crn: 0, execution_ccn: 0, execution_staker: 0, storage_ccn: 0, storage_staker: 0 }, wage_subsidy: { crn: 0, ccn: 0, staker: 10 } },
    });
    vi.spyOn(ce, "useCreditExpenses").mockReturnValue({ data: [], isLoading: false, isPlaceholderData: false } as never);
    vi.spyOn(ns, "useNodeState").mockReturnValue({ data: { crns: new Map(), ccns: new Map() }, isLoading: false } as never);

    const { result } = renderHook(() => useOwnerRewards("0xOWNER"), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const d = result.current.data!;
    expect(d.cycleEndSec).toBe(2000);
    expect(d.totalAleph).toBeCloseTo(60);
    expect(d.stakingAleph).toBeCloseTo(60);
    expect(d.lastPaid!.aleph).toBeCloseTo(82.28);
    expect(d.lastPaid!.txHash).toBe("0xtx");
  });
});
