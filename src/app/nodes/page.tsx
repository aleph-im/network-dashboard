"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { NodeTable } from "@/components/node-table";
import { NodeDetailPanel } from "@/components/node-detail-panel";
import { NodeDetailView } from "@/components/node-detail-view";
import type { NodeStatus } from "@/api/types";

const VALID_NODE_STATUSES = new Set<string>([
  "healthy",
  "unreachable",
  "unknown",
  "removed",
]);

function NodesContent() {
  const searchParams = useSearchParams();
  const viewHash = searchParams.get("view");

  const statusParam = searchParams.get("status");
  const initialStatus =
    statusParam && VALID_NODE_STATUSES.has(statusParam)
      ? (statusParam as NodeStatus)
      : undefined;

  const hasVms = searchParams.get("hasVms") === "true";

  const sortParam = searchParams.get("sort");
  const orderParam = searchParams.get("order");
  const sortDirection: "asc" | "desc" =
    orderParam === "asc" ? "asc" : "desc";
  const SORT_PARAM_TO_HEADER: Record<string, string> = {
    vms: "VMs",
    vcpus: "vCPUs",
    memory: "Memory",
  };
  const initialSortColumn = sortParam
    ? SORT_PARAM_TO_HEADER[sortParam]
    : undefined;
  const initialSort = initialSortColumn
    ? { column: initialSortColumn, direction: sortDirection }
    : undefined;

  const queryParam = searchParams.get("q") ?? "";

  const selectedParam = searchParams.get("selected");
  const [selectedNode, setSelectedNode] = useState<string | null>(
    selectedParam,
  );

  const tabParam = searchParams.get("tab");
  const initialTab: "overview" | "earnings" =
    tabParam === "earnings" ? "earnings" : "overview";

  if (viewHash) {
    return <NodeDetailView hash={viewHash} initialTab={initialTab} />;
  }

  return (
    <div>
      <div className="mb-10">
        <h1 className="text-4xl">Nodes</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Compute nodes registered with the Aleph Cloud scheduler
        </p>
      </div>
      <NodeTable
      onSelectNode={setSelectedNode}
      {...(initialStatus ? { initialStatus } : {})}
      initialHasVms={hasVms}
      {...(initialSort ? { initialSort } : {})}
      initialQuery={queryParam}
      {...(selectedNode ? { selectedKey: selectedNode } : {})}
      compact={!!selectedNode}
      sidePanel={
        selectedNode && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              onClick={() => setSelectedNode(null)}
              aria-hidden="true"
            />
            <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm overflow-y-auto bg-surface p-4 shadow-lg lg:static lg:z-auto lg:w-auto lg:max-w-none lg:overflow-visible lg:bg-transparent lg:p-0 lg:shadow-none">
              <NodeDetailPanel
                hash={selectedNode}
                onClose={() => setSelectedNode(null)}
              />
            </div>
          </>
        )
      }
    />
    </div>
  );
}

export default function NodesPage() {
  return (
    <Suspense>
      <NodesContent />
    </Suspense>
  );
}
