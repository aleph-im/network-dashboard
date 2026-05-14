"use client";

import { useMemo } from "react";
import {
  useCreditExpenses,
  RANGE_SECONDS,
  getStableExpenseRange,
  type CreditRange,
} from "@/hooks/use-credit-expenses";
import { useNodeState } from "@/hooks/use-node-state";
import { useNode, useNodes } from "@/hooks/use-nodes";
import {
  computeDistributionSummary,
  getRewardAddress,
} from "@/lib/credit-distribution";
import { replayVmCountTimeline } from "@/lib/node-vm-history";
import type { CreditEntrySource } from "@/api/credit-types";

const CRN_SHARE = 0.6;

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
  delta: { aleph: number; secondaryCount: number };
  buckets: NodeEarningsBucket[];
  perVm?: NodeEarningsPerVm[];
  linkedCrns?: NodeEarningsLinkedCrn[];
  reconciliation: Reconciliation | null;
};

const BUCKET_COUNT: Record<CreditRange, number> = {
  "24h": 24,
  "7d": 7,
  "30d": 30,
};

export function useNodeEarnings(
  hash: string,
  range: CreditRange,
): {
  data: NodeEarnings | undefined;
  isLoading: boolean;
  isPlaceholderData: boolean;
} {
  const rangeSec = RANGE_SECONDS[range];

  const current = useMemo(() => getStableExpenseRange(rangeSec), [rangeSec]);
  const previous = useMemo(
    () => ({ start: current.start - rangeSec, end: current.start }),
    [current.start, rangeSec],
  );

  const expensesQuery = useCreditExpenses(current.start, current.end);
  const prevExpensesQuery = useCreditExpenses(previous.start, previous.end);
  const { data: nodeState } = useNodeState();
  const { data: node } = useNode(hash);
  const { data: allNodes } = useNodes();

  const data = useMemo<NodeEarnings | undefined>(() => {
    if (!expensesQuery.data || !nodeState) return undefined;

    const isCcn = nodeState.ccns.has(hash);
    const isCrn = nodeState.crns.has(hash);
    if (!isCcn && !isCrn) return undefined;

    const role: "crn" | "ccn" = isCcn ? "ccn" : "crn";
    const selfNode = isCcn
      ? nodeState.ccns.get(hash)!
      : nodeState.crns.get(hash)!;
    const rewardAddr = getRewardAddress(selfNode);
    const bucketCount = BUCKET_COUNT[range];

    const currentSummary = computeDistributionSummary(
      expensesQuery.data,
      nodeState,
      {
        bucketCount,
        startTime: current.start,
        endTime: current.end,
      },
    );

    const prevSummary = prevExpensesQuery.data
      ? computeDistributionSummary(prevExpensesQuery.data, nodeState, {
          bucketCount,
          startTime: previous.start,
          endTime: previous.end,
        })
      : undefined;

    const buckets = currentSummary.perNodeBuckets?.get(hash) ?? [];
    const totalAleph = buckets.reduce((s, b) => s + b.aleph, 0);
    const prevTotal =
      prevSummary?.perNodeBuckets?.get(hash)?.reduce((s, b) => s + b.aleph, 0) ?? 0;

    let secondaryCurrent: number[];
    let secondaryPrev: number[];
    if (role === "crn") {
      const currentVms = node?.vms.length ?? 0;
      const history = node?.history ?? [];
      const bucketStarts = buckets.map((b) => b.time);
      secondaryCurrent = bucketStarts.length
        ? replayVmCountTimeline({
            history,
            currentVmCount: currentVms,
            bucketStarts,
            windowEndSec: current.end,
          })
        : [];
      // History from the API only covers recent events; we can't reconstruct
      // the previous window accurately. Fall back to the current VM count.
      secondaryPrev = secondaryCurrent.map(() => currentVms);
    } else {
      const linked = Array.from(nodeState.crns.values()).filter(
        (c) => c.parent === hash,
      ).length;
      secondaryCurrent = buckets.map(() => linked);
      secondaryPrev = secondaryCurrent;
    }

    const bucketsOut: NodeEarningsBucket[] = buckets.map((b, i) => ({
      time: b.time,
      aleph: b.aleph,
      secondaryCount: secondaryCurrent[i] ?? 0,
    }));

    const avgCurr =
      secondaryCurrent.length === 0
        ? 0
        : secondaryCurrent.reduce((s, n) => s + n, 0) / secondaryCurrent.length;
    const avgPrev =
      secondaryPrev.length === 0
        ? 0
        : secondaryPrev.reduce((s, n) => s + n, 0) / secondaryPrev.length;

    const delta = {
      aleph: totalAleph - prevTotal,
      secondaryCount: avgCurr - avgPrev,
    };

    if (role === "crn") {
      const perVmMap = currentSummary.perVmInWindow ?? new Map();
      const perVm: NodeEarningsPerVm[] = [];
      for (const [vmHash, entry] of perVmMap) {
        if (entry.nodeId === hash) {
          perVm.push({
            vmHash,
            aleph: entry.aleph * CRN_SHARE,
            source: entry.source,
          });
        }
      }
      perVm.sort((a, b) => b.aleph - a.aleph);
      const recipient = currentSummary.recipients.find(
        (r) => r.address === rewardAddr,
      );
      const reconciliation: Reconciliation | null = recipient
        ? {
            rewardAddr,
            thisNode: totalAleph,
            otherSameKind: {
              aleph: recipient.crnAleph - totalAleph,
              count: Math.max(0, recipient.crnCount - 1),
            },
            crossKind: { aleph: recipient.ccnAleph, role: "ccn" },
            staker: recipient.stakerAleph,
            windowAleph:
              recipient.crnAleph + recipient.ccnAleph + recipient.stakerAleph,
          }
        : null;
      return {
        role,
        totalAleph,
        delta,
        buckets: bucketsOut,
        perVm,
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
    const recipient = currentSummary.recipients.find(
      (r) => r.address === rewardAddr,
    );
    const reconciliation: Reconciliation | null = recipient
      ? {
          rewardAddr,
          thisNode: totalAleph,
          otherSameKind: {
            aleph: recipient.ccnAleph - totalAleph,
            count: Math.max(0, recipient.ccnCount - 1),
          },
          crossKind: { aleph: recipient.crnAleph, role: "crn" },
          staker: recipient.stakerAleph,
          windowAleph:
            recipient.crnAleph + recipient.ccnAleph + recipient.stakerAleph,
        }
      : null;
    return {
      role,
      totalAleph,
      delta,
      buckets: bucketsOut,
      linkedCrns,
      reconciliation,
    };
  }, [
    hash,
    range,
    expensesQuery.data,
    prevExpensesQuery.data,
    nodeState,
    node,
    allNodes,
    current.start,
    current.end,
    previous.start,
    previous.end,
  ]);

  return {
    data,
    isLoading:
      expensesQuery.isLoading ||
      (prevExpensesQuery.isLoading && !prevExpensesQuery.data),
    isPlaceholderData: !!expensesQuery.isPlaceholderData,
  };
}
