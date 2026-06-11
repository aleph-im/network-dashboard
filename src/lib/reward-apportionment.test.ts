import { describe, it, expect } from "vitest";
import {
  apportionOwnerRewards,
  roleTotals,
  computeExecutionBucketWeights,
  apportionNodeBuckets,
  computePerVmEarnings,
} from "@/lib/reward-apportionment";
import type { AddressRewards, RewardsBucket, RewardsFull } from "@/api/rewards-types";
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
  it("splits CRN execution by VM-count weight and CCN by score; sums to total", () => {
    const full = FULL();
    const r = apportionOwnerRewards({
      address: "0xowner",
      rewards: rewards(full),
      crnVmCounts: new Map([["crnA", 3], ["crnB", 1]]), // 3:1 → 75 / 25
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
    const r = apportionOwnerRewards({ address: "0xo", rewards: rewards(full), crnVmCounts: new Map([["only", 5]]), nodeState: ns });
    expect(r.byNode).toHaveLength(1);
    expect(r.byNode[0]!.totalAleph).toBeCloseTo(100);
  });

  it("handles an address with no owned nodes (staking-only)", () => {
    const full = FULL({ credit_revenue: { execution_crn: 0, execution_ccn: 0, execution_staker: 50, storage_ccn: 0, storage_staker: 0 }, wage_subsidy: { crn: 0, ccn: 0, staker: 10 } });
    const r = apportionOwnerRewards({ address: "0xnobody", rewards: rewards(full), crnVmCounts: new Map(), nodeState: { crns: new Map(), ccns: new Map() } });
    expect(r.byNode).toHaveLength(0);
    expect(r.stakingAleph).toBeCloseTo(60);
  });

  it("even-splits a role total across owned CRNs when none currently host VMs", () => {
    const full = FULL({
      credit_revenue: { execution_crn: 80, execution_ccn: 0, execution_staker: 0, storage_ccn: 0, storage_staker: 0 },
      wage_subsidy: { crn: 0, ccn: 0, staker: 0 },
    });
    const r = apportionOwnerRewards({
      address: "0xowner",
      rewards: rewards(full),
      crnVmCounts: new Map(), // no VM counts known → all CRN weights 0
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
      crnVmCounts: new Map(),
      nodeState: { crns: new Map(), ccns: new Map() }, // owns nothing
    });
    expect(r.byNode).toHaveLength(0);
    expect(r.stakingAleph).toBeCloseTo(0);
    expect(r.unattributedAleph).toBeCloseTo(50);
    const nodeSum = r.byNode.reduce((s, n) => s + n.totalAleph, 0);
    expect(nodeSum + r.stakingAleph + r.unattributedAleph).toBeCloseTo(rewards(full).totalAleph);
  });
});

const FULL2: RewardsFull = {
  credit_revenue: { execution_crn: 60, execution_ccn: 10, execution_staker: 20, storage_ccn: 5, storage_staker: 5 },
  holder_tier: { execution_crn: 30, execution_ccn: 4, execution_staker: 6, storage_ccn: 2, storage_staker: 1 },
  wage_subsidy: { crn: 12, ccn: 9, staker: 3 },
};

function bucket(startSec: number, full: RewardsFull): RewardsBucket {
  const aleph =
    full.credit_revenue.execution_crn + full.credit_revenue.execution_ccn +
    full.credit_revenue.execution_staker + full.credit_revenue.storage_ccn +
    full.credit_revenue.storage_staker + full.holder_tier.execution_crn +
    full.holder_tier.execution_ccn + full.holder_tier.execution_staker +
    full.holder_tier.storage_ccn + full.holder_tier.storage_staker +
    full.wage_subsidy.crn + full.wage_subsidy.ccn + full.wage_subsidy.staker;
  return {
    startSec,
    endSec: startSec + 3600,
    aleph,
    bySource: {
      credit_revenue: 100, // not used by apportionment; full is the source
      holder_tier: 43,
      wage_subsidy: 24,
    },
    full,
  };
}

function execExpense(time: number, entries: { nodeId: string; vm: string; aleph: number; source?: "credits" | "hold" }[]): CreditExpense {
  return {
    hash: `e${time}`,
    time,
    type: "execution",
    totalAleph: entries.reduce((s, e) => s + e.aleph, 0),
    creditCount: entries.length,
    creditPriceAleph: 1,
    credits: entries.map((e, i) => ({
      address: "0xpayer",
      amount: e.aleph,
      alephCost: e.aleph,
      ref: `r${i}`,
      timeSec: 0,
      nodeId: e.nodeId,
      executionId: e.vm,
      source: e.source ?? "credits",
    })),
  };
}

describe("roleTotals", () => {
  it("sums per-role node-owner totals including wage", () => {
    const r = roleTotals(FULL2);
    expect(r.crn).toBeCloseTo(60 + 30 + 12);
    expect(r.ccn).toBeCloseTo(10 + 5 + 4 + 2 + 9);
    expect(r.staker).toBeCloseTo(20 + 5 + 6 + 1 + 3);
  });
});

describe("computeExecutionBucketWeights", () => {
  const bounds = [
    { startSec: 0, endSec: 3600 },
    { startSec: 3600, endSec: 7200 },
  ];

  it("buckets by expense message time and filters to owned CRNs", () => {
    const w = computeExecutionBucketWeights(
      [
        execExpense(100, [
          { nodeId: "crnA", vm: "vm1", aleph: 30 },
          { nodeId: "crnB", vm: "vm2", aleph: 10 },
          { nodeId: "other", vm: "vm3", aleph: 99 },
        ]),
        execExpense(4000, [{ nodeId: "crnA", vm: "vm1", aleph: 5 }]),
      ],
      new Set(["crnA", "crnB"]),
      bounds,
    );
    expect(w[0]!.get("crnA")).toBeCloseTo(30);
    expect(w[0]!.get("crnB")).toBeCloseTo(10);
    expect(w[0]!.has("other")).toBe(false);
    expect(w[1]!.get("crnA")).toBeCloseTo(5);
    // Seeded: idle owned CRN is present at 0, so distribute() never drops it.
    expect(w[1]!.get("crnB")).toBe(0);
  });

  it("skips expenses outside every bucket", () => {
    const w = computeExecutionBucketWeights(
      [execExpense(99999, [{ nodeId: "crnA", vm: "vm1", aleph: 5 }])],
      new Set(["crnA"]),
      bounds,
    );
    expect(w[0]!.get("crnA")).toBe(0);
    expect(w[1]!.get("crnA")).toBe(0);
  });
});

describe("apportionNodeBuckets", () => {
  it("single-node address gets the full role pool (exact, no weights needed)", () => {
    const r = apportionNodeBuckets({
      nodeHash: "crnA",
      role: "crn",
      buckets: [bucket(0, FULL2)],
      perBucketWeights: null,
      staticWeights: new Map([["crnA", 0]]), // zero weight → even split of 1 node
    });
    expect(r.totalAleph).toBeCloseTo(60 + 30 + 12);
    expect(r.bySource.credit_revenue).toBeCloseTo(60);
    expect(r.bySource.holder_tier).toBeCloseTo(30);
    expect(r.bySource.wage_subsidy).toBeCloseTo(12);
    expect(r.buckets).toHaveLength(1);
    expect(r.buckets[0]!.time).toBe(0);
    expect(r.buckets[0]!.aleph).toBeCloseTo(102);
  });

  it("splits multi-CRN by per-bucket weights, wage included by the same weights", () => {
    const weights = [
      new Map([["crnA", 75], ["crnB", 25]]),
      new Map([["crnA", 0], ["crnB", 100]]),
    ];
    const r = apportionNodeBuckets({
      nodeHash: "crnA",
      role: "crn",
      buckets: [bucket(0, FULL2), bucket(3600, FULL2)],
      perBucketWeights: weights,
      staticWeights: new Map(),
    });
    // bucket 0: 102 * 0.75; bucket 1: 102 * 0
    expect(r.buckets[0]!.aleph).toBeCloseTo(102 * 0.75);
    expect(r.buckets[1]!.aleph).toBeCloseTo(0);
    expect(r.totalAleph).toBeCloseTo(102 * 0.75);
    expect(r.bySource.wage_subsidy).toBeCloseTo(12 * 0.75);
  });

  it("falls back to even split when a bucket's weights are all zero", () => {
    const r = apportionNodeBuckets({
      nodeHash: "crnA",
      role: "crn",
      buckets: [bucket(0, FULL2)],
      perBucketWeights: [new Map([["crnA", 0], ["crnB", 0]])],
      staticWeights: new Map(),
    });
    expect(r.totalAleph).toBeCloseTo(102 / 2);
  });

  it("CCN role pools execution_ccn + storage_ccn + wage.ccn by static score weights", () => {
    const r = apportionNodeBuckets({
      nodeHash: "ccnX",
      role: "ccn",
      buckets: [bucket(0, FULL2)],
      perBucketWeights: null,
      staticWeights: new Map([["ccnX", 1], ["ccnY", 1]]),
    });
    // (10+5+4+2+9) / 2
    expect(r.totalAleph).toBeCloseTo(30 / 2);
  });
});

describe("computePerVmEarnings", () => {
  it("scales raw per-VM ALEPH so the owned-set total matches the authoritative exec earnings", () => {
    const perVm = computePerVmEarnings({
      nodeHash: "crnA",
      expenses: [
        execExpense(100, [
          { nodeId: "crnA", vm: "vm1", aleph: 60 },
          { nodeId: "crnA", vm: "vm2", aleph: 20, source: "hold" },
          { nodeId: "crnB", vm: "vm3", aleph: 20 },
        ]),
      ],
      addressExecAleph: 50, // authoritative (cr+ht).execution_crn for the window
      ownedCrnHashes: new Set(["crnA", "crnB"]),
    });
    // factor = 50 / 100 raw
    expect(perVm).toHaveLength(2);
    expect(perVm[0]!.vmHash).toBe("vm1");
    expect(perVm[0]!.aleph).toBeCloseTo(30);
    expect(perVm[1]!.aleph).toBeCloseTo(10);
    expect(perVm[1]!.source).toBe("hold");
  });

  it("returns empty for zero raw execution", () => {
    expect(
      computePerVmEarnings({
        nodeHash: "crnA",
        expenses: [],
        addressExecAleph: 50,
        ownedCrnHashes: new Set(["crnA"]),
      }),
    ).toEqual([]);
  });
});
