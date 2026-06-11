"use client";

import { useMemo } from "react";
import { useRewards, getStableHourRange } from "@/hooks/use-rewards";
import { useExecutionExpenses } from "@/hooks/use-execution-expenses";
import { useNodeState } from "@/hooks/use-node-state";
import { useNode, useNodes } from "@/hooks/use-nodes";
import {
  getRewardAddress,
  computeScoreMultiplier,
} from "@/lib/credit-distribution";
import {
  roleTotals,
  computeExecutionBucketWeights,
  apportionNodeBuckets,
  computePerVmEarnings,
} from "@/lib/reward-apportionment";
import { replayVmCountTimeline } from "@/lib/node-vm-history";
import { RANGE_SECONDS, type CreditRange } from "@/hooks/use-credit-expenses";
import type { BySource } from "@/api/rewards-types";
import type { CreditEntrySource } from "@/api/credit-types";

/** Execution-expense windows are capped at 7d — a 30d execution-only fetch is
 *  ~300MB (Decision #112 territory). At 30d the per-VM table covers the
 *  trailing 7d and chart weights fall back to the vmCount proxy. */
const EXEC_WINDOW_CAP_SEC = 7 * 86400;

const BUCKET_SIZE: Record<CreditRange, string> = {
  "24h": "1h",
  "7d": "1d",
  "30d": "1d",
};

export type NodeEarningsBucket = {
  time: number;
  aleph: number;
  secondaryCount: number;
};

export type NodeEarningsPerVm = {
  vmHash: string;
  aleph: number;
  source: CreditEntrySource;
};

export type NodeEarningsLinkedCrn = {
  hash: string;
  name: string;
  status: string;
  vmCount: number;
};

export type Reconciliation = {
  rewardAddr: string;
  windowAleph: number;
  thisNode: number;
  otherSameKind: { aleph: number; count: number };
  crossKind: { aleph: number; role: "crn" | "ccn" };
  staker: number;
};

export type NodeEarnings = {
  role: "crn" | "ccn";
  totalAleph: number;
  bySource: BySource;
  delta: { aleph: number; secondaryCount: number };
  buckets: NodeEarningsBucket[];
  /** True when the multi-node split uses exact per-bucket execution weights
   *  (or the address has a single node of this role, where no weights are
   *  needed). False while proxy weights apply. */
  weightsExact: boolean;
  perVm?: NodeEarningsPerVm[];
  linkedCrns?: NodeEarningsLinkedCrn[];
  reconciliation: Reconciliation | null;
};

export type UseNodeEarningsOptions = {
  /** "proxy" skips the execution-expense fetch entirely (panel sparks);
   *  multi-node splits use live vmCount / score weights. Default "exact". */
  weights?: "exact" | "proxy";
};

export function useNodeEarnings(
  hash: string,
  range: CreditRange,
  options: UseNodeEarningsOptions = {},
): {
  data: NodeEarnings | undefined;
  isLoading: boolean;
  isPlaceholderData: boolean;
  isError: boolean;
  isPerVmLoading: boolean;
  isPerVmError: boolean;
} {
  const wantExact = options.weights !== "proxy";
  const rangeSec = RANGE_SECONDS[range];

  const current = useMemo(() => getStableHourRange(rangeSec), [rangeSec]);
  const previous = useMemo(
    () => ({ start: current.start - rangeSec, end: current.start }),
    [current.start, rangeSec],
  );

  const { data: nodeState } = useNodeState();
  const { data: node } = useNode(hash);
  const { data: allNodes } = useNodes();

  const isCcn = !!nodeState?.ccns.has(hash);
  const isCrn = !isCcn && !!nodeState?.crns.has(hash);
  const selfNode = isCcn
    ? nodeState?.ccns.get(hash)
    : nodeState?.crns.get(hash);
  const rewardAddr = selfNode ? getRewardAddress(selfNode) : "";

  const rewardsQuery = useRewards(
    rewardAddr,
    current.start,
    current.end,
    BUCKET_SIZE[range],
  );
  const prevQuery = useRewards(rewardAddr, previous.start, previous.end);

  const execWindow = useMemo(
    () => ({
      start: Math.max(current.start, current.end - EXEC_WINDOW_CAP_SEC),
      end: current.end,
    }),
    [current.start, current.end],
  );
  const execEnabled = isCrn && wantExact;
  const execQuery = useExecutionExpenses(
    execWindow.start,
    execWindow.end,
    execEnabled,
  );

  // 30d only: the per-VM scaling factor needs the address's exec totals over
  // the trailing-7d table window — one extra cheap total-only rewards query.
  // Degenerate window (from === to) keeps it disabled on other ranges.
  const tableWindowDiffers = execEnabled && execWindow.start !== current.start;
  const tableRewardsQuery = useRewards(
    rewardAddr,
    tableWindowDiffers ? execWindow.start : current.end,
    current.end,
  );

  const data = useMemo<NodeEarnings | undefined>(() => {
    if (!nodeState || !selfNode || !rewardsQuery.data) return undefined;
    if (!isCcn && !isCrn) return undefined;

    const role: "crn" | "ccn" = isCcn ? "ccn" : "crn";
    const rewards = rewardsQuery.data;
    const buckets = rewards.buckets ?? [];
    const lower = rewardAddr.toLowerCase();

    // Same-role siblings sharing this reward address.
    const ownedCrns = [...nodeState.crns.values()].filter(
      (c) => getRewardAddress(c).toLowerCase() === lower,
    );
    const ownedCcns = [...nodeState.ccns.values()].filter(
      (c) => getRewardAddress(c).toLowerCase() === lower,
    );
    const ownedCrnHashes = new Set(ownedCrns.map((c) => c.hash));

    // Window-constant weights: vmCount proxy (CRN) / score (CCN).
    const staticWeights = new Map<string, number>();
    if (role === "crn") {
      const vmCounts = new Map((allNodes ?? []).map((n) => [n.hash, n.vmCount]));
      for (const c of ownedCrns) staticWeights.set(c.hash, vmCounts.get(c.hash) ?? 0);
    } else {
      for (const c of ownedCcns) staticWeights.set(c.hash, computeScoreMultiplier(c.score));
    }

    // Exact per-bucket weights only when execution data covers the full window.
    const exactWeightsUsable =
      role === "crn" &&
      wantExact &&
      !!execQuery.data &&
      execWindow.start === current.start;
    const perBucketWeights = exactWeightsUsable
      ? computeExecutionBucketWeights(execQuery.data!, ownedCrnHashes, buckets)
      : null;

    const apportioned = apportionNodeBuckets({
      nodeHash: hash,
      role,
      buckets,
      perBucketWeights,
      staticWeights,
    });

    const sameRoleCount = role === "crn" ? ownedCrns.length : ownedCcns.length;
    const curRoles = roleTotals(rewards.full);
    const curRoleTotal = role === "crn" ? curRoles.crn : curRoles.ccn;

    // Previous-window delta: apportion the prev address totals with the current
    // window's realized share (prev-window execution data isn't fetched —
    // doubling the payload for a delta isn't worth it; exact for single-node
    // addresses regardless).
    const frac =
      curRoleTotal > 0
        ? apportioned.totalAleph / curRoleTotal
        : sameRoleCount > 0
          ? 1 / sameRoleCount
          : 0;
    const prevRoles = prevQuery.data ? roleTotals(prevQuery.data.full) : null;
    const prevNodeAleph = prevRoles
      ? (role === "crn" ? prevRoles.crn : prevRoles.ccn) * frac
      : 0;

    // Secondary line: VM-count replay (CRN) / linked-CRN flat line (CCN).
    const bucketStarts = apportioned.buckets.map((b) => b.time);
    const currentVms = node?.vms.length ?? 0;
    let secondaryCurrent: number[];
    if (role === "crn") {
      secondaryCurrent = bucketStarts.length
        ? replayVmCountTimeline({
            history: node?.history ?? [],
            currentVmCount: currentVms,
            bucketStarts,
            windowEndSec: current.end,
          })
        : [];
    } else {
      const linked = [...nodeState.crns.values()].filter(
        (c) => c.parent === hash,
      ).length;
      secondaryCurrent = bucketStarts.map(() => linked);
    }

    const bucketsOut: NodeEarningsBucket[] = apportioned.buckets.map((b, i) => ({
      time: b.time,
      aleph: b.aleph,
      secondaryCount: secondaryCurrent[i] ?? 0,
    }));

    const avgCurr =
      secondaryCurrent.length === 0
        ? 0
        : secondaryCurrent.reduce((s, n) => s + n, 0) / secondaryCurrent.length;
    // History only covers recent events; previous-window counts flat-line to
    // the current count (same approximation as before the re-source).
    const delta = {
      aleph: apportioned.totalAleph - prevNodeAleph,
      secondaryCount: role === "crn" ? avgCurr - currentVms : 0,
    };

    const reconciliation: Reconciliation = {
      rewardAddr,
      windowAleph: rewards.totalAleph,
      thisNode: apportioned.totalAleph,
      otherSameKind: {
        aleph: Math.max(0, curRoleTotal - apportioned.totalAleph),
        count: Math.max(0, sameRoleCount - 1),
      },
      crossKind: {
        aleph: role === "crn" ? curRoles.ccn : curRoles.crn,
        role: role === "crn" ? "ccn" : "crn",
      },
      staker: curRoles.staker,
    };

    const weightsExact =
      role === "ccn" || sameRoleCount <= 1 || exactWeightsUsable;

    if (role === "crn") {
      let perVm: NodeEarningsPerVm[] | undefined;
      const tableRewards = tableWindowDiffers
        ? tableRewardsQuery.data
        : rewards;
      if (execQuery.data && tableRewards) {
        const tf = tableRewards.full;
        perVm = computePerVmEarnings({
          nodeHash: hash,
          expenses: execQuery.data,
          addressExecAleph:
            tf.credit_revenue.execution_crn + tf.holder_tier.execution_crn,
          ownedCrnHashes,
        });
      }
      return {
        role,
        totalAleph: apportioned.totalAleph,
        bySource: apportioned.bySource,
        delta,
        buckets: bucketsOut,
        weightsExact,
        ...(perVm ? { perVm } : {}),
        reconciliation,
      };
    }

    const linkedCrns: NodeEarningsLinkedCrn[] = [];
    for (const crn of nodeState.crns.values()) {
      if (crn.parent !== hash) continue;
      const live = allNodes?.find((n) => n.hash === crn.hash);
      linkedCrns.push({
        hash: crn.hash,
        name: crn.name,
        status: live?.status ?? crn.status,
        vmCount: live?.vmCount ?? 0,
      });
    }
    return {
      role,
      totalAleph: apportioned.totalAleph,
      bySource: apportioned.bySource,
      delta,
      buckets: bucketsOut,
      weightsExact,
      linkedCrns,
      reconciliation,
    };
  }, [
    hash,
    nodeState,
    selfNode,
    isCcn,
    isCrn,
    rewardAddr,
    rewardsQuery.data,
    prevQuery.data,
    execQuery.data,
    tableRewardsQuery.data,
    tableWindowDiffers,
    allNodes,
    node,
    wantExact,
    execWindow.start,
    current.start,
    current.end,
  ]);

  return {
    data,
    isLoading: rewardsQuery.isLoading,
    isPlaceholderData: !!rewardsQuery.isPlaceholderData,
    isError: rewardsQuery.isError,
    isPerVmLoading:
      execEnabled &&
      (execQuery.isLoading || (tableWindowDiffers && tableRewardsQuery.isLoading)),
    isPerVmError: execEnabled && execQuery.isError,
  };
}
