"use client";

import { useMemo } from "react";
import { useRewards } from "@/hooks/use-rewards";
import { useDistributions } from "@/hooks/use-distributions";
import { useNodes } from "@/hooks/use-nodes";
import { useNodeState } from "@/hooks/use-node-state";
import { apportionOwnerRewards } from "@/lib/reward-apportionment";
import type { OwnerRewards } from "@/api/rewards-types";

/** Data-start floor for the rewards API. */
const DATA_START_SEC = Math.floor(Date.UTC(2026, 4, 1) / 1000); // 2026-05-01

export function useOwnerRewards(address: string): {
  data: OwnerRewards | undefined;
  isLoading: boolean;
  isBreakdownLoading: boolean;
  isError: boolean;
} {
  const { data: cycle, isLoading: cycleLoading } = useDistributions();

  const nowSec = useMemo(() => Math.floor(Date.now() / 300_000) * 300, []); // 5-min rounded
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
