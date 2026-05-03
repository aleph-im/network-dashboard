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
        },
      ],
      crns: [
        { hash: "crn1", name: "CRN-1", owner: "0xOp", reward: "0xOp", score: 0.9, status: "linked" },
        { hash: "crn2", name: "CRN-2", owner: "0xOp", reward: "0xOp", score: 0.9, status: "linked" },
        { hash: "crn3", name: "CRN-3", owner: "0xOther", reward: "0xOther", score: 0.9, status: "linked" },
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
