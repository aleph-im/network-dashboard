"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Card } from "@aleph-front/ds/card";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { useOverviewStats } from "@/hooks/use-overview-stats";
import { useStatsHistory } from "@/hooks/use-stats-history";
import type { StatsSnapshot } from "@/api/types";

type StatCardProps = {
  label: string;
  value: number | undefined;
  detail?: string | undefined;
  isLoading: boolean;
  history?: { value: number }[] | undefined;
  color?: string | undefined;
};

function StatCard({
  label,
  value,
  detail,
  isLoading,
  history,
  color = "var(--color-primary)",
}: StatCardProps) {
  return (
    <Card padding="sm" className="flex-1 min-w-[140px] overflow-hidden">
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
      {history && history.length > 0 && (
        <div className="-mx-3 -mb-2 mt-2">
          <ResponsiveContainer width="100%" height={40}>
            <AreaChart data={history}>
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                fill={color}
                fillOpacity={0.15}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function extractHistory(
  snapshots: StatsSnapshot[],
  key: keyof StatsSnapshot,
): { value: number }[] {
  return snapshots.map((s) => ({ value: s[key] as number }));
}

const COLORS = {
  primary: "var(--color-primary-400)",
  success: "var(--color-success-400)",
  warning: "var(--color-warning-400)",
  error: "var(--color-error-400)",
} as const;

export function StatsBar() {
  const { data: stats, isLoading } = useOverviewStats();
  const { data: history } = useStatsHistory();

  return (
    <div className="flex flex-wrap gap-3">
      <StatCard
        label="Total Nodes"
        value={stats?.totalNodes}
        detail={
          stats
            ? `${stats.healthyNodes} healthy, ${stats.degradedNodes + stats.offlineNodes} unhealthy`
            : undefined
        }
        isLoading={isLoading}
        history={
          history ? extractHistory(history, "totalNodes") : undefined
        }
        color={COLORS.primary}
      />
      <StatCard
        label="Healthy Nodes"
        value={stats?.healthyNodes}
        isLoading={isLoading}
        history={
          history
            ? extractHistory(history, "healthyNodes")
            : undefined
        }
        color={COLORS.success}
      />
      <StatCard
        label="Total VMs"
        value={stats?.totalVMs}
        detail={
          stats
            ? `${stats.scheduledVMs} scheduled, ${stats.observedVMs} observed`
            : undefined
        }
        isLoading={isLoading}
        history={
          history ? extractHistory(history, "totalVMs") : undefined
        }
        color={COLORS.primary}
      />
      <StatCard
        label="Orphaned"
        value={stats?.orphanedVMs}
        isLoading={isLoading}
        history={
          history
            ? extractHistory(history, "orphanedVMs")
            : undefined
        }
        color={COLORS.warning}
      />
      <StatCard
        label="Missing"
        value={stats?.missingVMs}
        isLoading={isLoading}
        history={
          history
            ? extractHistory(history, "missingVMs")
            : undefined
        }
        color={COLORS.error}
      />
      <StatCard
        label="Unschedulable"
        value={stats?.unschedulableVMs}
        isLoading={isLoading}
        history={
          history
            ? extractHistory(history, "unschedulableVMs")
            : undefined
        }
        color={COLORS.error}
      />
    </div>
  );
}
