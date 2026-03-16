"use client";

import Link from "next/link";
import { Button } from "@aleph-front/ds/button";
import { Card } from "@aleph-front/ds/card";
import { StatusDot } from "@aleph-front/ds/status-dot";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { CardHeader } from "@/components/card-header";
import { useNodes } from "@/hooks/use-nodes";
import { truncateHash } from "@/lib/format";
import { nodeStatusToDot } from "@/lib/status-map";

const MAX_ROWS = 15;

function barColor(status: string): string {
  if (status === "healthy") return "var(--color-success-500)";
  if (status === "unreachable") return "var(--color-error-500)";
  return "var(--color-muted-foreground)";
}

export function TopNodesCard() {
  const { data: nodes, isLoading } = useNodes();

  if (isLoading) {
    return (
      <Card padding="lg" className="flex-1">
        <CardHeader
          title="Top Nodes"
          info="Nodes ranked by number of VMs currently assigned"
        />
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
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
      <Card padding="lg" className="flex-1">
        <CardHeader
          title="Top Nodes"
          info="Nodes ranked by number of VMs currently assigned"
        />
        <p className="text-sm text-muted-foreground">
          No nodes with VMs found.
        </p>
      </Card>
    );
  }

  const maxCount = topNodes[0]?.vmCount ?? 1;

  return (
    <Card padding="lg" className="flex-1">
      <CardHeader
        title="Top Nodes"
        info="Nodes ranked by number of VMs currently assigned"
      />

      <ol className="grid grid-cols-[auto_auto_1fr] gap-x-3">
        {topNodes.map((node, i) => {
          const pct = (node.vmCount / maxCount) * 100;
          return (
            <li key={node.hash} className="contents">
              <Link
                href={`/nodes?selected=${node.hash}`}
                className="col-span-full grid min-h-12 grid-cols-subgrid items-center rounded-md border-b border-foreground/[0.06] px-2 py-1.5 transition-colors last:border-b-0 hover:bg-muted"
                style={{
                  transitionDuration: "var(--duration-fast)",
                }}
              >
                <span className="text-right text-xs tabular-nums text-muted-foreground">
                  {i + 1}
                </span>

                <StatusDot
                  status={nodeStatusToDot(node.status)}
                  size="sm"
                />

                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs">
                      {node.name ?? truncateHash(node.hash)}
                    </span>
                    <span className="shrink-0 text-xs font-medium tabular-nums">
                      {node.vmCount}
                    </span>
                  </div>

                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: barColor(node.status),
                        transitionDuration: "var(--duration-normal)",
                      }}
                    />
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>

      <div className="mt-6 pt-3">
        <Button variant="text" size="xs" asChild>
          <Link href="/nodes?hasVms=true&sort=vms&order=desc">
            View all nodes with VMs &rarr;
          </Link>
        </Button>
      </div>
    </Card>
  );
}
