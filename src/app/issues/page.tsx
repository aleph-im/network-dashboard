"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useIssues } from "@/hooks/use-issues";
import { IssuesVMTable } from "@/components/issues-vm-table";
import { IssuesNodeTable } from "@/components/issues-node-table";
import type { DiscrepancyStatus } from "@/hooks/use-issues";

type Perspective = "vms" | "nodes";

function PerspectiveToggle({
  value,
  onChange,
}: {
  value: Perspective;
  onChange: (p: Perspective) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-white/[0.08] bg-white/[0.03] p-0.5">
      <button
        type="button"
        onClick={() => onChange("vms")}
        className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
          value === "vms"
            ? "bg-primary-600/15 text-primary-400"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        VMs
      </button>
      <button
        type="button"
        onClick={() => onChange("nodes")}
        className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
          value === "nodes"
            ? "bg-primary-600/15 text-primary-400"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Nodes
      </button>
    </div>
  );
}

const VALID_DISCREPANCY_STATUSES = new Set<string>([
  "orphaned",
  "missing",
  "unschedulable",
]);

function IssuesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const perspectiveParam = searchParams.get("perspective");
  const perspective: Perspective =
    perspectiveParam === "nodes" ? "nodes" : "vms";

  const statusParam = searchParams.get("status");
  const initialVmStatus =
    statusParam && VALID_DISCREPANCY_STATUSES.has(statusParam)
      ? (statusParam as DiscrepancyStatus)
      : undefined;

  const { issueVMs, issueNodes, isLoading } = useIssues();

  function handlePerspectiveChange(p: Perspective) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("perspective", p);
    params.delete("status");
    router.replace(`${pathname}?${params.toString()}`);
  }

  const toggle = (
    <PerspectiveToggle
      value={perspective}
      onChange={handlePerspectiveChange}
    />
  );

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl">Issues</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Scheduling discrepancies between plan and reality
        </p>
      </div>

      {perspective === "vms" ? (
        <IssuesVMTable
          issueVMs={issueVMs}
          isLoading={isLoading}
          leading={toggle}
          {...(initialVmStatus ? { initialStatus: initialVmStatus } : {})}
        />
      ) : (
        <IssuesNodeTable
          issueNodes={issueNodes}
          isLoading={isLoading}
          leading={toggle}
        />
      )}
    </div>
  );
}

export default function IssuesPage() {
  return (
    <Suspense>
      <IssuesContent />
    </Suspense>
  );
}
