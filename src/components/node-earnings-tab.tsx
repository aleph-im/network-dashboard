"use client";

import { useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Card } from "@aleph-front/ds/card";
import { Tabs, TabsList, TabsTrigger } from "@aleph-front/ds/tabs";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import {
  useNodeEarnings,
  type NodeEarnings,
} from "@/hooks/use-node-earnings";
import { useNodeState } from "@/hooks/use-node-state";
import { useNode } from "@/hooks/use-nodes";
import {
  NodeEarningsKpiRow,
  type KpiCard,
} from "@/components/node-earnings-kpi-row";
import { NodeEarningsChart } from "@/components/node-earnings-chart";
import { NodeEarningsReconciliation } from "@/components/node-earnings-reconciliation";
import { formatAleph, relativeTime } from "@/lib/format";
import type { CreditRange } from "@/hooks/use-credit-expenses";

const RANGE_VALUES: CreditRange[] = ["24h", "7d", "30d"];

function deltaArrow(delta: number): string {
  if (delta > 0.0001) return "▲";
  if (delta < -0.0001) return "▼";
  return "·";
}

function buildCrnCards(
  data: NodeEarnings,
  range: CreditRange,
  score: number,
  status: string,
  updatedAt: string | undefined,
): KpiCard[] {
  const dAleph = data.delta.aleph;
  const dCount = data.delta.secondaryCount;
  const avgVms =
    data.buckets.length === 0
      ? 0
      : data.buckets.reduce((s, b) => s + b.secondaryCount, 0) /
        data.buckets.length;

  return [
    {
      label: `ALEPH accrued (${range})`,
      primary: formatAleph(data.totalAleph),
      secondary: `${deltaArrow(dAleph)} ${formatAleph(Math.abs(dAleph))} vs prev ${range}`,
      tone: dAleph > 0 ? "up" : dAleph < 0 ? "down" : "default",
    },
    {
      label: "VMs hosted (avg)",
      primary: avgVms.toFixed(1),
      secondary: `${deltaArrow(dCount)} ${Math.abs(dCount).toFixed(1)} vs prev ${range}`,
      tone: dCount > 0 ? "up" : dCount < 0 ? "down" : "default",
    },
    {
      label: "Score",
      primary: score.toFixed(2),
      secondary: "vs 0.8 threshold",
      tone: score < 0.8 ? "warning" : "default",
    },
    {
      label: "Status",
      primary: status,
      secondary: updatedAt ? `updated ${relativeTime(updatedAt)}` : "—",
    },
  ];
}

export function NodeEarningsTab({ hash }: { hash: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rangeParam = searchParams.get("earningsRange") as CreditRange | null;
  const [range, setRange] = useState<CreditRange>(
    rangeParam && RANGE_VALUES.includes(rangeParam) ? rangeParam : "24h",
  );
  const [expandedBreakdown, setExpandedBreakdown] = useState(false);

  const handleRangeChange = (next: string) => {
    if (!RANGE_VALUES.includes(next as CreditRange)) return;
    setRange(next as CreditRange);
    const params = new URLSearchParams(searchParams.toString());
    params.set("earningsRange", next);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const { data, isLoading } = useNodeEarnings(hash, range);
  const { data: nodeState } = useNodeState();
  const { data: node } = useNode(hash);

  const crn = nodeState?.crns.get(hash);

  if (isLoading || !data || !crn) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const cards = buildCrnCards(
    data,
    range,
    crn.score,
    node?.status ?? crn.status,
    node?.updatedAt,
  );

  const perVm = data.perVm ?? [];
  const TOP_N = 5;
  const rest = perVm.slice(TOP_N);
  const restAleph = rest.reduce((s, v) => s + v.aleph, 0);
  const visibleVms = expandedBreakdown ? perVm : perVm.slice(0, TOP_N);

  return (
    <div className="space-y-4">
      <Tabs value={range} onValueChange={handleRangeChange}>
        <TabsList variant="pill" size="sm">
          {RANGE_VALUES.map((r) => (
            <TabsTrigger key={r} value={r}>
              {r}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <NodeEarningsKpiRow cards={cards} />

      <Card padding="md">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          ALEPH accrual over time
        </div>
        <NodeEarningsChart
          buckets={data.buckets}
          primaryLabel="ALEPH"
          secondaryLabel="VMs hosted"
          {...(crn.parent === null
            ? {
                emptyHint:
                  "Pending CCN attachment — earnings start once linked.",
              }
            : {})}
        />
      </Card>

      <NodeEarningsReconciliation
        reconciliation={data.reconciliation}
        range={range}
        kind="crn"
      />

      {perVm.length > 0 && (
        <Card padding="md">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Hosted VMs — earnings breakdown
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">VM</th>
                <th className="pb-2 font-medium text-right">ALEPH</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {visibleVms.map((v) => (
                <tr key={v.vmHash}>
                  <td className="py-1.5 pr-4">
                    <CopyableText
                      text={v.vmHash}
                      startChars={8}
                      endChars={8}
                      size="sm"
                      href={`/vms?view=${v.vmHash}`}
                    />
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatAleph(v.aleph)}
                  </td>
                </tr>
              ))}
              {rest.length > 0 && (
                <tr>
                  <td colSpan={expandedBreakdown ? 2 : 1} className="py-1.5 pr-4">
                    <button
                      type="button"
                      onClick={() => setExpandedBreakdown((v) => !v)}
                      className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {expandedBreakdown ? "Show less" : `+ ${rest.length} more`}
                    </button>
                  </td>
                  {!expandedBreakdown && (
                    <td className="py-1.5 text-right text-xs text-muted-foreground tabular-nums">
                      {formatAleph(restAleph)}
                    </td>
                  )}
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-edge font-medium">
                <td className="pt-2 text-xs text-muted-foreground">Total</td>
                <td className="pt-2 text-right tabular-nums">
                  {formatAleph(data.totalAleph)}
                </td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}

      <p className="text-xs italic text-muted-foreground">
        Accrued earnings from the credit-expense feed using the protocol&apos;s
        distribution split. Numbers reflect what this node earned, not yet paid
        on-chain.
      </p>
    </div>
  );
}
