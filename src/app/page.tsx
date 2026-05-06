"use client";

import { StatsBar } from "@/components/stats-bar";
import { TopNodesCard } from "@/components/top-nodes-card";
import { LatestVMsCard } from "@/components/latest-vms-card";
import { WorldMapCard } from "@/components/world-map-card";

export default function OverviewPage() {
  return (
    <div>
      <div className="mb-10">
        <h1 className="text-4xl">Overview</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Real-time scheduler health and VM allocation
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-4">
        <StatsBar />
        <WorldMapCard />
      </div>

      <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <TopNodesCard />
        <LatestVMsCard />
      </div>
    </div>
  );
}
