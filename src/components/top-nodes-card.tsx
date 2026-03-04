"use client";

import Link from "next/link";
import { Button } from "@aleph-front/ds/button";
import { Card } from "@aleph-front/ds/card";
import { StatusDot } from "@aleph-front/ds/status-dot";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@aleph-front/ds/tooltip";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { useNodes } from "@/hooks/use-nodes";
import { truncateHash } from "@/lib/format";
import { nodeStatusToDot } from "@/lib/status-map";

const MAX_ROWS = 15;

export function TopNodesCard() {
  const { data: nodes, isLoading } = useNodes();

  if (isLoading) {
    return (
      <Card title="Top Nodes" padding="md" className="flex-1">
        <div className="space-y-1.5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  const topNodes = (nodes ?? [])
    .filter((n) => n.vmCount > 0)
    .sort((a, b) => b.vmCount - a.vmCount)
    .slice(0, MAX_ROWS);

  if (topNodes.length === 0) {
    return (
      <Card title="Top Nodes" padding="md" className="flex-1">
        <p className="text-sm text-muted-foreground">
          No nodes with VMs found.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Top Nodes" padding="md" className="flex-1">
      <TooltipProvider>
        <ul className="space-y-1">
          {topNodes.map((node) => (
            <li key={node.hash}>
              <Link
                href={`/nodes?selected=${node.hash}`}
                className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm transition-colors hover:bg-muted"
                style={{
                  transitionDuration: "var(--duration-fast)",
                }}
              >
                <StatusDot
                  status={nodeStatusToDot(node.status)}
                  size="sm"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">
                      {node.name ?? truncateHash(node.hash)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {node.hash}
                  </TooltipContent>
                </Tooltip>
                <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                  {node.vmCount} {node.vmCount === 1 ? "VM" : "VMs"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </TooltipProvider>

      <div className="mt-3 border-t border-border pt-3">
        <Button variant="text" size="xs" asChild>
          <Link href="/nodes?hasVms=true&sort=vms&order=desc">
            View all nodes with VMs &rarr;
          </Link>
        </Button>
      </div>
    </Card>
  );
}
