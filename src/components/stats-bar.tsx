"use client";

import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { useOverviewStats } from "@/hooks/use-overview-stats";

type StatProps = {
  label: string;
  value: number | undefined;
  detail?: string | undefined;
  isLoading: boolean;
  color?: string | undefined;
};

function Stat({ label, value, detail, isLoading, color }: StatProps) {
  return (
    <div className="text-center">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        {label}
      </p>
      {isLoading ? (
        <Skeleton className="mx-auto mt-1.5 h-10 w-20" />
      ) : (
        <p
          className="mt-1 text-4xl font-extrabold tabular-nums tracking-tight"
          {...(color ? { style: { color } } : {})}
        >
          {value ?? 0}
        </p>
      )}
      {detail && !isLoading && (
        <p className="mt-1 text-xs text-muted-foreground/60">{detail}</p>
      )}
    </div>
  );
}

export function StatsBar() {
  const { data: stats, isLoading } = useOverviewStats();

  const hasOrphaned = (stats?.orphanedVMs ?? 0) > 0;
  const hasMissing = (stats?.missingVMs ?? 0) > 0;
  const hasUnschedulable = (stats?.unschedulableVMs ?? 0) > 0;

  return (
    <div className="grid grid-cols-3 gap-y-10 py-6 sm:grid-cols-6">
      <Stat
        label="Nodes"
        value={stats?.totalNodes}
        detail={
          stats
            ? `${stats.healthyNodes} healthy · ${stats.unreachableNodes + stats.unknownNodes} unhealthy`
            : undefined
        }
        isLoading={isLoading}
      />
      <Stat
        label="Healthy"
        value={stats?.healthyNodes}
        isLoading={isLoading}
        color="var(--color-success-500)"
      />
      <Stat
        label="VMs"
        value={stats?.totalVMs}
        detail={stats ? `${stats.scheduledVMs} scheduled` : undefined}
        isLoading={isLoading}
      />
      <Stat
        label="Orphaned"
        value={stats?.orphanedVMs}
        isLoading={isLoading}
        {...(hasOrphaned
          ? { color: "var(--color-warning-400)" }
          : {})}
      />
      <Stat
        label="Missing"
        value={stats?.missingVMs}
        isLoading={isLoading}
        {...(hasMissing
          ? { color: "var(--color-error-400)" }
          : {})}
      />
      <Stat
        label="Unschedulable"
        value={stats?.unschedulableVMs}
        isLoading={isLoading}
        {...(hasUnschedulable
          ? { color: "var(--color-warning-400)" }
          : {})}
      />
    </div>
  );
}
