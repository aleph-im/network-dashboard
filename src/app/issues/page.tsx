"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@aleph-front/ds/tabs";
import { usePageHeader } from "@aleph-front/ds/page-header";
import { Button } from "@aleph-front/ds/button";
import { ArrowClockwise } from "@phosphor-icons/react/dist/ssr";
import { useIssues } from "@/hooks/use-issues";
import { IssuesVMTable } from "@/components/issues-vm-table";
import { IssuesNodeTable } from "@/components/issues-node-table";
import type { DiscrepancyStatus } from "@/hooks/use-issues";

type Perspective = "vms" | "nodes";

const VALID_DISCREPANCY_STATUSES = new Set<string>([
  "orphaned",
  "missing",
  "unschedulable",
  "duplicated",
  "misplaced",
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

  const { issueVMs, issueNodes, isLoading, isFetching, refetch } = useIssues();

  usePageHeader({
    title: "Issues",
    actions: (
      <Button
        variant="text"
        size="xs"
        iconLeft={<ArrowClockwise />}
        onClick={() => { void refetch(); }}
        disabled={isFetching}
      >
        {isFetching ? "Refreshing…" : "Refresh"}
      </Button>
    ),
  });

  function handlePerspectiveChange(p: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("perspective", p);
    params.delete("status");
    router.replace(`${pathname}?${params.toString()}`);
  }

  const toggle = (
    <Tabs value={perspective} onValueChange={handlePerspectiveChange}>
      <TabsList variant="pill" size="sm">
        <TabsTrigger value="vms">VMs</TabsTrigger>
        <TabsTrigger value="nodes">Nodes</TabsTrigger>
      </TabsList>
    </Tabs>
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
