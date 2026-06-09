import type { AddressRewards, BySource, OwnerNodeReward, RewardSource } from "@/api/rewards-types";
import type { CreditExpense, NodeState } from "@/api/credit-types";
import { getRewardAddress, computeScoreMultiplier } from "@/lib/credit-distribution";

const ZERO_SOURCE: BySource = { credit_revenue: 0, holder_tier: 0, wage_subsidy: 0 };

type Args = {
  address: string;
  rewards: AddressRewards;
  expenses: CreditExpense[];
  nodeState: NodeState;
};

type Apportioned = {
  byNode: OwnerNodeReward[];
  stakingAleph: number;
};

/** Per-CRN execution weight from api2 node_id ALEPH over the window, scoped to
 *  this address's CRNs. Exact attribution (node_id present on every exec entry). */
function crnExecWeights(ownedCrnHashes: Set<string>, expenses: CreditExpense[]): Map<string, number> {
  const w = new Map<string, number>();
  for (const expense of expenses) {
    if (expense.type !== "execution") continue;
    for (const c of expense.credits) {
      if (!c.nodeId || !ownedCrnHashes.has(c.nodeId)) continue;
      w.set(c.nodeId, (w.get(c.nodeId) ?? 0) + c.alephCost);
    }
  }
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

export function apportionOwnerRewards({ address, rewards, expenses, nodeState }: Args): Apportioned {
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

  const crnW = crnExecWeights(ownedCrnHashes, expenses);
  for (const h of ownedCrnHashes) if (!crnW.has(h)) crnW.set(h, 0);
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
  return { byNode, stakingAleph };
}
