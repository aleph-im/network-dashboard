"use client";

import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@aleph-front/ds/tooltip";
import { useOverviewStats } from "@/hooks/use-overview-stats";

type StatProps = {
  label: string;
  value: number | undefined;
  subtitle: string;
  isLoading: boolean;
  color?: string | undefined;
  tint?: string | undefined;
};

function Stat({
  label,
  value,
  subtitle,
  isLoading,
  color,
  tint,
}: StatProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="stat-card border border-white/[0.06] bg-white/[0.03] p-6"
            style={{
              "--stat-tint": tint ?? "transparent",
            } as React.CSSProperties}
          >
            <div className="flex items-center gap-2">
              {color ? (
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
              ) : null}
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
                {label}
              </p>
            </div>
            {isLoading ? (
              <Skeleton className="mt-3 h-11 w-24" />
            ) : (
              <p
                className="mt-3 font-heading text-4xl font-extrabold tabular-nums tracking-tight"
                {...(color ? { style: { color } } : {})}
              >
                {value ?? 0}
              </p>
            )}
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground/60">
              {subtitle}
            </p>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[280px]">
          {subtitle}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function StatsBar() {
  const { data: stats, isLoading } = useOverviewStats();

  const hasUnreachable = (stats?.unreachableNodes ?? 0) > 0;
  const hasRemoved = (stats?.removedNodes ?? 0) > 0;
  const hasOrphaned = (stats?.orphanedVMs ?? 0) > 0;
  const hasMissing = (stats?.missingVMs ?? 0) > 0;
  const hasUnschedulable = (stats?.unschedulableVMs ?? 0) > 0;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      {/* Nodes */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground/50">
          Nodes
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Stat
            label="Total"
            value={stats?.totalNodes}
            subtitle="Compute nodes registered with the scheduler"
            isLoading={isLoading}
          />
          <Stat
            label="Healthy"
            value={stats?.healthyNodes}
            subtitle="Nodes that passed their last health check"
            isLoading={isLoading}
            color="var(--color-success-500)"
            tint="var(--color-success-500)"
          />
          <Stat
            label="Unreachable"
            value={stats?.unreachableNodes}
            subtitle="Nodes that failed their last health check"
            isLoading={isLoading}
            {...(hasUnreachable
              ? {
                  color: "var(--color-error-400)",
                  tint: "var(--color-error-400)",
                }
              : {})}
          />
          <Stat
            label="Removed"
            value={stats?.removedNodes}
            subtitle="Nodes that have been deregistered from the scheduler"
            isLoading={isLoading}
            {...(hasRemoved
              ? {
                  color: "var(--color-muted-foreground)",
                  tint: "var(--color-muted-foreground)",
                }
              : {})}
          />
        </div>
      </div>

      {/* VMs */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground/50">
          Virtual Machines
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Stat
            label="Total"
            value={stats?.totalVMs}
            subtitle="Virtual machines currently scheduled across the network"
            isLoading={isLoading}
          />
          <Stat
            label="Orphaned"
            value={stats?.orphanedVMs}
            subtitle="VMs whose assigned node is no longer responding"
            isLoading={isLoading}
            {...(hasOrphaned
              ? {
                  color: "var(--color-warning-400)",
                  tint: "var(--color-warning-400)",
                }
              : {})}
          />
          <Stat
            label="Missing"
            value={stats?.missingVMs}
            subtitle="VMs expected to be running but not found on any node"
            isLoading={isLoading}
            {...(hasMissing
              ? {
                  color: "var(--color-error-400)",
                  tint: "var(--color-error-400)",
                }
              : {})}
          />
          <Stat
            label="Unschedulable"
            value={stats?.unschedulableVMs}
            subtitle="VMs that cannot be placed due to resource constraints"
            isLoading={isLoading}
            {...(hasUnschedulable
              ? {
                  color: "var(--color-warning-400)",
                  tint: "var(--color-warning-400)",
                }
              : {})}
          />
        </div>
      </div>
    </div>
  );
}
