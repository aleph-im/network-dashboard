import type {
  CCNInfo,
  CreditEntrySource,
  CreditExpense,
  DistributionSummary,
  ExpenseDistribution,
  NodeBucket,
  NodeState,
  RecipientRole,
  RecipientTotal,
  WalletNodeReward,
  WalletRewards,
} from "@/api/credit-types";

// Distribution shares
const STORAGE_CCN_SHARE = 0.75;
const STORAGE_STAKER_SHARE = 0.2;
const EXECUTION_CRN_SHARE = 0.6;
const EXECUTION_CCN_SHARE = 0.15;
const EXECUTION_STAKER_SHARE = 0.2;
const DEV_FUND_SHARE = 0.05;

export type SummaryOptions = {
  bucketCount: number;
  startTime: number;
  endTime: number;
};

function bucketIndexFor(
  time: number,
  startTime: number,
  bucketWidth: number,
  bucketCount: number,
): number {
  const raw = Math.floor((time - startTime) / bucketWidth);
  if (raw < 0) return 0;
  if (raw >= bucketCount) return bucketCount - 1;
  return raw;
}

function ensureBucketArray(
  map: Map<string, NodeBucket[]>,
  hash: string,
  startTime: number,
  bucketWidth: number,
  bucketCount: number,
): NodeBucket[] {
  let arr = map.get(hash);
  if (!arr) {
    arr = Array.from({ length: bucketCount }, (_, i) => ({
      time: startTime + i * bucketWidth,
      aleph: 0,
    }));
    map.set(hash, arr);
  }
  return arr;
}

export function computeScoreMultiplier(score: number): number {
  if (score < 0.2) return 0;
  if (score >= 0.8) return 1;
  return (score - 0.2) / 0.6;
}

export function getRewardAddress(node: {
  reward: string;
  owner: string;
}): string {
  return node.reward || node.owner;
}

function buildCcnWeights(
  ccns: Map<string, CCNInfo>,
): { address: string; weight: number }[] {
  const weights: { address: string; weight: number }[] = [];
  for (const ccn of ccns.values()) {
    if (ccn.status !== "active") continue;
    const w = computeScoreMultiplier(ccn.score);
    if (w > 0) {
      weights.push({ address: getRewardAddress(ccn), weight: w });
    }
  }
  return weights;
}

function buildStakerWeights(
  ccns: Map<string, CCNInfo>,
): { address: string; staked: number }[] {
  const totals = new Map<string, number>();
  for (const ccn of ccns.values()) {
    if (ccn.status !== "active") continue;
    for (const [addr, amount] of Object.entries(ccn.stakers)) {
      totals.set(addr, (totals.get(addr) ?? 0) + amount);
    }
  }
  return [...totals.entries()].map(([address, staked]) => ({
    address,
    staked,
  }));
}

function addToMap(map: Map<string, number>, key: string, value: number): void {
  map.set(key, (map.get(key) ?? 0) + value);
}

export function distributeExpense(
  expense: CreditExpense,
  nodeState: NodeState,
): ExpenseDistribution {
  const crnRewards = new Map<string, number>();
  const ccnRewards = new Map<string, number>();
  const stakerRewards = new Map<string, number>();

  const { totalAleph } = expense;
  const devFund = totalAleph * DEV_FUND_SHARE;

  const isStorage = expense.type === "storage";
  const ccnShare = isStorage ? STORAGE_CCN_SHARE : EXECUTION_CCN_SHARE;
  const stakerShare = isStorage
    ? STORAGE_STAKER_SHARE
    : EXECUTION_STAKER_SHARE;

  // CRN share (execution only) — per credit entry
  if (!isStorage) {
    for (const credit of expense.credits) {
      if (!credit.nodeId) continue;
      const crn = nodeState.crns.get(credit.nodeId);
      if (crn) {
        const addr = getRewardAddress(crn);
        addToMap(crnRewards, addr, credit.alephCost * EXECUTION_CRN_SHARE);
      }
    }
  }

  // CCN pool — weighted by score
  const ccnWeights = buildCcnWeights(nodeState.ccns);
  const totalWeight = ccnWeights.reduce((s, w) => s + w.weight, 0);
  const ccnPool = totalAleph * ccnShare;

  if (totalWeight > 0 && ccnPool > 0) {
    for (const { address, weight } of ccnWeights) {
      addToMap(ccnRewards, address, (ccnPool * weight) / totalWeight);
    }
  }

  // Staker pool — weighted by staked amount
  const stakers = buildStakerWeights(nodeState.ccns);
  const totalStaked = stakers.reduce((s, st) => s + st.staked, 0);
  const stakerPool = totalAleph * stakerShare;

  if (totalStaked > 0 && stakerPool > 0) {
    for (const { address, staked } of stakers) {
      addToMap(stakerRewards, address, (stakerPool * staked) / totalStaked);
    }
  }

  return { expense, crnRewards, ccnRewards, stakerRewards, devFund };
}

export function computeDistributionSummary(
  expenses: CreditExpense[],
  nodeState: NodeState,
  options?: SummaryOptions,
): DistributionSummary {
  const distributions: ExpenseDistribution[] = [];
  const allCrn = new Map<string, number>();
  const allCcn = new Map<string, number>();
  const allStaker = new Map<string, number>();
  let storageAleph = 0;
  let executionAleph = 0;
  let devFundAleph = 0;

  // Per-VM and per-node totals for table integration
  const perVm = new Map<string, number>();
  const perNode = new Map<string, number>();

  // Bucket bookkeeping (only if options provided)
  const perNodeBuckets = options ? new Map<string, NodeBucket[]>() : undefined;
  const perVmInWindow = options
    ? new Map<
        string,
        { aleph: number; nodeId: string; source: CreditEntrySource }
      >()
    : undefined;
  const bucketWidth = options
    ? (options.endTime - options.startTime) / options.bucketCount
    : 0;

  // Precompute CCN scoring weights once — same denominator the per-expense
  // path uses, lifted out so the bucket pass doesn't rebuild it per expense.
  let totalCcnWeight = 0;
  if (options) {
    for (const ccn of nodeState.ccns.values()) {
      if (ccn.status !== "active") continue;
      const w = computeScoreMultiplier(ccn.score);
      if (w > 0) totalCcnWeight += w;
    }
  }

  for (const expense of expenses) {
    const dist = distributeExpense(expense, nodeState);
    distributions.push(dist);

    if (expense.type === "storage") {
      storageAleph += expense.totalAleph;
    } else {
      executionAleph += expense.totalAleph;
    }
    devFundAleph += dist.devFund;

    for (const [addr, amt] of dist.crnRewards) addToMap(allCrn, addr, amt);
    for (const [addr, amt] of dist.ccnRewards) addToMap(allCcn, addr, amt);
    for (const [addr, amt] of dist.stakerRewards)
      addToMap(allStaker, addr, amt);

    // Aggregate per-VM and per-node costs
    for (const credit of expense.credits) {
      if (credit.executionId) {
        addToMap(perVm, credit.executionId, credit.alephCost);
      }
      if (credit.nodeId) {
        addToMap(
          perNode,
          credit.nodeId,
          credit.alephCost * EXECUTION_CRN_SHARE,
        );
      }
    }

    // Bucket pass — only if options provided
    if (options && perNodeBuckets && perVmInWindow) {
      const idx = bucketIndexFor(
        expense.time,
        options.startTime,
        bucketWidth,
        options.bucketCount,
      );
      const isStorage = expense.type === "storage";

      // CRN: per-credit, per-node
      if (!isStorage) {
        for (const credit of expense.credits) {
          if (!credit.nodeId) continue;
          if (!nodeState.crns.has(credit.nodeId)) continue;
          const arr = ensureBucketArray(
            perNodeBuckets,
            credit.nodeId,
            options.startTime,
            bucketWidth,
            options.bucketCount,
          );
          arr[idx]!.aleph += credit.alephCost * EXECUTION_CRN_SHARE;

          // Per-VM aggregate (raw alephCost; consumers apply the share split).
          // `source` tracks which payment path attributed ALEPH to this VM —
          // a VM is paid by credits OR hold throughout its life, not both, so
          // the source is uniform across all entries we aggregate here.
          if (credit.executionId) {
            const existing = perVmInWindow.get(credit.executionId);
            const aleph = (existing?.aleph ?? 0) + credit.alephCost;
            perVmInWindow.set(credit.executionId, {
              aleph,
              nodeId: credit.nodeId,
              source: credit.source,
            });
          }
        }
      }

      // CCN: score-weighted share of pool, indexed by CCN hash (not reward
      // address — multiple CCNs can share one reward address, but the chart
      // is per-node).
      if (totalCcnWeight > 0) {
        const ccnShare = isStorage ? STORAGE_CCN_SHARE : EXECUTION_CCN_SHARE;
        const pool = expense.totalAleph * ccnShare;
        for (const ccn of nodeState.ccns.values()) {
          if (ccn.status !== "active") continue;
          const w = computeScoreMultiplier(ccn.score);
          if (w <= 0) continue;
          const share = (pool * w) / totalCcnWeight;
          const arr = ensureBucketArray(
            perNodeBuckets,
            ccn.hash,
            options.startTime,
            bucketWidth,
            options.bucketCount,
          );
          arr[idx]!.aleph += share;
        }
      }
    }
  }

  // Build per-address node counts — keyed by reward address (matches recipient grouping)
  const crnCountByAddress = new Map<string, number>();
  for (const crn of nodeState.crns.values()) {
    const addr = getRewardAddress(crn);
    crnCountByAddress.set(addr, (crnCountByAddress.get(addr) ?? 0) + 1);
  }
  const ccnCountByAddress = new Map<string, number>();
  for (const ccn of nodeState.ccns.values()) {
    const addr = getRewardAddress(ccn);
    ccnCountByAddress.set(addr, (ccnCountByAddress.get(addr) ?? 0) + 1);
  }

  // Merge rewards by address across roles
  const merged = new Map<
    string,
    { crnAleph: number; ccnAleph: number; stakerAleph: number }
  >();

  function getOrCreate(address: string) {
    let entry = merged.get(address);
    if (!entry) {
      entry = { crnAleph: 0, ccnAleph: 0, stakerAleph: 0 };
      merged.set(address, entry);
    }
    return entry;
  }

  for (const [addr, amt] of allCrn) getOrCreate(addr).crnAleph += amt;
  for (const [addr, amt] of allCcn) getOrCreate(addr).ccnAleph += amt;
  for (const [addr, amt] of allStaker) getOrCreate(addr).stakerAleph += amt;

  const recipients: RecipientTotal[] = [...merged.entries()].map(
    ([address, e]) => {
      const roles: RecipientRole[] = [];
      if (e.crnAleph > 0) roles.push("crn");
      if (e.ccnAleph > 0) roles.push("ccn");
      if (e.stakerAleph > 0) roles.push("staker");
      return {
        address,
        roles,
        totalAleph: e.crnAleph + e.ccnAleph + e.stakerAleph,
        crnAleph: e.crnAleph,
        ccnAleph: e.ccnAleph,
        stakerAleph: e.stakerAleph,
        crnCount: crnCountByAddress.get(address) ?? 0,
        ccnCount: ccnCountByAddress.get(address) ?? 0,
      };
    },
  );

  recipients.sort((a, b) => b.totalAleph - a.totalAleph);

  const totalAleph = storageAleph + executionAleph;
  const distributedAleph = totalAleph - devFundAleph;

  return {
    totalAleph,
    storageAleph,
    executionAleph,
    devFundAleph,
    distributedAleph,
    expenseCount: expenses.length,
    recipients,
    expenses: distributions,
    perVm,
    perNode,
    ...(perNodeBuckets ? { perNodeBuckets } : {}),
    ...(perVmInWindow ? { perVmInWindow } : {}),
  };
}

export function computeWalletRewards(
  address: string,
  expenses: CreditExpense[],
  nodeState: NodeState,
): WalletRewards {
  const lower = address.toLowerCase();

  function isOwner(node: { owner: string; reward: string }): boolean {
    return (
      node.owner.toLowerCase() === lower ||
      node.reward.toLowerCase() === lower
    );
  }

  // Identify owned nodes
  const ownedCrns = new Set<string>();
  for (const [hash, crn] of nodeState.crns) {
    if (isOwner(crn)) ownedCrns.add(hash);
  }

  const ownedCcns = new Set<string>();
  for (const [hash, ccn] of nodeState.ccns) {
    if (isOwner(ccn)) ownedCcns.add(hash);
  }

  // Pre-compute CCN score weights (stable across expenses)
  let totalCcnWeight = 0;
  const ccnWeightByHash = new Map<string, number>();
  for (const ccn of nodeState.ccns.values()) {
    if (ccn.status !== "active") continue;
    const w = computeScoreMultiplier(ccn.score);
    if (w > 0) {
      ccnWeightByHash.set(ccn.hash, w);
      totalCcnWeight += w;
    }
  }

  // Pre-compute staker weights
  let totalStaked = 0;
  let addressStaked = 0;
  for (const ccn of nodeState.ccns.values()) {
    if (ccn.status !== "active") continue;
    for (const [addr, amount] of Object.entries(ccn.stakers)) {
      totalStaked += amount;
      if (addr.toLowerCase() === lower) addressStaked += amount;
    }
  }

  const crnPerNode = new Map<string, number>();
  const ccnPerNode = new Map<string, number>();
  let stakerAleph = 0;

  for (const expense of expenses) {
    const isStorage = expense.type === "storage";

    // CRN rewards (execution only) — per credit entry
    if (!isStorage) {
      for (const credit of expense.credits) {
        if (!credit.nodeId || !ownedCrns.has(credit.nodeId)) continue;
        addToMap(
          crnPerNode,
          credit.nodeId,
          credit.alephCost * EXECUTION_CRN_SHARE,
        );
      }
    }

    // CCN rewards — score-weighted share of the CCN pool
    const ccnShare = isStorage ? STORAGE_CCN_SHARE : EXECUTION_CCN_SHARE;
    const ccnPool = expense.totalAleph * ccnShare;
    if (totalCcnWeight > 0 && ccnPool > 0) {
      for (const hash of ownedCcns) {
        const w = ccnWeightByHash.get(hash);
        if (w && w > 0) {
          addToMap(ccnPerNode, hash, (ccnPool * w) / totalCcnWeight);
        }
      }
    }

    // Staker rewards — proportional to staked amount
    const stakerShare = isStorage
      ? STORAGE_STAKER_SHARE
      : EXECUTION_STAKER_SHARE;
    const stakerPool = expense.totalAleph * stakerShare;
    if (totalStaked > 0 && stakerPool > 0 && addressStaked > 0) {
      stakerAleph += (stakerPool * addressStaked) / totalStaked;
    }
  }

  // Build sorted result
  const nodes: WalletNodeReward[] = [];
  for (const [hash, aleph] of crnPerNode) {
    const crn = nodeState.crns.get(hash);
    nodes.push({ nodeHash: hash, nodeName: crn?.name ?? "", role: "crn", aleph });
  }
  for (const [hash, aleph] of ccnPerNode) {
    const ccn = nodeState.ccns.get(hash);
    nodes.push({ nodeHash: hash, nodeName: ccn?.name ?? "", role: "ccn", aleph });
  }
  nodes.sort((a, b) => b.aleph - a.aleph);

  return {
    nodes,
    stakerAleph,
    totalAleph: nodes.reduce((s, n) => s + n.aleph, 0) + stakerAleph,
  };
}
