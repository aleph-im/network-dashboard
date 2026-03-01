"use client";

import { Card } from "@aleph-front/ds/card";
import { StatusDot } from "@aleph-front/ds/status-dot";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { useOverviewStats } from "@/hooks/use-overview-stats";

type SegmentProps = {
  count: number;
  total: number;
  color: string;
};

function Segment({ count, total, color }: SegmentProps) {
  if (count === 0 || total === 0) return null;
  const pct = (count / total) * 100;
  return (
    <div
      className="h-full rounded-sm transition-all"
      style={{
        width: `${pct}%`,
        backgroundColor: color,
        transitionDuration: "var(--duration-normal)",
      }}
    />
  );
}

export function NodeHealthSummary() {
  const { data: stats, isLoading } = useOverviewStats();

  if (isLoading) {
    return (
      <Card title="Node Health" padding="md" className="flex-1">
        <Skeleton className="h-4 w-full" />
        <div className="mt-3 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-24" />
        </div>
      </Card>
    );
  }

  if (!stats) return null;

  const total = stats.totalNodes;
  const unknown =
    total - stats.healthyNodes - stats.degradedNodes - stats.offlineNodes;

  const segments = [
    { label: "Healthy", count: stats.healthyNodes, status: "healthy" as const, color: "var(--color-success-500)" },
    { label: "Degraded", count: stats.degradedNodes, status: "degraded" as const, color: "var(--color-warning-500)" },
    { label: "Offline", count: stats.offlineNodes, status: "offline" as const, color: "var(--color-error-500)" },
    { label: "Unknown", count: unknown, status: "unknown" as const, color: "var(--color-neutral-400)" },
  ];

  return (
    <Card title="Node Health" padding="md" className="flex-1">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-md bg-muted">
        {segments.map((seg) => (
          <Segment
            key={seg.label}
            count={seg.count}
            total={total}
            color={seg.color}
          />
        ))}
      </div>

      <ul className="mt-3 space-y-1.5">
        {segments
          .filter((s) => s.count > 0)
          .map((seg) => (
            <li key={seg.label} className="flex items-center gap-2 text-sm">
              <StatusDot status={seg.status} size="sm" />
              <span className="text-muted-foreground">{seg.label}</span>
              <span className="ml-auto font-medium tabular-nums">
                {seg.count}
              </span>
            </li>
          ))}
      </ul>
    </Card>
  );
}
