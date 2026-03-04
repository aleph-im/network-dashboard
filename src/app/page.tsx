"use client";

import { StatsBar } from "@/components/stats-bar";
import { NodeHealthSummary } from "@/components/node-health-summary";
import { VMAllocationSummary } from "@/components/vm-allocation-summary";
import { TopNodesCard } from "@/components/top-nodes-card";
import { LatestVMsCard } from "@/components/latest-vms-card";

export default function OverviewPage() {
  return (
    <div>
      <StatsBar />

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <NodeHealthSummary />
        <VMAllocationSummary />
      </div>

      <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TopNodesCard />
        <LatestVMsCard />
      </div>
    </div>
  );
}
