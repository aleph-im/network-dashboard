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
  const sortDirection = orderParam === "asc" ? "asc" : "desc";
  const initialSort =
    sortParam === "vms"
      ? { field: "vms" as const, direction: sortDirection as "asc" | "desc" }
      : undefined;

  const queryParam = searchParams.get("q") ?? "";

  const selectedParam = searchParams.get("selected");
  const [selectedNode, setSelectedNode] = useState<string | null>(
    selectedParam,
  );

  if (viewHash) {
    return <NodeDetailView hash={viewHash} />;
  }

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0">
        <NodeTable
          onSelectNode={setSelectedNode}
          {...(initialStatus ? { initialStatus } : {})}
          initialHasVms={hasVms}
          {...(initialSort ? { initialSort } : {})}
          initialQuery={queryParam}
          {...(selectedNode ? { selectedKey: selectedNode } : {})}
          compact={!!selectedNode}
        />
      </div>
      {selectedNode && (
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
      )}
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
