"use client";

import { StatsBar } from "@/components/stats-bar";
import { NodeHealthSummary } from "@/components/node-health-summary";
import { VMAllocationSummary } from "@/components/vm-allocation-summary";
import { TopNodesCard } from "@/components/top-nodes-card";

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <StatsBar />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <NodeHealthSummary />
        <VMAllocationSummary />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TopNodesCard />
      </div>
    </div>
  );
}
