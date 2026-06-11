import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useNodeEarnings } from "@/hooks/use-node-earnings";
import * as rc from "@/api/rewards-client";
import * as api from "@/api/client";
import * as un from "@/hooks/use-nodes";
import * as ns from "@/hooks/use-node-state";
import type { AddressRewards, RewardsFull } from "@/api/rewards-types";
import type { CRNInfo, NodeState } from "@/api/credit-types";

afterEach(() => vi.restoreAllMocks());

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const FULL: RewardsFull = {
  credit_revenue: { execution_crn: 60, execution_ccn: 10, execution_staker: 20, storage_ccn: 5, storage_staker: 5 },
  holder_tier: { execution_crn: 30, execution_ccn: 4, execution_staker: 6, storage_ccn: 2, storage_staker: 1 },
  wage_subsidy: { crn: 12, ccn: 9, staker: 3 },
};

function rewardsFor(addr: string, fromSec: number, toSec: number): AddressRewards {
  const r: AddressRewards = {
    address: addr,
    totalAleph: 167,
    bySource: { credit_revenue: 100, holder_tier: 43, wage_subsidy: 24 },
    full: FULL,
  };
  // Bucketed query (1h/1d) gets a single-bucket series spanning the window.
  return toSec - fromSec > 0
    ? { ...r, buckets: [{ startSec: fromSec, endSec: toSec, aleph: 167, bySource: r.bySource, full: FULL }] }
    : r;
}

function crn(hash: string, reward: string): CRNInfo {
  return { hash, name: hash, owner: "0xown", reward, score: 0.9, status: "linked", inactiveSince: null, parent: "ccn1" };
}

function mockNodeState(crns: CRNInfo[]): NodeState {
  return { ccns: new Map(), crns: new Map(crns.map((c) => [c.hash, c])) };
}

function setupMocks(args: { crns: CRNInfo[]; exec?: ReturnType<typeof execExpense>[] }) {
  vi.spyOn(rc, "getRewardsTimeSeries").mockImplementation(
    async (addr, from, to) => rewardsFor(addr, from, to),
  );
  const execSpy = vi
    .spyOn(api, "getExecutionExpenses")
    .mockResolvedValue(args.exec ?? []);
  vi.spyOn(ns, "useNodeState").mockReturnValue({ data: mockNodeState(args.crns) } as never);
  vi.spyOn(un, "useNodes").mockReturnValue({ data: args.crns.map((c) => ({ hash: c.hash, vmCount: 2 })) } as never);
  vi.spyOn(un, "useNode").mockReturnValue({ data: { vms: [], history: [] } } as never);
  return { execSpy };
}

function execExpense(time: number, nodeId: string, vm: string, aleph: number) {
  return {
    hash: `e${time}`, time, type: "execution" as const, totalAleph: aleph,
    creditCount: 1, creditPriceAleph: 1,
    credits: [{ address: "0xp", amount: aleph, alephCost: aleph, ref: "r", timeSec: 0, nodeId, executionId: vm, source: "credits" as const }],
  };
}

describe("useNodeEarnings (rewards-layer)", () => {
  it("single-CRN address: exact totals incl. wage, KPI reconciles with buckets", async () => {
    setupMocks({ crns: [crn("crnA", "0xreward")] });
    const { result } = renderHook(() => useNodeEarnings("crnA", "24h"), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const d = result.current.data!;
    expect(d.role).toBe("crn");
    expect(d.totalAleph).toBeCloseTo(60 + 30 + 12); // exec_crn both sources + wage.crn
    expect(d.bySource.wage_subsidy).toBeCloseTo(12);
    expect(d.buckets.reduce((s, b) => s + b.aleph, 0)).toBeCloseTo(d.totalAleph);
    expect(d.weightsExact).toBe(true);
    expect(d.reconciliation!.staker).toBeCloseTo(20 + 5 + 6 + 1 + 3);
    expect(d.reconciliation!.crossKind.aleph).toBeCloseTo(10 + 5 + 4 + 2 + 9);
  });

  it("proxy mode (sparks) never fetches execution expenses", async () => {
    const { execSpy } = setupMocks({ crns: [crn("crnA", "0xreward")] });
    const { result } = renderHook(
      () => useNodeEarnings("crnA", "24h", { weights: "proxy" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(execSpy).not.toHaveBeenCalled();
    expect(result.current.isPerVmLoading).toBe(false);
  });

  it("30d caps the execution window at the trailing 7d (per-VM table only)", async () => {
    const { execSpy } = setupMocks({ crns: [crn("crnA", "0xreward")] });
    const { result } = renderHook(() => useNodeEarnings("crnA", "30d"), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    await waitFor(() => expect(execSpy).toHaveBeenCalled());
    const [start, end] = execSpy.mock.calls[0]! as [number, number];
    expect(end - start).toBe(7 * 86400);
  });

  it("multi-CRN address splits per-VM by realized share and flags proxy weights at 30d", async () => {
    setupMocks({
      crns: [crn("crnA", "0xreward"), crn("crnB", "0xreward")],
      exec: [execExpense(1, "crnA", "vm1", 75), execExpense(1, "crnB", "vm2", 25)],
    });
    const { result } = renderHook(() => useNodeEarnings("crnA", "30d"), { wrapper });
    await waitFor(() => expect(result.current.data?.perVm).toBeDefined());
    const d = result.current.data!;
    expect(d.weightsExact).toBe(false); // 30d → proxy weights for the chart
    // perVm factor = addressExec (60+30) / raw owned 100 → vm1 = 75 * 0.9
    expect(d.perVm![0]!.aleph).toBeCloseTo(75 * 0.9);
  });

  it("surfaces rewards-feed errors", async () => {
    vi.spyOn(rc, "getRewardsTimeSeries").mockRejectedValue(new Error("down"));
    vi.spyOn(api, "getExecutionExpenses").mockResolvedValue([]);
    vi.spyOn(ns, "useNodeState").mockReturnValue({ data: mockNodeState([crn("crnA", "0xreward")]) } as never);
    vi.spyOn(un, "useNodes").mockReturnValue({ data: [] } as never);
    vi.spyOn(un, "useNode").mockReturnValue({ data: undefined } as never);
    const { result } = renderHook(() => useNodeEarnings("crnA", "24h"), { wrapper });
    // useRewards sets retry: 1 (overrides the wrapper's retry: false), so the
    // error state lands only after the ~1s retry backoff.
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
    expect(result.current.data).toBeUndefined();
  });
});
