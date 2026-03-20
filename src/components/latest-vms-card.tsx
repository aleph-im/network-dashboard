"use client";

import Link from "next/link";
import { Button } from "@aleph-front/ds/button";
import { Card } from "@aleph-front/ds/card";
import { Badge } from "@aleph-front/ds/badge";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { CardHeader } from "@/components/card-header";
import { useVMs } from "@/hooks/use-vms";
import { useVMMessageInfo } from "@/hooks/use-vm-creation-times";
import { relativeTimeFromUnix } from "@/lib/format";
import { VM_STATUS_VARIANT } from "@/lib/status-map";

const MAX_ROWS = 15;

const CANDIDATE_POOL = 100;

export function LatestVMsCard() {
  const { data: vms, isLoading } = useVMs();

  // Pre-sort by updatedAt and take a candidate pool to avoid
  // looking up all 6000+ VM hashes on api2
  const candidates = [...(vms ?? [])]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() -
        new Date(a.updatedAt).getTime(),
    )
    .slice(0, CANDIDATE_POOL);
  const hashes = candidates.map((v) => v.hash);
  const { data: messageInfo } = useVMMessageInfo(hashes);

  if (isLoading) {
    return (
      <Card padding="lg" className="flex-1">
        <CardHeader
          title="Latest VMs"
          info="Most recently created virtual machines across the network"
        />
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (candidates.length === 0) {
    return (
      <Card padding="lg" className="flex-1">
        <CardHeader
          title="Latest VMs"
          info="Most recently created virtual machines across the network"
        />
        <p className="text-sm text-muted-foreground">No VMs found.</p>
      </Card>
    );
  }

  // Re-sort candidates by creation time (from api2) when available
  const sorted = [...candidates]
    .sort((a, b) => {
      const timeA = messageInfo?.get(a.hash)?.time;
      const timeB = messageInfo?.get(b.hash)?.time;
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
    <Card padding="lg" className="flex-1">
      <CardHeader
        title="Latest VMs"
        info="Most recently created virtual machines across the network"
      />

      <ul className="grid grid-cols-[auto_1fr_auto] gap-x-6">
        {sorted.map((vm) => {
          const msgInfo = messageInfo?.get(vm.hash);
          const createdAt = msgInfo?.time;
          return (
            <li key={vm.hash} className="contents">
              <Link
                href={`/vms?selected=${vm.hash}`}
                className="col-span-full grid min-h-12 grid-cols-subgrid items-center rounded-md border-b border-foreground/[0.06] px-2 py-1.5 transition-colors last:border-b-0 hover:bg-muted"
                style={{
                  transitionDuration: "var(--duration-fast)",
                }}
              >
                <Badge fill="outline"
                  variant={VM_STATUS_VARIANT[vm.status]}
                  size="sm"
                >
                  {vm.status}
                </Badge>

                <span className="block min-w-0 truncate font-mono text-xs text-muted-foreground">
                  {vm.hash}
                </span>

                <span className="min-w-16 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
                  {createdAt != null ? (
                    relativeTimeFromUnix(createdAt)
                  ) : messageInfo ? (
                    "—"
                  ) : (
                    <Skeleton className="h-4 w-12" />
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 pt-3">
        <Button variant="text" size="xs" asChild>
          <Link href="/vms">View all VMs &rarr;</Link>
        </Button>
      </div>
    </Card>
  );
}
