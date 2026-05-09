---
status: done
branch: feature/network-graph
date: 2026-05-09
note: awaiting user preview
---

# Network Graph Node Panel Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the network graph's 400px slide-in side panel with a smaller floating right-edge card that doesn't block the map or toolbar, and renders meaningful content for all four node kinds (CCN, CRN, staker, reward) using only graph-relevant facts.

**Architecture:** A shared shell (`NetworkDetailPanel`) renders the header (title + Focus + Close) and footer ("View full details" for CCN/CRN), and dispatches to one of three presentational body components based on `node.kind`. The shell reads from `nodeState` (now exposed by `useNetworkGraph`) so CCN content stops being empty. The CRN body keeps using `useNode(hash)` for resource bars / VM count. Stakers and reward addresses get a simple address + visible-degree body. The page wrapper changes `aside` from `right-0 top-0 bottom-0 w-[400px]` to `right-4 top-20 bottom-4 w-[280px]` with a rounded border so the toolbar/search and most of the map stay uncovered. The `onFocus` callback now sets both `?focus` and `?selected` so the panel stays open after focusing.

**Tech Stack:** Next.js 16 (App Router, static export), TypeScript (strict), Tailwind CSS 4, `@aleph-front/ds` components (Badge, Button, Card, CopyableText, StatusDot, Skeleton), Vitest + Testing Library.

---

## File Structure

**Modify:**
- `src/hooks/use-network-graph.ts` — expose `nodeState` on the returned object.
- `src/components/network/network-detail-panel.tsx` — rewrite as shell + dispatcher.
- `src/app/network/page.tsx` — new panel positioning + `onFocus` keeps panel open.

**Create:**
- `src/components/network/network-detail-panel-ccn.tsx` — CCN body.
- `src/components/network/network-detail-panel-crn.tsx` — CRN body.
- `src/components/network/network-detail-panel-address.tsx` — staker / reward body.
- `src/components/network/network-detail-panel.test.tsx` — shell + dispatch tests.
- `src/components/network/network-detail-panel-ccn.test.tsx` — CCN body tests.
- `src/components/network/network-detail-panel-crn.test.tsx` — CRN body tests.
- `src/components/network/network-detail-panel-address.test.tsx` — address body tests.

---

### Task 1: Expose `nodeState` from `useNetworkGraph`

**Files:**
- Modify: `src/hooks/use-network-graph.ts`

The shell needs to look up `CCNInfo`/`CRNInfo` for the selected node without making a second API call. `useNetworkGraph` already calls `useNodeState()` internally; we just expose the result on its return value.

- [ ] **Step 1: Update the return type and the returned object**

Replace `src/hooks/use-network-graph.ts` with:

```typescript
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
import type { NodeState } from "@/api/credit-types";

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
  isFetching: boolean;
  nodeState: NodeState | undefined;
};

export function useNetworkGraph(): UseNetworkGraphResult {
  const searchParams = useSearchParams();
  const { data: state, isLoading, isFetching } = useNodeState();

  const layersParam = searchParams.get("layers");
  const layers = useMemo(() => parseLayers(layersParam), [layersParam]);
  const focusId = searchParams.get("focus");

  const fullGraph = useMemo<Graph>(() => {
    if (!state) return { nodes: [], edges: [] };
    return buildGraph(state, layers);
  }, [state, layers]);

  const visibleGraph = useMemo<Graph>(() => {
    if (!focusId) return fullGraph;
    return egoSubgraph(fullGraph, focusId);
  }, [fullGraph, focusId]);

  return {
    fullGraph,
    visibleGraph,
    layers,
    focusId,
    isLoading,
    isFetching,
    nodeState: state,
  };
}
```

- [ ] **Step 2: Run typecheck to verify nothing else relies on the old shape**

Run: `pnpm typecheck`
Expected: PASS — `nodeState` is additive, no existing consumer breaks.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-network-graph.ts
git commit -m "feat(network): expose nodeState from useNetworkGraph"
```

---

### Task 2: Address body component (staker / reward)

**Files:**
- Create: `src/components/network/network-detail-panel-address.tsx`
- Create: `src/components/network/network-detail-panel-address.test.tsx`

Simplest body. Pure presentational — receives the node, the visible-graph degree count, and the close handler.

- [ ] **Step 1: Write the failing test**

Create `src/components/network/network-detail-panel-address.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NetworkDetailPanelAddress } from "@/components/network/network-detail-panel-address";
import type { GraphNode } from "@/lib/network-graph-model";

const STAKER: GraphNode = {
  id: "0xab12cd34ef56ab12cd34ef56ab12cd34ef56ab12",
  kind: "staker",
  label: "0xab12cd34ef56ab12cd34ef56ab12cd34ef56ab12",
  status: "active",
  owner: null,
  reward: null,
  inactive: false,
};

describe("NetworkDetailPanelAddress", () => {
  it("renders the kind label and degree summary when degree > 0", () => {
    render(<NetworkDetailPanelAddress node={STAKER} degree={4} />);
    expect(screen.getByText("Staker")).toBeInTheDocument();
    expect(screen.getByText(/Connected to 4 CCNs/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open wallet view/i }),
    ).toHaveAttribute(
      "href",
      `/wallet?address=${STAKER.id}`,
    );
  });

  it("hides the degree line when degree is 0", () => {
    render(<NetworkDetailPanelAddress node={STAKER} degree={0} />);
    expect(screen.queryByText(/Connected to/i)).not.toBeInTheDocument();
  });

  it("renders 'Reward address' for kind=reward", () => {
    render(
      <NetworkDetailPanelAddress
        node={{ ...STAKER, kind: "reward" }}
        degree={2}
      />,
    );
    expect(screen.getByText("Reward address")).toBeInTheDocument();
    expect(screen.getByText(/Connected to 2 nodes/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/network/network-detail-panel-address.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `src/components/network/network-detail-panel-address.tsx`:

```tsx
"use client";

import Link from "next/link";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import type { GraphNode } from "@/lib/network-graph-model";

type Props = {
  node: GraphNode;
  degree: number;
};

export function NetworkDetailPanelAddress({ node, degree }: Props) {
  const kindLabel = node.kind === "staker" ? "Staker" : "Reward address";
  const noun = node.kind === "staker" ? "CCNs" : "nodes";

  return (
    <div className="space-y-3 px-4 py-3 text-sm">
      <div>
        <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
          {kindLabel}
        </div>
        <CopyableText
          text={node.id}
          startChars={8}
          endChars={8}
          size="sm"
          href={`/wallet?address=${node.id}`}
        />
      </div>

      {degree > 0 && (
        <p className="text-xs text-muted-foreground">
          Connected to {degree} {noun} in the visible graph.
        </p>
      )}

      <Link
        href={`/wallet?address=${node.id}`}
        className="block text-sm font-medium text-primary-300 hover:underline"
      >
        Open wallet view →
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/network/network-detail-panel-address.test.tsx`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/network/network-detail-panel-address.tsx src/components/network/network-detail-panel-address.test.tsx
git commit -m "feat(network): address-node panel body"
```

---

### Task 3: CCN body component

**Files:**
- Create: `src/components/network/network-detail-panel-ccn.tsx`
- Create: `src/components/network/network-detail-panel-ccn.test.tsx`

Reads from `CCNInfo` (already loaded). No external API calls.

- [ ] **Step 1: Write the failing test**

Create `src/components/network/network-detail-panel-ccn.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NetworkDetailPanelCCN } from "@/components/network/network-detail-panel-ccn";
import type { CCNInfo } from "@/api/credit-types";

const ACTIVE_CCN: CCNInfo = {
  hash: "ccn-hash-1",
  name: "aleph-prod-01",
  owner: "0xab12cd34ef56ab12cd34ef56ab12cd34ef56ab12",
  reward: "0xee99ff88aa77bb66cc55dd44ee33ff22aa11bb00",
  score: 0.94,
  status: "active",
  stakers: { "0xstaker1": 100, "0xstaker2": 200, "0xstaker3": 300 },
  totalStaked: 1_243_500,
  inactiveSince: null,
  resourceNodes: ["crn-1", "crn-2", "crn-3", "crn-4"],
};

describe("NetworkDetailPanelCCN", () => {
  it("renders identity, score, counts, total staked, owner and reward", () => {
    render(<NetworkDetailPanelCCN info={ACTIVE_CCN} />);
    expect(screen.getByText("CCN")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("0.94")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("CRNs attached")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Stakers")).toBeInTheDocument();
    expect(screen.getByText(/1,243,500\s+ALEPH/)).toBeInTheDocument();
  });

  it("uses the inactive chip variant when inactiveSince is set", () => {
    render(
      <NetworkDetailPanelCCN
        info={{ ...ACTIVE_CCN, inactiveSince: 1700000000 }}
      />,
    );
    const chip = screen.getByText("active").closest("span");
    expect(chip?.className).toMatch(/badge|default|muted/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/network/network-detail-panel-ccn.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `src/components/network/network-detail-panel-ccn.tsx`:

```tsx
"use client";

import { Badge } from "@aleph-front/ds/badge";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import type { CCNInfo } from "@/api/credit-types";

type Props = {
  info: CCNInfo;
};

const ALEPH_FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function ccnChipVariant(
  info: CCNInfo,
): "success" | "warning" | "default" {
  if (info.inactiveSince != null) return "default";
  if (info.status === "active") return "success";
  return "warning";
}

export function NetworkDetailPanelCCN({ info }: Props) {
  const crnCount = info.resourceNodes.length;
  const stakerCount = Object.keys(info.stakers).length;

  return (
    <div className="space-y-4 px-4 py-3 text-sm">
      <dl className="space-y-1.5">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Type</dt>
          <dd className="font-medium">CCN</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <Badge fill="outline" variant={ccnChipVariant(info)} size="sm">
              {info.status}
            </Badge>
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Score</dt>
          <dd className="font-mono text-xs">{info.score.toFixed(2)}</dd>
        </div>
      </dl>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-foreground/[0.06] bg-foreground/[0.03] p-2.5">
          <div className="text-lg font-semibold leading-tight">{crnCount}</div>
          <div className="text-[11px] text-muted-foreground">CRNs attached</div>
        </div>
        <div className="rounded-lg border border-foreground/[0.06] bg-foreground/[0.03] p-2.5">
          <div className="text-lg font-semibold leading-tight">
            {stakerCount}
          </div>
          <div className="text-[11px] text-muted-foreground">Stakers</div>
        </div>
      </div>

      <div className="space-y-1 border-t border-edge pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Total staked
        </h4>
        <p className="font-mono text-sm">
          {ALEPH_FMT.format(info.totalStaked)} ALEPH
        </p>
      </div>

      <div className="space-y-1 border-t border-edge pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Owner
        </h4>
        <CopyableText
          text={info.owner}
          startChars={8}
          endChars={8}
          size="sm"
          href={`/wallet?address=${info.owner}`}
        />
      </div>

      <div className="space-y-1 border-t border-edge pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Reward
        </h4>
        <CopyableText
          text={info.reward}
          startChars={8}
          endChars={8}
          size="sm"
          href={`/wallet?address=${info.reward}`}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/network/network-detail-panel-ccn.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/network/network-detail-panel-ccn.tsx src/components/network/network-detail-panel-ccn.test.tsx
git commit -m "feat(network): CCN panel body"
```

---

### Task 4: CRN body component

**Files:**
- Create: `src/components/network/network-detail-panel-crn.tsx`
- Create: `src/components/network/network-detail-panel-crn.test.tsx`

Reads `CRNInfo` for graph-side facts and the parent `CCNInfo` lookup; uses `useNode(hash)` for resource bars + VM count. Renders skeletons while `useNode` loads, and gracefully omits the resources section if `useNode` returns null.

- [ ] **Step 1: Write the failing test**

Create `src/components/network/network-detail-panel-crn.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NetworkDetailPanelCRN } from "@/components/network/network-detail-panel-crn";
import type { CCNInfo, CRNInfo } from "@/api/credit-types";
import type { Node } from "@/api/types";

const CRN: CRNInfo = {
  hash: "crn-hash-1",
  name: "crn-eu-west-04",
  owner: "0xab12cd34ef56ab12cd34ef56ab12cd34ef56ab12",
  reward: "0xee99ff88aa77bb66cc55dd44ee33ff22aa11bb00",
  score: 0.88,
  status: "active",
  inactiveSince: null,
  parent: "ccn-hash-1",
};

const PARENT: CCNInfo = {
  hash: "ccn-hash-1",
  name: "aleph-prod-01",
  owner: "0x0000000000000000000000000000000000000000",
  reward: "0x0000000000000000000000000000000000000000",
  score: 0.94,
  status: "active",
  stakers: {},
  totalStaked: 0,
  inactiveSince: null,
  resourceNodes: ["crn-hash-1"],
};

vi.mock("@/hooks/use-nodes", () => ({
  useNode: vi.fn(),
}));

import { useNode } from "@/hooks/use-nodes";
const useNodeMock = vi.mocked(useNode);

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("NetworkDetailPanelCRN", () => {
  it("renders identity, parent CCN, and owner; resources skeleton while loading", () => {
    useNodeMock.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useNode>);

    renderWithQuery(
      <NetworkDetailPanelCRN info={CRN} parent={PARENT} onFocusParent={() => {}} />,
    );
    expect(screen.getByText("CRN")).toBeInTheDocument();
    expect(screen.getByText("aleph-prod-01")).toBeInTheDocument();
    expect(screen.getByText("Resources")).toBeInTheDocument();
  });

  it("renders resource bars and VM count when scheduler data is available", () => {
    const node = {
      hash: "crn-hash-1",
      vms: [{}, {}, {}, {}, {}, {}, {}],
      resources: {
        vcpusTotal: 32,
        memoryTotalMb: 131072,
        diskTotalMb: 0,
        cpuUsagePct: 62,
        memoryUsagePct: 48,
        diskUsagePct: 0,
      },
    } as unknown as Node;
    useNodeMock.mockReturnValue({
      data: node,
      isLoading: false,
    } as unknown as ReturnType<typeof useNode>);

    renderWithQuery(
      <NetworkDetailPanelCRN info={CRN} parent={PARENT} onFocusParent={() => {}} />,
    );
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText(/CPU.*32 vCPUs/)).toBeInTheDocument();
    expect(screen.getByText(/Memory.*128 GB/)).toBeInTheDocument();
  });

  it("omits resources when scheduler returns no data", () => {
    useNodeMock.mockReturnValue({
      data: null,
      isLoading: false,
    } as unknown as ReturnType<typeof useNode>);

    renderWithQuery(
      <NetworkDetailPanelCRN info={CRN} parent={PARENT} onFocusParent={() => {}} />,
    );
    expect(screen.queryByText("Resources")).not.toBeInTheDocument();
  });

  it("renders an em-dash when there is no parent CCN", () => {
    useNodeMock.mockReturnValue({
      data: null,
      isLoading: false,
    } as unknown as ReturnType<typeof useNode>);

    renderWithQuery(
      <NetworkDetailPanelCRN
        info={{ ...CRN, parent: null }}
        parent={null}
        onFocusParent={() => {}}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/network/network-detail-panel-crn.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `src/components/network/network-detail-panel-crn.tsx`:

```tsx
"use client";

import { Badge } from "@aleph-front/ds/badge";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { Skeleton } from "@aleph-front/ds/ui/skeleton";
import { ResourceBar } from "@/components/resource-bar";
import { useNode } from "@/hooks/use-nodes";
import type { CCNInfo, CRNInfo } from "@/api/credit-types";

type Props = {
  info: CRNInfo;
  parent: CCNInfo | null;
  onFocusParent: (parentId: string) => void;
};

function crnChipVariant(
  info: CRNInfo,
): "success" | "warning" | "default" {
  if (info.inactiveSince != null) return "default";
  if (info.status === "active") return "success";
  return "warning";
}

export function NetworkDetailPanelCRN({ info, parent, onFocusParent }: Props) {
  const { data: node, isLoading } = useNode(info.hash);

  return (
    <div className="space-y-4 px-4 py-3 text-sm">
      <dl className="space-y-1.5">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Type</dt>
          <dd className="font-medium">CRN</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <Badge fill="outline" variant={crnChipVariant(info)} size="sm">
              {info.status}
            </Badge>
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">VMs</dt>
          <dd>
            {isLoading ? (
              <Skeleton className="h-4 w-6" />
            ) : node ? (
              <span className="font-medium">{node.vms.length}</span>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="space-y-1 border-t border-edge pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Parent CCN
        </h4>
        {parent ? (
          <button
            type="button"
            onClick={() => onFocusParent(parent.hash)}
            className="text-left text-sm font-medium text-primary-300 hover:underline"
          >
            {parent.name} →
          </button>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </div>

      {(isLoading || (node?.resources && node.resources.vcpusTotal > 0)) && (
        <div className="space-y-2 border-t border-edge pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Resources
          </h4>
          {isLoading || !node?.resources ? (
            <>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  CPU · {node.resources.vcpusTotal} vCPUs
                </span>
                <ResourceBar value={node.resources.cpuUsagePct} label="CPU" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Memory · {Math.round(node.resources.memoryTotalMb / 1024)} GB
                </span>
                <ResourceBar
                  value={node.resources.memoryUsagePct}
                  label="Memory"
                />
              </div>
            </>
          )}
        </div>
      )}

      <div className="space-y-1 border-t border-edge pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Owner
        </h4>
        <CopyableText
          text={info.owner}
          startChars={8}
          endChars={8}
          size="sm"
          href={`/wallet?address=${info.owner}`}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/network/network-detail-panel-crn.test.tsx`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/network/network-detail-panel-crn.tsx src/components/network/network-detail-panel-crn.test.tsx
git commit -m "feat(network): CRN panel body"
```

---

### Task 5: Shell + dispatcher (rewrite `network-detail-panel.tsx`)

**Files:**
- Modify: `src/components/network/network-detail-panel.tsx`
- Create: `src/components/network/network-detail-panel.test.tsx`

Replace the existing component. Owns the outer card chrome, the header (status dot + title + Focus + ×), the optional footer ("View full details"), and dispatches to one of the three bodies based on `node.kind`. Looks up `CCNInfo` / `CRNInfo` from `nodeState`. Computes the visible-graph degree for staker / reward bodies.

- [ ] **Step 1: Write the failing test**

Create `src/components/network/network-detail-panel.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NetworkDetailPanel } from "@/components/network/network-detail-panel";
import type { NodeState } from "@/api/credit-types";
import type { Graph, GraphNode } from "@/lib/network-graph-model";

vi.mock("@/hooks/use-nodes", () => ({
  useNode: () => ({ data: null, isLoading: false }),
}));

const CCN_NODE: GraphNode = {
  id: "ccn-hash-1",
  kind: "ccn",
  label: "aleph-prod-01",
  status: "active",
  owner: "0xab12cd34ef56ab12cd34ef56ab12cd34ef56ab12",
  reward: "0xee99ff88aa77bb66cc55dd44ee33ff22aa11bb00",
  inactive: false,
};

const NODE_STATE: NodeState = {
  ccns: new Map([
    [
      "ccn-hash-1",
      {
        hash: "ccn-hash-1",
        name: "aleph-prod-01",
        owner: CCN_NODE.owner!,
        reward: CCN_NODE.reward!,
        score: 0.94,
        status: "active",
        stakers: { "0x1": 100 },
        totalStaked: 1000,
        inactiveSince: null,
        resourceNodes: ["crn-1", "crn-2"],
      },
    ],
  ]),
  crns: new Map(),
};

const EMPTY_GRAPH: Graph = { nodes: [], edges: [] };

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("NetworkDetailPanel", () => {
  it("renders the CCN body with title and view-full-details footer", () => {
    renderWithQuery(
      <NetworkDetailPanel
        node={CCN_NODE}
        nodeState={NODE_STATE}
        visibleGraph={EMPTY_GRAPH}
        onClose={() => {}}
        onFocus={() => {}}
      />,
    );
    expect(screen.getByText("aleph-prod-01")).toBeInTheDocument();
    expect(screen.getByText("CRNs attached")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View full details/i }))
      .toHaveAttribute("href", "/nodes?view=ccn-hash-1");
  });

  it("calls onFocus with the node id when Focus is clicked", async () => {
    const onFocus = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <NetworkDetailPanel
        node={CCN_NODE}
        nodeState={NODE_STATE}
        visibleGraph={EMPTY_GRAPH}
        onClose={() => {}}
        onFocus={onFocus}
      />,
    );
    await user.click(screen.getByRole("button", { name: /^Focus$/i }));
    expect(onFocus).toHaveBeenCalledWith("ccn-hash-1");
  });

  it("calls onClose when × is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <NetworkDetailPanel
        node={CCN_NODE}
        nodeState={NODE_STATE}
        visibleGraph={EMPTY_GRAPH}
        onClose={onClose}
        onFocus={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders address body without footer for staker nodes", () => {
    const stakerNode: GraphNode = {
      id: "0xstaker",
      kind: "staker",
      label: "0xstaker",
      status: "active",
      owner: null,
      reward: null,
      inactive: false,
    };
    const graphWithEdges: Graph = {
      nodes: [],
      edges: [
        { source: "0xstaker", target: "ccn-1", type: "staker" },
        { source: "0xstaker", target: "ccn-2", type: "staker" },
      ],
    };
    renderWithQuery(
      <NetworkDetailPanel
        node={stakerNode}
        nodeState={NODE_STATE}
        visibleGraph={graphWithEdges}
        onClose={() => {}}
        onFocus={() => {}}
      />,
    );
    expect(screen.getByText("Staker")).toBeInTheDocument();
    expect(screen.getByText(/Connected to 2 CCNs/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /View full details/i }),
    ).not.toBeInTheDocument();
  });

  it("returns null when node is null", () => {
    const { container } = renderWithQuery(
      <NetworkDetailPanel
        node={null}
        nodeState={NODE_STATE}
        visibleGraph={EMPTY_GRAPH}
        onClose={() => {}}
        onFocus={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify the new shape fails**

Run: `pnpm vitest run src/components/network/network-detail-panel.test.tsx`
Expected: FAIL — props don't match the rewritten interface (today's component takes only `node`, `onClose`, `onFocus`).

- [ ] **Step 3: Replace the component**

Replace the entire contents of `src/components/network/network-detail-panel.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { X } from "@phosphor-icons/react";
import { Button } from "@aleph-front/ds/button";
import { StatusDot } from "@aleph-front/ds/status-dot";
import type { NodeState } from "@/api/credit-types";
import type { Graph, GraphNode } from "@/lib/network-graph-model";
import { NetworkDetailPanelAddress } from "@/components/network/network-detail-panel-address";
import { NetworkDetailPanelCCN } from "@/components/network/network-detail-panel-ccn";
import { NetworkDetailPanelCRN } from "@/components/network/network-detail-panel-crn";

type Props = {
  node: GraphNode | null;
  nodeState: NodeState | undefined;
  visibleGraph: Graph;
  onClose: () => void;
  onFocus: (id: string) => void;
};

function dotStatusFor(node: GraphNode): "success" | "error" | "warning" | "info" {
  if (node.inactive) return "info";
  if (node.kind === "staker" || node.kind === "reward") return "info";
  if (node.status === "active") return "success";
  if (node.status === "unreachable" || node.status === "unknown")
    return "error";
  return "warning";
}

function titleFor(node: GraphNode): string {
  if (node.kind === "staker") return "Staker";
  if (node.kind === "reward") return "Reward address";
  return node.label || node.id.slice(0, 10) + "…";
}

function countDegree(graph: Graph, id: string): number {
  let n = 0;
  for (const e of graph.edges) {
    if (e.source === id || e.target === id) n++;
  }
  return n;
}

export function NetworkDetailPanel({
  node,
  nodeState,
  visibleGraph,
  onClose,
  onFocus,
}: Props) {
  if (!node) return null;

  const showFooter = node.kind === "ccn" || node.kind === "crn";

  return (
    <section
      className="flex h-full flex-col"
      style={{
        animation: "fade-in var(--duration-normal) ease-out",
        animationFillMode: "both",
        opacity: 0,
      }}
    >
      <header className="flex items-center justify-between gap-2 border-b border-foreground/[0.06] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot status={dotStatusFor(node)} />
          <h3 className="truncate text-sm font-semibold">{titleFor(node)}</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button size="xs" variant="text" onClick={() => onFocus(node.id)}>
            Focus
          </Button>
          <Button
            size="xs"
            variant="text"
            onClick={onClose}
            aria-label="Close panel"
            iconLeft={<X weight="bold" />}
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {node.kind === "ccn" && nodeState?.ccns.get(node.id) && (
          <NetworkDetailPanelCCN info={nodeState.ccns.get(node.id)!} />
        )}
        {node.kind === "crn" && nodeState?.crns.get(node.id) && (
          <NetworkDetailPanelCRN
            info={nodeState.crns.get(node.id)!}
            parent={
              nodeState.crns.get(node.id)!.parent
                ? nodeState.ccns.get(
                    nodeState.crns.get(node.id)!.parent!,
                  ) ?? null
                : null
            }
            onFocusParent={onFocus}
          />
        )}
        {(node.kind === "staker" || node.kind === "reward") && (
          <NetworkDetailPanelAddress
            node={node}
            degree={countDegree(visibleGraph, node.id)}
          />
        )}
      </div>

      {showFooter && (
        <footer className="border-t border-foreground/[0.06] px-4 py-3">
          <Link
            href={`/nodes?view=${node.id}`}
            className="text-sm font-medium text-primary-300 hover:underline"
          >
            View full details →
          </Link>
        </footer>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run shell tests to verify they pass**

Run: `pnpm vitest run src/components/network/network-detail-panel.test.tsx`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS — but `network/page.tsx` is still passing the old props shape, so this will fail. That's expected; Task 6 fixes it. If it does fail, note this and continue.

If typecheck fails on `src/app/network/page.tsx` only with a "missing property `nodeState` / `visibleGraph`" or "extra property" complaint, that's the intended state — proceed to commit and continue to Task 6.

- [ ] **Step 6: Commit**

```bash
git add src/components/network/network-detail-panel.tsx src/components/network/network-detail-panel.test.tsx
git commit -m "feat(network): rewrite detail panel as shell + dispatcher"
```

---

### Task 6: Reposition the panel + persist selection on focus

**Files:**
- Modify: `src/app/network/page.tsx`

Two changes: (a) the wrapper `aside` moves from a 400px slide-in to a 280px floating card; (b) `onFocus` keeps `?selected` in addition to setting `?focus`, so focusing doesn't close the panel. The page also needs to pass `nodeState` and `visibleGraph` to the panel.

- [ ] **Step 1: Update the destructure from `useNetworkGraph`**

In `src/app/network/page.tsx`, find:

```tsx
const {
    fullGraph,
    visibleGraph,
    focusId,
    isLoading,
    isFetching,
  } = useNetworkGraph();
```

Replace with:

```tsx
const {
    fullGraph,
    visibleGraph,
    focusId,
    isLoading,
    isFetching,
    nodeState,
  } = useNetworkGraph();
```

- [ ] **Step 2: Change the `onFocus` callback to keep `?selected`**

Find:

```tsx
const onFocus = useCallback((id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("focus", id);
    params.delete("selected");
    router.push(`/network?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);
```

Replace with:

```tsx
const onFocus = useCallback((id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("focus", id);
    params.set("selected", id);
    router.push(`/network?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);
```

- [ ] **Step 3: Update the panel wrapper and the panel props**

Find:

```tsx
{/* Detail panel overlay */}
      {selectedNode && (
        <aside className="absolute right-0 top-0 bottom-0 z-20 hidden w-[400px] overflow-y-auto bg-background md:block">
          <NetworkDetailPanel
            node={selectedNode}
            onClose={onClosePanel}
            onFocus={onFocus}
          />
        </aside>
      )}
```

Replace with:

```tsx
{/* Detail panel — floating card */}
      {selectedNode && (
        <aside className="pointer-events-auto absolute right-4 top-20 bottom-4 z-20 hidden w-[280px] overflow-hidden rounded-xl border border-foreground/[0.06] bg-background shadow-md md:block">
          <NetworkDetailPanel
            node={selectedNode}
            nodeState={nodeState}
            visibleGraph={visibleGraph}
            onClose={onClosePanel}
            onFocus={onFocus}
          />
        </aside>
      )}
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS — no errors.

- [ ] **Step 5: Run lint**

Run: `pnpm lint`
Expected: PASS — no warnings.

- [ ] **Step 6: Run the full test suite**

Run: `pnpm test`
Expected: PASS — all existing tests + new ones green.

- [ ] **Step 7: Commit**

```bash
git add src/app/network/page.tsx
git commit -m "feat(network): floating panel position; keep selection on focus"
```

---

### Task 7: Verify and refine

**Files:**
- None — manual verification step.

- [ ] **Step 1: Run full project checks**

Run: `pnpm check`
Expected: lint, typecheck, and test all pass.

- [ ] **Step 2: Start dev server**

Run: `pnpm dev`
Open: `http://localhost:3000/network`

- [ ] **Step 3: Manual smoke test — desktop**

In a desktop browser:

- Click a CCN node → panel shows name, type=CCN, status chip, score, CRN/Stakers tiles, total staked, owner, reward, "View full details →".
- Click a CRN node → panel shows name, type=CRN, status chip, VM count, parent CCN (clickable), CPU/Memory bars, owner, "View full details →".
- Click a staker node (turn the staker layer on first via the toggle) → panel shows "Staker", address (truncated), "Connected to N CCNs", "Open wallet view →".
- Click a reward node (turn the reward layer on) → panel shows "Reward address", address, "Connected to N nodes" (or no line if 0), "Open wallet view →".
- Verify the panel does **not** overlap the search bar / layer toggles in the top-left.
- Verify the panel does **not** overlap the focus banner when focus is active.
- Verify ~62% of the map width is uncovered (eyeball: panel is ~20% of a 1440px-wide viewport with the content recess).
- Click "Focus" inside the panel on a CCN → graph zooms to ego subgraph; panel stays open showing the same CCN.
- Click "Close" (×) → panel disappears; URL no longer has `?selected`.
- Click "View full details →" on a CRN → routes to `/nodes?view=<hash>`.
- Click the parent-CCN link inside a CRN panel → graph focuses on the parent CCN; panel re-targets to the parent.

- [ ] **Step 4: Manual smoke test — mobile**

Resize the browser to <768px (Chrome devtools, iPhone preset):

- Verify the desktop panel is hidden (only the mobile CCN list shows).
- Verify the mobile CCN list still works as before.

- [ ] **Step 5: Fix any issues found**

If anything broke:
1. Identify root cause (don't paper over symptoms).
2. Patch the relevant component or page.
3. Re-run `pnpm check` until clean.
4. Re-run the manual checks above.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix(network): <issue summary>"
```

(Skip if no fixes needed.)

---

### Task 8: Update docs and version

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/BACKLOG.md`
- Modify: `CLAUDE.md`
- Modify: `src/changelog.ts`

- [ ] **Step 1: Update `docs/ARCHITECTURE.md`**

In the "Network graph" section (or equivalent), add a paragraph describing the new panel:

> **Network detail panel.** A 280px floating card anchored to `right-4 top-20 bottom-4` over the recessed content panel. Composed of a shared shell (`network-detail-panel.tsx`) that renders the header (StatusDot + title + Focus + ×) and the optional "View full details →" footer (CCN/CRN only), plus three presentational bodies (`network-detail-panel-ccn.tsx`, `network-detail-panel-crn.tsx`, `network-detail-panel-address.tsx`) selected by `node.kind`. CCN/staker/reward bodies render directly from `nodeState` (now exposed by `useNetworkGraph`); the CRN body keeps `useNode(hash)` for resource bars and VM count. The Focus action sets both `?focus` and `?selected` so the panel stays open after focusing.

- [ ] **Step 2: Update `docs/DECISIONS.md`**

Append a new decision entry (use the project format — find the next number with `grep "^## Decision #" docs/DECISIONS.md | tail -1`):

```markdown
## Decision #N - 2026-05-09
**Context:** The network graph's side panel was a 400px slide-in that blocked the map and overlapped the toolbar. CCN nodes showed empty content because `useNode` only knows scheduler-side CRNs, and CRN content was a copy/paste of the full /nodes detail card.
**Decision:** Replace it with a 280px floating card positioned `right-4 top-20 bottom-4`, with three per-kind bodies (CCN, CRN, address) and a shared shell. CCN/address content reads from the `nodeState` already loaded by `useNetworkGraph`. Heavy content (GPU/VM/history) drops in favor of "View full details →" links to /nodes?view=<hash>.
**Rationale:** Three of the user's complaints (blocks the map, overlaps the search, empty CCN cards) were structural: the panel's size and data source were wrong for the graph context. A small per-kind card centered on graph-relevant facts solves all three at once and keeps Focus + Close attached to the card.
**Alternatives considered:** Floating tooltip-style card next to the node (option A); narrower right rail without the rewrite (B without content changes); bottom dock (C); floating + open-full-details link (D). User picked B with rich content.
```

- [ ] **Step 3: Update `docs/BACKLOG.md`**

Move any related items into Completed, and add this entry:

```markdown
### 2026-05-09 — Network panel redesign
**Source:** Implemented in feature/network-graph
**Description:** Smaller floating right-edge panel with per-kind bodies (CCN/CRN/address) and content trimmed to graph-relevant facts.
**Status:** Done
```

- [ ] **Step 4: Update `CLAUDE.md` Current Features list**

In the Network graph entry of the Current Features section, replace the panel-related sentence with:

> Detail panel is a 280px floating card (`right-4 top-20 bottom-4`) over the recessed content panel — header with StatusDot + title + Focus + ×; per-kind body (CCN reads `CCNInfo` from `nodeState`: type, status, score, CRN/Stakers stat tiles, total staked, owner, reward; CRN reads `CRNInfo` + `useNode(hash)`: type, status, VM count, parent CCN clickable, CPU/Memory bars, owner; staker/reward shows kind label, address with copy + wallet link, visible-graph degree summary). Footer "View full details →" routes CCN/CRN to `/nodes?view=<hash>`. Focus action sets both `?focus` and `?selected` so the panel stays open after focusing.

- [ ] **Step 5: Bump version + add changelog entry**

In `src/changelog.ts`, bump `CURRENT_VERSION` (minor: this is user-visible behavior change to a feature), and add a `VersionEntry`:

```ts
{
  version: "<new version>",
  date: "2026-05-09",
  changes: [
    {
      kind: "ui",
      summary:
        "Network graph: redesigned the node detail panel — smaller floating card, per-kind content for CCNs and CRNs, doesn't block the map or toolbar.",
    },
  ],
}
```

(Look up the existing format and current version with `grep -n "CURRENT_VERSION\|^export " src/changelog.ts | head -10` if uncertain.)

- [ ] **Step 6: Run full checks one more time**

Run: `pnpm check`
Expected: PASS — clean.

- [ ] **Step 7: Add the plan-status frontmatter**

At the very top of `docs/superpowers/plans/2026-05-09-network-panel-redesign.md`, prepend:

```markdown
---
status: done
branch: feature/network-graph
date: 2026-05-09
note: awaiting user preview
---

```

- [ ] **Step 8: Commit docs + version**

```bash
git add docs/ARCHITECTURE.md docs/DECISIONS.md docs/BACKLOG.md CLAUDE.md src/changelog.ts docs/superpowers/plans/2026-05-09-network-panel-redesign.md
git commit -m "docs(network): redesigned panel — architecture, decisions, backlog, changelog"
```

---

## Self-review

**Spec coverage:**
- Placement (right-4 top-20 bottom-4, 280px, opaque card) → Task 6.
- CCN body content (type, status, score, CRNs/Stakers tiles, total staked, owner, reward, view-full-details) → Task 3 + Task 5 footer.
- CRN body content (type, status, VMs, parent CCN clickable, CPU/Memory bars, owner, view-full-details) → Task 4 + Task 5 footer.
- Address body (kind label, address, degree, open wallet view) → Task 2.
- Header with StatusDot + title + Focus + × → Task 5.
- Focus keeps panel open (`?focus` + `?selected`) → Task 6.
- `useNetworkGraph` exposes `nodeState` → Task 1.
- File layout (shell + 3 bodies, kebab-case) → Tasks 2/3/4/5.
- Status chip mapping (inactive→default, active→success, else→warning) → Tasks 3 and 4.
- Edge cases (no nodeState entry, no useNode data, parent=null, inactive) → Tasks 4 and 5 tests.
- Mobile fallback unchanged → Task 6 keeps the existing mobile section untouched.

**Placeholder scan:** No "TBD"/"TODO"/etc. remain. The "look up current version" hint in Task 8 step 5 is intentional — version numbers depend on the live state of `src/changelog.ts` at execution time.

**Type consistency:** `NetworkDetailPanel` props (`node`, `nodeState`, `visibleGraph`, `onClose`, `onFocus`) match across Task 5 and Task 6. `NetworkDetailPanelCRN` props (`info`, `parent`, `onFocusParent`) match across Task 4 and Task 5. `NetworkDetailPanelCCN` (`info`) and `NetworkDetailPanelAddress` (`node`, `degree`) match across their tasks.
