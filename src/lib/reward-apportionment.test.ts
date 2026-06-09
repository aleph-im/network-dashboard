import { describe, it, expect } from "vitest";
import { apportionOwnerRewards } from "@/lib/reward-apportionment";
import type { AddressRewards } from "@/api/rewards-types";
import type { CreditExpense, NodeState } from "@/api/credit-types";

function nodeState(): NodeState {
  return {
    crns: new Map([
      ["crnA", { hash: "crnA", name: "A", owner: "0xowner", reward: "0xowner", score: 1, status: "linked", inactiveSince: null, parent: "ccnX" }],
      ["crnB", { hash: "crnB", name: "B", owner: "0xowner", reward: "0xowner", score: 1, status: "linked", inactiveSince: null, parent: "ccnX" }],
    ]),
    ccns: new Map([
      ["ccnX", { hash: "ccnX", name: "X", owner: "0xowner", reward: "0xowner", score: 0.8, status: "active", stakers: {}, totalStaked: 0, inactiveSince: null, resourceNodes: [] }],
    ]),
  };
}

function execExpense(entries: { nodeId: string; alephCost: number }[]): CreditExpense {
  return {
    hash: "e1", time: 1779000000, type: "execution", totalAleph: 0, creditCount: entries.length, creditPriceAleph: 1,
    credits: entries.map((e, i) => ({ address: "0xpayer", amount: e.alephCost, alephCost: e.alephCost, ref: `r${i}`, timeSec: 1779000000, nodeId: e.nodeId, executionId: `vm${i}`, source: "credits" as const })),
  };
}

const FULL = (over: Partial<AddressRewards["full"]> = {}): AddressRewards["full"] => ({
  credit_revenue: { execution_crn: 100, execution_ccn: 40, execution_staker: 20, storage_ccn: 0, storage_staker: 0 },
  holder_tier: { execution_crn: 0, execution_ccn: 0, execution_staker: 0, storage_ccn: 0, storage_staker: 0 },
  wage_subsidy: { crn: 30, ccn: 30, staker: 30 },
  ...over,
});

const rewards = (full: AddressRewards["full"]): AddressRewards => {
  const sum =
    full.credit_revenue.execution_crn + full.credit_revenue.execution_ccn + full.credit_revenue.execution_staker + full.credit_revenue.storage_ccn + full.credit_revenue.storage_staker +
    full.holder_tier.execution_crn + full.holder_tier.execution_ccn + full.holder_tier.execution_staker + full.holder_tier.storage_ccn + full.holder_tier.storage_staker +
    full.wage_subsidy.crn + full.wage_subsidy.ccn + full.wage_subsidy.staker;
  return {
    address: "0xowner",
    totalAleph: sum,
    bySource: {
      credit_revenue: 160, holder_tier: 0, wage_subsidy: 90,
    },
    full,
  };
};

describe("apportionOwnerRewards", () => {
  it("splits CRN execution by node_id weight and CCN by score; sums to total", () => {
    const full = FULL();
    const r = apportionOwnerRewards({
      address: "0xowner",
      rewards: rewards(full),
      expenses: [execExpense([{ nodeId: "crnA", alephCost: 75 }, { nodeId: "crnB", alephCost: 25 }])],
      nodeState: nodeState(),
    });

    const a = r.byNode.find((n) => n.hash === "crnA")!;
    const b = r.byNode.find((n) => n.hash === "crnB")!;
    const x = r.byNode.find((n) => n.hash === "ccnX")!;

    expect(a.bySource.credit_revenue).toBeCloseTo(75);
    expect(b.bySource.credit_revenue).toBeCloseTo(25);
    expect(a.bySource.wage_subsidy).toBeCloseTo(22.5);
    expect(b.bySource.wage_subsidy).toBeCloseTo(7.5);
    expect(x.bySource.credit_revenue).toBeCloseTo(40);
    expect(x.bySource.wage_subsidy).toBeCloseTo(30);
    expect(r.stakingAleph).toBeCloseTo(50);
    const nodeSum = r.byNode.reduce((s, n) => s + n.totalAleph, 0);
    expect(nodeSum + r.stakingAleph + r.unattributedAleph).toBeCloseTo(rewards(full).totalAleph);
  });

  it("single CRN gets the whole CRN slice exactly", () => {
    const full = FULL({ credit_revenue: { execution_crn: 100, execution_ccn: 0, execution_staker: 0, storage_ccn: 0, storage_staker: 0 }, wage_subsidy: { crn: 0, ccn: 0, staker: 0 } });
    const ns: NodeState = { crns: new Map([["only", { hash: "only", name: "O", owner: "0xo", reward: "0xo", score: 1, status: "linked", inactiveSince: null, parent: null }]]), ccns: new Map() };
    const r = apportionOwnerRewards({ address: "0xo", rewards: rewards(full), expenses: [execExpense([{ nodeId: "only", alephCost: 5 }])], nodeState: ns });
    expect(r.byNode).toHaveLength(1);
    expect(r.byNode[0]!.totalAleph).toBeCloseTo(100);
  });

  it("handles an address with no owned nodes (staking-only)", () => {
    const full = FULL({ credit_revenue: { execution_crn: 0, execution_ccn: 0, execution_staker: 50, storage_ccn: 0, storage_staker: 0 }, wage_subsidy: { crn: 0, ccn: 0, staker: 10 } });
    const r = apportionOwnerRewards({ address: "0xnobody", rewards: rewards(full), expenses: [], nodeState: { crns: new Map(), ccns: new Map() } });
    expect(r.byNode).toHaveLength(0);
    expect(r.stakingAleph).toBeCloseTo(60);
  });

  it("even-splits a role total across owned CRNs when none have execution credits in the window", () => {
    const full = FULL({
      credit_revenue: { execution_crn: 80, execution_ccn: 0, execution_staker: 0, storage_ccn: 0, storage_staker: 0 },
      wage_subsidy: { crn: 0, ccn: 0, staker: 0 },
    });
    const r = apportionOwnerRewards({
      address: "0xowner",
      rewards: rewards(full),
      expenses: [], // no execution credits → all CRN weights 0
      nodeState: nodeState(), // owns crnA + crnB (+ ccnX)
    });
    const a = r.byNode.find((n) => n.hash === "crnA")!;
    const b = r.byNode.find((n) => n.hash === "crnB")!;
    expect(a.bySource.credit_revenue).toBeCloseTo(40);
    expect(b.bySource.credit_revenue).toBeCloseTo(40);
  });

  it("captures role totals with no owned node as unattributed (conserves total)", () => {
    const full = FULL({
      credit_revenue: { execution_crn: 50, execution_ccn: 0, execution_staker: 0, storage_ccn: 0, storage_staker: 0 },
      wage_subsidy: { crn: 0, ccn: 0, staker: 0 },
    });
    const r = apportionOwnerRewards({
      address: "0xowner",
      rewards: rewards(full),
      expenses: [],
      nodeState: { crns: new Map(), ccns: new Map() }, // owns nothing
    });
    expect(r.byNode).toHaveLength(0);
    expect(r.stakingAleph).toBeCloseTo(0);
    expect(r.unattributedAleph).toBeCloseTo(50);
    const nodeSum = r.byNode.reduce((s, n) => s + n.totalAleph, 0);
    expect(nodeSum + r.stakingAleph + r.unattributedAleph).toBeCloseTo(rewards(full).totalAleph);
  });
});
