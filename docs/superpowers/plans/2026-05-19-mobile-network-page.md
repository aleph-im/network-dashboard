# Mobile network page — portrait summary — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken 50-CCN portrait fallback on `/network` with a three-section summary (CCNs / Top countries / Top reward addresses), each row click-through to a working detail page, plus a quiet "↻ Rotate device for full network graph" hint at the top.

**Architecture:** All changes scoped to the portrait block (`md:hidden`). One new component (`NetworkMobileSummary`), one new pure-logic helper file (`network-mobile-aggregates.ts`) with co-located tests, and a small refactor that promotes `dotStatusFor` from a private function in `network-detail-panel.tsx` to a shared helper in `network-graph-model.ts` (alongside `isPending` / `isUnderstaked`, which are the same shape). No new API calls, no new React Query hooks, no orientation-detection API — landscape ≥ md already shows the graph via the existing media query.

**Tech Stack:** Next.js 16 App Router (static export), TypeScript strict, Tailwind v4, `@aleph-front/ds` components (Badge, StatusDot, Skeleton), React Query (already wired via `useNetworkGraph`), Vitest for unit tests.

**Spec:** `docs/superpowers/specs/2026-05-19-mobile-network-page-design.md`

---

## Task 1: Promote `dotStatusFor` to a shared helper

**Files:**
- Modify: `src/lib/network-graph-model.ts` — add `DotStatus` type + `dotStatusFor` function below the existing `isUnderstaked` helper
- Modify: `src/components/network/network-detail-panel.tsx:28-39` — delete the local `DotStatus` type + `dotStatusFor` function; add import

**Why this task is first:** the mobile summary needs the same status mapping the desktop detail panel uses (so the two views agree on which dot color a node gets). Moving the function up keeps the codebase DRY rather than duplicating nine lines of mapping logic into the new component.

- [ ] **Step 1: Add the type + function to `network-graph-model.ts`**

Add these declarations to `src/lib/network-graph-model.ts`, just below the existing `isUnderstaked` function (around line 117):

```ts
// Maps a GraphNode to the StatusDot variant it should render. Shared between
// the desktop detail panel (`network-detail-panel.tsx`) and the mobile
// summary (`network-mobile-summary.tsx`) so both views agree.
export type DotStatus = "healthy" | "degraded" | "error" | "offline" | "unknown";

export function dotStatusFor(node: GraphNode): DotStatus {
  if (node.kind === "country") return "unknown";
  if (node.inactive) return "offline";
  if (node.kind === "staker" || node.kind === "reward") return "unknown";
  if (node.kind === "crn" && node.flagged) return "degraded";
  if (node.status === "active" || node.status === "linked") return "healthy";
  if (node.status === "unreachable") return "error";
  if (node.status === "unknown") return "unknown";
  return "degraded";
}
```

- [ ] **Step 2: Delete the local copy in `network-detail-panel.tsx`**

In `src/components/network/network-detail-panel.tsx`, delete lines 28–39 (the local `DotStatus` type + `dotStatusFor` function).

- [ ] **Step 3: Update imports in `network-detail-panel.tsx`**

The file already has an import line for `network-graph-model`. Update it to include the moved symbol. Find the existing import (it imports types like `GraphNode`) and add `dotStatusFor`:

```ts
import { dotStatusFor, type GraphNode, /* …existing imports… */ } from "@/lib/network-graph-model";
```

(If `DotStatus` is referenced anywhere else in the file as a type, also import it. Grep first: `rg -n 'DotStatus' src/components/network/network-detail-panel.tsx`.)

- [ ] **Step 4: Run typecheck to verify nothing broke**

Run: `pnpm typecheck`
Expected: clean (0 errors).

- [ ] **Step 5: Commit**

```bash
git add src/lib/network-graph-model.ts src/components/network/network-detail-panel.tsx
git commit -m "refactor: promote dotStatusFor to shared graph helper"
```

---

## Task 2: Aggregation helpers (TDD)

**Files:**
- Create: `src/lib/network-mobile-aggregates.ts`
- Test: `src/lib/network-mobile-aggregates.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/network-mobile-aggregates.test.ts` with this content:

```ts
import { describe, expect, it } from "vitest";
import type { Graph, GraphNode } from "@/lib/network-graph-model";
import type { CCNInfo, CRNInfo, NodeState } from "@/api/credit-types";
import { aggregateCountries, aggregateRewards } from "./network-mobile-aggregates";

function ccnNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: "ccn1",
    kind: "ccn",
    label: "CCN One",
    status: "active",
    owner: "0xowner1",
    reward: "0xreward1",
    inactive: false,
    ...overrides,
  };
}

function crnNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: "crn1",
    kind: "crn",
    label: "CRN One",
    status: "linked",
    owner: "0xowner1",
    reward: "0xreward1",
    inactive: false,
    ...overrides,
  };
}

function ccnInfo(overrides: Partial<CCNInfo> = {}): CCNInfo {
  return {
    hash: "ccn1",
    name: "CCN One",
    owner: "0xowner1",
    reward: "0xreward1",
    score: 0.9,
    status: "active",
    stakers: {},
    totalStaked: 500_000,
    inactiveSince: null,
    resourceNodes: [],
    ...overrides,
  };
}

function crnInfo(overrides: Partial<CRNInfo> = {}): CRNInfo {
  return {
    hash: "crn1",
    name: "CRN One",
    owner: "0xowner1",
    reward: "0xreward1",
    score: 0.9,
    status: "linked",
    inactiveSince: null,
    parent: "ccn1",
    ...overrides,
  };
}

describe("aggregateCountries", () => {
  it("returns an empty array for an empty graph", () => {
    const graph: Graph = { nodes: [], edges: [] };
    expect(aggregateCountries(graph)).toEqual([]);
  });

  it("groups one CCN and one CRN with the same country", () => {
    const graph: Graph = {
      nodes: [
        ccnNode({ id: "ccn1", country: "FR" }),
        crnNode({ id: "crn1", country: "FR" }),
      ],
      edges: [],
    };
    const result = aggregateCountries(graph);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      iso: "FR",
      name: "France",
      total: 2,
      ccns: 1,
      crns: 1,
    });
  });

  it("skips nodes without country attribution", () => {
    const graph: Graph = {
      nodes: [
        ccnNode({ id: "ccn1", country: "FR" }),
        ccnNode({ id: "ccn2" }), // no country
      ],
      edges: [],
    };
    const result = aggregateCountries(graph);
    expect(result).toHaveLength(1);
    expect(result[0]?.total).toBe(1);
  });

  it("ignores non-CCN/non-CRN nodes even if they have a country field", () => {
    const graph: Graph = {
      nodes: [
        { id: "country:FR", kind: "country", label: "France", status: "", owner: null, reward: null, inactive: false },
        ccnNode({ id: "ccn1", country: "FR" }),
      ],
      edges: [],
    };
    const result = aggregateCountries(graph);
    expect(result[0]?.total).toBe(1);
  });

  it("sorts by total desc, name asc tiebreaker", () => {
    const graph: Graph = {
      nodes: [
        ccnNode({ id: "ccn1", country: "DE" }),
        ccnNode({ id: "ccn2", country: "FR" }),
        crnNode({ id: "crn1", country: "FR" }),
      ],
      edges: [],
    };
    const result = aggregateCountries(graph);
    expect(result.map((r) => r.iso)).toEqual(["FR", "DE"]);
  });
});

describe("aggregateRewards", () => {
  function buildNodeState(ccns: CCNInfo[], crns: CRNInfo[]): NodeState {
    return {
      ccns: new Map(ccns.map((c) => [c.hash, c])),
      crns: new Map(crns.map((c) => [c.hash, c])),
    };
  }

  it("returns an empty array when nodeState is undefined", () => {
    const graph: Graph = { nodes: [ccnNode()], edges: [] };
    expect(aggregateRewards(graph, undefined)).toEqual([]);
  });

  it("groups one CCN + one CRN sharing a reward address", () => {
    const state = buildNodeState(
      [ccnInfo({ reward: "0xAAA" })],
      [crnInfo({ reward: "0xAAA" })],
    );
    const graph: Graph = {
      nodes: [
        ccnNode({ id: "ccn1", reward: "0xAAA" }),
        crnNode({ id: "crn1", reward: "0xAAA" }),
      ],
      edges: [],
    };
    const result = aggregateRewards(graph, state);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      address: "0xaaa",
      total: 2,
      ccns: 1,
      crns: 1,
    });
  });

  it("lowercases reward addresses for grouping", () => {
    const state = buildNodeState(
      [
        ccnInfo({ hash: "ccn1", reward: "0xAAA" }),
        ccnInfo({ hash: "ccn2", reward: "0xaaa" }),
      ],
      [],
    );
    const graph: Graph = {
      nodes: [
        ccnNode({ id: "ccn1", reward: "0xAAA" }),
        ccnNode({ id: "ccn2", reward: "0xaaa" }),
      ],
      edges: [],
    };
    const result = aggregateRewards(graph, state);
    expect(result).toHaveLength(1);
    expect(result[0]?.address).toBe("0xaaa");
    expect(result[0]?.total).toBe(2);
  });

  it("skips nodes with null reward", () => {
    const state = buildNodeState([ccnInfo({ reward: "0xAAA" })], []);
    const graph: Graph = {
      nodes: [
        ccnNode({ id: "ccn1", reward: "0xAAA" }),
        ccnNode({ id: "ccn2", reward: null }),
      ],
      edges: [],
    };
    const result = aggregateRewards(graph, state);
    expect(result).toHaveLength(1);
  });

  it("uses totalStaked as a tiebreaker when totals match", () => {
    const state = buildNodeState(
      [
        ccnInfo({ hash: "ccn1", reward: "0xLOW", totalStaked: 100_000 }),
        ccnInfo({ hash: "ccn2", reward: "0xHIGH", totalStaked: 900_000 }),
      ],
      [],
    );
    const graph: Graph = {
      nodes: [
        ccnNode({ id: "ccn1", reward: "0xLOW" }),
        ccnNode({ id: "ccn2", reward: "0xHIGH" }),
      ],
      edges: [],
    };
    const result = aggregateRewards(graph, state);
    expect(result.map((r) => r.address)).toEqual(["0xhigh", "0xlow"]);
  });

  it("sums totalStaked across multiple CCNs with the same reward", () => {
    const state = buildNodeState(
      [
        ccnInfo({ hash: "ccn1", reward: "0xAAA", totalStaked: 100_000 }),
        ccnInfo({ hash: "ccn2", reward: "0xAAA", totalStaked: 200_000 }),
      ],
      [],
    );
    const graph: Graph = {
      nodes: [
        ccnNode({ id: "ccn1", reward: "0xAAA" }),
        ccnNode({ id: "ccn2", reward: "0xAAA" }),
      ],
      edges: [],
    };
    const result = aggregateRewards(graph, state);
    expect(result[0]?.totalStaked).toBe(300_000);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm vitest run src/lib/network-mobile-aggregates.test.ts`
Expected: FAIL — "Cannot find module './network-mobile-aggregates'".

- [ ] **Step 3: Implement the helpers**

Create `src/lib/network-mobile-aggregates.ts`:

```ts
import type { Graph, GraphNode } from "@/lib/network-graph-model";
import type { NodeState } from "@/api/credit-types";
import centroidsJson from "@/data/country-centroids.json";

type Centroid = { lat: number; lng: number; name: string };
const centroids = centroidsJson as Record<string, Centroid>;

export type CountryAggregate = {
  iso: string;
  name: string;
  total: number;
  ccns: number;
  crns: number;
};

export type RewardAggregate = {
  address: string;
  total: number;
  ccns: number;
  crns: number;
  totalStaked: number;
};

export function aggregateCountries(graph: Graph): CountryAggregate[] {
  const byIso = new Map<string, CountryAggregate>();
  for (const n of graph.nodes) {
    if (n.kind !== "ccn" && n.kind !== "crn") continue;
    if (!n.country) continue;
    const iso = n.country;
    const existing = byIso.get(iso);
    if (existing) {
      existing.total++;
      if (n.kind === "ccn") existing.ccns++;
      else existing.crns++;
    } else {
      byIso.set(iso, {
        iso,
        name: centroids[iso]?.name ?? iso,
        total: 1,
        ccns: n.kind === "ccn" ? 1 : 0,
        crns: n.kind === "crn" ? 1 : 0,
      });
    }
  }
  return [...byIso.values()].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.name.localeCompare(b.name);
  });
}

export function aggregateRewards(
  graph: Graph,
  nodeState: NodeState | undefined,
): RewardAggregate[] {
  if (!nodeState) return [];
  const byAddr = new Map<string, RewardAggregate>();
  for (const n of graph.nodes) {
    if (n.kind !== "ccn" && n.kind !== "crn") continue;
    if (!n.reward) continue;
    const address = n.reward.toLowerCase();
    const staked = n.kind === "ccn"
      ? (nodeState.ccns.get(n.id)?.totalStaked ?? 0)
      : 0;
    const existing = byAddr.get(address);
    if (existing) {
      existing.total++;
      if (n.kind === "ccn") existing.ccns++;
      else existing.crns++;
      existing.totalStaked += staked;
    } else {
      byAddr.set(address, {
        address,
        total: 1,
        ccns: n.kind === "ccn" ? 1 : 0,
        crns: n.kind === "crn" ? 1 : 0,
        totalStaked: staked,
      });
    }
  }
  return [...byAddr.values()].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return b.totalStaked - a.totalStaked;
  });
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `pnpm vitest run src/lib/network-mobile-aggregates.test.ts`
Expected: PASS — all 11 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/network-mobile-aggregates.ts src/lib/network-mobile-aggregates.test.ts
git commit -m "feat(network): add country + reward-address aggregation helpers for mobile summary"
```

---

## Task 3: Build `NetworkMobileSummary` component

**Files:**
- Create: `src/components/network/network-mobile-summary.tsx`

- [ ] **Step 1: Scaffold the file with the rotate hint + section headers**

Create `src/components/network/network-mobile-summary.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { Badge } from "@aleph-front/ds/badge";
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
```

- [ ] **Step 2: Add the CCN section**

Append to the same file:

```tsx
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
      <section className="flex flex-col gap-2">
        <SectionHeader label="CCNs" count={null} />
        <RowSkeletons />
      </section>
    );
  }

  if (ccns.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <SectionHeader label="CCNs" count={0} />
        <EmptyLine text="No data yet" />
      </section>
    );
  }

  const visible = expanded ? ccns : ccns.slice(0, VISIBLE_LIMIT);

  return (
    <section className="flex flex-col gap-2">
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
    </section>
  );
}
```

- [ ] **Step 3: Add the Country section**

Append to the same file:

```tsx
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
      <section className="flex flex-col gap-2">
        <SectionHeader label="Top countries" count={null} />
        <RowSkeletons />
      </section>
    );
  }

  if (countries.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <SectionHeader label="Top countries" count={0} />
        <EmptyLine text="No location data yet" />
      </section>
    );
  }

  const visible = expanded ? countries : countries.slice(0, VISIBLE_LIMIT);

  return (
    <section className="flex flex-col gap-2">
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
    </section>
  );
}
```

- [ ] **Step 4: Add the Reward addresses section**

Append to the same file:

```tsx
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
      <section className="flex flex-col gap-2">
        <SectionHeader label="Top reward addresses" count={null} />
        <RowSkeletons />
      </section>
    );
  }

  if (rewards.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <SectionHeader label="Top reward addresses" count={0} />
        <EmptyLine text="No data yet" />
      </section>
    );
  }

  const visible = expanded ? rewards : rewards.slice(0, VISIBLE_LIMIT);

  return (
    <section className="flex flex-col gap-2">
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
    </section>
  );
}
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: clean (0 errors).

- [ ] **Step 6: Run lint**

Run: `pnpm lint src/components/network/network-mobile-summary.tsx`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/network/network-mobile-summary.tsx
git commit -m "feat(network): add NetworkMobileSummary component"
```

---

## Task 4: Wire the new component into the network page

**Files:**
- Modify: `src/app/network/page.tsx` — replace the existing portrait fallback (lines 142–169) with `<NetworkMobileSummary>`

- [ ] **Step 1: Add the import**

In `src/app/network/page.tsx`, add this import alongside the other network component imports (near line 17):

```tsx
import { NetworkMobileSummary } from "@/components/network/network-mobile-summary";
```

- [ ] **Step 2: Replace the mobile fallback block**

Find the existing portrait block in `src/app/network/page.tsx`:

```tsx
      {/* Mobile fallback */}
      <div className="flex h-full flex-col md:hidden">
        <header className="px-6 py-4">
          <h1 className="text-2xl font-semibold">Network</h1>
          <p className="text-sm text-muted-foreground">
            Aleph node topology — CCNs, CRNs, and their links.
          </p>
        </header>
        <div className="flex-1 overflow-auto p-6">
          <p className="mb-4 text-sm text-muted-foreground">
            Network graph is best on a larger screen. Pick a CCN to inspect:
          </p>
          <ul className="space-y-2">
            {fullGraph.nodes
              .filter((n) => n.kind === "ccn")
              .slice(0, 50)
              .map((n) => (
                <li key={n.id}>
                  <Link
                    href={`/network?focus=${n.id}`}
                    className="block rounded-md border border-foreground/[0.06] px-3 py-2 text-sm"
                  >
                    {n.label}
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      </div>
```

Replace the entire `{/* Mobile fallback */}` block with:

```tsx
      {/* Mobile fallback */}
      <div className="md:hidden">
        <NetworkMobileSummary
          fullGraph={fullGraph}
          nodeState={nodeState}
          isLoading={isLoading}
        />
      </div>
```

- [ ] **Step 3: Check the `Link` import**

After the replacement, the only remaining use of `Link` in `page.tsx` may have disappeared (the desktop block doesn't use `Link` directly). Run:

```bash
rg -n '\bLink\b' src/app/network/page.tsx
```

If `Link` is no longer referenced, remove the `import Link from "next/link";` line. If it's still used somewhere, leave it.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: clean (0 errors).

- [ ] **Step 5: Run lint**

Run: `pnpm lint src/app/network/page.tsx`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/network/page.tsx
git commit -m "feat(network): replace portrait CCN list with NetworkMobileSummary"
```

---

## Task 5: Verify and refine

- [ ] Run full project checks: `pnpm check`
- [ ] Start dev server: `pnpm dev`
- [ ] Manual smoke test below `md` (Chrome DevTools → Toggle device toolbar → iPhone 14 / 390×844):
  - [ ] `/network` loads, PageHeader shows "Network Graph" with a ☰ in the right slot
  - [ ] "↻ Rotate device for full network graph" hint visible at top
  - [ ] **CCNs section**: top 10 CCNs visible, each shows name + flag + CRN count + staked total + StatusDot, "See all N →" toggle present
  - [ ] Tap a CCN row → lands on `/nodes?view=<hash>` (a CCN detail page should render)
  - [ ] Tap "See all" → all CCNs render → tap "Show less" → collapses to top 10
  - [ ] **Top countries section**: top 10 countries visible, each shows flag + name + "N nodes · M CCNs · K CRNs", rows are not clickable
  - [ ] **Top reward addresses section**: top 10 addresses visible, each shows truncated 0x… + CRN/CCN badges + → arrow
  - [ ] Tap a reward address row → lands on `/wallet?address=<addr>`
  - [ ] Rotate to landscape (≥ md) → full graph renders, portrait summary hidden
  - [ ] Rotate back to portrait → summary renders again
- [ ] Fix any issues found, re-run `pnpm check` until clean

---

## Task 6: Update docs and version

- [ ] **`docs/ARCHITECTURE.md`** — under the network graph section (search for `/network` references), add a paragraph noting the new portrait summary: three sections (CCNs / Top countries / Top reward addresses), pure aggregation helpers in `src/lib/network-mobile-aggregates.ts`, shared `dotStatusFor` now in `src/lib/network-graph-model.ts`.

- [ ] **`docs/DECISIONS.md`** — add a new decision entry capturing the portrait-summary design:

```markdown
## Decision #N - 2026-05-19

**Context:** The portrait `/network` page rendered a broken 50-CCN list — clicking a node linked to `/network?focus=<id>` but the graph wasn't rendered below `md`, so the focus had no visible effect. The list also omitted CRNs, geo, and reward addresses, so portrait users couldn't see the full network story.

**Decision:** Replace the portrait fallback with a three-section summary (CCNs / Top countries / Top reward addresses), each row clicking through to a working detail page (`/nodes?view=`, `/wallet?address=`). Country rows are informational (no detail page exists). Add a persistent "↻ Rotate device for full network graph" hint at the top. No orientation-detection API — the existing width-based media query handles landscape ≥ md.

**Rationale:** The network page tells a relational story (edges, clusters) that a flat list can't reproduce. Rather than pretending portrait can render that, we lean into "portrait is a summary, landscape is the graph" and make the summary useful in its own right: tells users who's on the network, where they are, and who runs the most nodes.

**Alternatives considered:**
- Rotate-only wall ("rotate to continue") — rejected because orientation-locked or one-handed users would hit a dead end with no usable surface.
- Search-first operations triage — deferred; the surface is "overview" first, search can be added later if needed.
- Make countries clickable to a `/network?focus=country:<ISO>` URL — rejected because the graph isn't rendered in portrait, so the focus would have no visible effect (same trap as today's broken CCN links).
```

- [ ] **`docs/BACKLOG.md`** — if there's an open entry for "fix mobile network page" or "portrait network page", move it to Completed. Also add deferred ideas under Ready/Needs planning as appropriate:
  - Portrait search/filter
  - Country detail page
  - Top stakers + top CRNs sections

- [ ] **`CLAUDE.md`** (project) — update the **Current Features** "Network graph page" entry. Find the line that currently reads `Mobile fallback: a list of CCNs (no graph), inside md:hidden.` (around the end of the network-graph paragraph) and replace with:

```
Mobile fallback (`md:hidden`): a three-section portrait summary (CCNs / Top countries / Top reward addresses) rendered by `NetworkMobileSummary`. Each section shows top 10 items with a "See all N →" inline expand toggle. CCN rows link to `/nodes?view=<hash>`, reward address rows link to `/wallet?address=<addr>`, country rows are informational. A persistent "↻ Rotate device for full network graph" hint sits at the top. The desktop graph renders automatically when the viewport reaches `md` (landscape on most modern phones). Aggregation lives in `src/lib/network-mobile-aggregates.ts` (pure, unit-tested); `dotStatusFor` was promoted to `src/lib/network-graph-model.ts` so the portrait and desktop views share the same status mapping.
```

- [ ] **`src/changelog.ts`** — bump `CURRENT_VERSION` (patch — this is a user-facing fix to a previously broken surface). Add a `VersionEntry` with `kind: "Feature"` for the new portrait summary and `kind: "UI"` noting the rotate hint + click-through to detail pages. Example:

```ts
{
  version: "0.X.Y",  // bump patch from current
  date: "2026-05-19",
  changes: [
    { kind: "Feature", text: "Portrait `/network` now renders a three-section summary (CCNs / Top countries / Top reward addresses) instead of the broken CCN list. Each row links to a working detail page; a quiet hint nudges users to rotate for the full graph." },
    { kind: "Refactor", text: "Promoted `dotStatusFor` from `network-detail-panel.tsx` to `network-graph-model.ts` so portrait and desktop views share status mapping." },
  ],
},
```

- [ ] Commit docs:

```bash
git add docs/ARCHITECTURE.md docs/DECISIONS.md docs/BACKLOG.md CLAUDE.md src/changelog.ts
git commit -m "docs(network): document portrait summary + dotStatusFor move"
```

---

## Self-review checklist (for the implementer)

Before declaring the plan done, verify each spec section maps to a task:

| Spec section | Covered by |
|---|---|
| Three sections (CCNs, Top countries, Top reward addresses) | Task 3 steps 2–4 |
| Click-through targets (`/nodes?view=`, `/wallet?address=`, country not clickable) | Task 3 steps 2 + 4 |
| Persistent rotate hint | Task 3 step 1 |
| "See all" inline expand toggle (no pagination, no route change) | Task 3 step 1 (`ExpandToggle`) |
| Drop the redundant local `<h1>` + subtitle | Task 4 step 2 |
| Aggregate helpers + tests | Task 2 |
| `dotStatusFor` available outside `network-detail-panel.tsx` | Task 1 |
| Loading / empty states with skeletons | Task 3 steps 2–4 |
| URL state silent on portrait | Task 4 step 2 (the new portrait block doesn't read URL params) |
| Accessibility — links for clickable rows, plain divs for countries | Task 3 steps 2 (CCN `<Link>`), 3 (country `<li>`), 4 (reward `<Link>`) |
