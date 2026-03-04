"use client";

import { Card } from "@aleph-front/ds/card";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { useOverviewStats } from "@/hooks/use-overview-stats";

type StatCardProps = {
  label: string;
  value: number | undefined;
  detail?: string | undefined;
  isLoading: boolean;
};

function StatCard({ label, value, detail, isLoading }: StatCardProps) {
  return (
    <Card padding="sm" className="flex-1 min-w-[140px]">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {isLoading ? (
        <Skeleton className="mt-1 h-8 w-16" />
      ) : (
        <p className="mt-1 text-2xl font-bold tabular-nums">
          {value ?? 0}
        </p>
      )}
      {detail && !isLoading && (
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      )}
    </Card>
  );
}

export function StatsBar() {
  const { data: stats, isLoading } = useOverviewStats();

  return (
    <div className="flex flex-wrap gap-3">
      <StatCard
        label="Total Nodes"
        value={stats?.totalNodes}
        detail={
          stats
            ? `${stats.healthyNodes} healthy, ${stats.unreachableNodes + stats.unknownNodes} unhealthy`
            : undefined
        }
        isLoading={isLoading}
      />
      <StatCard
        label="Healthy Nodes"
        value={stats?.healthyNodes}
        isLoading={isLoading}
      />
      <StatCard
        label="Total VMs"
        value={stats?.totalVMs}
        detail={
          stats ? `${stats.scheduledVMs} scheduled` : undefined
        }
        isLoading={isLoading}
      />
      <StatCard
        label="Orphaned VMs"
        value={stats?.orphanedVMs}
        isLoading={isLoading}
      />
      <StatCard
        label="Missing VMs"
        value={stats?.missingVMs}
        isLoading={isLoading}
      />
      <StatCard
        label="Unschedulable VMs"
        value={stats?.unschedulableVMs}
        isLoading={isLoading}
      />
    </div>
  );
}
