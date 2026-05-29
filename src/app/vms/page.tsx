"use client";

import { Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePageHeader } from "@aleph-front/ds/page-header";
import { Button } from "@aleph-front/ds/button";
import { ArrowClockwise } from "@phosphor-icons/react/dist/ssr";
import { VMTable } from "@/components/vm-table";
import { VMDetailPanel } from "@/components/vm-detail-panel";
import { VMDetailView } from "@/components/vm-detail-view";
import { useVMs } from "@/hooks/use-vms";
import { RETENTION_WINDOWS, type RetentionWindow } from "@/lib/filters";
import type { VmStatus } from "@/api/types";

const VALID_VM_STATUSES = new Set<string>([
  "scheduled",
  "dispatched",
  "migrating",
  "duplicated",
  "misplaced",
  "unscheduled",
  "orphaned",
  "missing",
  "unschedulable",
  "unknown",
]);

function VMsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewHash = searchParams.get("view");

  const statusParam = searchParams.get("status");
  const initialStatus =
    statusParam && VALID_VM_STATUSES.has(statusParam)
      ? (statusParam as VmStatus)
      : undefined;

  const queryParam = searchParams.get("q") ?? "";
  const retentionParam = searchParams.get("retention");
  const initialRetention = RETENTION_WINDOWS.includes(
    retentionParam as RetentionWindow,
  )
    ? (retentionParam as RetentionWindow)
    : undefined;
  const ownerParam = searchParams.get("owner") ?? "";

  const selectedParam = searchParams.get("selected");
  const [selectedVM, setSelectedVM] = useState<string | null>(selectedParam);

  const handleSelectVM = useCallback(
    (hash: string | null) => {
      if (
        hash &&
        typeof window !== "undefined" &&
        !window.matchMedia("(min-width: 1024px)").matches
      ) {
        router.push(`/vms?view=${hash}`);
        return;
      }
      setSelectedVM(hash);
    },
    [router],
  );

  const { data: vms, isFetching, refetch } = useVMs();
  const total = vms?.length ?? 0;

  const refreshButton = (
    <Button
      variant="text"
      size="xs"
      iconLeft={<ArrowClockwise />}
      onClick={() => {
        void refetch();
      }}
      disabled={isFetching}
    >
      {isFetching ? "Refreshing…" : "Refresh"}
    </Button>
  );

  usePageHeader({
    title: total > 0 ? `VMs · ${total} total` : "VMs",
    actions: <span className="hidden md:inline-flex">{refreshButton}</span>,
  });

  if (viewHash) {
    return <VMDetailView hash={viewHash} />;
  }

  return (
    <div>
      <div className="mb-10">
        <h1 className="text-4xl">Virtual Machines</h1>
        <p className="mt-2 text-base text-muted-foreground">
          VMs scheduled across the Aleph Cloud network
        </p>
      </div>
      <VMTable
      onSelectVM={handleSelectVM}
      {...(initialStatus ? { initialStatus } : {})}
      initialQuery={queryParam}
      initialOwner={ownerParam}
      {...(initialRetention ? { initialRetention } : {})}
      {...(selectedVM ? { selectedKey: selectedVM } : {})}
      compact={!!selectedVM}
      sidePanel={
        selectedVM && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              onClick={() => setSelectedVM(null)}
              aria-hidden="true"
            />
            <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm overflow-y-auto bg-surface p-4 shadow-lg lg:static lg:z-auto lg:w-auto lg:max-w-none lg:overflow-visible lg:bg-transparent lg:p-0 lg:shadow-none">
              <VMDetailPanel
                hash={selectedVM}
                onClose={() => setSelectedVM(null)}
              />
            </div>
          </>
        )
      }
    />
    </div>
  );
}

export default function VMsPage() {
  return (
    <Suspense>
      <VMsContent />
    </Suspense>
  );
}
