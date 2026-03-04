"use client";

import Link from "next/link";
import { Button } from "@aleph-front/ds/button";
import { Card } from "@aleph-front/ds/card";
import { Badge } from "@aleph-front/ds/badge";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@aleph-front/ds/tooltip";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { useVMs } from "@/hooks/use-vms";
import { useVMCreationTimes } from "@/hooks/use-vm-creation-times";
import { truncateHash, relativeTimeFromUnix } from "@/lib/format";
import type { VmStatus } from "@/api/types";

const MAX_ROWS = 15;

const VM_STATUS_VARIANT: Record<
  VmStatus,
  "default" | "success" | "warning" | "error" | "info"
> = {
  scheduled: "info",
  unscheduled: "default",
  orphaned: "warning",
  missing: "error",
  unschedulable: "error",
  unknown: "default",
};

export function LatestVMsCard() {
  const { data: vms, isLoading } = useVMs();
  const hashes = (vms ?? []).map((v) => v.hash);
  const { data: creationTimes } = useVMCreationTimes(hashes);

  if (isLoading) {
    return (
      <Card title="Latest VMs" padding="md" className="flex-1">
        <div className="space-y-1.5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  const allVMs = vms ?? [];

  if (allVMs.length === 0) {
    return (
      <Card title="Latest VMs" padding="md" className="flex-1">
        <p className="text-sm text-muted-foreground">No VMs found.</p>
      </Card>
    );
  }

  // Sort by creation time if available, otherwise by updatedAt
  const sorted = [...allVMs]
    .sort((a, b) => {
      const timeA = creationTimes?.get(a.hash);
      const timeB = creationTimes?.get(b.hash);
      if (timeA != null && timeB != null) return timeB - timeA;
      if (timeA != null) return -1;
      if (timeB != null) return 1;
      return (
        new Date(b.updatedAt).getTime() -
        new Date(a.updatedAt).getTime()
      );
    })
    .slice(0, MAX_ROWS);

  return (
    <Card title="Latest VMs" padding="md" className="flex-1">
      <TooltipProvider>
        <ul className="space-y-1">
          {sorted.map((vm) => {
            const createdAt = creationTimes?.get(vm.hash);
            return (
              <li key={vm.hash}>
                <Link
                  href={`/vms?selected=${vm.hash}`}
                  className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm transition-colors hover:bg-muted"
                  style={{
                    transitionDuration: "var(--duration-fast)",
                  }}
                >
                  <Badge variant={VM_STATUS_VARIANT[vm.status]}>
                    {vm.status}
                  </Badge>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">
                        {truncateHash(vm.hash)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{vm.hash}</TooltipContent>
                  </Tooltip>
                  <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                    {createdAt != null ? (
                      relativeTimeFromUnix(createdAt)
                    ) : (
                      <Skeleton className="h-4 w-12" />
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </TooltipProvider>

      <div className="mt-3 border-t border-border pt-3">
        <Button variant="text" size="xs" asChild>
          <Link href="/vms">View all VMs &rarr;</Link>
        </Button>
      </div>
    </Card>
  );
}
