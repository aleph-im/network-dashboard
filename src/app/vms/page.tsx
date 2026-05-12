"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { VMTable } from "@/components/vm-table";
import { VMDetailPanel } from "@/components/vm-detail-panel";
import { VMDetailView } from "@/components/vm-detail-view";
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
  const searchParams = useSearchParams();
  const viewHash = searchParams.get("view");

  const statusParam = searchParams.get("status");
  const initialStatus =
    statusParam && VALID_VM_STATUSES.has(statusParam)
      ? (statusParam as VmStatus)
      : undefined;

  const queryParam = searchParams.get("q") ?? "";
  const showInactiveParam = searchParams.get("showInactive") === "true";
  const ownerParam = searchParams.get("owner") ?? "";

  const selectedParam = searchParams.get("selected");
  const [selectedVM, setSelectedVM] = useState<string | null>(selectedParam);

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
      onSelectVM={setSelectedVM}
      {...(initialStatus ? { initialStatus } : {})}
      initialQuery={queryParam}
      initialOwner={ownerParam}
      {...(showInactiveParam ? { initialShowInactive: true } : {})}
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
