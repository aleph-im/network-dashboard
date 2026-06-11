"use client";

import { useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Badge } from "@aleph-front/ds/badge";
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
import { useVMMessageInfo } from "@/hooks/use-vm-creation-times";
import {
  NodeEarningsKpiRow,
  type KpiCard,
} from "@/components/node-earnings-kpi-row";
import { NodeEarningsChart } from "@/components/node-earnings-chart";
import { NodeEarningsReconciliation } from "@/components/node-earnings-reconciliation";
import { MobileTableCardRow } from "@/components/mobile-table-card-row";
import { RewardSourceBar } from "@/components/reward-source-bar";
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
  rangeLoading: boolean,
  vms: { earning: number | null; earningLoading: boolean },
): KpiCard[] {
  const dAleph = data.delta.aleph;
  // The earning count comes from the execution-expense slice, which is only
  // fetched up to 7d (a 30d window is ~250MB) — at 30d the count is omitted
  // rather than mislabeled.
  const tooHeavy = range === "30d";

  return [
    {
      label: `ALEPH accrued (${range})`,
      primary: formatAleph(data.totalAleph),
      secondary: `${deltaArrow(dAleph)} ${formatAleph(Math.abs(dAleph))} vs prev ${range}`,
      tone: dAleph > 0 ? "up" : dAleph < 0 ? "down" : "default",
      loading: rangeLoading,
      extra: <RewardSourceBar bySource={data.bySource} />,
    },
    {
      label: `VMs earning (${range})`,
      primary: tooHeavy || vms.earning === null ? "—" : String(vms.earning),
      secondary: "",
      loading: !tooHeavy && (rangeLoading || vms.earningLoading),
      ...(tooHeavy
        ? {
            extra: (
              <p className="mt-1 text-[11px] italic text-muted-foreground">
                30d VM count is too heavy to load (~250 MB)
              </p>
            ),
          }
        : {}),
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

  const { data, isLoading, isPlaceholderData, isError, isPerVmLoading, isPerVmError } =
    useNodeEarnings(hash, range);
  const { data: nodeState } = useNodeState();
  const { data: node } = useNode(hash);
  const { data: vmMessageInfo } = useVMMessageInfo(
    data?.perVm?.map((v) => v.vmHash) ?? [],
  );

  const crn = nodeState?.crns.get(hash);

  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        Rewards feed unreachable — earnings can&apos;t be shown right now.
      </p>
    );
  }

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
    isPlaceholderData,
    {
      // Count of VMs with billable execution in the window = the table below.
      earning: isPerVmError ? null : (data.perVm?.length ?? null),
      earningLoading: !isPerVmError && data.perVm === undefined,
    },
  );

  const perVm = data.perVm ?? [];
  const TOP_N = 5;
  const rest = perVm.slice(TOP_N);
  const restAleph = rest.reduce((s, v) => s + v.aleph, 0);
  const visibleVms = expandedBreakdown ? perVm : perVm.slice(0, TOP_N);
  // Execution-only table; data.totalAleph also includes the wage subsidy.
  const perVmTotal = perVm.reduce((s, v) => s + v.aleph, 0);

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
          secondaryLabel="VMs scheduled"
          loading={isPlaceholderData}
          {...(crn.parent === null
            ? {
                emptyHint:
                  "Pending CCN attachment — earnings start once linked.",
              }
            : {})}
        />
        {!data.weightsExact && isPerVmLoading && (
          <p className="mt-1 text-[11px] italic text-muted-foreground">
            Refining node split from execution data…
          </p>
        )}
      </Card>

      <NodeEarningsReconciliation
        reconciliation={data.reconciliation}
        range={range}
        kind="crn"
        loading={isPlaceholderData}
      />

      {isPerVmLoading ? (
        <Card padding="md">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Hosted VMs — earnings breakdown
          </div>
          <div className="space-y-2">
            <Skeleton className="h-5 w-full bg-edge" />
            <Skeleton className="h-5 w-full bg-edge" />
            <Skeleton className="h-5 w-2/3 bg-edge" />
          </div>
        </Card>
      ) : isPerVmError ? (
        <Card padding="md">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Hosted VMs — earnings breakdown
          </div>
          <p className="text-xs italic text-muted-foreground">
            Per-VM detail unavailable — the execution-expense feed timed out.
            The headline numbers above are unaffected.
          </p>
        </Card>
      ) : perVm.length > 0 ? (
        <Card padding="md">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Hosted VMs — earnings breakdown
          </div>
          {range === "30d" && (
            <p className="mb-2 text-xs italic text-muted-foreground">
              Per-VM detail covers the last 7 days.
            </p>
          )}
          <div className="space-y-3 md:hidden">
            {visibleVms.map((v) => {
              const vmName = vmMessageInfo?.get(v.vmHash)?.name;
              return (
              <MobileTableCardRow
                key={v.vmHash}
                href={`/vms?view=${v.vmHash}`}
                primary={
                  <div className="flex min-w-0 items-center gap-2">
                    <CopyableText
                      text={v.vmHash}
                      startChars={8}
                      endChars={8}
                      size="sm"
                    />
                    {vmName && (
                      <span className="truncate text-xs text-muted-foreground">
                        {vmName}
                      </span>
                    )}
                  </div>
                }
                fields={[
                  {
                    label: "Payment",
                    value: (
                      <Badge
                        fill="outline"
                        variant={v.source === "hold" ? "info" : "default"}
                        size="sm"
                      >
                        {v.source === "hold" ? "Hold" : "Credits"}
                      </Badge>
                    ),
                  },
                  {
                    label: "ALEPH",
                    value: isPlaceholderData ? (
                      <Skeleton className="h-4 w-16 bg-edge" />
                    ) : (
                      <span className="font-mono tabular-nums">
                        {formatAleph(v.aleph)}
                      </span>
                    ),
                  },
                ]}
              />
              );
            })}
            {!isPlaceholderData && rest.length > 0 && (
              <button
                type="button"
                onClick={() => setExpandedBreakdown((v) => !v)}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {expandedBreakdown ? "Show less" : `+ ${rest.length} more (${formatAleph(restAleph)})`}
              </button>
            )}
            <div className="flex items-center justify-between border-t border-edge pt-2 text-sm font-medium">
              <span className="text-xs text-muted-foreground">Total</span>
              {isPlaceholderData ? (
                <Skeleton className="h-4 w-20 bg-edge" />
              ) : (
                <span className="font-mono tabular-nums">
                  {formatAleph(perVmTotal)}
                </span>
              )}
            </div>
          </div>
          <table className="hidden w-full text-sm md:table">
            <thead>
              <tr className="border-b border-edge text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">VM</th>
                <th className="pb-2 pr-4 font-medium">Payment</th>
                <th className="pb-2 font-medium text-right">ALEPH</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {visibleVms.map((v) => {
                const vmName = vmMessageInfo?.get(v.vmHash)?.name;
                return (
                <tr key={v.vmHash}>
                  <td className="py-1.5 pr-4">
                    <div className="flex min-w-0 items-center gap-2">
                      <CopyableText
                        text={v.vmHash}
                        startChars={8}
                        endChars={8}
                        size="sm"
                        href={`/vms?view=${v.vmHash}`}
                      />
                      {vmName && (
                        <span className="truncate text-xs text-muted-foreground">
                          {vmName}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 pr-4">
                    <Badge
                      fill="outline"
                      variant={v.source === "hold" ? "info" : "default"}
                      size="sm"
                    >
                      {v.source === "hold" ? "Hold" : "Credits"}
                    </Badge>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {isPlaceholderData ? (
                      <Skeleton className="ml-auto h-4 w-16 bg-edge" />
                    ) : (
                      formatAleph(v.aleph)
                    )}
                  </td>
                </tr>
                );
              })}
              {!isPlaceholderData && rest.length > 0 && (
                <tr>
                  <td colSpan={expandedBreakdown ? 3 : 2} className="py-1.5 pr-4">
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
                <td colSpan={2} className="pt-2 text-xs text-muted-foreground">
                  Total
                </td>
                <td className="pt-2 text-right tabular-nums">
                  {isPlaceholderData ? (
                    <Skeleton className="ml-auto h-4 w-20 bg-edge" />
                  ) : (
                    formatAleph(perVmTotal)
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </Card>
      ) : null}

      <p className="text-xs italic text-muted-foreground">
        Owed amounts accrued from the protocol&apos;s authoritative rewards
        feed, including the wage subsidy (which decays over time). Per-node
        figures for reward addresses with multiple nodes are apportioned.
      </p>
    </div>
  );
}
