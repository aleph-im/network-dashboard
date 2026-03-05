"use client";

import Link from "next/link";
import { Card } from "@aleph-front/ds/card";
import { Badge } from "@aleph-front/ds/badge";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { CardHeader } from "@/components/card-header";
import { useOverviewStats } from "@/hooks/use-overview-stats";
import { VM_STATUS_VARIANT } from "@/lib/status-map";
import type { VmStatus } from "@/api/types";

type VmStatusRow = {
  label: string;
  status: VmStatus;
  count: number;
};

export function VMAllocationSummary() {
  const { data: stats, isLoading } = useOverviewStats();

  if (isLoading) {
    return (
      <Card padding="lg" className="card-glow flex-1">
        <CardHeader
          title="VM Allocation"
          info="Breakdown of virtual machines by scheduling status"
        />
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (!stats) return null;

  const rows: VmStatusRow[] = [
    { label: "Scheduled", status: "scheduled", count: stats.scheduledVMs },
    { label: "Orphaned", status: "orphaned", count: stats.orphanedVMs },
    { label: "Missing", status: "missing", count: stats.missingVMs },
    { label: "Unschedulable", status: "unschedulable", count: stats.unschedulableVMs },
  ];

  return (
    <Card padding="lg" className="card-glow flex-1">
      <CardHeader
        title="VM Allocation"
        info="Breakdown of virtual machines by scheduling status"
      />

      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.label}>
            <Link
              href={`/vms?status=${row.status}`}
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
              style={{ transitionDuration: "var(--duration-fast)" }}
            >
              <div className="flex items-center gap-2">
                <Badge variant={VM_STATUS_VARIANT[row.status]} size="sm">
                  {row.label}
                </Badge>
              </div>
              <span className="font-medium tabular-nums">{row.count}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t border-edge pt-3">
        <div className="flex items-center justify-between text-sm font-medium">
          <span>Total</span>
          <span className="tabular-nums">{stats.totalVMs}</span>
        </div>
      </div>
    </Card>
  );
}
