---
status: done
branch: feature/crn-compute-units
date: 2026-05-22
note: all 9 tasks complete, pnpm check clean (318 tests); awaiting preview before ship
---

# CRN Compute Units (CU) Display — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display Compute Units (CU) per CRN — total capacity, available, and used — on the Nodes table, node detail view, node quick-peek panel, and network graph CRN panel.

**Architecture:** A pure helper (`src/lib/compute-units.ts`) derives CU from a node's existing `resources` + `gpus` fields. CU is the limiting resource across CPU / RAM / disk, at a ratio that depends on whether the node is GPU-class. Four UI surfaces consume the helper; the Nodes table also gains a CU range filter. No new API calls.

**Tech Stack:** TypeScript (strict, ESM), React 19, Next.js 16, `@aleph-front/ds`, Vitest, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-05-22-crn-compute-units-design.md`

---

## File Structure

**Create:**
- `src/lib/compute-units.ts` — CU ratios, `NodeCu` type, `computeNodeCu`, `formatCuSummary`.
- `src/lib/compute-units.test.ts` — unit tests for the helper.

**Modify:**
- `src/lib/filters.ts` — `cu` field on `NodeFilterMaxes` / `NODE_FILTER_MAX_FLOOR` / `computeNodeFilterMaxes`; `cuTotalRange` on `NodeAdvancedFilters`; CU branch in `applyNodeAdvancedFilters`.
- `src/lib/filters.test.ts` — CU filter test.
- `src/components/node-table.tsx` — replace vCPUs column with CU column; add CU range slider; count it in `activeAdvancedCount`.
- `src/components/node-table.test.tsx` — CU column / filter assertions.
- `src/components/node-detail-view.tsx` — CU bar block in the Resources card.
- `src/components/node-detail-panel.tsx` — CU row in the panel `dl`.
- `src/components/node-detail-panel.test.tsx` — CU row assertion.
- `src/components/network/network-detail-panel-crn.tsx` — CU line in the Resources section.
- `src/components/network/network-detail-panel-crn.test.tsx` — CU line assertion.
- `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `CLAUDE.md`, `src/changelog.ts` — docs + version.

---

## Task 1: CU computation helper

**Files:**
- Create: `src/lib/compute-units.ts`
- Test: `src/lib/compute-units.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/compute-units.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeNodeCu, formatCuSummary } from "@/lib/compute-units";
import type { Node } from "@/api/types";

function makeNode(over: Partial<Node>): Node {
  return {
    hash: "h",
    name: null,
    address: null,
    status: "healthy",
    staked: false,
    resources: null,
    vmCount: 0,
    updatedAt: "2026-05-22T00:00:00Z",
    owner: null,
    supportsIpv6: null,
    discoveredAt: null,
    gpus: { used: [], available: [] },
    confidentialComputing: false,
    cpuArchitecture: null,
    cpuVendor: null,
    cpuFeatures: [],
    ...over,
  };
}

const RES = {
  vcpusTotal: 32,
  memoryTotalMb: 64 * 1024,
  diskTotalMb: 640 * 1024,
  vcpusAvailable: 24,
  memoryAvailableMb: 48 * 1024,
  diskAvailableMb: 480 * 1024,
  cpuUsagePct: 25,
  memoryUsagePct: 25,
  diskUsagePct: 25,
};

describe("computeNodeCu", () => {
  it("returns null when resources is null", () => {
    expect(computeNodeCu(makeNode({ resources: null }))).toBeNull();
  });

  it("computes standard CU when the node has no GPUs", () => {
    // 32 vCPU / (64GB / 2) / (640GB / 20) = min(32, 32, 32) = 32
    const cu = computeNodeCu(makeNode({ resources: RES }));
    expect(cu).toEqual({ total: 32, available: 24, used: 8, isGpu: false });
  });

  it("uses the GPU ratio when the node has GPU devices", () => {
    // 32 vCPU / (64GB / 6) / (640GB / 60) = min(32, 10.6, 10.6) = 10
    const cu = computeNodeCu(
      makeNode({
        resources: RES,
        gpus: {
          used: [],
          available: [{ vendor: "NVIDIA", model: "RTX", deviceName: "RTX" }],
        },
      }),
    );
    expect(cu?.isGpu).toBe(true);
    expect(cu?.total).toBe(10);
  });

  it("is RAM-limited when memory is the scarce resource", () => {
    // 32 vCPU but only 16GB RAM → standard: min(32, 16/2=8, ...) = 8
    const cu = computeNodeCu(
      makeNode({
        resources: { ...RES, memoryTotalMb: 16 * 1024 },
      }),
    );
    expect(cu?.total).toBe(8);
  });

  it("is disk-limited when disk is the scarce resource", () => {
    // 32 vCPU, 64GB RAM, but only 100GB disk → standard: min(32, 32, 100/20=5) = 5
    const cu = computeNodeCu(
      makeNode({
        resources: { ...RES, diskTotalMb: 100 * 1024 },
      }),
    );
    expect(cu?.total).toBe(5);
  });

  it("returns 0 CU for a node with zero vCPUs", () => {
    const cu = computeNodeCu(
      makeNode({
        resources: { ...RES, vcpusTotal: 0, vcpusAvailable: 0 },
      }),
    );
    expect(cu?.total).toBe(0);
    expect(cu?.used).toBe(0);
  });

  it("clamps available to total so used is never negative", () => {
    // available resources exceed total (inconsistent API data)
    const cu = computeNodeCu(
      makeNode({
        resources: {
          ...RES,
          vcpusAvailable: 64,
          memoryAvailableMb: 128 * 1024,
          diskAvailableMb: 1280 * 1024,
        },
      }),
    );
    expect(cu?.available).toBe(32);
    expect(cu?.used).toBe(0);
  });
});

describe("formatCuSummary", () => {
  it("formats used / total / free", () => {
    expect(
      formatCuSummary({ total: 32, available: 24, used: 8, isGpu: false }),
    ).toBe("8 / 32 CU · 24 free");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/compute-units.test.ts`
Expected: FAIL — `compute-units.ts` does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/lib/compute-units.ts`:

```ts
import type { Node } from "@/api/types";

/**
 * RAM (GB) and disk (GB) bundled into one Compute Unit, by node class.
 * Standard and confidential nodes share the same ratio; GPU nodes differ.
 */
export const CU_RATIOS = {
  standard: { ramGbPerCu: 2, diskGbPerCu: 20 },
  gpu: { ramGbPerCu: 6, diskGbPerCu: 60 },
} as const;

export type NodeCu = {
  /** CU capacity — whole number. */
  total: number;
  /** Free CU — whole number, clamped to `<= total`. */
  available: number;
  /** Consumed CU — `total - available`, always `>= 0`. */
  used: number;
  /** Whether the GPU ratio was used (node has GPU devices). */
  isGpu: boolean;
};

/**
 * CU for one resource snapshot: the limiting dimension across CPU, RAM, disk.
 * Memory and disk are supplied in MB and converted to GB before the division.
 */
function cuFromResources(
  vcpus: number,
  memoryMb: number,
  diskMb: number,
  ramGbPerCu: number,
  diskGbPerCu: number,
): number {
  const byCpu = vcpus;
  const byRam = memoryMb / 1024 / ramGbPerCu;
  const byDisk = diskMb / 1024 / diskGbPerCu;
  return Math.max(0, Math.floor(Math.min(byCpu, byRam, byDisk)));
}

/**
 * Compute the CU capacity, availability, and usage of a CRN.
 *
 * Returns `null` when the node reports no `resources`. GPU-class nodes (any
 * GPU device, used or available) use the 1vCPU/6GB/60GB ratio; everything
 * else uses 1vCPU/2GB/20GB. Confidential computing does not change the ratio.
 */
export function computeNodeCu(node: Node): NodeCu | null {
  const r = node.resources;
  if (r == null) return null;

  const isGpu = node.gpus.used.length + node.gpus.available.length > 0;
  const { ramGbPerCu, diskGbPerCu } = isGpu
    ? CU_RATIOS.gpu
    : CU_RATIOS.standard;

  const total = cuFromResources(
    r.vcpusTotal,
    r.memoryTotalMb,
    r.diskTotalMb,
    ramGbPerCu,
    diskGbPerCu,
  );
  const rawAvailable = cuFromResources(
    r.vcpusAvailable,
    r.memoryAvailableMb,
    r.diskAvailableMb,
    ramGbPerCu,
    diskGbPerCu,
  );
  const available = Math.min(rawAvailable, total);
  const used = total - available;

  return { total, available, used, isGpu };
}

/** Compact one-liner for the detail panels: `"8 / 32 CU · 24 free"`. */
export function formatCuSummary(cu: NodeCu): string {
  return `${cu.used} / ${cu.total} CU · ${cu.available} free`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/compute-units.test.ts`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/compute-units.ts src/lib/compute-units.test.ts
git commit -m "feat: add compute-units helper for per-CRN CU"
```

---

## Task 2: CU range filter support in filters.ts

**Files:**
- Modify: `src/lib/filters.ts`
- Test: `src/lib/filters.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/filters.test.ts` (inside the existing top-level scope; place near the other node-filter tests). First check the file's existing import block and `makeNode`-style helper — if the file already has a node factory, reuse it; otherwise add this self-contained block:

```ts
import { computeNodeFilterMaxes, applyNodeAdvancedFilters } from "@/lib/filters";
import type { Node } from "@/api/types";

function cuTestNode(vcpus: number, hasResources = true): Node {
  return {
    hash: `n-${vcpus}`,
    name: null,
    address: null,
    status: "healthy",
    staked: false,
    resources: hasResources
      ? {
          vcpusTotal: vcpus,
          memoryTotalMb: vcpus * 2 * 1024,
          diskTotalMb: vcpus * 20 * 1024,
          vcpusAvailable: vcpus,
          memoryAvailableMb: vcpus * 2 * 1024,
          diskAvailableMb: vcpus * 20 * 1024,
          cpuUsagePct: 0,
          memoryUsagePct: 0,
          diskUsagePct: 0,
        }
      : null,
    vmCount: 0,
    updatedAt: "2026-05-22T00:00:00Z",
    owner: null,
    supportsIpv6: null,
    discoveredAt: null,
    gpus: { used: [], available: [] },
    confidentialComputing: false,
    cpuArchitecture: null,
    cpuVendor: null,
    cpuFeatures: [],
  };
}

describe("CU filter", () => {
  it("computeNodeFilterMaxes includes a cu extent", () => {
    const maxes = computeNodeFilterMaxes([cuTestNode(8), cuTestNode(40)]);
    // 40 CU rounds up to the next power of two (64).
    expect(maxes.cu).toBe(64);
  });

  it("applyNodeAdvancedFilters filters by cuTotalRange", () => {
    const nodes = [cuTestNode(8), cuTestNode(40), cuTestNode(100)];
    const maxes = computeNodeFilterMaxes(nodes);
    const filtered = applyNodeAdvancedFilters(
      nodes,
      { cuTotalRange: [10, 50] },
      maxes,
    );
    expect(filtered.map((n) => n.hash)).toEqual(["n-40"]);
  });

  it("excludes nodes without resources when the cu filter is active", () => {
    const nodes = [cuTestNode(40), cuTestNode(0, false)];
    const maxes = computeNodeFilterMaxes(nodes);
    const filtered = applyNodeAdvancedFilters(
      nodes,
      { cuTotalRange: [1, 50] },
      maxes,
    );
    expect(filtered.map((n) => n.hash)).toEqual(["n-40"]);
  });
});
```

Note: if `filters.test.ts` already imports `describe`/`it`/`expect` and `Node`, do not duplicate those imports — add only the missing ones.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/filters.test.ts`
Expected: FAIL — `maxes.cu` is `undefined`; `cuTotalRange` is not a known filter key.

- [ ] **Step 3: Write the implementation**

In `src/lib/filters.ts`:

(a) Add the import at the top, below the existing `import type` line:

```ts
import { computeNodeCu } from "@/lib/compute-units";
```

(b) Add `cu` to the `NodeFilterMaxes` type:

```ts
export type NodeFilterMaxes = {
  vmCount: number;
  vcpus: number;
  memoryGb: number;
  cu: number;
};
```

(c) Add `cu` to `NODE_FILTER_MAX_FLOOR`:

```ts
export const NODE_FILTER_MAX_FLOOR: NodeFilterMaxes = {
  vmCount: 100,
  vcpus: 128,
  memoryGb: 512,
  cu: 64,
};
```

(d) In `computeNodeFilterMaxes`, add a `cu` accumulator. Replace the function body:

```ts
export function computeNodeFilterMaxes(nodes: Node[]): NodeFilterMaxes {
  let vcpus = 0;
  let memoryGb = 0;
  let vmCount = 0;
  let cu = 0;
  for (const n of nodes) {
    vcpus = Math.max(vcpus, n.resources?.vcpusTotal ?? 0);
    memoryGb = Math.max(
      memoryGb,
      (n.resources?.memoryTotalMb ?? 0) / 1024,
    );
    vmCount = Math.max(vmCount, n.vmCount);
    cu = Math.max(cu, computeNodeCu(n)?.total ?? 0);
  }
  return {
    vcpus: roundUpPow2(vcpus, NODE_FILTER_MAX_FLOOR.vcpus),
    memoryGb: roundUpPow2(
      memoryGb,
      NODE_FILTER_MAX_FLOOR.memoryGb,
    ),
    vmCount: roundUpPow2(vmCount, NODE_FILTER_MAX_FLOOR.vmCount),
    cu: roundUpPow2(cu, NODE_FILTER_MAX_FLOOR.cu),
  };
}
```

(e) Add `cuTotalRange` to `NodeAdvancedFilters`:

```ts
export type NodeAdvancedFilters = {
  staked?: boolean;
  supportsIpv6?: boolean;
  hasGpu?: boolean;
  confidentialComputing?: boolean;
  cpuVendors?: Set<string>;
  vmCountRange?: [number, number];
  vcpusTotalRange?: [number, number];
  memoryTotalGbRange?: [number, number];
  cuTotalRange?: [number, number];
};
```

(f) In `applyNodeAdvancedFilters`, add the CU branch immediately before `return result;`:

```ts
  if (
    filters.cuTotalRange &&
    isRangeActive(filters.cuTotalRange, maxes.cu)
  ) {
    const [min, max] = filters.cuTotalRange;
    result = result.filter((n) => {
      const cu = computeNodeCu(n)?.total;
      return cu != null && cu >= min && cu <= max;
    });
  }
  return result;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/filters.test.ts`
Expected: PASS — including the three new CU filter tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/filters.ts src/lib/filters.test.ts
git commit -m "feat: add CU range filter to node advanced filters"
```

---

## Task 3: Replace the vCPUs column with a CU column

**Files:**
- Modify: `src/components/node-table.tsx`
- Test: `src/components/node-table.test.tsx`

- [ ] **Step 1: Write the failing test**

Open `src/components/node-table.test.tsx` and inspect its existing structure (mocks, render helper, node fixtures). Add a test that asserts the table renders a `CU` header and not a `vCPUs` header. Use the file's existing render helper and fixture style — the test below is the intent; adapt the fixture call to match the file:

```ts
it("shows a CU column instead of vCPUs", () => {
  // render the NodeTable with at least one node that has resources
  renderNodeTable();
  expect(screen.getByText("CU")).toBeInTheDocument();
  expect(screen.queryByText("vCPUs")).not.toBeInTheDocument();
});
```

If `node-table.test.tsx` has no fixture with populated `resources`, add one (or extend the existing fixture) so the CU cell renders a number. Reuse the `resources` shape from Task 1's `RES` constant.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/components/node-table.test.tsx`
Expected: FAIL — `CU` header not found / `vCPUs` still present.

- [ ] **Step 3: Write the implementation**

In `src/components/node-table.tsx`:

(a) Add the import below the `relativeTime` import line:

```ts
import { computeNodeCu } from "@/lib/compute-units";
```

(b) Replace the entire `vCPUs` column object (currently `header: "vCPUs"`, lines ~102-112) with the CU column:

```tsx
  {
    header: "CU",
    accessor: (r) => {
      const cu = computeNodeCu(r);
      if (cu == null) {
        return <span className="text-xs">{"—"}</span>;
      }
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-xs tabular-nums">
              {cu.total}
              <span className="ml-1 text-muted-foreground/60">
                · {cu.used} used
              </span>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <span className="block">
              {cu.total} CU total · {cu.available} available · {cu.used} used
            </span>
            <span className="block text-muted-foreground">
              {cu.isGpu
                ? "GPU-class — 1 CU = 1 vCPU / 6 GB / 60 GB"
                : "Standard — 1 CU = 1 vCPU / 2 GB / 20 GB"}
            </span>
          </TooltipContent>
        </Tooltip>
      );
    },
    sortable: true,
    sortValue: (r) => computeNodeCu(r)?.total ?? 0,
    align: "right",
  },
```

Note: `Tooltip`, `TooltipTrigger`, `TooltipContent` are already imported at the top of `node-table.tsx`, and the table body is wrapped in `TooltipProvider` — no new imports needed beyond `computeNodeCu`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/components/node-table.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/node-table.tsx src/components/node-table.test.tsx
git commit -m "feat: replace vCPUs column with CU on the Nodes table"
```

---

## Task 4: Add the CU range slider to the Nodes filter panel

**Files:**
- Modify: `src/components/node-table.tsx`

- [ ] **Step 1: Add CU to the active-filter count**

In `node-table.tsx`, in the `activeAdvancedCount` array, add a CU entry after the `memoryTotalGbRange` entry (keep it the last entry before `].filter(Boolean).length`):

```tsx
    advanced.memoryTotalGbRange != null &&
      isRangeActive(
        advanced.memoryTotalGbRange,
        filterMaxes.memoryGb,
      ),
    advanced.cuTotalRange != null &&
      isRangeActive(advanced.cuTotalRange, filterMaxes.cu),
  ].filter(Boolean).length;
```

- [ ] **Step 2: Add the CU slider to the Hardware group**

In the Hardware `<div>` group, the inner `<div className="space-y-6">` currently holds the vCPUs slider block then the Memory slider block. Insert a CU slider block as the **first** child (before the vCPUs block), so the order reads CU → vCPUs → Memory:

```tsx
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm font-semibold text-muted-foreground">
                    <span>CU</span>
                    <span className="tabular-nums text-xs">
                      {advanced.cuTotalRange?.[0] ?? 0}–
                      {advanced.cuTotalRange?.[1] ?? filterMaxes.cu}
                    </span>
                  </div>
                  <Slider
                    size="sm"
                    min={0}
                    max={filterMaxes.cu}
                    step={1}
                    value={
                      advanced.cuTotalRange ?? [0, filterMaxes.cu]
                    }
                    onValueChange={(val) =>
                      updateAdvanced((p) => ({
                        ...p,
                        cuTotalRange: val as [number, number],
                      }))
                    }
                    showTooltip
                  />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm font-semibold text-muted-foreground">
                    <span>vCPUs</span>
```

(The `<span>vCPUs</span>` line above is the start of the existing vCPUs block — the new CU block is inserted directly before it. Leave the vCPUs and Memory blocks unchanged.)

- [ ] **Step 3: Run lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS — no errors.

- [ ] **Step 4: Run the node-table tests**

Run: `pnpm test -- src/components/node-table.test.tsx`
Expected: PASS — existing tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/components/node-table.tsx
git commit -m "feat: add CU range slider to Nodes advanced filters"
```

---

## Task 5: CU bar in the node detail view Resources card

**Files:**
- Modify: `src/components/node-detail-view.tsx`

- [ ] **Step 1: Add the import**

In `src/components/node-detail-view.tsx`, add to the import block:

```ts
import { computeNodeCu } from "@/lib/compute-units";
```

- [ ] **Step 2: Add a local `NodeCuBar` component**

At the bottom of `node-detail-view.tsx` (after the main exported component, alongside any other local helpers like `MetaItem`), add:

```tsx
function NodeCuBar({ node }: { node: Node }) {
  const cu = computeNodeCu(node);
  if (cu == null) return null;
  const usedPct = cu.total > 0 ? Math.round((cu.used / cu.total) * 100) : 0;
  return (
    <div className="mb-4 space-y-1 border-b border-edge pb-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Compute Units</span>
        <span className="text-xs tabular-nums">
          {cu.used} / {cu.total} CU
        </span>
      </div>
      <ResourceBar value={usedPct} label="CU" />
      <p className="text-xs text-muted-foreground/60">
        {cu.available} CU available · {cu.isGpu ? "GPU-class" : "standard"}
      </p>
    </div>
  );
}
```

Note: `ResourceBar` is already imported in `node-detail-view.tsx`. Confirm `Node` is imported as a type there — it is used widely in the file; if for some reason it is not, add `import type { Node } from "@/api/types";` (merge into the existing `@/api/types` import if one exists).

- [ ] **Step 3: Render `NodeCuBar` inside the Resources card**

In the Resources `<Card>` block (the `{node.resources && (` block), insert `<NodeCuBar node={node} />` between the `<h3>` heading and the `<div className="grid gap-4 sm:grid-cols-3">`:

```tsx
      {node.resources && (
        <Card padding="md">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Resources
          </h3>
          <NodeCuBar node={node} />
          <div className="grid gap-4 sm:grid-cols-3">
```

- [ ] **Step 4: Run lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/node-detail-view.tsx
git commit -m "feat: show CU usage bar on the node detail view"
```

---

## Task 6: CU row in the node quick-peek panel

**Files:**
- Modify: `src/components/node-detail-panel.tsx`
- Test: `src/components/node-detail-panel.test.tsx`

- [ ] **Step 1: Write the failing test**

In `src/components/node-detail-panel.test.tsx`, add a test with a node that has `resources`. The existing `BUSY_NODE` fixture has `resources: undefined`; create a second fixture with resources so CU renders:

```ts
const CU_NODE = {
  ...BUSY_NODE,
  hash: "crn-cu-1",
  resources: {
    vcpusTotal: 32,
    memoryTotalMb: 64 * 1024,
    diskTotalMb: 640 * 1024,
    vcpusAvailable: 24,
    memoryAvailableMb: 48 * 1024,
    diskAvailableMb: 480 * 1024,
    cpuUsagePct: 25,
    memoryUsagePct: 25,
    diskUsagePct: 25,
  },
} as unknown as Node;

it("renders a CU row when the node reports resources", () => {
  useNodeMock.mockReturnValue({
    data: CU_NODE,
    isLoading: false,
  } as unknown as ReturnType<typeof useNode>);

  renderWithQuery(<NodeDetailPanel hash="crn-cu-1" onClose={() => {}} />);

  expect(screen.getByText("CU")).toBeInTheDocument();
  // 32 total, 24 available, used = 8
  expect(screen.getByText("8 / 32 CU · 24 free")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/components/node-detail-panel.test.tsx`
Expected: FAIL — no `CU` row.

- [ ] **Step 3: Write the implementation**

In `src/components/node-detail-panel.tsx`:

(a) Add to the imports:

```ts
import { computeNodeCu, formatCuSummary } from "@/lib/compute-units";
```

(b) After `if (!node) return null;`, derive the CU value:

```tsx
  if (!node) return null;

  const cu = computeNodeCu(node);
```

(c) In the main `<dl>`, add a CU row after the `Updated` row (the last `<div>` in that `<dl>`):

```tsx
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Updated</dt>
          <dd className="text-xs">{relativeTime(node.updatedAt)}</dd>
        </div>
        {cu && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">CU</dt>
            <dd className="text-xs tabular-nums">{formatCuSummary(cu)}</dd>
          </div>
        )}
      </dl>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/components/node-detail-panel.test.tsx`
Expected: PASS — both the existing test and the new CU test.

- [ ] **Step 5: Commit**

```bash
git add src/components/node-detail-panel.tsx src/components/node-detail-panel.test.tsx
git commit -m "feat: show CU summary in the node quick-peek panel"
```

---

## Task 7: CU line in the network graph CRN panel

**Files:**
- Modify: `src/components/network/network-detail-panel-crn.tsx`
- Test: `src/components/network/network-detail-panel-crn.test.tsx`

- [ ] **Step 1: Write the failing test**

Open `src/components/network/network-detail-panel-crn.test.tsx` and inspect its mocking of `useNode` and its CRN fixture. Add a test that supplies a `useNode` mock whose `data.resources` is populated, and asserts the CU line renders. Adapt to the file's existing helpers — intent:

```ts
it("renders a CU line in the Resources section", () => {
  // mock useNode to return a node with resources (32 vCPU / 64GB / 640GB)
  // ... see existing useNode mock in this file ...
  expect(screen.getByText("CU")).toBeInTheDocument();
  expect(screen.getByText("8 / 32 CU · 24 free")).toBeInTheDocument();
});
```

Use the same `resources` shape as Task 6's `CU_NODE` (`vcpusTotal: 32`, `memoryTotalMb: 64*1024`, `diskTotalMb: 640*1024`, `vcpusAvailable: 24`, `memoryAvailableMb: 48*1024`, `diskAvailableMb: 480*1024`). If the existing `network-detail-panel-crn.test.tsx` already mocks `useNode` with a resources-bearing node, extend that mock rather than adding a new one.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/components/network/network-detail-panel-crn.test.tsx`
Expected: FAIL — no `CU` text.

- [ ] **Step 3: Write the implementation**

In `src/components/network/network-detail-panel-crn.tsx`:

(a) Add to the imports:

```ts
import { computeNodeCu, formatCuSummary } from "@/lib/compute-units";
```

(b) Inside the Resources section, in the non-loading branch (the `<>...</>` after `isLoading || !node?.resources ? skeleton : (`), add a CU line after the Memory `<div>`:

```tsx
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Memory · {Math.round(node.resources.memoryTotalMb / 1024)} GB
                </span>
                <ResourceBar
                  value={node.resources.memoryUsagePct}
                  label="Memory"
                />
              </div>
              {(() => {
                const cu = computeNodeCu(node);
                return cu ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">CU</span>
                    <span className="text-xs tabular-nums">
                      {formatCuSummary(cu)}
                    </span>
                  </div>
                ) : null;
              })()}
            </>
```

Note: in this branch `node` and `node.resources` are both non-null (the ternary guards on `!node?.resources`), so `computeNodeCu(node)` returns a value; the `cu ?` guard satisfies the type checker.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/components/network/network-detail-panel-crn.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/network/network-detail-panel-crn.tsx src/components/network/network-detail-panel-crn.test.tsx
git commit -m "feat: show CU line in the network graph CRN panel"
```

---

## Task 8: Verify and refine

- [ ] Run full project checks: `pnpm check`
- [ ] Fix any lint / typecheck / token / test failures until clean
- [ ] Manual smoke test with real data (`pnpm dev`, `.env.local` points at the live scheduler):
  - `/nodes` — the table shows a `CU` column (no `vCPUs` column); hover a CU cell to see the total/available/used + formula tooltip; sort by CU; open advanced filters and confirm a `CU` slider sits above vCPUs in the Hardware group and filtering by it narrows the list.
  - `/nodes?view=<crn-hash>` — the Resources card shows a Compute Units bar + `N CU available · standard/GPU-class` caption above the CPU/Memory/Disk grid.
  - `/nodes` quick-peek panel (click a row) — a `CU` row appears in the panel `dl` reading `used / total CU · N free`.
  - `/network` — click a CRN node; the Resources section shows a `CU` line.
  - Confirm a GPU CRN shows `GPU-class` and a markedly lower CU total than its vCPU count.
- [ ] Re-run `pnpm check` until clean

---

## Task 9: Update docs and version

- [ ] **`docs/ARCHITECTURE.md`** — add `src/lib/compute-units.ts` to the lib helpers (CU computation: limiting resource across CPU/RAM/disk, GPU vs standard ratio); note the four CU surfaces (Nodes table column, detail view Resources card, quick-peek panel, network CRN panel) and the CU range filter.

- [ ] **`docs/DECISIONS.md`** — add a new decision entry at the top:

```
## Decision #107 - 2026-05-22
**Context:** The Nodes table and detail surfaces exposed raw `vCPUs`, but the operationally meaningful capacity unit on Aleph is the Compute Unit (CU) — a bundle of CPU, RAM, and disk. Operators wanted CU per CRN.
**Decision:** Add `src/lib/compute-units.ts` deriving CU = the limiting resource across CPU / RAM / disk. Standard and confidential CRNs use 1 CU = 1vCPU/2GB/20GB; GPU CRNs (any GPU device present) use 1vCPU/6GB/60GB. CU is floored to a whole number; `available` is clamped to `total` so `used = total − available` is always ≥ 0. CU is shown on four surfaces — the Nodes table (the `vCPUs` column is replaced by `CU`; total prominent, used muted, full breakdown + formula in a cell tooltip), the node detail view Resources card (usage bar + available/class caption), the quick-peek panel (one-line `dl` row), and the network graph CRN panel (one line in Resources). The Nodes advanced filter keeps the vCPUs range slider and gains a CU range slider.
**Rationale:** All data already exists on the `Node` (`resources` + `gpus`) — CU is pure presentation, no API change. The limiting-resource `min()` is the honest reading of "how many CU can this node host." Keeping the vCPUs filter alongside the new CU filter preserves the underlying-property query while matching the new column.
**Alternatives considered:** CU from vCPU alone (rejected — ignores RAM/disk limits, the whole point). `used` as a separate `min()` over consumed resources (rejected — wouldn't reconcile with total − available). A `?` tooltip in the CU column header (rejected — the DS `Table` `Column.header` is string-only; the per-cell tooltip carries the formula instead). Replacing the vCPUs filter outright (rejected — vCPU is still a real property operators may query).
```

- [ ] **`CLAUDE.md`** — in the Current Features list:
  - Nodes page entry: change "vCPUs and Memory columns" to "CU and Memory columns (CU = limiting resource across CPU/RAM/disk; standard 1vCPU/2GB/20GB, GPU 1vCPU/6GB/60GB; cell tooltip carries total/available/used + formula)"; add CU range slider to the advanced-filters Hardware description (alongside vCPUs/Memory); note the quick-peek panel CU row and the detail view Resources CU bar.
  - Network graph entry: in the CRN panel description, note the Resources section now includes a CU line.

- [ ] **`src/changelog.ts`** — bump `CURRENT_VERSION` to `"0.32.0"` and prepend a `VersionEntry`:

```ts
  {
    version: "0.32.0",
    date: "2026-05-22",
    changes: [
      {
        type: "feature",
        text: "Each CRN now shows its capacity in Compute Units (CU) — total, available, and used. CU is the limiting resource across CPU, RAM, and disk: standard and confidential nodes count 1 CU per 1 vCPU / 2 GB / 20 GB, GPU nodes per 1 vCPU / 6 GB / 60 GB. The Nodes table swaps its vCPUs column for CU (full breakdown in the cell tooltip), the node detail view adds a CU usage bar, and the quick-peek and network graph CRN panels show a CU line.",
      },
      {
        type: "feature",
        text: "The Nodes advanced filters gain a CU range slider alongside the existing vCPUs and Memory sliders.",
      },
    ],
  },
```

- [ ] **`docs/BACKLOG.md`** — no open backlog item corresponds to this work; nothing to move. (Skip if there is genuinely nothing — do not invent an entry.)

- [ ] Run `pnpm check` once more — expected PASS.

- [ ] **Commit:**

```bash
git add docs/ARCHITECTURE.md docs/DECISIONS.md CLAUDE.md src/changelog.ts
git commit -m "docs: record CU display feature (Decision #107, v0.32.0)"
```

---

## Self-Review Notes

- **Spec coverage:** computation helper (Task 1) ✓; four surfaces — table column (Task 3), detail view (Task 5), quick-peek panel (Task 6), network CRN panel (Task 7) ✓; CU range filter (Tasks 2, 4) ✓; edge cases — null resources, zero vCPU, available-clamp all unit-tested in Task 1 ✓; docs + changelog (Task 9) ✓.
- **Type consistency:** `computeNodeCu` / `formatCuSummary` / `NodeCu` / `CU_RATIOS` named consistently across Tasks 1–7; `cuTotalRange` / `NodeFilterMaxes.cu` consistent between Tasks 2 and 4.
- **Naming:** column header string is `"CU"` everywhere; filter field is `cuTotalRange` (mirrors the existing `vcpusTotalRange` / `memoryTotalGbRange`).
