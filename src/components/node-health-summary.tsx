"use client";

import Link from "next/link";
import { Card } from "@aleph-front/ds/card";
import { StatusDot } from "@aleph-front/ds/status-dot";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { CardHeader } from "@/components/card-header";
import { useOverviewStats } from "@/hooks/use-overview-stats";
import { nodeStatusToDot } from "@/lib/status-map";
import type { NodeStatus } from "@/api/types";

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

type HealthSegment = {
  label: string;
  count: number;
  status: NodeStatus;
  color: string;
};

export function NodeHealthSummary() {
  const { data: stats, isLoading } = useOverviewStats();

  if (isLoading) {
    return (
      <Card padding="lg" className="card-glow flex-1">
        <CardHeader
          title="Node Health"
          info="Distribution of compute nodes by health status"
        />
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

  const removedNodes =
    stats.totalNodes -
    stats.healthyNodes -
    stats.unreachableNodes -
    stats.unknownNodes;

  const segments: HealthSegment[] = [
    { label: "Healthy", count: stats.healthyNodes, status: "healthy", color: "var(--color-success-500)" },
    { label: "Unreachable", count: stats.unreachableNodes, status: "unreachable", color: "var(--color-error-500)" },
    { label: "Unknown", count: stats.unknownNodes, status: "unknown", color: "var(--color-neutral-400)" },
    { label: "Removed", count: removedNodes, status: "removed", color: "var(--color-warning-500)" },
  ];

  return (
    <Card padding="lg" className="card-glow flex-1">
      <CardHeader
        title="Node Health"
        info="Distribution of compute nodes by health status"
      />

      <div className="flex h-3 gap-0.5 overflow-hidden rounded-md bg-muted">
        {segments.map((seg) => (
          <Segment
            key={seg.label}
            count={seg.count}
            total={stats.totalNodes}
            color={seg.color}
          />
        ))}
      </div>

      <ul className="mt-4 space-y-1.5">
        {segments
          .filter((s) => s.count > 0)
          .map((seg) => (
            <li key={seg.label}>
              <Link
                href={`/nodes?status=${seg.status}`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                style={{ transitionDuration: "var(--duration-fast)" }}
              >
                <StatusDot status={nodeStatusToDot(seg.status)} size="sm" />
                <span className="text-muted-foreground">{seg.label}</span>
                <span className="ml-auto font-medium tabular-nums">
                  {seg.count}
                </span>
              </Link>
            </li>
          ))}
      </ul>
    </Card>
  );
}
