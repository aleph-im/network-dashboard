"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Card } from "@aleph-front/ds/card";
import { Badge } from "@aleph-front/ds/badge";
import { StatusDot } from "@aleph-front/ds/status-dot";
import { Tabs, TabsList, TabsTrigger } from "@aleph-front/ds/tabs";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import type { CCNInfo } from "@/api/credit-types";
import { NodeEarningsTabCcn } from "@/components/node-earnings-tab-ccn";
import {
  CCN_ACTIVATION_THRESHOLD,
  CCN_OWNER_BALANCE_THRESHOLD,
  isBelowActivation,
} from "@/lib/network-graph-model";

type DetailTab = "overview" | "earnings";

type Props = {
  hash: string;
  ccn: CCNInfo;
  ownerBalance: number | null;
  initialTab?: DetailTab;
};

const ALEPH_FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function ccnDotStatus(
  ccn: CCNInfo,
  ownerBalance: number | null,
): "healthy" | "degraded" | "offline" {
  if (ccn.inactiveSince != null) return "offline";
  if (isBelowActivation(ccn.totalStaked, ownerBalance)) return "degraded";
  if (ccn.status === "active") return "healthy";
  return "degraded";
}

function ccnBadgeVariant(
  ccn: CCNInfo,
  ownerBalance: number | null,
): "success" | "warning" | "default" {
  if (ccn.inactiveSince != null) return "default";
  if (isBelowActivation(ccn.totalStaked, ownerBalance)) return "warning";
  if (ccn.status === "active") return "success";
  return "warning";
}

export function NodeDetailViewCcn({
  hash,
  ccn,
  ownerBalance,
  initialTab,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<DetailTab>(initialTab ?? "overview");

  const handleTabChange = (next: string) => {
    if (next !== "overview" && next !== "earnings") return;
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    router.replace(
      params.toString() ? `${pathname}?${params.toString()}` : pathname,
    );
  };

  const linkedCrnCount = ccn.resourceNodes.length;
  const stakerEntries = Object.entries(ccn.stakers).sort(
    (a, b) => b[1] - a[1],
  );
  const belowActivation =
    ccn.inactiveSince == null &&
    isBelowActivation(ccn.totalStaked, ownerBalance);
  const ownerLocked =
    belowActivation &&
    ownerBalance != null &&
    ownerBalance < CCN_OWNER_BALANCE_THRESHOLD;
  const pending =
    belowActivation && !ownerLocked && ccn.resourceNodes.length === 0;
  const understaked = belowActivation && !ownerLocked && !pending;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Nodes
        </button>
      </div>
      <div className="flex items-center gap-3">
        <StatusDot status={ccnDotStatus(ccn, ownerBalance)} />
        {ccn.name ? (
          <h2 className="text-xl font-bold">{ccn.name}</h2>
        ) : (
          <CopyableText text={hash} startChars={8} endChars={8} size="md" />
        )}
        <Badge
          fill="outline"
          variant={ccnBadgeVariant(ccn, ownerBalance)}
          size="sm"
        >
          {ccn.status}
        </Badge>
        <Badge fill="outline" variant="default" size="sm">
          CCN
        </Badge>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList variant="underline" size="sm">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="earnings">Earnings</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "overview" ? (
        <>
          <Card padding="md">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Details
            </h3>
            <dl className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-4 py-1">
                <dt className="text-muted-foreground shrink-0">Hash</dt>
                <dd className="min-w-0 truncate text-right font-mono text-xs">
                  {hash}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-1">
                <dt className="text-muted-foreground shrink-0">Score</dt>
                <dd className="min-w-0 truncate text-right font-mono text-xs">
                  {(ccn.score * 100).toFixed(1)}%
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-1">
                <dt className="text-muted-foreground shrink-0">Owner</dt>
                <dd className="min-w-0 text-right">
                  <CopyableText
                    text={ccn.owner}
                    startChars={8}
                    endChars={8}
                    size="sm"
                    href={`/wallet?address=${ccn.owner}`}
                  />
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-1">
                <dt className="text-muted-foreground shrink-0">Reward</dt>
                <dd className="min-w-0 text-right">
                  <CopyableText
                    text={ccn.reward}
                    startChars={8}
                    endChars={8}
                    size="sm"
                    href={`/wallet?address=${ccn.reward}`}
                  />
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-1">
                <dt className="text-muted-foreground shrink-0">Total staked</dt>
                <dd className="min-w-0 truncate text-right font-mono text-xs">
                  {ALEPH_FMT.format(ccn.totalStaked)} ALEPH
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-1">
                <dt className="text-muted-foreground shrink-0">CRNs attached</dt>
                <dd className="min-w-0 truncate text-right tabular-nums">
                  {linkedCrnCount}
                </dd>
              </div>
            </dl>

            {ownerLocked && (
              <p className="mt-3 text-xs italic text-muted-foreground">
                Owner must hold{" "}
                {ALEPH_FMT.format(CCN_OWNER_BALANCE_THRESHOLD)} ALEPH before
                others can stake on this node.
              </p>
            )}
            {pending && (
              <p className="mt-3 text-xs italic text-muted-foreground">
                Registered but has no attached CRNs yet.
              </p>
            )}
            {understaked && (
              <p className="mt-3 text-xs italic text-muted-foreground">
                Not yet active — activation needs{" "}
                {ALEPH_FMT.format(CCN_ACTIVATION_THRESHOLD)} ALEPH total staked.
              </p>
            )}
          </Card>

          {ccn.resourceNodes.length > 0 && (
            <Card padding="md">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Linked CRNs ({ccn.resourceNodes.length})
              </h3>
              <ul className="space-y-1.5">
                {ccn.resourceNodes.map((crnHash) => (
                  <li key={crnHash} className="text-sm">
                    <CopyableText
                      text={crnHash}
                      startChars={8}
                      endChars={8}
                      size="sm"
                      href={`/nodes?view=${crnHash}`}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {stakerEntries.length > 0 && (
            <Card padding="md">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Stakers ({stakerEntries.length})
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-edge text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Address</th>
                    <th className="pb-2 font-medium text-right">ALEPH staked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {stakerEntries.map(([addr, amount]) => (
                    <tr key={addr}>
                      <td className="py-1.5 pr-4">
                        <CopyableText
                          text={addr}
                          startChars={8}
                          endChars={8}
                          size="sm"
                          href={`/wallet?address=${addr}`}
                        />
                      </td>
                      <td className="py-1.5 text-right font-mono tabular-nums">
                        {ALEPH_FMT.format(amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      ) : (
        <NodeEarningsTabCcn hash={hash} />
      )}
    </div>
  );
}
