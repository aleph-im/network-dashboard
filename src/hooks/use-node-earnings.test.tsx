import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { CreditExpense, NodeState, CCNInfo, CRNInfo } from "@/api/credit-types";
import type { Node, NodeDetail } from "@/api/types";

vi.mock("@/hooks/use-credit-expenses", () => ({
  useCreditExpenses: vi.fn(),
  RANGE_SECONDS: { "24h": 86400, "7d": 604800, "30d": 2592000 },
  getStableExpenseRange: (sec: number) => {
    const end = 1_700_000_000;
    return { start: end - sec, end };
  },
}));
vi.mock("@/hooks/use-node-state", () => ({ useNodeState: vi.fn() }));
vi.mock("@/hooks/use-nodes", () => ({
  useNode: vi.fn(),
  useNodes: vi.fn(),
}));

import { useCreditExpenses } from "@/hooks/use-credit-expenses";
import { useNodeState } from "@/hooks/use-node-state";
import { useNode, useNodes } from "@/hooks/use-nodes";
import { useNodeEarnings } from "./use-node-earnings";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function makeCrn(overrides?: Partial<CRNInfo>): CRNInfo {
  return {
    hash: "crn1",
    name: "CRN-1",
    owner: "0xCRN",
    reward: "0xCRN",
    score: 0.9,
    status: "linked",
    inactiveSince: null,
    parent: "ccn1",
    ...overrides,
  };
}

function makeCcn(overrides?: Partial<CCNInfo>): CCNInfo {
  return {
    hash: "ccn1",
    name: "CCN-1",
    owner: "0xCCN",
    reward: "0xCCN",
    score: 0.8,
    status: "active",
    stakers: {},
    totalStaked: 600_000,
    inactiveSince: null,
    resourceNodes: [],
    ...overrides,
  };
}

function makeState(crns: CRNInfo[], ccns: CCNInfo[]): NodeState {
  return {
    crns: new Map(crns.map((c) => [c.hash, c])),
    ccns: new Map(ccns.map((c) => [c.hash, c])),
  };
}

function makeExpense(
  time: number,
  totalAleph: number,
  nodeId?: string,
  executionId?: string,
): CreditExpense {
  return {
    hash: `exp-${time}`,
    time,
    type: "execution",
    totalAleph,
    creditCount: 1,
    creditPriceAleph: 0.00005,
    credits: [
      {
        address: "0xCustomer",
        amount: 1,
        alephCost: totalAleph,
        ref: "p1",
        timeSec: time,
        nodeId: nodeId ?? null,
        executionId: executionId ?? null,
      },
    ],
  };
}

const NOW = 1_700_000_000;

describe("useNodeEarnings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns CRN role with per-VM breakdown when hash is a CRN", async () => {
    const expenses = [
      makeExpense(NOW - 100, 10, "crn1", "vmA"),
      makeExpense(NOW - 200, 5, "crn1", "vmB"),
    ];
    (useCreditExpenses as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({ data: expenses, isLoading: false, isPlaceholderData: false })
      .mockReturnValueOnce({ data: [], isLoading: false, isPlaceholderData: false });
    (useNodeState as ReturnType<typeof vi.fn>).mockReturnValue({
      data: makeState([makeCrn()], [makeCcn()]),
    });
    (useNode as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { hash: "crn1", vms: [], history: [] } as unknown as NodeDetail,
    });
    (useNodes as ReturnType<typeof vi.fn>).mockReturnValue({ data: [] });

    const { result } = renderHook(() => useNodeEarnings("crn1", "24h"), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data!.role).toBe("crn");
    expect(result.current.data!.totalAleph).toBeCloseTo((10 + 5) * 0.6);
    expect(result.current.data!.perVm).toHaveLength(2);
    expect(result.current.data!.linkedCrns).toBeUndefined();
  });

  it("returns CCN role with linkedCrns when hash is a CCN", async () => {
    (useCreditExpenses as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
      isLoading: false,
      isPlaceholderData: false,
    });
    (useNodeState as ReturnType<typeof vi.fn>).mockReturnValue({
      data: makeState(
        [
          makeCrn({ hash: "crn1", name: "CRN-1", parent: "ccn1" }),
          makeCrn({ hash: "crn2", name: "CRN-2", parent: "ccn1" }),
        ],
        [makeCcn()],
      ),
    });
    (useNode as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { hash: "ccn1", vms: [], history: [] } as unknown as NodeDetail,
    });
    (useNodes as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [
        { hash: "crn1", status: "healthy", vmCount: 2 },
        { hash: "crn2", status: "unreachable", vmCount: 0 },
      ] as unknown as Node[],
    });

    const { result } = renderHook(() => useNodeEarnings("ccn1", "24h"), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data!.role).toBe("ccn");
    expect(result.current.data!.perVm).toBeUndefined();
    expect(result.current.data!.linkedCrns).toEqual([
      { hash: "crn1", name: "CRN-1", status: "healthy", vmCount: 2 },
      { hash: "crn2", name: "CRN-2", status: "unreachable", vmCount: 0 },
    ]);
  });

  it("computes delta = current - previous", async () => {
    const currentExpenses = [makeExpense(NOW - 100, 20, "crn1", "vmA")];
    const previousExpenses = [makeExpense(NOW - 86500, 10, "crn1", "vmA")];

    (useCreditExpenses as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({ data: currentExpenses, isLoading: false, isPlaceholderData: false })
      .mockReturnValueOnce({ data: previousExpenses, isLoading: false, isPlaceholderData: false });
    (useNodeState as ReturnType<typeof vi.fn>).mockReturnValue({
      data: makeState([makeCrn()], [makeCcn()]),
    });
    (useNode as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { hash: "crn1", vms: [], history: [] } as unknown as NodeDetail,
    });
    (useNodes as ReturnType<typeof vi.fn>).mockReturnValue({ data: [] });

    const { result } = renderHook(() => useNodeEarnings("crn1", "24h"), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data!.totalAleph).toBeCloseTo(20 * 0.6);
    expect(result.current.data!.delta.aleph).toBeCloseTo((20 - 10) * 0.6);
  });

  it("isLoading reflects underlying queries", () => {
    (useCreditExpenses as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: true,
      isPlaceholderData: false,
    });
    (useNodeState as ReturnType<typeof vi.fn>).mockReturnValue({ data: undefined });
    (useNode as ReturnType<typeof vi.fn>).mockReturnValue({ data: undefined });
    (useNodes as ReturnType<typeof vi.fn>).mockReturnValue({ data: undefined });

    const { result } = renderHook(() => useNodeEarnings("crn1", "24h"), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });
});
