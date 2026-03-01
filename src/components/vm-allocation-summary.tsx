"use client";

import { Card } from "@aleph-front/ds/card";
import { Badge } from "@aleph-front/ds/badge";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { useOverviewStats } from "@/hooks/use-overview-stats";

type VMStatusRow = {
  label: string;
  count: number;
  variant: "default" | "success" | "warning" | "error" | "info";
};

export function VMAllocationSummary() {
  const { data: stats, isLoading } = useOverviewStats();

  if (isLoading) {
    return (
      <Card title="VM Allocation" padding="md" className="flex-1">
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (!stats) return null;

  const rows: VMStatusRow[] = [
    { label: "Scheduled", count: stats.scheduledVMs, variant: "info" },
    { label: "Observed", count: stats.observedVMs, variant: "success" },
    { label: "Orphaned", count: stats.orphanedVMs, variant: "warning" },
    { label: "Missing", count: stats.missingVMs, variant: "error" },
    { label: "Unschedulable", count: stats.unschedulableVMs, variant: "error" },
  ];

  return (
    <Card title="VM Allocation" padding="md" className="flex-1">
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Badge variant={row.variant} size="sm">
                {row.label}
              </Badge>
            </div>
            <span className="font-medium tabular-nums">{row.count}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 border-t border-edge pt-2">
        <div className="flex items-center justify-between text-sm font-medium">
          <span>Total</span>
          <span className="tabular-nums">{stats.totalVMs}</span>
        </div>
      </div>
    </Card>
  );
}
