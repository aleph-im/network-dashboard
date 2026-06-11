import type {
  AddressRewards,
  BySource,
  OwnerNodeReward,
  RewardSource,
  RewardsBucket,
  RewardsFull,
} from "@/api/rewards-types";
import type { CreditEntrySource, CreditExpense, NodeState } from "@/api/credit-types";
import { getRewardAddress, computeScoreMultiplier } from "@/lib/credit-distribution";

const ZERO_SOURCE: BySource = { credit_revenue: 0, holder_tier: 0, wage_subsidy: 0 };

type Args = {
  address: string;
  rewards: AddressRewards;
  /** Current VM count per CRN hash (from useNodes), the per-CRN execution-share
   *  proxy. Deriving exact per-CRN execution ALEPH would mean downloading the
   *  whole network's ~750MB credit-expense feed for the cycle just to rank this
   *  address's handful of CRNs; VM count is already cached and good enough to
   *  split the authoritative per-source totals. */
  crnVmCounts: Map<string, number>;
  nodeState: NodeState;
};

type Apportioned = {
  byNode: OwnerNodeReward[];
  stakingAleph: number;
  unattributedAleph: number;
};

/** Per-CRN execution weight = current VM count, scoped to this address's CRNs.
 *  Every owned CRN is seeded (0 when it hosts no VMs) so `distribute` falls back
 *  to an even split rather than dropping a node. */
function crnVmWeights(ownedCrnHashes: Set<string>, crnVmCounts: Map<string, number>): Map<string, number> {
  const w = new Map<string, number>();
  for (const h of ownedCrnHashes) w.set(h, crnVmCounts.get(h) ?? 0);
  return w;
}

function distribute(total: number, weights: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  let sum = 0;
  for (const v of weights.values()) sum += v;
  if (sum <= 0) {
    const n = weights.size;
    if (n === 0) return out;
    for (const k of weights.keys()) out.set(k, total / n);
    return out;
  }
  for (const [k, v] of weights) out.set(k, (total * v) / sum);
  return out;
}

export function apportionOwnerRewards({ address, rewards, crnVmCounts, nodeState }: Args): Apportioned {
  const lower = address.toLowerCase();
  const owns = (n: { owner: string; reward: string }) =>
    getRewardAddress(n).toLowerCase() === lower || n.owner.toLowerCase() === lower;

  const ownedCrns = [...nodeState.crns.values()].filter(owns);
  const ownedCcns = [...nodeState.ccns.values()].filter(owns);
  const ownedCrnHashes = new Set(ownedCrns.map((c) => c.hash));

  const cr = rewards.full.credit_revenue;
  const ht = rewards.full.holder_tier;
  const wage = rewards.full.wage_subsidy;

  const crnTotals: Record<RewardSource, number> = {
    credit_revenue: cr.execution_crn,
    holder_tier: ht.execution_crn,
    wage_subsidy: wage.crn,
  };
  const ccnTotals: Record<RewardSource, number> = {
    credit_revenue: cr.execution_ccn + cr.storage_ccn,
    holder_tier: ht.execution_ccn + ht.storage_ccn,
    wage_subsidy: wage.ccn,
  };

  const crnW = crnVmWeights(ownedCrnHashes, crnVmCounts);
  const ccnW = new Map<string, number>();
  for (const c of ownedCcns) ccnW.set(c.hash, computeScoreMultiplier(c.score));

  const node = new Map<string, OwnerNodeReward>();
  const ensure = (hash: string, name: string, role: "crn" | "ccn") => {
    let n = node.get(hash);
    if (!n) { n = { hash, name, role, totalAleph: 0, bySource: { ...ZERO_SOURCE } }; node.set(hash, n); }
    return n;
  };
  for (const c of ownedCrns) ensure(c.hash, c.name, "crn");
  for (const c of ownedCcns) ensure(c.hash, c.name, "ccn");

  for (const src of ["credit_revenue", "holder_tier", "wage_subsidy"] as RewardSource[]) {
    for (const [hash, amt] of distribute(crnTotals[src], crnW)) {
      const n = node.get(hash)!; n.bySource[src] += amt; n.totalAleph += amt;
    }
    for (const [hash, amt] of distribute(ccnTotals[src], ccnW)) {
      const n = node.get(hash)!; n.bySource[src] += amt; n.totalAleph += amt;
    }
  }

  const stakingAleph =
    cr.execution_staker + cr.storage_staker +
    ht.execution_staker + ht.storage_staker +
    wage.staker;

  const byNode = [...node.values()].sort((a, b) => b.totalAleph - a.totalAleph);
  const attributed =
    byNode.reduce((s, n) => s + n.totalAleph, 0) + stakingAleph;
  // Clamp float residue (≈1e-13 when fully attributed) so it doesn't render
  // as a scientific-notation "Unattributed" row.
  const residual = rewards.totalAleph - attributed;
  const unattributedAleph = residual > 1e-6 ? residual : 0;
  return { byNode, stakingAleph, unattributedAleph };
}

/** Per-role node-owner totals from a `full` split, wage included. */
export function roleTotals(full: RewardsFull): {
  crn: number;
  ccn: number;
  staker: number;
} {
  const cr = full.credit_revenue;
  const ht = full.holder_tier;
  const w = full.wage_subsidy;
  return {
    crn: cr.execution_crn + ht.execution_crn + w.crn,
    ccn:
      cr.execution_ccn + cr.storage_ccn +
      ht.execution_ccn + ht.storage_ccn +
      w.ccn,
    staker:
      cr.execution_staker + cr.storage_staker +
      ht.execution_staker + ht.storage_staker +
      w.staker,
  };
}

/**
 * Per-bucket execution ALEPH per owned CRN. Bucketed by the parent expense's
 * message time (entry `timeSec` is an execution duration, not a timestamp).
 * Every owned CRN is seeded at 0 in every bucket so `distribute()` falls back
 * to an even split instead of dropping idle nodes.
 */
export function computeExecutionBucketWeights(
  expenses: CreditExpense[],
  ownedCrnHashes: Set<string>,
  buckets: { startSec: number; endSec: number }[],
): Map<string, number>[] {
  const out = buckets.map(() => {
    const m = new Map<string, number>();
    for (const h of ownedCrnHashes) m.set(h, 0);
    return m;
  });
  for (const e of expenses) {
    if (e.type !== "execution") continue;
    const idx = buckets.findIndex(
      (b) => e.time >= b.startSec && e.time < b.endSec,
    );
    if (idx < 0) continue;
    const w = out[idx]!;
    for (const c of e.credits) {
      if (!c.nodeId || !ownedCrnHashes.has(c.nodeId)) continue;
      w.set(c.nodeId, (w.get(c.nodeId) ?? 0) + c.alephCost);
    }
  }
  return out;
}

export type ApportionedNode = {
  buckets: { time: number; aleph: number }[];
  totalAleph: number;
  bySource: BySource;
};

const SOURCES: RewardSource[] = ["credit_revenue", "holder_tier", "wage_subsidy"];

function bucketRolePools(
  b: RewardsBucket,
  role: "crn" | "ccn",
): Record<RewardSource, number> {
  const cr = b.full.credit_revenue;
  const ht = b.full.holder_tier;
  const w = b.full.wage_subsidy;
  if (role === "crn") {
    return {
      credit_revenue: cr.execution_crn,
      holder_tier: ht.execution_crn,
      wage_subsidy: w.crn,
    };
  }
  return {
    credit_revenue: cr.execution_ccn + cr.storage_ccn,
    holder_tier: ht.execution_ccn + ht.storage_ccn,
    wage_subsidy: w.ccn,
  };
}

function shareFraction(weights: Map<string, number>, hash: string): number {
  let sum = 0;
  for (const v of weights.values()) sum += v;
  if (sum > 0) return (weights.get(hash) ?? 0) / sum;
  if (weights.size > 0 && weights.has(hash)) return 1 / weights.size;
  return 0;
}

/**
 * Apportion an address's per-bucket role pools to one node. With
 * `perBucketWeights` (aligned with `buckets`) the split is exact per bucket;
 * otherwise `staticWeights` (vmCount proxy / score) applies to every bucket.
 * Wage is apportioned by the same weights as the role (no per-node grain
 * exists for wage). A single-node address gets share = 1 either way.
 */
export function apportionNodeBuckets(args: {
  nodeHash: string;
  role: "crn" | "ccn";
  buckets: RewardsBucket[];
  perBucketWeights: Map<string, number>[] | null;
  staticWeights: Map<string, number>;
}): ApportionedNode {
  const { nodeHash, role, buckets, perBucketWeights, staticWeights } = args;
  const bySource: BySource = { ...ZERO_SOURCE };
  const out: { time: number; aleph: number }[] = [];
  let totalAleph = 0;
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i]!;
    const weights = perBucketWeights?.[i] ?? staticWeights;
    const frac = shareFraction(weights, nodeHash);
    const pools = bucketRolePools(b, role);
    let aleph = 0;
    for (const src of SOURCES) {
      const amt = pools[src] * frac;
      bySource[src] += amt;
      aleph += amt;
    }
    totalAleph += aleph;
    out.push({ time: b.startSec, aleph });
  }
  return { buckets: out, totalAleph, bySource };
}

export type PerVmEarning = {
  vmHash: string;
  aleph: number;
  source: CreditEntrySource;
};

/**
 * Per-VM earnings for one CRN: raw execution ALEPH per VM, scaled so the
 * owned-set total matches the address's authoritative execution earnings
 * (replaces the old hardcoded CRN_SHARE = 0.6 with the realized share).
 */
export function computePerVmEarnings(args: {
  nodeHash: string;
  expenses: CreditExpense[];
  /** (credit_revenue + holder_tier).execution_crn over the same window. */
  addressExecAleph: number;
  ownedCrnHashes: Set<string>;
}): PerVmEarning[] {
  const { nodeHash, expenses, addressExecAleph, ownedCrnHashes } = args;
  const perVm = new Map<string, { aleph: number; source: CreditEntrySource }>();
  let ownedRawTotal = 0;
  for (const e of expenses) {
    if (e.type !== "execution") continue;
    for (const c of e.credits) {
      if (!c.nodeId || !ownedCrnHashes.has(c.nodeId)) continue;
      ownedRawTotal += c.alephCost;
      if (c.nodeId !== nodeHash || !c.executionId) continue;
      const prev = perVm.get(c.executionId);
      perVm.set(c.executionId, {
        aleph: (prev?.aleph ?? 0) + c.alephCost,
        source: c.source,
      });
    }
  }
  const factor = ownedRawTotal > 0 ? addressExecAleph / ownedRawTotal : 0;
  return [...perVm.entries()]
    .map(([vmHash, v]) => ({ vmHash, aleph: v.aleph * factor, source: v.source }))
    .sort((a, b) => b.aleph - a.aleph);
}
