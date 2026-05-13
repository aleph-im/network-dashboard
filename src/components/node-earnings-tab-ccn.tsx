"use client";

import { useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Card } from "@aleph-front/ds/card";
import { Tabs, TabsList, TabsTrigger } from "@aleph-front/ds/tabs";
import { Badge } from "@aleph-front/ds/badge";
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

// Mirrors the activation gate: linkedCRNPenalty rises with linked count.
function linkedCrnPenaltyPct(linkedCount: number): number {
  if (linkedCount >= 3) return 100;
  return 70 + linkedCount * 10;
}

function buildCcnCards(
  data: NodeEarnings,
  range: CreditRange,
  score: number,
  status: string,
  updatedAt: string | undefined,
  linkedCount: number,
  rangeLoading: boolean,
): KpiCard[] {
  const dAleph = data.delta.aleph;
  return [
    {
      label: `ALEPH accrued (${range})`,
      primary: formatAleph(data.totalAleph),
      secondary: `${deltaArrow(dAleph)} ${formatAleph(Math.abs(dAleph))} vs prev ${range}`,
      tone: dAleph > 0 ? "up" : dAleph < 0 ? "down" : "default",
      loading: rangeLoading,
    },
    {
      label: "Score",
      primary: score.toFixed(2),
      secondary: "vs 0.8 threshold",
      tone: score < 0.8 ? "warning" : "default",
    },
    {
      label: "Linked CRNs",
      primary: String(linkedCount),
      secondary: `linkedCRNPenalty: ${linkedCrnPenaltyPct(linkedCount)}%`,
      tone: linkedCount < 3 ? "warning" : "default",
    },
    {
      label: "Status",
      primary: status,
      secondary: updatedAt ? `updated ${relativeTime(updatedAt)}` : "—",
    },
  ];
}

export function NodeEarningsTabCcn({ hash }: { hash: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rangeParam = searchParams.get("earningsRange") as CreditRange | null;
  const [range, setRange] = useState<CreditRange>(
    rangeParam && RANGE_VALUES.includes(rangeParam) ? rangeParam : "24h",
  );

  const handleRangeChange = (next: string) => {
    if (!RANGE_VALUES.includes(next as CreditRange)) return;
    setRange(next as CreditRange);
    const params = new URLSearchParams(searchParams.toString());
    params.set("earningsRange", next);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const { data, isLoading, isPlaceholderData } = useNodeEarnings(hash, range);
  const { data: nodeState } = useNodeState();
  const { data: node } = useNode(hash);

  const ccn = nodeState?.ccns.get(hash);

  if (isLoading || !data || !ccn) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const linkedCount = data.linkedCrns?.length ?? 0;
  const cards = buildCcnCards(
    data,
    range,
    ccn.score,
    node?.status ?? ccn.status,
    node?.updatedAt,
    linkedCount,
    isPlaceholderData,
  );

  const chartProps =
    ccn.status !== "active"
      ? {
          emptyHint:
            "Earnings start once the node activates (score ≥ 0.2 and stake ≥ 500k ALEPH).",
        }
      : linkedCount === 0
        ? { emptyHint: "Registered but has no attached CRNs yet." }
        : {};

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
          secondaryLabel="Linked CRNs"
          loading={isPlaceholderData}
          {...chartProps}
        />
      </Card>

      <NodeEarningsReconciliation
        reconciliation={data.reconciliation}
        range={range}
        kind="ccn"
        loading={isPlaceholderData}
      />

      {data.linkedCrns && data.linkedCrns.length > 0 && (
        <Card padding="md">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Linked CRNs
          </div>
          <p className="mb-3 text-xs italic text-muted-foreground">
            Linked CRNs contribute to your linkedCRNPenalty factor but their VM
            earnings accrue to themselves, not to this CCN.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">CRN</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">VMs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {data.linkedCrns.map((c) => (
                <tr key={c.hash}>
                  <td className="py-1.5 pr-4">
                    <CopyableText
                      text={c.hash}
                      startChars={8}
                      endChars={8}
                      size="sm"
                      href={`/nodes?view=${c.hash}`}
                    />
                    {c.name && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {c.name}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-4">
                    <Badge fill="outline" size="sm">
                      {c.status}
                    </Badge>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {c.vmCount}
                  </td>
                </tr>
              ))}
            </tbody>
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
