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
import { VM_STATUS_VARIANT } from "@/lib/status-map";

const MAX_ROWS = 15;

export function LatestVMsCard() {
  const { data: vms, isLoading } = useVMs();
  const hashes = (vms ?? []).map((v) => v.hash);
  const { data: creationTimes } = useVMCreationTimes(hashes);

  if (isLoading) {
    return (
      <Card title="Latest VMs" padding="md" className="flex-1">
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
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
        <ul className="divide-y divide-black/[0.06] [&>:last-child]:border-b-0 dark:divide-white/[0.06]">
          {sorted.map((vm) => {
            const createdAt = creationTimes?.get(vm.hash);
            return (
              <li key={vm.hash}>
                <Link
                  href={`/vms?selected=${vm.hash}`}
                  className="flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-muted"
                  style={{
                    transitionDuration: "var(--duration-fast)",
                  }}
                >
                  <Badge
                    variant={VM_STATUS_VARIANT[vm.status]}
                    size="sm"
                    className="w-24 shrink-0 justify-center capitalize"
                  >
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

      <div className="mt-6 pt-3">
        <Button variant="text" size="xs" asChild>
          <Link href="/vms">View all VMs &rarr;</Link>
        </Button>
      </div>
    </Card>
  );
}
