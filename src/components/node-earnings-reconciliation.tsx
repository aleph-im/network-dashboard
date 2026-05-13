"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@aleph-front/ds/card";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { formatAleph } from "@/lib/format";
import type { Reconciliation } from "@/hooks/use-node-earnings";
import type { CreditRange } from "@/hooks/use-credit-expenses";

type Props = {
  reconciliation: Reconciliation | null;
  range: CreditRange;
  kind: "crn" | "ccn";
  loading?: boolean;
};

function CardHeader({ walletHref }: { walletHref: string | null }) {
  return (
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Reward address breakdown
      </div>
      {walletHref && (
        <Link
          href={walletHref}
          className="text-xs text-primary-500 transition-colors hover:text-primary-300 dark:text-primary-300"
        >
          View full wallet →
        </Link>
      )}
    </div>
  );
}

type SegmentKey = "this" | "other" | "cross" | "staker";

type Segment = {
  key: SegmentKey;
  label: string;
  aleph: number;
  colorClass: string;
  swatchClass: string;
};

const RANGE_LABEL: Record<CreditRange, string> = {
  "24h": "last 24h",
  "7d": "last 7d",
  "30d": "last 30d",
};

function buildSegments(r: Reconciliation, kind: "crn" | "ccn"): Segment[] {
  const thisColor =
    kind === "crn"
      ? "bg-[color:var(--color-success-500)]"
      : "bg-[color:var(--color-primary-500)]";
  const sameKindColor =
    kind === "crn"
      ? "bg-[color:var(--color-success-500)]/45"
      : "bg-[color:var(--color-primary-500)]/45";
  const crossKindColor =
    kind === "crn"
      ? "bg-[color:var(--color-primary-500)]"
      : "bg-[color:var(--color-success-500)]";

  return [
    {
      key: "this",
      label: "This node",
      aleph: r.thisNode,
      colorClass: thisColor,
      swatchClass: thisColor,
    },
    {
      key: "other",
      label:
        kind === "crn"
          ? `Other CRNs (${r.otherSameKind.count})`
          : `Other CCNs (${r.otherSameKind.count})`,
      aleph: r.otherSameKind.aleph,
      colorClass: sameKindColor,
      swatchClass: sameKindColor,
    },
    {
      key: "cross",
      label: kind === "crn" ? "CCN ops" : "CRN ops",
      aleph: r.crossKind.aleph,
      colorClass: crossKindColor,
      swatchClass: crossKindColor,
    },
    {
      key: "staker",
      label: "Staking",
      aleph: r.staker,
      colorClass: "bg-[color:var(--color-warning-500)]",
      swatchClass: "bg-[color:var(--color-warning-500)]",
    },
  ];
}

export function NodeEarningsReconciliation({
  reconciliation,
  range,
  kind,
  loading = false,
}: Props) {
  const [hoveredKey, setHoveredKey] = useState<SegmentKey | null>(null);

  if (!reconciliation) return null;

  const r = reconciliation;
  const hasOverlap =
    r.otherSameKind.aleph + r.crossKind.aleph + r.staker > 0;
  const rangeLabel = RANGE_LABEL[range];
  const walletHref = `/wallet?address=${r.rewardAddr}`;
  const segments = buildSegments(r, kind);

  if (loading) {
    return (
      <Card padding="md" className="@container/recon">
        <CardHeader walletHref={walletHref} />
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <CopyableText
            text={r.rewardAddr}
            startChars={6}
            endChars={4}
            size="sm"
          />
          <span>·</span>
          <Skeleton className="h-3 w-44 bg-foreground/10" />
        </div>
        <Skeleton className="mb-3 h-7 w-full rounded-md bg-foreground/10" />
        <div className="grid grid-cols-1 gap-x-4 gap-y-2 @md/recon:grid-cols-2 @2xl/recon:grid-cols-4">
          {segments.map((seg) => (
            <div key={seg.key} className="flex items-start gap-2">
              <span
                className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${seg.swatchClass}`}
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="truncate text-xs text-muted-foreground">
                  {seg.label}
                </div>
                <Skeleton className="h-3 w-20 bg-foreground/10" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card padding="md" className="@container/recon">
      <CardHeader walletHref={walletHref} />

      {hasOverlap ? (
        <div onMouseLeave={() => setHoveredKey(null)}>
          <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <CopyableText
              text={r.rewardAddr}
              startChars={6}
              endChars={4}
              size="sm"
            />
            <span>·</span>
            <span className="tabular-nums">
              {formatAleph(r.windowAleph)} ALEPH earned in {range}
            </span>
          </div>

          <div
            data-testid="reconciliation-bar"
            className="mb-3 flex h-7 overflow-hidden rounded-md"
          >
            {segments.map((seg) => {
              if (seg.aleph <= 0) return null;
              const widthPct = (seg.aleph / r.windowAleph) * 100;
              const dimmed = hoveredKey !== null && hoveredKey !== seg.key;
              return (
                <div
                  key={seg.key}
                  className={`${seg.colorClass} transition-opacity ${dimmed ? "opacity-30" : ""}`}
                  style={{ flexGrow: widthPct, minWidth: "4px" }}
                  aria-label={`${seg.label}: ${formatAleph(seg.aleph)} ALEPH`}
                  onMouseEnter={() => setHoveredKey(seg.key)}
                />
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-x-4 gap-y-2 @md/recon:grid-cols-2 @2xl/recon:grid-cols-4">
            {segments.map((seg) => {
              const pct =
                r.windowAleph > 0 ? (seg.aleph / r.windowAleph) * 100 : 0;
              const dimmed = hoveredKey !== null && hoveredKey !== seg.key;
              return (
                <div
                  key={seg.key}
                  className={`flex items-start gap-2 transition-opacity ${dimmed ? "opacity-30" : ""}`}
                  onMouseEnter={() => setHoveredKey(seg.key)}
                >
                  <span
                    className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${seg.swatchClass}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs text-muted-foreground">
                      {seg.label}
                    </div>
                    <div className="font-mono text-xs tabular-nums">
                      {formatAleph(seg.aleph)}{" "}
                      <span className="text-muted-foreground">
                        ({pct.toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <CopyableText
            text={r.rewardAddr}
            startChars={6}
            endChars={4}
            size="sm"
          />
          <span>earned only from this node in the {rangeLabel}.</span>
        </div>
      )}
    </Card>
  );
}
