"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { Badge } from "@aleph-front/ds/badge";
import { Card } from "@aleph-front/ds/card";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { StatusDot } from "@aleph-front/ds/status-dot";
import type { Graph, GraphNode } from "@/lib/network-graph-model";
import { dotStatusFor } from "@/lib/network-graph-model";
import type { NodeState } from "@/api/credit-types";
import { countryFlag } from "@/lib/country-flag";
import { formatAleph, truncateHash } from "@/lib/format";
import {
  aggregateCountries,
  aggregateRewards,
  type CountryAggregate,
  type RewardAggregate,
} from "@/lib/network-mobile-aggregates";

const VISIBLE_LIMIT = 10;

type Props = {
  fullGraph: Graph;
  nodeState: NodeState | undefined;
  isLoading: boolean;
};

type ExpandState = { ccns: boolean; countries: boolean; rewards: boolean };

export function NetworkMobileSummary({ fullGraph, nodeState, isLoading }: Props) {
  const [expanded, setExpanded] = useState<ExpandState>({
    ccns: false,
    countries: false,
    rewards: false,
  });

  const toggle = (key: keyof ExpandState) =>
    setExpanded((s) => ({ ...s, [key]: !s[key] }));

  return (
    <div className="flex flex-col gap-6 p-6">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowsClockwise weight="bold" className="size-4" />
        Rotate device for full network graph
      </p>
      <CcnSection
        graph={fullGraph}
        nodeState={nodeState}
        isLoading={isLoading}
        expanded={expanded.ccns}
        onToggle={() => toggle("ccns")}
      />
      <CountrySection
        graph={fullGraph}
        isLoading={isLoading}
        expanded={expanded.countries}
        onToggle={() => toggle("countries")}
      />
      <RewardSection
        graph={fullGraph}
        nodeState={nodeState}
        isLoading={isLoading}
        expanded={expanded.rewards}
        onToggle={() => toggle("rewards")}
      />
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count: number | null }) {
  return (
    <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
      {label}
      {count !== null && <span className="ml-1 text-foreground">· {count}</span>}
    </h2>
  );
}

function ExpandToggle({
  total,
  expanded,
  onToggle,
}: {
  total: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (total <= VISIBLE_LIMIT) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-2 text-xs text-primary-500 dark:text-primary-300"
    >
      {expanded ? "Show less" : `See all ${total} →`}
    </button>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground italic">{text}</p>;
}

function RowSkeletons({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function CcnSection({
  graph,
  nodeState,
  isLoading,
  expanded,
  onToggle,
}: {
  graph: Graph;
  nodeState: NodeState | undefined;
  isLoading: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const ccns = useMemo<GraphNode[]>(() => {
    const list = graph.nodes.filter((n) => n.kind === "ccn");
    return list.sort((a, b) => {
      const scoreA = nodeState?.ccns.get(a.id)?.score ?? 0;
      const scoreB = nodeState?.ccns.get(b.id)?.score ?? 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      const crnsA = nodeState?.ccns.get(a.id)?.resourceNodes.length ?? 0;
      const crnsB = nodeState?.ccns.get(b.id)?.resourceNodes.length ?? 0;
      return crnsB - crnsA;
    });
  }, [graph, nodeState]);

  if (isLoading || !nodeState) {
    return (
      <Card padding="md" className="flex flex-col gap-2">
        <SectionHeader label="CCNs" count={null} />
        <RowSkeletons />
      </Card>
    );
  }

  if (ccns.length === 0) {
    return (
      <Card padding="md" className="flex flex-col gap-2">
        <SectionHeader label="CCNs" count={0} />
        <EmptyLine text="No data yet" />
      </Card>
    );
  }

  const visible = expanded ? ccns : ccns.slice(0, VISIBLE_LIMIT);

  return (
    <Card padding="md" className="flex flex-col gap-2">
      <SectionHeader label="CCNs" count={ccns.length} />
      <ul className="flex flex-col divide-y divide-foreground/[0.06]">
        {visible.map((n) => {
          const info = nodeState.ccns.get(n.id);
          const crnCount = info?.resourceNodes.length ?? 0;
          const staked = info?.totalStaked ?? 0;
          const flag = n.country ? countryFlag(n.country) : "";
          return (
            <li key={n.id}>
              <Link
                href={`/nodes?view=${n.id}`}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{n.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {flag && <span className="mr-1">{flag}</span>}
                    {crnCount} CRNs · {formatAleph(staked)} ALEPH
                  </div>
                </div>
                <StatusDot status={dotStatusFor(n)} />
              </Link>
            </li>
          );
        })}
      </ul>
      <ExpandToggle total={ccns.length} expanded={expanded} onToggle={onToggle} />
    </Card>
  );
}

function CountrySection({
  graph,
  isLoading,
  expanded,
  onToggle,
}: {
  graph: Graph;
  isLoading: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const countries: CountryAggregate[] = useMemo(
    () => aggregateCountries(graph),
    [graph],
  );

  if (isLoading) {
    return (
      <Card padding="md" className="flex flex-col gap-2">
        <SectionHeader label="Top countries" count={null} />
        <RowSkeletons />
      </Card>
    );
  }

  if (countries.length === 0) {
    return (
      <Card padding="md" className="flex flex-col gap-2">
        <SectionHeader label="Top countries" count={0} />
        <EmptyLine text="No location data yet" />
      </Card>
    );
  }

  const visible = expanded ? countries : countries.slice(0, VISIBLE_LIMIT);

  return (
    <Card padding="md" className="flex flex-col gap-2">
      <SectionHeader label="Top countries" count={countries.length} />
      <ul className="flex flex-col divide-y divide-foreground/[0.06]">
        {visible.map((c) => (
          <li key={c.iso} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">
                <span className="mr-1">{countryFlag(c.iso)}</span>
                {c.name}
              </div>
              <div className="text-xs text-muted-foreground">
                {c.total} nodes · {c.ccns} CCNs · {c.crns} CRNs
              </div>
            </div>
          </li>
        ))}
      </ul>
      <ExpandToggle total={countries.length} expanded={expanded} onToggle={onToggle} />
    </Card>
  );
}

function RewardSection({
  graph,
  nodeState,
  isLoading,
  expanded,
  onToggle,
}: {
  graph: Graph;
  nodeState: NodeState | undefined;
  isLoading: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const rewards: RewardAggregate[] = useMemo(
    () => aggregateRewards(graph, nodeState),
    [graph, nodeState],
  );

  if (isLoading || !nodeState) {
    return (
      <Card padding="md" className="flex flex-col gap-2">
        <SectionHeader label="Top reward addresses" count={null} />
        <RowSkeletons />
      </Card>
    );
  }

  if (rewards.length === 0) {
    return (
      <Card padding="md" className="flex flex-col gap-2">
        <SectionHeader label="Top reward addresses" count={0} />
        <EmptyLine text="No data yet" />
      </Card>
    );
  }

  const visible = expanded ? rewards : rewards.slice(0, VISIBLE_LIMIT);

  return (
    <Card padding="md" className="flex flex-col gap-2">
      <SectionHeader label="Top reward addresses" count={rewards.length} />
      <ul className="flex flex-col divide-y divide-foreground/[0.06]">
        {visible.map((r) => (
          <li key={r.address}>
            <Link
              href={`/wallet?address=${r.address}`}
              className="flex items-center justify-between gap-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs">{truncateHash(r.address)}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {r.crns > 0 && (
                    <Badge fill="outline" size="sm">
                      CRN: {r.crns}
                    </Badge>
                  )}
                  {r.ccns > 0 && (
                    <Badge fill="outline" size="sm">
                      CCN: {r.ccns}
                    </Badge>
                  )}
                </div>
              </div>
              <span className="text-xs text-muted-foreground">→</span>
            </Link>
          </li>
        ))}
      </ul>
      <ExpandToggle total={rewards.length} expanded={expanded} onToggle={onToggle} />
    </Card>
  );
}
