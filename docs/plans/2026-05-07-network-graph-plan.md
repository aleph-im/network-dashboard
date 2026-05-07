# Network Graph Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/network` page that renders the Aleph network as a force-directed graph (CCN ↔ CRN structural links by default; owner / staker / reward overlays toggleable), with hover tooltips, click-to-detail panels, ego-network focus mode, and operator-deep-link via `?address=`.

**Architecture:** D3 owns the simulation (computes `x`/`y`); React owns the DOM (renders `<circle>`/`<line>` from a positions ref, batched at requestAnimationFrame). Hit-testing uses `d3-quadtree` so hover/click is O(log n) regardless of node count. URL is the source of truth for selected node, focus, layers, and address-highlight — back/forward buttons work everywhere.

**Tech Stack:** Next.js 16 (App Router, static export), React 19, TypeScript, `d3-force` + `d3-zoom` + `d3-drag` + `d3-quadtree`, Vitest, Tailwind, `@aleph-front/ds` 0.14.0.

**Spec:** `docs/plans/2026-05-07-network-graph-design.md`

---

## Notes for the implementer

- **Branch first.** Run `/start-session` (or `git checkout -b feature/network-graph`) before any code edits. Brainstorming and planning happen on `main`; implementation happens on a feature branch.
- **D3 + React decoupling rule:** D3 mutates simulation node objects in place. React must NOT read those mutated `x`/`y` values during render; instead, read from a `positionsRef` updated on each `tick`, and trigger a single re-render per animation frame via `setTickKey`. Violating this causes either dropped frames (too many re-renders) or stale visuals (positions that never update).
- **The CCN→CRN parent links are dropped by `getNodeState()` today (`src/api/client.ts:486-532`).** Task 1 reinstates them. Until that lands, the graph builder has nothing to link.
- **`exactOptionalPropertyTypes: true`** is on (per `tsconfig.json` and `MEMORY.md`). When emitting optional fields, never assign `undefined`; spread instead: `{ ...(x ? { key: x } : {}) }`.
- **Project conventions:** function ≤100 lines, ≤5 positional params, 100-char lines, absolute imports (`@/...`), no comments unless the WHY is non-obvious. DS components only; never raw `<input>` / `<button>` / `<select>`.
- **TDD discipline:** every task that produces logic starts with a failing test, then implementation, then a passing test, then commit. UI components use React Testing Library + jsdom (vitest config already wired).
- **Frequent commits:** one commit per task minimum. Use conventional-commit prefixes (`feat:`, `test:`, `chore:`, `docs:`).

---

## Task 1: Data model — preserve CCN↔CRN links + install d3 deps

**Goal:** Make the parent/child relationships available to the app, and install the d3 modules the rest of the plan depends on.

**Files:**
- Modify: `src/api/credit-types.ts`
- Modify: `src/api/client.ts:486-532` (`getNodeState`)
- Modify: `package.json` (deps via pnpm)

- [ ] **Step 1: Create the feature branch**

```bash
git checkout main
git pull --ff-only origin main
git checkout -b feature/network-graph
```

Expected: clean branch off latest main.

- [ ] **Step 2: Install d3 modules**

```bash
pnpm add d3-force d3-zoom d3-drag d3-quadtree
pnpm add -D @types/d3-force @types/d3-zoom @types/d3-drag @types/d3-quadtree
```

Expected: `package.json` and `pnpm-lock.yaml` updated. ~30 kB gzipped runtime add.

- [ ] **Step 3: Add fields to app-level types**

Edit `src/api/credit-types.ts` — extend `CCNInfo` and `CRNInfo` (around lines 73-93):

```ts
export type CCNInfo = {
  hash: string;
  name: string;
  owner: string;
  reward: string;
  score: number;
  status: string;
  stakers: Record<string, number>;
  totalStaked: number;
  inactiveSince: number | null;
  resourceNodes: string[];   // hashes of child CRNs
};

export type CRNInfo = {
  hash: string;
  name: string;
  owner: string;
  reward: string;
  score: number;
  status: string;
  inactiveSince: number | null;
  parent: string | null;     // hash of parent CCN, null when unattached
};
```

- [ ] **Step 4: Update the wire→app transform**

Edit `src/api/client.ts` `getNodeState()` (around line 505 for CCNs, 519 for CRNs):

```ts
for (const n of channel.nodes ?? []) {
  ccns.set(n.hash, {
    hash: n.hash,
    name: n.name,
    owner: n.owner,
    reward: n.reward,
    score: n.score,
    status: n.status,
    stakers: n.stakers,
    totalStaked: n.total_staked,
    inactiveSince: n.inactive_since ?? null,
    resourceNodes: n.resource_nodes ?? [],
  });
}

for (const r of channel.resource_nodes ?? []) {
  crns.set(r.hash, {
    hash: r.hash,
    name: r.name,
    owner: r.owner,
    reward: r.reward,
    score: r.score,
    status: r.status,
    inactiveSince: r.inactive_since ?? null,
    parent: r.parent ?? null,
  });
}
```

- [ ] **Step 5: Run typecheck — confirm no consumer breaks**

Run: `pnpm typecheck`
Expected: PASS. The new fields are additive; existing consumers (`credit-distribution.ts`, `useNodeLocations`, etc.) don't touch them.

- [ ] **Step 6: Run existing tests**

Run: `pnpm test`
Expected: PASS. `credit-distribution.test.ts` constructs `CCNInfo`/`CRNInfo` literals — they'll fail to typecheck without the new fields. Add `resourceNodes: []` and `parent: null` to the literals in that file. Re-run, confirm green.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/api/credit-types.ts src/api/client.ts \
        src/lib/credit-distribution.test.ts
git commit -m "feat(api): preserve CCN→CRN parent links + install d3 deps"
```

---

## Task 2: Pure graph builder — `lib/network-graph-model.ts`

**Goal:** A pure, testable function that takes `NodeState` plus the active layer set and returns `{ nodes, edges }` ready for d3-force.

**Files:**
- Create: `src/lib/network-graph-model.ts`
- Create: `src/lib/network-graph-model.test.ts`

- [ ] **Step 1: Write the failing test for structural-only graph**

Create `src/lib/network-graph-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CCNInfo, CRNInfo, NodeState } from "@/api/credit-types";
import { buildGraph, type GraphLayer } from "./network-graph-model";

function makeState(overrides?: {
  ccns?: CCNInfo[];
  crns?: CRNInfo[];
}): NodeState {
  const ccns = new Map<string, CCNInfo>();
  const crns = new Map<string, CRNInfo>();
  for (const c of overrides?.ccns ?? []) ccns.set(c.hash, c);
  for (const r of overrides?.crns ?? []) crns.set(r.hash, r);
  return { ccns, crns };
}

function ccn(hash: string, partial?: Partial<CCNInfo>): CCNInfo {
  return {
    hash,
    name: `ccn-${hash}`,
    owner: "0xowner",
    reward: "0xreward",
    score: 0.9,
    status: "active",
    stakers: {},
    totalStaked: 0,
    inactiveSince: null,
    resourceNodes: [],
    ...partial,
  };
}

function crn(hash: string, partial?: Partial<CRNInfo>): CRNInfo {
  return {
    hash,
    name: `crn-${hash}`,
    owner: "0xowner",
    reward: "0xreward",
    score: 0.9,
    status: "active",
    inactiveSince: null,
    parent: null,
    ...partial,
  };
}

describe("buildGraph", () => {
  it("emits CCN + CRN nodes with structural edges by default", () => {
    const state = makeState({
      ccns: [ccn("c1", { resourceNodes: ["r1", "r2"] })],
      crns: [crn("r1", { parent: "c1" }), crn("r2", { parent: "c1" })],
    });

    const layers: Set<GraphLayer> = new Set(["structural"]);
    const graph = buildGraph(state, layers);

    expect(graph.nodes).toHaveLength(3);
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(["c1", "r1", "r2"]);
    expect(graph.edges).toHaveLength(2);
    expect(graph.edges.every((e) => e.type === "structural")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test — verify fail**

Run: `pnpm test src/lib/network-graph-model.test.ts`
Expected: FAIL with "Cannot find module './network-graph-model'".

- [ ] **Step 3: Implement the minimal builder**

Create `src/lib/network-graph-model.ts`:

```ts
import type { NodeState } from "@/api/credit-types";

export type GraphLayer = "structural" | "owner" | "staker" | "reward";

export type GraphNodeKind = "ccn" | "crn" | "staker" | "reward";

export type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  status: string;
  owner: string | null;
  reward: string | null;
  inactive: boolean;
};

export type GraphEdge = {
  source: string;
  target: string;
  type: GraphLayer;
};

export type Graph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export function buildGraph(
  state: NodeState,
  layers: Set<GraphLayer>,
): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const c of state.ccns.values()) {
    nodes.push({
      id: c.hash,
      kind: "ccn",
      label: c.name,
      status: c.status,
      owner: c.owner,
      reward: c.reward,
      inactive: c.inactiveSince != null,
    });
  }

  for (const r of state.crns.values()) {
    nodes.push({
      id: r.hash,
      kind: "crn",
      label: r.name,
      status: r.status,
      owner: r.owner,
      reward: r.reward,
      inactive: r.inactiveSince != null,
    });
    if (layers.has("structural") && r.parent != null) {
      edges.push({ source: r.parent, target: r.hash, type: "structural" });
    }
  }

  return { nodes, edges };
}
```

- [ ] **Step 4: Run the test — verify pass**

Run: `pnpm test src/lib/network-graph-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Add tests for owner / staker / reward layers**

Append to `network-graph-model.test.ts`:

```ts
describe("buildGraph layers", () => {
  it("draws owner edges between nodes sharing an owner address", () => {
    const state = makeState({
      ccns: [ccn("c1", { owner: "0xA" })],
      crns: [
        crn("r1", { owner: "0xA" }),
        crn("r2", { owner: "0xA" }),
        crn("r3", { owner: "0xB" }),
      ],
    });

    const graph = buildGraph(state, new Set(["owner"]));
    const ownerEdges = graph.edges.filter((e) => e.type === "owner");

    // 3 nodes share 0xA → 3 pairs
    expect(ownerEdges).toHaveLength(3);
    // 0xB has only one node → no edge
    expect(ownerEdges.every((e) =>
      ["c1", "r1", "r2"].includes(e.source) &&
      ["c1", "r1", "r2"].includes(e.target),
    )).toBe(true);
  });

  it("emits staker dot nodes + edges only when staker layer is on", () => {
    const state = makeState({
      ccns: [ccn("c1", { stakers: { "0xS1": 100, "0xS2": 200 } })],
    });

    const without = buildGraph(state, new Set(["structural"]));
    expect(without.nodes.find((n) => n.kind === "staker")).toBeUndefined();

    const withLayer = buildGraph(state, new Set(["structural", "staker"]));
    const stakerNodes = withLayer.nodes.filter((n) => n.kind === "staker");
    const stakerEdges = withLayer.edges.filter((e) => e.type === "staker");
    expect(stakerNodes.map((n) => n.id).sort()).toEqual(["0xS1", "0xS2"]);
    expect(stakerEdges).toHaveLength(2);
  });

  it("emits reward-address cluster edges when reward layer is on", () => {
    const state = makeState({
      ccns: [ccn("c1", { reward: "0xR" })],
      crns: [
        crn("r1", { reward: "0xR" }),
        crn("r2", { reward: "0xR" }),
      ],
    });

    const graph = buildGraph(state, new Set(["reward"]));
    const rewardEdges = graph.edges.filter((e) => e.type === "reward");
    expect(rewardEdges).toHaveLength(3); // c1↔r1, c1↔r2, r1↔r2
  });

  it("returns no edges when no layers are active", () => {
    const state = makeState({
      ccns: [ccn("c1", { resourceNodes: ["r1"] })],
      crns: [crn("r1", { parent: "c1" })],
    });
    expect(buildGraph(state, new Set()).edges).toHaveLength(0);
  });
});
```

- [ ] **Step 6: Extend the implementation to cover all layers**

Replace the single-layer implementation with the full one:

```ts
export function buildGraph(
  state: NodeState,
  layers: Set<GraphLayer>,
): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const c of state.ccns.values()) {
    nodes.push({
      id: c.hash, kind: "ccn", label: c.name, status: c.status,
      owner: c.owner, reward: c.reward,
      inactive: c.inactiveSince != null,
    });
  }
  for (const r of state.crns.values()) {
    nodes.push({
      id: r.hash, kind: "crn", label: r.name, status: r.status,
      owner: r.owner, reward: r.reward,
      inactive: r.inactiveSince != null,
    });
  }

  if (layers.has("structural")) {
    for (const r of state.crns.values()) {
      if (r.parent != null) {
        edges.push({ source: r.parent, target: r.hash, type: "structural" });
      }
    }
  }

  if (layers.has("owner")) {
    pushClusterEdges(nodes, "owner", (n) => n.owner, edges);
  }

  if (layers.has("reward")) {
    pushClusterEdges(nodes, "reward", (n) => n.reward, edges);
  }

  if (layers.has("staker")) {
    const stakerHashes = new Set<string>();
    for (const c of state.ccns.values()) {
      for (const stakerAddr of Object.keys(c.stakers)) {
        if (!stakerHashes.has(stakerAddr)) {
          stakerHashes.add(stakerAddr);
          nodes.push({
            id: stakerAddr, kind: "staker", label: stakerAddr,
            status: "active", owner: null, reward: null, inactive: false,
          });
        }
        edges.push({ source: stakerAddr, target: c.hash, type: "staker" });
      }
    }
  }

  return { nodes, edges };
}

function pushClusterEdges(
  nodes: GraphNode[],
  layer: GraphLayer,
  keyFn: (n: GraphNode) => string | null,
  out: GraphEdge[],
): void {
  const groups = new Map<string, string[]>();
  for (const n of nodes) {
    const k = keyFn(n);
    if (k == null) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(n.id);
  }
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        out.push({ source: ids[i]!, target: ids[j]!, type: layer });
      }
    }
  }
}
```

- [ ] **Step 7: Run the tests — verify pass**

Run: `pnpm test src/lib/network-graph-model.test.ts`
Expected: all 4 cases PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/network-graph-model.ts src/lib/network-graph-model.test.ts
git commit -m "feat(network): pure graph builder with layered edges"
```

---

## Task 3: Ego subgraph — `lib/network-focus.ts`

**Goal:** Extract a focused node + its 1-hop neighbors and the edges between them. Used by focus mode.

**Files:**
- Create: `src/lib/network-focus.ts`
- Create: `src/lib/network-focus.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/network-focus.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { egoSubgraph } from "./network-focus";
import type { Graph } from "./network-graph-model";

const sample: Graph = {
  nodes: [
    { id: "c1", kind: "ccn", label: "c1", status: "active",
      owner: "0xA", reward: "0xR", inactive: false },
    { id: "r1", kind: "crn", label: "r1", status: "active",
      owner: "0xA", reward: "0xR", inactive: false },
    { id: "r2", kind: "crn", label: "r2", status: "active",
      owner: "0xB", reward: "0xR", inactive: false },
    { id: "r3", kind: "crn", label: "r3", status: "active",
      owner: "0xC", reward: "0xX", inactive: false },
  ],
  edges: [
    { source: "c1", target: "r1", type: "structural" },
    { source: "c1", target: "r2", type: "structural" },
    { source: "r2", target: "r3", type: "owner" },
  ],
};

describe("egoSubgraph", () => {
  it("returns the focus node + its 1-hop neighbors only", () => {
    const result = egoSubgraph(sample, "c1");
    expect(result.nodes.map((n) => n.id).sort()).toEqual(["c1", "r1", "r2"]);
  });

  it("returns only edges where both endpoints are in the ego set", () => {
    const result = egoSubgraph(sample, "c1");
    expect(result.edges).toHaveLength(2);
    expect(result.edges.every((e) =>
      ["c1", "r1", "r2"].includes(e.source) &&
      ["c1", "r1", "r2"].includes(e.target),
    )).toBe(true);
  });

  it("returns just the node when it has no neighbors", () => {
    const isolated: Graph = {
      nodes: [{ id: "x", kind: "ccn", label: "x", status: "active",
        owner: null, reward: null, inactive: false }],
      edges: [],
    };
    expect(egoSubgraph(isolated, "x").nodes).toHaveLength(1);
  });

  it("returns empty when the focus id is not in the graph", () => {
    expect(egoSubgraph(sample, "missing").nodes).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test — verify fail**

Run: `pnpm test src/lib/network-focus.test.ts`
Expected: FAIL with "Cannot find module './network-focus'".

- [ ] **Step 3: Implement**

Create `src/lib/network-focus.ts`:

```ts
import type { Graph } from "./network-graph-model";

export function egoSubgraph(graph: Graph, focusId: string): Graph {
  const focus = graph.nodes.find((n) => n.id === focusId);
  if (!focus) return { nodes: [], edges: [] };

  const keep = new Set<string>([focusId]);
  for (const e of graph.edges) {
    if (e.source === focusId) keep.add(e.target);
    if (e.target === focusId) keep.add(e.source);
  }

  return {
    nodes: graph.nodes.filter((n) => keep.has(n.id)),
    edges: graph.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
  };
}
```

- [ ] **Step 4: Run the tests — verify pass**

Run: `pnpm test src/lib/network-focus.test.ts`
Expected: all 4 cases PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/network-focus.ts src/lib/network-focus.test.ts
git commit -m "feat(network): ego subgraph extraction for focus mode"
```

---

## Task 4: `useNetworkGraph` hook — URL state + memoized graph

**Goal:** A single hook that reads the active layers from URL `?layers=`, builds the graph from `useNodeState()`, applies focus if `?focus=` is present, and memoizes the result.

**Files:**
- Create: `src/hooks/use-network-graph.ts`

- [ ] **Step 1: Implement the hook**

Create `src/hooks/use-network-graph.ts`:

```ts
"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useNodeState } from "@/hooks/use-node-state";
import {
  buildGraph,
  type Graph,
  type GraphLayer,
} from "@/lib/network-graph-model";
import { egoSubgraph } from "@/lib/network-focus";

const DEFAULT_LAYERS: Set<GraphLayer> = new Set(["structural"]);
const ALL_LAYERS: GraphLayer[] = ["structural", "owner", "staker", "reward"];

export function parseLayers(raw: string | null): Set<GraphLayer> {
  if (!raw) return new Set(DEFAULT_LAYERS);
  const parts = raw.split(",").filter((p): p is GraphLayer =>
    (ALL_LAYERS as string[]).includes(p),
  );
  return parts.length > 0 ? new Set(parts) : new Set(DEFAULT_LAYERS);
}

export type UseNetworkGraphResult = {
  fullGraph: Graph;
  visibleGraph: Graph;
  layers: Set<GraphLayer>;
  focusId: string | null;
  isLoading: boolean;
};

export function useNetworkGraph(): UseNetworkGraphResult {
  const searchParams = useSearchParams();
  const { data: state, isLoading } = useNodeState();

  const layers = useMemo(
    () => parseLayers(searchParams.get("layers")),
    [searchParams],
  );
  const focusId = searchParams.get("focus");

  const fullGraph = useMemo(() => {
    if (!state) return { nodes: [], edges: [] } satisfies Graph;
    return buildGraph(state, layers);
  }, [state, layers]);

  const visibleGraph = useMemo(() => {
    if (!focusId) return fullGraph;
    return egoSubgraph(fullGraph, focusId);
  }, [fullGraph, focusId]);

  return { fullGraph, visibleGraph, layers, focusId, isLoading };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-network-graph.ts
git commit -m "feat(network): useNetworkGraph hook with URL-driven layers + focus"
```

---

## Task 5: Presentational primitives — `NetworkNode` + `NetworkEdge`

**Goal:** Two memoized SVG components that render a node or edge given absolute coordinates and visual flags. Pure presentational — no event handlers (parent SVG owns hit-testing).

**Files:**
- Create: `src/components/network/network-node.tsx`
- Create: `src/components/network/network-edge.tsx`

- [ ] **Step 1: Implement `NetworkNode`**

Create `src/components/network/network-node.tsx`:

```tsx
"use client";

import { memo } from "react";
import type { GraphNodeKind } from "@/lib/network-graph-model";

type Props = {
  x: number;
  y: number;
  kind: GraphNodeKind;
  status: string;
  selected: boolean;
  highlighted: boolean;
  inactive: boolean;
};

const RADIUS: Record<GraphNodeKind, number> = {
  ccn: 9,
  crn: 5,
  staker: 2,
  reward: 3,
};

const STATUS_FILL: Record<string, string> = {
  active: "var(--color-success-500)",
  unreachable: "var(--color-error-500)",
  removed: "var(--color-neutral-500)",
};

export const NetworkNode = memo(function NetworkNode({
  x, y, kind, status, selected, highlighted, inactive,
}: Props) {
  const r = RADIUS[kind];
  const fill = STATUS_FILL[status] ?? "var(--color-neutral-400)";
  const opacity = inactive ? 0.5 : 1;

  if (kind === "reward") {
    // Square for reward addresses
    return (
      <g opacity={opacity}>
        <rect
          x={x - r}
          y={y - r}
          width={r * 2}
          height={r * 2}
          fill={fill}
        />
        {selected && (
          <rect
            x={x - r - 3}
            y={y - r - 3}
            width={(r + 3) * 2}
            height={(r + 3) * 2}
            fill="none"
            stroke="var(--color-primary-500)"
            strokeWidth={2}
          />
        )}
      </g>
    );
  }

  return (
    <g opacity={opacity}>
      {highlighted && (
        <circle
          cx={x}
          cy={y}
          r={r * 1.5}
          fill="none"
          stroke="var(--color-primary-500)"
          strokeOpacity={0.5}
          strokeWidth={2}
          className="network-node-pulse"
        />
      )}
      <circle cx={x} cy={y} r={r} fill={fill} />
      {kind === "ccn" && (
        <circle
          cx={x}
          cy={y}
          r={r + 2}
          fill="none"
          stroke={fill}
          strokeOpacity={0.4}
          strokeWidth={1.5}
        />
      )}
      {selected && (
        <circle
          cx={x}
          cy={y}
          r={r + 4}
          fill="none"
          stroke="var(--color-primary-500)"
          strokeWidth={2}
        />
      )}
    </g>
  );
});
```

- [ ] **Step 2: Implement `NetworkEdge`**

Create `src/components/network/network-edge.tsx`:

```tsx
"use client";

import { memo } from "react";
import type { GraphLayer } from "@/lib/network-graph-model";

type Props = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: GraphLayer;
  faded: boolean;
};

const STROKE: Record<GraphLayer, string> = {
  structural: "currentColor",
  owner: "var(--color-info-500)",
  staker: "var(--color-warning-500)",
  reward: "var(--color-purple-500)",
};

const OPACITY: Record<GraphLayer, number> = {
  structural: 0.4,
  owner: 0.25,
  staker: 0.2,
  reward: 0.2,
};

const DASH: Partial<Record<GraphLayer, string>> = {
  owner: "3 3",
  reward: "1 4",
};

export const NetworkEdge = memo(function NetworkEdge({
  x1, y1, x2, y2, type, faded,
}: Props) {
  const opacity = (faded ? OPACITY[type] * 0.2 : OPACITY[type]);
  return (
    <line
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={STROKE[type]}
      strokeOpacity={opacity}
      strokeWidth={1}
      {...(DASH[type] ? { strokeDasharray: DASH[type] } : {})}
    />
  );
});
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Add the pulse animation in globals**

Edit `src/app/globals.css` — append a small keyframe (location: near the bottom, after existing keyframes):

```css
@keyframes network-pulse {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50%       { transform: scale(1.25); opacity: 0.2; }
}
.network-node-pulse {
  transform-origin: center;
  transform-box: fill-box;
  animation: network-pulse 2s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .network-node-pulse { animation: none; }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/network/network-node.tsx \
        src/components/network/network-edge.tsx \
        src/app/globals.css
git commit -m "feat(network): memoized SVG primitives for nodes and edges"
```

---

## Task 6: `NetworkGraph` core — simulation, rAF batching, quadtree hit-testing

**Goal:** The viz container. Owns the d3-force simulation, the positions ref, the quadtree, the SVG viewport, and emits `onNodeHover` / `onNodeClick`. Renders all nodes/edges by pulling from the positions ref.

**Files:**
- Create: `src/components/network/network-graph.tsx`

- [ ] **Step 1: Implement the container**

Create `src/components/network/network-graph.tsx`:

```tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { quadtree, type Quadtree } from "d3-quadtree";
import {
  zoom as d3zoom,
  zoomIdentity,
  type ZoomBehavior,
} from "d3-zoom";
import { select } from "d3-selection";
import type {
  Graph,
  GraphLayer,
  GraphNode,
} from "@/lib/network-graph-model";
import { NetworkNode } from "./network-node";
import { NetworkEdge } from "./network-edge";

type SimNode = SimulationNodeDatum & GraphNode;
type SimLink = SimulationLinkDatum<SimNode> & { type: GraphLayer };

type Props = {
  graph: Graph;
  selectedId: string | null;
  highlightedIds: Set<string>;
  onNodeHover: (node: GraphNode | null) => void;
  onNodeClick: (node: GraphNode) => void;
};

const SIM_DECAY = 0.05;
const HIT_RADIUS = 12;

export function NetworkGraph({
  graph, selectedId, highlightedIds, onNodeHover, onNodeClick,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(
    new Map(),
  );
  const quadtreeRef = useRef<Quadtree<SimNode> | null>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const rafRef = useRef<number>(0);
  const [tickKey, setTickKey] = useState(0);
  const [size, setSize] = useState({ w: 800, h: 600 });

  // Resize observer keeps the viewport in sync with the container.
  useEffect(() => {
    if (!svgRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      const { width, height } = e.contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(svgRef.current);
    return () => ro.disconnect();
  }, []);

  // Build / rebuild the simulation when graph changes.
  // We carry over positions for nodes that already exist.
  const simNodes = useMemo<SimNode[]>(() => {
    return graph.nodes.map((n) => {
      const prev = positionsRef.current.get(n.id);
      return {
        ...n,
        ...(prev ? { x: prev.x, y: prev.y } : {}),
      };
    });
  }, [graph]);

  const simLinks = useMemo<SimLink[]>(
    () => graph.edges.map((e) => ({
      source: e.source,
      target: e.target,
      type: e.type,
    })),
    [graph],
  );

  useEffect(() => {
    const sim = forceSimulation<SimNode>(simNodes)
      .force("link", forceLink<SimNode, SimLink>(simLinks)
        .id((d) => d.id)
        .distance(60)
        .strength(0.5))
      .force("charge", forceManyBody().strength(-180))
      .force("center", forceCenter(size.w / 2, size.h / 2))
      .alphaDecay(SIM_DECAY)
      .on("tick", () => {
        for (const n of simNodes) {
          if (n.x != null && n.y != null) {
            positionsRef.current.set(n.id, { x: n.x, y: n.y });
          }
        }
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(() => {
            quadtreeRef.current = quadtree<SimNode>()
              .x((d) => d.x ?? 0)
              .y((d) => d.y ?? 0)
              .addAll(simNodes);
            setTickKey((k) => k + 1);
            rafRef.current = 0;
          });
        }
      });

    simRef.current = sim;
    return () => {
      sim.stop();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [simNodes, simLinks, size.w, size.h]);

  // Wire d3-zoom onto the SVG; apply transform to <g>.
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const z = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => {
        if (gRef.current) {
          gRef.current.setAttribute("transform", event.transform.toString());
        }
      });
    zoomRef.current = z;
    select(svgRef.current).call(z);
    return () => {
      if (svgRef.current) select(svgRef.current).on(".zoom", null);
    };
  }, []);

  // Hit-test on mouse move via quadtree.
  const localPoint = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current || !gRef.current) return null;
      const ctm = gRef.current.getScreenCTM();
      if (!ctm) return null;
      const pt = svgRef.current.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      return pt.matrixTransform(ctm.inverse());
    },
    [],
  );

  const onMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const local = localPoint(e);
    if (!local || !quadtreeRef.current) return;
    const found = quadtreeRef.current.find(local.x, local.y, HIT_RADIUS);
    onNodeHover(found ?? null);
  }, [localPoint, onNodeHover]);

  const onClickSvg = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const local = localPoint(e);
    if (!local || !quadtreeRef.current) return;
    const found = quadtreeRef.current.find(local.x, local.y, HIT_RADIUS);
    if (found) onNodeClick(found);
  }, [localPoint, onNodeClick]);

  // Reset zoom to fit when graph changes substantially.
  // (Optional first pass — Task 14 adds smarter auto-fit for ?address=.)
  useEffect(() => {
    if (!svgRef.current || !zoomRef.current) return;
    select(svgRef.current).call(zoomRef.current.transform, zoomIdentity);
  }, [graph]);

  // tickKey is read for re-render; reference it here.
  void tickKey;

  return (
    <svg
      ref={svgRef}
      className="size-full text-muted-foreground"
      onMouseMove={onMove}
      onMouseLeave={() => onNodeHover(null)}
      onClick={onClickSvg}
    >
      <g ref={gRef}>
        {graph.edges.map((e) => {
          const a = positionsRef.current.get(e.source);
          const b = positionsRef.current.get(e.target);
          if (!a || !b) return null;
          return (
            <NetworkEdge
              key={`${e.source}-${e.target}-${e.type}`}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              type={e.type}
              faded={false}
            />
          );
        })}
        {graph.nodes.map((n) => {
          const p = positionsRef.current.get(n.id);
          if (!p) return null;
          return (
            <NetworkNode
              key={n.id}
              x={p.x} y={p.y}
              kind={n.kind}
              status={n.status}
              selected={n.id === selectedId}
              highlighted={highlightedIds.has(n.id)}
              inactive={n.inactive}
            />
          );
        })}
      </g>
    </svg>
  );
}
```

- [ ] **Step 2: Install `d3-selection` (transitive but not auto-installed)**

```bash
pnpm add d3-selection
pnpm add -D @types/d3-selection
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. If you see an error about `SimulationNodeDatum` — the type generic comes from `d3-force`. Verify imports.

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/network/network-graph.tsx package.json pnpm-lock.yaml
git commit -m "feat(network): force-directed graph with rAF batching + quadtree hit-test"
```

---

## Task 7: `/network` route + sidebar nav

**Goal:** Wire up the page so visiting `/network` renders the graph. Add the sidebar entry.

**Files:**
- Create: `src/app/network/page.tsx`
- Modify: `src/components/app-sidebar.tsx`

- [ ] **Step 1: Create the page**

Create `src/app/network/page.tsx`:

```tsx
"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { GraphNode } from "@/lib/network-graph-model";
import { useNetworkGraph } from "@/hooks/use-network-graph";
import { NetworkGraph } from "@/components/network/network-graph";

export default function NetworkPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { visibleGraph, isLoading } = useNetworkGraph();
  const [hovered, setHovered] = useState<GraphNode | null>(null);

  const selectedId = searchParams.get("selected");

  const onNodeClick = useCallback((node: GraphNode) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("selected", node.id);
    router.replace(`/network?${next.toString()}`, { scroll: false });
  }, [router, searchParams]);

  return (
    <div className="flex h-full flex-col">
      <header className="px-6 py-4">
        <h1 className="text-2xl font-semibold">Network</h1>
        <p className="text-sm text-muted-foreground">
          Aleph node topology — CCNs, CRNs, and their links.
        </p>
      </header>

      <div className="relative flex-1">
        {isLoading ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            Loading network…
          </div>
        ) : (
          <NetworkGraph
            graph={visibleGraph}
            selectedId={selectedId}
            highlightedIds={new Set()}
            onNodeHover={setHovered}
            onNodeClick={onNodeClick}
          />
        )}
        {hovered && (
          <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-foreground/[0.08] bg-surface/90 px-3 py-2 text-xs shadow-md backdrop-blur-sm">
            <div className="font-medium">{hovered.label}</div>
            <div className="text-muted-foreground">
              {hovered.kind.toUpperCase()} · {hovered.status}
            </div>
            <div className="font-mono text-[11px] text-muted-foreground">
              {hovered.id.slice(0, 12)}…
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the sidebar entry**

Edit `src/components/app-sidebar.tsx`. Two changes:

1. Extend `IconName` and `NavIcon`:

```ts
type IconName = "grid" | "server" | "cpu" | "warning" | "coins" | "network";
```

Add a case to the `NavIcon` switch (paste before the final default `case "coins"` block, or anywhere in the switch):

```tsx
case "network":
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24"
         stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M5 12h.01M12 5h.01M19 12h.01M12 19h.01M7.05 7.05l.01.01M16.95 7.05l.01.01M16.95 16.95l.01.01M7.05 16.95l.01.01"/>
      <circle cx="12" cy="12" r="3"/>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 9V5M12 15v4M9 12H5M15 12h4"/>
    </svg>
  );
```

2. Add the nav item under Resources, between VMs and Credits:

```ts
{
  title: "Resources",
  items: [
    { label: "Nodes", href: "/nodes", icon: "server" },
    { label: "VMs", href: "/vms", icon: "cpu" },
    { label: "Network", href: "/network", icon: "network" },
    { label: "Credits", href: "/credits", icon: "coins" },
  ],
},
```

- [ ] **Step 3: Smoke test in dev**

```bash
pnpm dev
```

Open `http://localhost:3000/network`. Expected: graph appears within ~1 s, simulation settles, mouse-hover surfaces the tooltip overlay. Click a node — URL updates with `?selected=<hash>` (no panel yet — that's Task 11).

- [ ] **Step 4: Commit**

```bash
git add src/app/network/page.tsx src/components/app-sidebar.tsx
git commit -m "feat(network): /network route + sidebar nav entry"
```

---

## Task 8: Layer toggles — `NetworkLayerToggles` + URL sync

**Goal:** Pill row above the graph that toggles each edge layer. URL `?layers=` reflects the active set.

**Files:**
- Create: `src/components/network/network-layer-toggles.tsx`
- Modify: `src/app/network/page.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/network/network-layer-toggles.tsx`:

```tsx
"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { GraphLayer } from "@/lib/network-graph-model";
import { parseLayers } from "@/hooks/use-network-graph";

const ALL: { id: GraphLayer; label: string }[] = [
  { id: "structural", label: "Structural" },
  { id: "owner",      label: "Owner" },
  { id: "staker",     label: "Stakers" },
  { id: "reward",     label: "Reward addr" },
];

export function NetworkLayerToggles() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = parseLayers(searchParams.get("layers"));

  const toggle = useCallback((id: GraphLayer) => {
    const next = new Set(active);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (next.size === 0) next.add("structural"); // never go fully empty

    const params = new URLSearchParams(searchParams.toString());
    if (next.size === 1 && next.has("structural")) params.delete("layers");
    else params.set("layers", [...next].join(","));

    router.replace(`/network?${params.toString()}`, { scroll: false });
  }, [active, router, searchParams]);

  return (
    <div className="flex flex-wrap items-center gap-2 px-6 pb-3">
      {ALL.map((l) => {
        const on = active.has(l.id);
        return (
          <button
            key={l.id}
            type="button"
            onClick={() => toggle(l.id)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              on
                ? "border-primary-500 bg-primary-600/10 text-primary-400"
                : "border-foreground/[0.08] text-muted-foreground hover:text-foreground"
            }`}
            style={{ transitionDuration: "var(--duration-fast)" }}
            aria-pressed={on}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Mount it in the page**

Edit `src/app/network/page.tsx` — add the import and render the toggles below the header:

```tsx
import { NetworkLayerToggles } from "@/components/network/network-layer-toggles";
```

```tsx
<header className="px-6 py-4">{/* …existing… */}</header>
<NetworkLayerToggles />
<div className="relative flex-1">{/* …graph… */}</div>
```

- [ ] **Step 3: Smoke test**

Run: `pnpm dev`. Toggle each pill — URL updates, edges fade in/out. Reload — state persists from URL.

- [ ] **Step 4: Commit**

```bash
git add src/components/network/network-layer-toggles.tsx src/app/network/page.tsx
git commit -m "feat(network): layer toggles with URL persistence"
```

---

## Task 9: Search + address-highlight + auto-fit

**Goal:** Page-local search input (hash / name / address) and the `?address=` deep-link. Both pan the viewport to fit the matching node(s) and highlight them.

**Files:**
- Create: `src/components/network/network-search.tsx`
- Modify: `src/components/network/network-graph.tsx`
- Modify: `src/app/network/page.tsx`

- [ ] **Step 1: Add `highlightedIds` aware auto-fit on `NetworkGraph`**

In `network-graph.tsx`, replace the existing "Reset zoom to fit when graph changes" effect with a smarter auto-fit that frames `highlightedIds` if any are present, otherwise the whole graph. Add this helper inside the file:

```ts
function fitTransform(
  nodes: SimNode[],
  ids: Set<string> | null,
  size: { w: number; h: number },
): { x: number; y: number; k: number } {
  const pool = ids && ids.size > 0
    ? nodes.filter((n) => ids.has(n.id))
    : nodes;
  if (pool.length === 0) return { x: 0, y: 0, k: 1 };

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of pool) {
    if (n.x == null || n.y == null) continue;
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
  }
  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;
  const k = Math.min(size.w / (dx * 1.4), size.h / (dy * 1.4), 4);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { x: size.w / 2 - cx * k, y: size.h / 2 - cy * k, k };
}
```

Replace the existing reset-zoom effect with:

```tsx
useEffect(() => {
  if (!svgRef.current || !zoomRef.current || simNodes.length === 0) return;
  // Wait one frame for positions to populate
  const id = requestAnimationFrame(() => {
    const t = fitTransform(simNodes, highlightedIds, size);
    select(svgRef.current!).transition().duration(450)
      .call(zoomRef.current!.transform, zoomIdentity.translate(t.x, t.y).scale(t.k));
  });
  return () => cancelAnimationFrame(id);
}, [graph, highlightedIds, size.w, size.h, simNodes]);
```

(`select` needs `transition` from `d3-transition` — install in step 2.)

- [ ] **Step 2: Install `d3-transition`**

```bash
pnpm add d3-transition
pnpm add -D @types/d3-transition
```

Add to top of `network-graph.tsx`:

```ts
import "d3-transition";
```

- [ ] **Step 3: Create the search component**

Create `src/components/network/network-search.tsx`:

```tsx
"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@aleph-front/ds/input";
import { useNetworkGraph } from "@/hooks/use-network-graph";

export function NetworkSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { fullGraph } = useNetworkGraph();
  const [q, setQ] = useState("");

  const onSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const needle = q.trim().toLowerCase();
    if (!needle) return;

    if (needle.startsWith("0x") && needle.length >= 6) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("address", needle);
      params.delete("selected");
      router.replace(`/network?${params.toString()}`, { scroll: false });
      return;
    }

    const match = fullGraph.nodes.find((n) =>
      n.id.toLowerCase().includes(needle) ||
      n.label.toLowerCase().includes(needle),
    );
    if (match) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("selected", match.id);
      router.replace(`/network?${params.toString()}`, { scroll: false });
    }
  }, [q, fullGraph, router, searchParams]);

  return (
    <form onSubmit={onSubmit} className="px-6 pb-3">
      <Input
        size="sm"
        placeholder="Search hash, name, or 0x address…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
    </form>
  );
}
```

- [ ] **Step 4: Compute `highlightedIds` from `?address=` in the page**

Edit `src/app/network/page.tsx`:

```tsx
const address = searchParams.get("address")?.toLowerCase() ?? null;

const highlightedIds = useMemo(() => {
  if (!address) return new Set<string>();
  return new Set(
    visibleGraph.nodes
      .filter((n) => n.owner?.toLowerCase() === address)
      .map((n) => n.id),
  );
}, [visibleGraph, address]);
```

Pass `highlightedIds` into `<NetworkGraph />`. Mount `<NetworkSearch />` next to `<NetworkLayerToggles />`.

Add the `useMemo` import.

- [ ] **Step 5: Smoke test**

Run: `pnpm dev`. Visit `/network?address=<some-owner-with-multiple-nodes>` — those nodes pulse, viewport auto-fits to them. Type a partial hash in the search box → press Enter → that node selected, viewport pans.

- [ ] **Step 6: Commit**

```bash
git add src/components/network/network-search.tsx \
        src/components/network/network-graph.tsx \
        src/app/network/page.tsx \
        package.json pnpm-lock.yaml
git commit -m "feat(network): search + ?address deep-link with auto-fit viewport"
```

---

## Task 10: Detail panel — kind-router

**Goal:** Click a node → side panel opens. The panel routes to the existing `node-detail-panel` for CCN/CRN; for staker/reward addresses it shows a compact wallet stub linking to `/wallet?address=…`.

**Files:**
- Create: `src/components/network/network-detail-panel.tsx`
- Modify: `src/app/network/page.tsx`

- [ ] **Step 1: Create the panel router**

Create `src/components/network/network-detail-panel.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Button } from "@aleph-front/ds/button";
import { Card } from "@aleph-front/ds/card";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { NodeDetailPanel } from "@/components/node-detail-panel";
import type { GraphNode } from "@/lib/network-graph-model";

type Props = {
  node: GraphNode | null;
  onClose: () => void;
  onFocus: (id: string) => void;
};

export function NetworkDetailPanel({ node, onClose, onFocus }: Props) {
  if (!node) return null;

  if (node.kind === "ccn" || node.kind === "crn") {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-4 pt-4">
          <Button size="xs" variant="text" onClick={() => onFocus(node.id)}>
            Focus on this node
          </Button>
          <Button size="xs" variant="text" onClick={onClose}>Close</Button>
        </div>
        <NodeDetailPanel hash={node.id} />
      </div>
    );
  }

  // staker / reward address
  return (
    <Card padding="lg" className="m-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {node.kind === "staker" ? "Staker" : "Reward address"}
        </span>
        <Button size="xs" variant="text" onClick={onClose}>Close</Button>
      </div>
      <CopyableText href={`/wallet?address=${node.id}`}>{node.id}</CopyableText>
      <div className="mt-3 flex gap-2">
        <Button size="xs" variant="outline" onClick={() => onFocus(node.id)}>
          Focus
        </Button>
        <Button size="xs" variant="text" asChild>
          <Link href={`/wallet?address=${node.id}`}>Open wallet view →</Link>
        </Button>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Wire selection in the page**

Edit `src/app/network/page.tsx`:

```tsx
const selectedNode = useMemo(
  () => visibleGraph.nodes.find((n) => n.id === selectedId) ?? null,
  [visibleGraph, selectedId],
);

const onClose = useCallback(() => {
  const params = new URLSearchParams(searchParams.toString());
  params.delete("selected");
  router.replace(`/network?${params.toString()}`, { scroll: false });
}, [router, searchParams]);

const onFocus = useCallback((id: string) => {
  const params = new URLSearchParams(searchParams.toString());
  params.set("focus", id);
  params.delete("selected");
  router.replace(`/network?${params.toString()}`, { scroll: false });
}, [router, searchParams]);
```

Render the panel as an inline sidebar on lg+ and a slide-in overlay on mobile (mirrors existing nodes/vms pages):

```tsx
<div className="relative flex flex-1">
  <div className="relative flex-1">{/* graph + tooltip */}</div>

  {/* Desktop sidebar */}
  <aside className={`hidden lg:block lg:w-[400px] ${selectedNode ? "" : "lg:hidden"}`}>
    <NetworkDetailPanel node={selectedNode} onClose={onClose} onFocus={onFocus} />
  </aside>

  {/* Mobile overlay */}
  {selectedNode && (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-background shadow-xl lg:hidden">
      <NetworkDetailPanel node={selectedNode} onClose={onClose} onFocus={onFocus} />
    </div>
  )}
</div>
```

- [ ] **Step 3: Smoke test**

Run: `pnpm dev`. Click a CCN — panel opens with full node detail. Click a CRN — same. Click a staker dot (after enabling the staker layer) — minimal address card appears.

- [ ] **Step 4: Commit**

```bash
git add src/components/network/network-detail-panel.tsx src/app/network/page.tsx
git commit -m "feat(network): kind-routed detail panel + selection wiring"
```

---

## Task 11: Focus mode — `NetworkFocusBanner`

**Goal:** When `?focus=<hash>` is present, the graph already shows the ego subgraph (Task 4). Add a banner above the graph: "Focused on `<name>` · `<n>` connections · Show all".

**Files:**
- Create: `src/components/network/network-focus-banner.tsx`
- Modify: `src/app/network/page.tsx`

- [ ] **Step 1: Create the banner**

Create `src/components/network/network-focus-banner.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@aleph-front/ds/button";
import type { GraphNode } from "@/lib/network-graph-model";

type Props = {
  focusNode: GraphNode | null;
  connectionCount: number;
};

export function NetworkFocusBanner({ focusNode, connectionCount }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  if (!focusNode) return null;

  const onShowAll = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("focus");
    router.replace(`/network?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="mx-6 mb-3 flex items-center justify-between rounded-md border border-primary-500/20 bg-primary-600/5 px-3 py-2 text-xs">
      <span>
        Focused on <span className="font-medium">{focusNode.label}</span>
        {" · "}
        <span className="text-muted-foreground">
          {connectionCount} connection{connectionCount === 1 ? "" : "s"}
        </span>
      </span>
      <Button size="xs" variant="text" onClick={onShowAll}>Show all</Button>
    </div>
  );
}
```

- [ ] **Step 2: Mount in the page**

Edit `src/app/network/page.tsx`:

```tsx
const { fullGraph, visibleGraph, focusId, isLoading } = useNetworkGraph();

const focusNode = useMemo(
  () => fullGraph.nodes.find((n) => n.id === focusId) ?? null,
  [fullGraph, focusId],
);
const focusConnections = focusNode
  ? Math.max(0, visibleGraph.nodes.length - 1)
  : 0;
```

Render `<NetworkFocusBanner focusNode={focusNode} connectionCount={focusConnections} />` between the layer toggles and the graph.

- [ ] **Step 3: Smoke test**

Run: `pnpm dev`. Click "Focus on this node" in the detail panel — graph shrinks to ego subgraph, banner appears. Click "Show all" — banner disappears, full graph returns. Back button does the right thing.

- [ ] **Step 4: Commit**

```bash
git add src/components/network/network-focus-banner.tsx src/app/network/page.tsx
git commit -m "feat(network): focus-mode banner + back-button-aware focus toggle"
```

---

## Task 12: Legend + visual polish

**Goal:** Bottom-left fixed legend explaining node shapes / sizes / edge styles. Also: ensure inactive nodes desaturate, status colors work in both themes.

**Files:**
- Create: `src/components/network/network-legend.tsx`
- Modify: `src/app/network/page.tsx`

- [ ] **Step 1: Create the legend**

Create `src/components/network/network-legend.tsx`:

```tsx
"use client";

export function NetworkLegend() {
  return (
    <div className="absolute bottom-4 left-4 rounded-md border border-foreground/[0.06] bg-surface/80 p-3 text-[11px] shadow-sm backdrop-blur-sm">
      <div className="mb-2 font-medium text-foreground">Legend</div>
      <ul className="space-y-1.5 text-muted-foreground">
        <li className="flex items-center gap-2">
          <svg width="22" height="14" viewBox="0 0 22 14">
            <circle cx="11" cy="7" r="6" fill="var(--color-success-500)" />
            <circle cx="11" cy="7" r="8" fill="none"
              stroke="var(--color-success-500)" strokeOpacity={0.4} />
          </svg>
          CCN (active)
        </li>
        <li className="flex items-center gap-2">
          <svg width="22" height="14" viewBox="0 0 22 14">
            <circle cx="11" cy="7" r="4" fill="var(--color-success-500)" />
          </svg>
          CRN (active)
        </li>
        <li className="flex items-center gap-2">
          <svg width="22" height="14" viewBox="0 0 22 14">
            <line x1="2" y1="7" x2="20" y2="7" stroke="currentColor"
              strokeOpacity={0.4} />
          </svg>
          Structural link
        </li>
        <li className="flex items-center gap-2">
          <svg width="22" height="14" viewBox="0 0 22 14">
            <line x1="2" y1="7" x2="20" y2="7"
              stroke="var(--color-info-500)" strokeOpacity={0.5}
              strokeDasharray="3 3" />
          </svg>
          Same owner
        </li>
        <li className="flex items-center gap-2">
          <svg width="22" height="14" viewBox="0 0 22 14">
            <line x1="2" y1="7" x2="20" y2="7"
              stroke="var(--color-warning-500)" strokeOpacity={0.4} />
          </svg>
          Stake link
        </li>
        <li className="flex items-center gap-2">
          <svg width="22" height="14" viewBox="0 0 22 14">
            <line x1="2" y1="7" x2="20" y2="7"
              stroke="var(--color-purple-500)" strokeOpacity={0.4}
              strokeDasharray="1 4" />
          </svg>
          Reward cluster
        </li>
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Render it inside the graph wrapper**

In `src/app/network/page.tsx`, mount `<NetworkLegend />` inside the `<div className="relative flex-1">` wrapper, after the graph and tooltip.

- [ ] **Step 3: Theme check**

Run: `pnpm dev`. Toggle light/dark theme — verify legend, edges, and node fills all swap cleanly via CSS vars.

- [ ] **Step 4: Commit**

```bash
git add src/components/network/network-legend.tsx src/app/network/page.tsx
git commit -m "feat(network): legend overlay"
```

---

## Task 13: Accessibility — keyboard nav + reduced motion + mobile fallback

**Goal:** Tab/Enter/Esc/F keyboard nav, aria labels, reduced-motion compliance, and a usable <768 px experience.

**Files:**
- Modify: `src/components/network/network-graph.tsx`
- Modify: `src/app/network/page.tsx`

- [ ] **Step 1: Add keyboard nav to the SVG**

In `network-graph.tsx`, add `tabIndex={0}` and an `onKeyDown` handler on `<svg>`:

```tsx
const onKeyDown = useCallback((e: React.KeyboardEvent<SVGSVGElement>) => {
  if (graph.nodes.length === 0) return;
  const sorted = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const currentIdx = selectedId
    ? sorted.findIndex((n) => n.id === selectedId)
    : -1;

  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
    e.preventDefault();
    const next = sorted[(currentIdx + 1 + sorted.length) % sorted.length]!;
    onNodeClick(next);
  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
    e.preventDefault();
    const next = sorted[(currentIdx - 1 + sorted.length) % sorted.length]!;
    onNodeClick(next);
  } else if (e.key === "Escape") {
    onNodeHover(null);
  }
}, [graph, selectedId, onNodeClick, onNodeHover]);
```

Add `tabIndex={0} onKeyDown={onKeyDown} aria-label="Network graph"` on `<svg>`. Add `role="button" aria-label={...}` on each rendered node group via a small wrapper inside `NetworkNode`:

In `network-node.tsx`, change the outer `<g>` to:

```tsx
<g
  opacity={opacity}
  role="img"
  aria-label={`${kind.toUpperCase()} ${status}`}
>
```

- [ ] **Step 2: Respect reduced motion in the auto-fit**

In `network-graph.tsx`, replace the auto-fit transition call:

```tsx
const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const sel = select(svgRef.current!);
if (reduced) {
  sel.call(zoomRef.current!.transform, zoomIdentity.translate(t.x, t.y).scale(t.k));
} else {
  sel.transition().duration(450)
    .call(zoomRef.current!.transform, zoomIdentity.translate(t.x, t.y).scale(t.k));
}
```

- [ ] **Step 3: Mobile fallback**

In `src/app/network/page.tsx`, render an alternative under `<768px` when no `?address` is set:

```tsx
{/* hide graph on mobile, show CCN list fallback */}
<div className="md:hidden p-6">
  <p className="mb-4 text-sm text-muted-foreground">
    Network graph is best on a larger screen. Pick a CCN to inspect:
  </p>
  <ul className="space-y-2">
    {fullGraph.nodes
      .filter((n) => n.kind === "ccn")
      .slice(0, 50)
      .map((n) => (
        <li key={n.id}>
          <Link href={`/network?focus=${n.id}`}
            className="block rounded-md border border-foreground/[0.06] px-3 py-2 text-sm">
            {n.label}
          </Link>
        </li>
      ))}
  </ul>
</div>
<div className="hidden md:flex md:flex-1">{/* existing graph layout */}</div>
```

If `?address` IS set on mobile, the existing `?address` highlight still shows the graph — keep that path.

- [ ] **Step 4: Smoke tests**

- Tab to the graph; arrow keys cycle nodes; Esc clears hover.
- DevTools → Rendering → Emulate `prefers-reduced-motion: reduce` → reload → no pulse, no zoom transition.
- Resize to 375 px → fallback list appears.

- [ ] **Step 5: Commit**

```bash
git add src/components/network/network-graph.tsx \
        src/components/network/network-node.tsx \
        src/app/network/page.tsx
git commit -m "feat(network): keyboard nav, reduced-motion, mobile fallback"
```

---

## Task 14: Verify and refine

**Goal:** Run the full project checks and walk the smoke checklist from the design doc.

- [ ] **Step 1: Run full project checks**

```bash
pnpm check
```

Expected: `lint`, `typecheck`, and `vitest` all clean. Fix any warnings before continuing — the project's "zero warnings policy" applies.

- [ ] **Step 2: Manual smoke test (the spec's verification list)**

Walk every item from `docs/plans/2026-05-07-network-graph-design.md` § Verification. Make notes in this plan if anything is broken; fix in place rather than deferring.

- [ ] **Step 3: Re-run checks**

```bash
pnpm check
```

Expected: still clean.

- [ ] **Step 4: Preview in dev**

Tell the user: "Ready to preview? Run `preview start feature/network-graph`." Wait for approval before proceeding to docs (Task 15).

---

## Task 15: Update docs and version

**Goal:** Per CLAUDE.md "Plans Must Include Verification and Doc Updates" — touch all five docs and the changelog before merge.

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/BACKLOG.md`
- Modify: `CLAUDE.md`
- Modify: `src/changelog.ts`

- [ ] **Step 1: ARCHITECTURE.md — new "Network graph" section**

Add a section under "Recipes" or its own top-level section:
- Data flow: `useNodeState` → `buildGraph(state, layers)` → `egoSubgraph(focusId?)` → `<NetworkGraph />`.
- D3+React decoupling rule: simulation mutates a positions ref; React re-renders once per `requestAnimationFrame`. Hit-testing via `d3-quadtree`.
- URL is the source of truth: `?layers`, `?focus`, `?selected`, `?address` — back/forward works.
- Add a one-liner under "Files" mapping the new components and lib modules.

- [ ] **Step 2: DECISIONS.md — log Decision #70**

Add at the top of the decisions list:

```
## Decision #70 - 2026-05-07
**Context:** Need a topology view for CCN ↔ CRN relationships, with optional owner / staker / reward overlays. Backlogged since 2026-03-20. Considered Sigma.js + graphology + react-sigma (~120 kB, WebGL, layer toggles built in), D3-force + React SVG (~30 kB, full visual control), and react-force-graph-2d (~150 kB, canvas).
**Decision:** D3-force + React SVG. Layout in d3 (`d3-force` + `d3-zoom` + `d3-drag` + `d3-quadtree`), DOM in React, decoupled via `requestAnimationFrame`-batched re-renders. Hit-testing via quadtree.
**Rationale:** Composes naturally with the project's existing SVG-first viz patterns (worldmap, sparkline). Smallest bundle add. Native `<circle>` event semantics for hover/click/keyboard. At realistic scale (default ~600 nodes, worst case ~2k with all four layers on) d3-force is comfortably fast; the WebGL ceiling Sigma.js provides isn't needed.
**Alternatives considered:** Sigma.js (overkill at this scale, less aesthetic control), react-force-graph (canvas painting via callbacks, manual hit-testing for non-circle hover regions, less natural fit), Cytoscape.js (rich graph algorithms not needed, not React-native).
```

- [ ] **Step 3: BACKLOG.md — move + add follow-ups**

Move "2026-03-20 - CCN→CRN topology view" out of Needs planning into Completed:

```
- ✅ 2026-05-07 - Network graph page with CCN ↔ CRN structural edges (default), opt-in owner / staker / reward overlays, URL-driven focus mode (`?focus=<hash>` re-runs simulation on ego subgraph), `?address=` deep-link with auto-fit + pulse, hover tooltip + side panel that delegates to existing node-detail components, keyboard nav, reduced-motion respect, mobile fallback (Decision #70)
```

Add three follow-ups under Roadmap ideations:

```
### 2026-05-07 - Move force simulation to a Web Worker
**Source:** Network graph implementation (Decision #70)
**Description:** Profile shows the simulation tick can stutter at 2k+ nodes. Moving `forceSimulation` into a Web Worker (`simulation.run()` no longer blocks the main thread) is the clean path. Not in v1 — measure first.

### 2026-05-07 - "Top operators" sidebar on /network
**Description:** A small leaderboard inside the page (or the detail panel) listing the top-N owners by node count, each clickable into `?address=…`. Quick discovery for "who runs the most".

### 2026-05-07 - Edge filtering by node score range
**Description:** Slider that hides edges where either endpoint has a score below threshold — useful for cleaning up clutter from low-quality nodes.
```

- [ ] **Step 4: CLAUDE.md — Current Features**

Append to the Current Features list:

```
- Network page (`/network`): force-directed graph of CCNs and CRNs with layered edges (Structural by default; Owner / Stakers / Reward addr toggleable via URL `?layers=`); hover tooltip with primary details, click → side panel that routes to existing node-detail / vm-detail content for CCN/CRN nodes or a wallet stub for staker/reward addresses; focus mode via `?focus=<hash>` re-runs the simulation on the ego subgraph (focused node + 1-hop neighbors), with a "Show all" banner; deep-link `/network?address=0x…` highlights all of an operator's nodes with a pulse and auto-fits the viewport; search by hash / name / `0x` address. Keyboard nav (arrows cycle nodes, Esc clears hover), `prefers-reduced-motion` respected, mobile fallback CCN list <768 px.
```

- [ ] **Step 5: changelog.ts — bump minor + add VersionEntry**

Bump `CURRENT_VERSION` in `src/changelog.ts` (minor: feature). Add a `VersionEntry`:

```ts
{
  version: "0.X.0",       // next minor
  date: "2026-05-07",
  changes: [
    {
      type: "Feature",
      text: "New /network page renders the Aleph topology as a force-directed graph. CCN ↔ CRN structural edges by default; toggleable Owner / Staker / Reward overlays. Hover for details, click for the side panel, click \"Focus\" to re-run the simulation on a node's ego network. Deep-link /network?address=0x… highlights an operator's whole fleet and auto-fits the viewport. Search by hash, name, or 0x address.",
    },
  ],
},
```

- [ ] **Step 6: Re-run checks once more**

```bash
pnpm check
```

Expected: clean.

- [ ] **Step 7: Add the plan-status frontmatter to this plan file**

At the top of `docs/plans/2026-05-07-network-graph-plan.md`, prepend:

```
---
status: done
branch: feature/network-graph
date: 2026-05-07
note: <one-liner if anything notable happened during execution>
---

```

- [ ] **Step 8: Commit**

```bash
git add docs/ARCHITECTURE.md docs/DECISIONS.md docs/BACKLOG.md \
        CLAUDE.md src/changelog.ts \
        docs/plans/2026-05-07-network-graph-plan.md
git commit -m "docs: log network graph feature in all four docs + bump version"
```

- [ ] **Step 9: Hand off to `/dio:ship`**

When the user says "ship" / "merge this", invoke `/dio:ship`. The skill handles: catch-up rebase, doc audit, `pnpm check`, preview gate, commit any drift, push, PR, squash-merge, sync local main, branch cleanup. Per CLAUDE.md "Finishing a branch", do not merge locally.
