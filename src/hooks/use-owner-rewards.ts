"use client";

import { useEffect, useMemo, useState } from "react";
import { useRewards } from "@/hooks/use-rewards";
import { useDistributions } from "@/hooks/use-distributions";
import { useNodes } from "@/hooks/use-nodes";
import { useNodeState } from "@/hooks/use-node-state";
import { apportionOwnerRewards } from "@/lib/reward-apportionment";
import type { OwnerRewards } from "@/api/rewards-types";

/** Data-start floor for the rewards API. */
const DATA_START_SEC = Math.floor(Date.UTC(2026, 4, 1) / 1000); // 2026-05-01

const NOW_ROUND_MS = 300_000; // 5 min — keeps the query key stable across remounts

function roundedNowSec(): number {
  return (Math.floor(Date.now() / NOW_ROUND_MS) * NOW_ROUND_MS) / 1000;
}

/** 5-min-rounded "now" that ticks while mounted, so the accrual window's upper
 *  bound advances and a Refresh invalidation refetches a moving window instead
 *  of the same frozen one. The rewards API truncates bounds to whole hours
 *  anyway, so real data changes at most hourly — the tick keeps the bound
 *  honest, not real-time. */
function useRoundedNowSec(): number {
  const [nowSec, setNowSec] = useState(roundedNowSec);
  useEffect(() => {
    const id = setInterval(() => setNowSec(roundedNowSec()), NOW_ROUND_MS);
    return () => clearInterval(id);
  }, []);
  return nowSec;
}

export function useOwnerRewards(address: string): {
  data: OwnerRewards | undefined;
  isLoading: boolean;
  isBreakdownLoading: boolean;
  isError: boolean;
} {
  const { data: cycle, isLoading: cycleLoading } = useDistributions();

  const nowSec = useRoundedNowSec();
  // While the cycle is still loading, use a degenerate window (from === to) so
  // useRewards stays disabled and we don't fire a throwaway DATA_START-wide
  // fetch that gets replaced once the real cycle window is known.
  const fromSec = cycleLoading ? nowSec : (cycle?.endSec ?? DATA_START_SEC);

  const { data: rewards, isLoading: rewardsLoading, isError: rewardsError } = useRewards(address, fromSec, nowSec);
  const { data: nodes, isLoading: nodesLoading } = useNodes();
  const { data: nodeState, isLoading: nsLoading } = useNodeState();

  const data = useMemo<OwnerRewards | undefined>(() => {
    if (!rewards || !nodeState) return undefined;
    const lower = address.toLowerCase();
    const crnVmCounts = new Map<string, number>();
    for (const n of nodes ?? []) crnVmCounts.set(n.hash, n.vmCount);
    const { byNode, stakingAleph, unattributedAleph } = apportionOwnerRewards({
      address, rewards, crnVmCounts, nodeState,
    });
    const paidAleph = cycle?.rewards.get(lower);
    const oc = cycle?.onChain.get(lower);
    return {
      address: lower,
      accrualStartSec: cycle?.endSec ?? null,
      totalAleph: rewards.totalAleph,
      bySource: rewards.bySource,
      byNode,
      stakingAleph,
      unattributedAleph,
      lastPaid:
        cycle && paidAleph !== undefined
          ? { aleph: paidAleph, timeSec: cycle.endSec, txHash: oc?.txHash ?? null, status: oc?.status ?? "pending" }
          : null,
    };
  }, [address, rewards, nodes, nodeState, cycle, fromSec]);

  return {
    data,
    isLoading: cycleLoading || rewardsLoading || nsLoading,
    isBreakdownLoading: nodesLoading,
    isError: rewardsError,
  };
}
