import { describe, expect, it } from "vitest";
import {
  computeDistributionSummary,
  computeScoreMultiplier,
  distributeExpense,
} from "./credit-distribution";
import type {
  CCNInfo,
  CRNInfo,
  CreditExpense,
  NodeState,
} from "@/api/credit-types";

function makeNodeState(
  overrides?: Partial<{ ccns: CCNInfo[]; crns: CRNInfo[] }>,
): NodeState {
  const ccns = new Map<string, CCNInfo>();
  const crns = new Map<string, CRNInfo>();

  for (const ccn of overrides?.ccns ?? [
    {
      hash: "ccn1",
      name: "CCN-1",
      owner: "0xCCN1",
      reward: "0xCCN1",
      score: 0.8,
      status: "active",
      stakers: { "0xStaker1": 100000, "0xStaker2": 50000 },
      totalStaked: 150000,
      inactiveSince: null,
      resourceNodes: [],
    },
  ]) {
    ccns.set(ccn.hash, ccn);
  }

  for (const crn of overrides?.crns ?? [
    {
      hash: "crn1",
      name: "CRN-1",
      owner: "0xCRN1",
      reward: "0xCRN1",
      score: 0.9,
      status: "linked",
      inactiveSince: null,
      parent: null,
    },
  ]) {
    crns.set(crn.hash, crn);
  }

  return { ccns, crns };
}

function makeExpense(
  type: "storage" | "execution",
  totalAleph: number,
  nodeId?: string,
  executionId?: string,
): CreditExpense {
  return {
    hash: "exp1",
    time: Date.now() / 1000,
    type,
    totalAleph,
    creditCount: 1,
    creditPriceAleph: 0.00005,
    credits: [
      {
        address: "0xCustomer",
        amount: totalAleph / 0.00005,
        alephCost: totalAleph,
        ref: "program1",
        timeSec: 3600,
        nodeId: nodeId ?? null,
        executionId: executionId ?? null,
      },
    ],
  };
}

describe("computeScoreMultiplier", () => {
  it("returns 0 for scores below 0.2", () => {
    expect(computeScoreMultiplier(0)).toBe(0);
    expect(computeScoreMultiplier(0.1)).toBe(0);
    expect(computeScoreMultiplier(0.19)).toBe(0);
  });

  it("returns 1 for scores >= 0.8", () => {
    expect(computeScoreMultiplier(0.8)).toBe(1);
    expect(computeScoreMultiplier(0.9)).toBe(1);
    expect(computeScoreMultiplier(1.0)).toBe(1);
  });

  it("normalizes between 0.2 and 0.8", () => {
    expect(computeScoreMultiplier(0.2)).toBeCloseTo(0);
    expect(computeScoreMultiplier(0.5)).toBeCloseTo(0.5);
    expect(computeScoreMultiplier(0.5)).toBeCloseTo(0.5);
  });
});

describe("distributeExpense", () => {
  it("distributes storage: 75% CCN, 20% stakers, 5% dev", () => {
    const nodeState = makeNodeState();
    const expense = makeExpense("storage", 100);
    const result = distributeExpense(expense, nodeState);

    expect(result.devFund).toBeCloseTo(5);
    expect(result.crnRewards.size).toBe(0);

    const ccnTotal = [...result.ccnRewards.values()].reduce(
      (s, v) => s + v,
      0,
    );
    expect(ccnTotal).toBeCloseTo(75);

    const stakerTotal = [...result.stakerRewards.values()].reduce(
      (s, v) => s + v,
      0,
    );
    expect(stakerTotal).toBeCloseTo(20);
  });

  it("distributes execution: 60% CRN, 15% CCN, 20% stakers, 5% dev", () => {
    const nodeState = makeNodeState();
    const expense = makeExpense("execution", 100, "crn1", "vm1");
    const result = distributeExpense(expense, nodeState);

    expect(result.devFund).toBeCloseTo(5);

    const crnTotal = [...result.crnRewards.values()].reduce(
      (s, v) => s + v,
      0,
    );
    expect(crnTotal).toBeCloseTo(60);

    const ccnTotal = [...result.ccnRewards.values()].reduce(
      (s, v) => s + v,
      0,
    );
    expect(ccnTotal).toBeCloseTo(15);

    const stakerTotal = [...result.stakerRewards.values()].reduce(
      (s, v) => s + v,
      0,
    );
    expect(stakerTotal).toBeCloseTo(20);
  });

  it("skips CRN share when node_id not found", () => {
    const nodeState = makeNodeState();
    const expense = makeExpense("execution", 100, "unknown_crn");
    const result = distributeExpense(expense, nodeState);

    expect(result.crnRewards.size).toBe(0);
    // CCN and staker shares still distributed
    const ccnTotal = [...result.ccnRewards.values()].reduce(
      (s, v) => s + v,
      0,
    );
    expect(ccnTotal).toBeCloseTo(15);
  });

  it("handles no active CCNs — CCN pool not distributed", () => {
    const nodeState = makeNodeState({
      ccns: [
        {
          hash: "ccn1",
          name: "CCN-1",
          owner: "0xCCN1",
          reward: "0xCCN1",
          score: 0.1, // below 0.2 threshold
          status: "active",
          stakers: { "0xS1": 100000 },
          totalStaked: 100000,
          inactiveSince: null,
          resourceNodes: [],
        },
      ],
    });
    const expense = makeExpense("storage", 100);
    const result = distributeExpense(expense, nodeState);

    expect(result.ccnRewards.size).toBe(0);
    // Stakers still get their share
    const stakerTotal = [...result.stakerRewards.values()].reduce(
      (s, v) => s + v,
      0,
    );
    expect(stakerTotal).toBeCloseTo(20);
  });
});

describe("computeDistributionSummary", () => {
  it("aggregates multiple expenses and merges recipients by address", () => {
    const nodeState = makeNodeState();
    const expenses = [
      makeExpense("storage", 10),
      makeExpense("execution", 90, "crn1", "vm1"),
    ];
    const summary = computeDistributionSummary(expenses, nodeState);

    expect(summary.storageAleph).toBeCloseTo(10);
    expect(summary.executionAleph).toBeCloseTo(90);
    expect(summary.totalAleph).toBeCloseTo(100);
    expect(summary.devFundAleph).toBeCloseTo(5);
    expect(summary.expenseCount).toBe(2);
    expect(summary.recipients.length).toBeGreaterThan(0);

    // CCN reward address earns from both CCN scoring and staking
    const ccnRecipient = summary.recipients.find(
      (r) => r.address === "0xCCN1",
    );
    expect(ccnRecipient).toBeDefined();
    expect(ccnRecipient!.roles).toContain("ccn");
    expect(ccnRecipient!.ccnAleph).toBeGreaterThan(0);
  });

  it("returns empty summary for no expenses", () => {
    const nodeState = makeNodeState();
    const summary = computeDistributionSummary([], nodeState);

    expect(summary.totalAleph).toBe(0);
    expect(summary.recipients.length).toBe(0);
  });

  it("tracks per-VM and per-node totals", () => {
    const nodeState = makeNodeState();
    const expenses = [makeExpense("execution", 100, "crn1", "vm1")];
    const summary = computeDistributionSummary(expenses, nodeState);

    expect(summary.perVm.get("vm1")).toBeCloseTo(100);
    expect(summary.perNode.get("crn1")).toBeCloseTo(60); // 60% CRN share
  });

  it("counts CRNs and CCNs per reward address", () => {
    const nodeState = makeNodeState({
      ccns: [
        {
          hash: "ccn1",
          name: "CCN-1",
          owner: "0xOp",
          reward: "0xOp",
          score: 0.8,
          status: "active",
          stakers: { "0xStaker": 100000 },
          totalStaked: 100000,
          inactiveSince: null,
          resourceNodes: [],
        },
      ],
      crns: [
        { hash: "crn1", name: "CRN-1", owner: "0xOp", reward: "0xOp", score: 0.9, status: "linked", inactiveSince: null, parent: null },
        { hash: "crn2", name: "CRN-2", owner: "0xOp", reward: "0xOp", score: 0.9, status: "linked", inactiveSince: null, parent: null },
        { hash: "crn3", name: "CRN-3", owner: "0xOther", reward: "0xOther", score: 0.9, status: "linked", inactiveSince: null, parent: null },
      ],
    });
    const expenses = [makeExpense("execution", 100, "crn1", "vm1")];
    const summary = computeDistributionSummary(expenses, nodeState);

    const op = summary.recipients.find((r) => r.address === "0xOp");
    expect(op).toBeDefined();
    expect(op!.crnCount).toBe(2);
    expect(op!.ccnCount).toBe(1);

    const other = summary.recipients.find((r) => r.address === "0xOther");
    // 0xOther has a CRN but no rewards in this expense, so isn't a recipient
    expect(other).toBeUndefined();
  });

  it("staker-only address has zero CRN/CCN counts", () => {
    const nodeState = makeNodeState();
    const expenses = [makeExpense("storage", 100)];
    const summary = computeDistributionSummary(expenses, nodeState);

    const staker = summary.recipients.find((r) => r.address === "0xStaker1");
    expect(staker).toBeDefined();
    expect(staker!.crnCount).toBe(0);
    expect(staker!.ccnCount).toBe(0);
    expect(staker!.roles).toContain("staker");
  });
});

function makeExpenseAt(
  time: number,
  type: "storage" | "execution",
  totalAleph: number,
  nodeId?: string,
  executionId?: string,
): CreditExpense {
  const e = makeExpense(type, totalAleph, nodeId, executionId);
  return { ...e, time };
}

describe("computeDistributionSummary with bucket options", () => {
  const start = 1_700_000_000;
  const end = start + 3600 * 24; // 24h window
  const bucketCount = 24;
  const bucketWidth = (end - start) / bucketCount; // 3600

  it("buckets CRN execution rewards by expense time", () => {
    const state = makeNodeState();
    const expenses = [
      makeExpenseAt(start + 30, "execution", 10, "crn1", "vm1"),
      makeExpenseAt(start + bucketWidth + 30, "execution", 20, "crn1", "vm1"),
      makeExpenseAt(start + bucketWidth * 5 + 30, "execution", 5, "crn1", "vm2"),
    ];

    const summary = computeDistributionSummary(expenses, state, {
      bucketCount,
      startTime: start,
      endTime: end,
    });

    const buckets = summary.perNodeBuckets!.get("crn1")!;
    expect(buckets).toHaveLength(24);
    expect(buckets[0]!.aleph).toBeCloseTo(10 * 0.6); // EXECUTION_CRN_SHARE
    expect(buckets[1]!.aleph).toBeCloseTo(20 * 0.6);
    expect(buckets[5]!.aleph).toBeCloseTo(5 * 0.6);
    expect(buckets[10]!.aleph).toBe(0);
    expect(buckets[0]!.time).toBe(start);
    expect(buckets[1]!.time).toBe(start + bucketWidth);
  });

  it("buckets CCN rewards as score-weighted share of CCN pool", () => {
    const state = makeNodeState({
      ccns: [
        {
          hash: "ccnA",
          name: "A",
          owner: "0xA",
          reward: "0xA",
          score: 0.8,
          status: "active",
          stakers: {},
          totalStaked: 600_000,
          inactiveSince: null,
          resourceNodes: [],
        },
        {
          hash: "ccnB",
          name: "B",
          owner: "0xB",
          reward: "0xB",
          score: 0.5, // weight = (0.5 - 0.2) / 0.6 = 0.5
          status: "active",
          stakers: {},
          totalStaked: 600_000,
          inactiveSince: null,
          resourceNodes: [],
        },
      ],
    });
    const expenses = [
      makeExpenseAt(start + 30, "execution", 100, "crnX", "vmX"),
    ];

    const summary = computeDistributionSummary(expenses, state, {
      bucketCount,
      startTime: start,
      endTime: end,
    });

    // ccnA weight=1, ccnB weight=0.5; total=1.5
    // CCN pool from execution = 100 * 0.15 = 15
    // ccnA share = 15 * 1/1.5 = 10
    // ccnB share = 15 * 0.5/1.5 = 5
    expect(summary.perNodeBuckets!.get("ccnA")![0]!.aleph).toBeCloseTo(10);
    expect(summary.perNodeBuckets!.get("ccnB")![0]!.aleph).toBeCloseTo(5);
  });

  it("storage expenses use storage CCN share (no CRN share)", () => {
    const state = makeNodeState();
    const expenses = [
      makeExpenseAt(start + 30, "storage", 100, "crn1", "obj1"),
    ];

    const summary = computeDistributionSummary(expenses, state, {
      bucketCount,
      startTime: start,
      endTime: end,
    });

    // CRN gets nothing from storage expenses
    expect(summary.perNodeBuckets!.get("crn1")).toBeUndefined();
    // CCN gets storage CCN share = 100 * 0.75 = 75 (single active CCN with weight 1)
    expect(summary.perNodeBuckets!.get("ccn1")![0]!.aleph).toBeCloseTo(75);
  });

  it("populates perVmInWindow with execution credits", () => {
    const state = makeNodeState();
    const expenses = [
      makeExpenseAt(start + 30, "execution", 10, "crn1", "vmA"),
      makeExpenseAt(start + 60, "execution", 7, "crn1", "vmA"),
      makeExpenseAt(start + 90, "execution", 3, "crn1", "vmB"),
    ];

    const summary = computeDistributionSummary(expenses, state, {
      bucketCount,
      startTime: start,
      endTime: end,
    });

    expect(summary.perVmInWindow!.get("vmA")!.aleph).toBeCloseTo(17);
    expect(summary.perVmInWindow!.get("vmA")!.nodeId).toBe("crn1");
    expect(summary.perVmInWindow!.get("vmB")!.aleph).toBeCloseTo(3);
  });

  it("returns undefined bucket maps when options omitted", () => {
    const state = makeNodeState();
    const summary = computeDistributionSummary(
      [makeExpenseAt(start + 30, "execution", 10, "crn1", "vm1")],
      state,
    );
    expect(summary.perNodeBuckets).toBeUndefined();
    expect(summary.perVmInWindow).toBeUndefined();
  });

  it("clamps expense times outside the window to edge buckets", () => {
    const state = makeNodeState();
    const expenses = [
      makeExpenseAt(start - 100, "execution", 5, "crn1", "vm1"), // before window
      makeExpenseAt(end + 100, "execution", 7, "crn1", "vm1"), // after window
    ];

    const summary = computeDistributionSummary(expenses, state, {
      bucketCount,
      startTime: start,
      endTime: end,
    });

    const buckets = summary.perNodeBuckets!.get("crn1")!;
    // First and last buckets carry the clamped contributions
    expect(buckets[0]!.aleph).toBeCloseTo(5 * 0.6);
    expect(buckets[23]!.aleph).toBeCloseTo(7 * 0.6);
  });
});
