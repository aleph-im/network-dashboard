---
status: done
branch: feature/crn-highlights
date: 2026-05-12
note: implemented; ready for preview + ship
---

# CRN Highlights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flag operationally problematic CRNs on the network graph with the existing warning-ring treatment (same visual as understaked CCNs from Decision #84). Two trigger conditions: `score < 0.8` (corechannel data, already available) OR scheduler health reports `"unreachable"` (joined from `useNodes()`).

**Architecture:** `useNetworkGraph` already merges `useNodeState()` (corechannel) with `useOwnerBalances()` (Decision #83 pipeline). Add a third input: `useNodes()` (scheduler health, already used by `/nodes`), reduced to a `Map<crnHash, schedulerStatus>` via `useMemo`. Thread that map into `buildGraph(state, layers, ownerBalances?, crnStatuses?, geo?)` as a new 4th param. `buildGraph` sets `flagged: boolean` on each CRN GraphNode where the operational gates fire. `NetworkNode` extends its warning-ring trigger from `understaked` to `understaked || flagged`. The detail panel cascade extends to surface "Unreachable" or "Low score" italic notes; the StatusDot and Status Badge flip to amber alongside.

**Tech Stack:** Next.js 16 (App Router, static export), TypeScript (strict), Tailwind CSS 4, React Query (existing cache), `@aleph-front/ds` (Badge, StatusDot), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-05-12-crn-highlights-design.md`

---

## File Structure

**Modify:**
- `src/lib/network-graph-model.ts` — new `CRN_SCORE_THRESHOLD` constant, new optional `flagged` field on `GraphNode`, new `crnStatuses?` param on `buildGraph`, predicate.
- `src/lib/network-graph-model.test.ts` — 7 new cases for the predicate + update existing geo tests for the signature change.
- `src/hooks/use-network-graph.ts` — call `useNodes()`, build `crnStatuses` map, thread it in, return it.
- `src/components/network/network-node.tsx` — accept `flagged` prop, extend ring + opacity rules.
- `src/components/network/network-graph.tsx` — pass `flagged` from GraphNode to NetworkNode.
- `src/components/network/network-detail-panel.tsx` — extend `dotStatusFor`, accept `crnStatuses` prop, compute `unreachable` for CRN body.
- `src/components/network/network-detail-panel-crn.tsx` — extend `crnChipVariant`, accept `unreachable` prop, render cascade messages.
- `src/components/network/network-detail-panel-crn.test.tsx` — 3 new cases for the messages + variant flip.
- `src/components/network/network-detail-panel.test.tsx` — pass `ownerBalances={undefined}` + new `crnStatuses={undefined}` in existing render calls.
- `src/app/network/page.tsx` — thread `crnStatuses` from `useNetworkGraph` into the detail panel.
- `src/changelog.ts` — bump `CURRENT_VERSION` 0.15.0 → 0.16.0; new `VersionEntry`.
- `CLAUDE.md`, `docs/ARCHITECTURE.md` — inline doc updates for the new flag.
- `docs/DECISIONS.md` — new Decision #85.

---

## Task 1: Add `CRN_SCORE_THRESHOLD` constant + `flagged` field

**Files:**
- Modify: `src/lib/network-graph-model.ts`

- [ ] **Step 1: Add the constant** near `CCN_ACTIVATION_THRESHOLD`

After the existing `CCN_ACTIVATION_THRESHOLD = 500_000` block in `src/lib/network-graph-model.ts`, insert:

```ts
// Below this score (0–1 scale), a CRN is treated as underperforming and
// gets the warning ring on the graph. Threshold chosen for visibility:
// most CRNs score well above 0.8, so the flag stays meaningful.
export const CRN_SCORE_THRESHOLD = 0.8;
```

- [ ] **Step 2: Add `flagged` to the `GraphNode` type**

In the `GraphNode` type definition, right after the `understaked?: boolean;` field, insert:

```ts
  // CRN-only flag. True when the CRN is operationally connected (linked,
  // not inactive, has a parent) but has an issue worth surfacing — score
  // below CRN_SCORE_THRESHOLD or scheduler reports it as unreachable.
  // Triggers the warning ring (same treatment as understaked CCNs).
  flagged?: boolean;
```

- [ ] **Step 3: Run typecheck to confirm no breakage**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/lib/network-graph-model.ts
git commit -m "feat(network): add CRN_SCORE_THRESHOLD + flagged field on GraphNode"
```

---

## Task 2: `buildGraph` accepts `crnStatuses` and computes `flagged` (TDD)

**Files:**
- Modify: `src/lib/network-graph-model.ts`
- Modify: `src/lib/network-graph-model.test.ts`

- [ ] **Step 1: Write the failing tests**

Append a new `describe` block at the end of the existing `describe("buildGraph — understaked / pending CCNs", ...)` block in `src/lib/network-graph-model.test.ts`:

```ts
describe("buildGraph — flagged CRNs", () => {
  it("flags a linked CRN with score below 0.8", () => {
    const state = makeState({
      ccns: [ccn("c1", { totalStaked: 1_000_000, resourceNodes: ["r1"] })],
      crns: [crn("r1", { parent: "c1", status: "linked", score: 0.65 })],
    });
    const balances = new Map([["0xowner", 250_000]]);
    const graph = buildGraph(state, new Set(["structural"]), balances);
    const node = graph.nodes.find((n) => n.id === "r1")!;
    expect(node.flagged).toBe(true);
  });

  it("flags a linked CRN that the scheduler reports as unreachable, even if score is high", () => {
    const state = makeState({
      ccns: [ccn("c1", { totalStaked: 1_000_000, resourceNodes: ["r1"] })],
      crns: [crn("r1", { parent: "c1", status: "linked", score: 0.95 })],
    });
    const balances = new Map([["0xowner", 250_000]]);
    const statuses = new Map([["r1", "unreachable"]]);
    const graph = buildGraph(
      state, new Set(["structural"]), balances, statuses,
    );
    const node = graph.nodes.find((n) => n.id === "r1")!;
    expect(node.flagged).toBe(true);
  });

  it("does not flag a healthy linked CRN", () => {
    const state = makeState({
      ccns: [ccn("c1", { totalStaked: 1_000_000, resourceNodes: ["r1"] })],
      crns: [crn("r1", { parent: "c1", status: "linked", score: 0.95 })],
    });
    const balances = new Map([["0xowner", 250_000]]);
    const statuses = new Map([["r1", "healthy"]]);
    const graph = buildGraph(
      state, new Set(["structural"]), balances, statuses,
    );
    const node = graph.nodes.find((n) => n.id === "r1")!;
    expect(node.flagged).toBe(false);
  });

  it("does not flag an inactive CRN even with low score (inactive precedence)", () => {
    const state = makeState({
      ccns: [ccn("c1", { totalStaked: 1_000_000, resourceNodes: ["r1"] })],
      crns: [
        crn("r1", {
          parent: "c1",
          status: "linked",
          score: 0.3,
          inactiveSince: 1_700_000_000,
        }),
      ],
    });
    const balances = new Map([["0xowner", 250_000]]);
    const graph = buildGraph(state, new Set(["structural"]), balances);
    const node = graph.nodes.find((n) => n.id === "r1")!;
    expect(node.flagged).toBe(false);
  });

  it("does not flag a pending CRN (waiting + no parent) even with low score", () => {
    const state = makeState({
      ccns: [],
      crns: [crn("r-pending", { parent: null, status: "waiting", score: 0.3 })],
    });
    const graph = buildGraph(state, new Set(["structural"]), new Map());
    const node = graph.nodes.find((n) => n.id === "r-pending")!;
    expect(node.pending).toBe(true);
    expect(node.flagged).toBe(false);
  });

  it("does not enforce the unreachable gate when scheduler status is missing", () => {
    const state = makeState({
      ccns: [ccn("c1", { totalStaked: 1_000_000, resourceNodes: ["r1"] })],
      crns: [crn("r1", { parent: "c1", status: "linked", score: 0.95 })],
    });
    const balances = new Map([["0xowner", 250_000]]);
    // crnStatuses omitted entirely — should not flag
    const graph = buildGraph(state, new Set(["structural"]), balances);
    const node = graph.nodes.find((n) => n.id === "r1")!;
    expect(node.flagged).toBe(false);
  });

  it("flags when both signals fire — still a single boolean, not stackable", () => {
    const state = makeState({
      ccns: [ccn("c1", { totalStaked: 1_000_000, resourceNodes: ["r1"] })],
      crns: [crn("r1", { parent: "c1", status: "linked", score: 0.4 })],
    });
    const balances = new Map([["0xowner", 250_000]]);
    const statuses = new Map([["r1", "unreachable"]]);
    const graph = buildGraph(
      state, new Set(["structural"]), balances, statuses,
    );
    const node = graph.nodes.find((n) => n.id === "r1")!;
    expect(node.flagged).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests, expect failures**

Run: `pnpm test --run src/lib/network-graph-model.test.ts`
Expected: 7 new tests fail. Existing tests still pass.

- [ ] **Step 3: Update `buildGraph` signature and implementation**

Replace the current `buildGraph` signature + the CRN loop in `src/lib/network-graph-model.ts`. The current function:

```ts
export function buildGraph(
  state: NodeState,
  layers: Set<GraphLayer>,
  ownerBalances?: Map<string, number>,
  geo: GeoData = DEFAULT_GEO,
): Graph {
```

Becomes:

```ts
export function buildGraph(
  state: NodeState,
  layers: Set<GraphLayer>,
  ownerBalances?: Map<string, number>,
  crnStatuses?: Map<string, string>,
  geo: GeoData = DEFAULT_GEO,
): Graph {
```

Then in the CRN loop (currently around line 130), replace:

```ts
  for (const r of state.crns.values()) {
    const crnInactive = r.inactiveSince != null;
    nodes.push({
      id: r.hash,
      kind: "crn",
      label: r.name,
      status: r.status,
      owner: r.owner,
      reward: r.reward,
      inactive: crnInactive,
      pending: r.status === "waiting" && !crnInactive && r.parent == null,
    });
  }
```

With:

```ts
  for (const r of state.crns.values()) {
    const crnInactive = r.inactiveSince != null;
    const crnPending =
      r.status === "waiting" && !crnInactive && r.parent == null;
    const schedulerStatus = crnStatuses?.get(r.hash) ?? null;
    const flagged =
      !crnInactive &&
      !crnPending &&
      (
        r.score < CRN_SCORE_THRESHOLD ||
        schedulerStatus === "unreachable"
      );
    nodes.push({
      id: r.hash,
      kind: "crn",
      label: r.name,
      status: r.status,
      owner: r.owner,
      reward: r.reward,
      inactive: crnInactive,
      pending: crnPending,
      flagged,
    });
  }
```

- [ ] **Step 4: Update the existing geo tests for the new param position**

In `src/lib/network-graph-model.test.ts`, find each `buildGraph(state, new Set([...]), undefined, { locations: ..., centroids: ... })` call (6 of them in the `describe("buildGraph — geo layer", ...)` block) and insert another `undefined` before the geo data:

```ts
// Before:
const graph = buildGraph(state, new Set(["structural"]), undefined, {
  locations: { c1: { country: "FR" }, r1: { country: "FR" } },
  centroids: { FR: FR_CENTROID },
});

// After:
const graph = buildGraph(state, new Set(["structural"]), undefined, undefined, {
  locations: { c1: { country: "FR" }, r1: { country: "FR" } },
  centroids: { FR: FR_CENTROID },
});
```

Apply this to all 6 geo-test `buildGraph` calls.

- [ ] **Step 5: Run tests, expect all pass**

Run: `pnpm test --run src/lib/network-graph-model.test.ts`
Expected: all tests pass (including the 7 new ones).

- [ ] **Step 6: Run full typecheck + test suite**

Run: `pnpm check`
Expected: lint + typecheck + tests all pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/network-graph-model.ts src/lib/network-graph-model.test.ts
git commit -m "feat(network): compute flagged for CRNs in buildGraph

Flag = !inactive && !pending && (score < 0.8 || scheduler unreachable).
Adds optional crnStatuses param to buildGraph; missing entries don't
enforce the unreachable gate (loading-window guard)."
```

---

## Task 3: Wire `useNodes` into `useNetworkGraph`

**Files:**
- Modify: `src/hooks/use-network-graph.ts`

- [ ] **Step 1: Add imports + the new map**

In `src/hooks/use-network-graph.ts`, find the `useOwnerBalances` import and add a `useNodes` import below it:

```ts
import { useOwnerBalances } from "@/hooks/use-owner-balances";
import { useNodes } from "@/hooks/use-nodes";
```

`useNodes()` returns a React Query result whose `.data` is `Node[] | undefined` (no pagination wrapper — verified against `src/hooks/use-nodes.ts` and `getNodes()` in `src/api/client.ts`).

- [ ] **Step 2: Build the `crnStatuses` map**

Inside the `useNetworkGraph()` function, right after the `useOwnerBalances(state)` line, add:

```ts
  const { data: nodesData } = useNodes();
  const crnStatuses = useMemo(() => {
    if (!nodesData) return undefined;
    const map = new Map<string, string>();
    for (const n of nodesData) {
      map.set(n.hash, n.status);
    }
    return map;
  }, [nodesData]);
```

- [ ] **Step 3: Thread it into `buildGraph`**

Change the `fullGraph` useMemo from:

```ts
  const fullGraph = useMemo<Graph>(() => {
    if (!state) return { nodes: [], edges: [] };
    return buildGraph(state, layers, ownerBalances);
  }, [state, layers, ownerBalances]);
```

To:

```ts
  const fullGraph = useMemo<Graph>(() => {
    if (!state) return { nodes: [], edges: [] };
    return buildGraph(state, layers, ownerBalances, crnStatuses);
  }, [state, layers, ownerBalances, crnStatuses]);
```

- [ ] **Step 4: Add `crnStatuses` to the result type + return value**

Update the `UseNetworkGraphResult` type to add the new field:

```ts
export type UseNetworkGraphResult = {
  fullGraph: Graph;
  visibleGraph: Graph;
  layers: Set<GraphLayer>;
  focusId: string | null;
  focusStack: string[];
  isLoading: boolean;
  isFetching: boolean;
  nodeState: NodeState | undefined;
  ownerBalances: Map<string, number> | undefined;
  crnStatuses: Map<string, string> | undefined;
};
```

Update the return statement to include `crnStatuses`:

```ts
  return {
    fullGraph,
    visibleGraph,
    layers,
    focusId,
    focusStack,
    isLoading,
    isFetching,
    nodeState: state,
    ownerBalances,
    crnStatuses,
  };
```

- [ ] **Step 5: Run typecheck + tests**

Run: `pnpm check`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/use-network-graph.ts
git commit -m "feat(network): thread scheduler statuses into the graph hook

useNetworkGraph now joins useNodes() output as a per-CRN status map and
feeds it to buildGraph. The map travels through the hook result so the
detail panel can render cause-specific messages."
```

---

## Task 4: Extend `NetworkNode` to render warning ring on flagged

**Files:**
- Modify: `src/components/network/network-node.tsx`

- [ ] **Step 1: Add `flagged` to the `Props` type**

In `src/components/network/network-node.tsx`, find the `Props` type and add the new prop right after `understaked`:

```ts
type Props = {
  id: string;
  x: number;
  y: number;
  kind: GraphNodeKind;
  status: string;
  selected: boolean;
  highlighted: boolean;
  inactive: boolean;
  pending: boolean;
  understaked: boolean;
  flagged: boolean;
  dimmed: boolean;
  sizeScale: number;
};
```

- [ ] **Step 2: Destructure the new prop**

In the `NetworkNode` function definition, add `flagged` to the destructured props (right after `understaked`):

```ts
export const NetworkNode = memo(function NetworkNode({
  id, x, y, kind, status, selected, highlighted, inactive, pending, understaked, flagged, dimmed, sizeScale,
}: Props) {
```

- [ ] **Step 3: Extend the ring + opacity rules**

Replace the `dottedRing` and `opacity` computation. The current block:

```ts
  const dottedRing = pending || understaked;
  // Understaked nodes get the warning ring (amber) at full body opacity —
  // the previous 0.6 dim hid the cue. Pending and inactive still dim because
  // their separate visual (grey body + grey pending ring) carries the signal.
  const opacity = dimmed
    ? 0.18
    : inactive
      ? 0.6
      : pending
        ? 0.6
        : 1;
```

Becomes:

```ts
  const dottedRing = pending || understaked || flagged;
  // Understaked CCNs and flagged CRNs get the warning ring (amber) at full
  // body opacity — the previous 0.6 dim hid the cue. Pending and inactive
  // still dim because their separate visual (grey body + grey pending ring)
  // carries the signal.
  const opacity = dimmed
    ? 0.18
    : inactive
      ? 0.6
      : pending
        ? 0.6
        : 1;
```

- [ ] **Step 4: Extend the warning-ring stroke trigger**

Find the dotted-ring `<circle>` block (currently:

```ts
      {dottedRing && (
        <circle
          cx={x}
          cy={y}
          r={r + 3}
          fill="none"
          stroke={understaked ? "var(--color-warning-500)" : color}
          strokeOpacity={0.6}
          strokeWidth={0.75}
          strokeDasharray="2 2"
          strokeLinecap="round"
        />
      )}
```

) and change the stroke condition to include `flagged`:

```ts
      {dottedRing && (
        <circle
          cx={x}
          cy={y}
          r={r + 3}
          fill="none"
          stroke={understaked || flagged ? "var(--color-warning-500)" : color}
          strokeOpacity={0.6}
          strokeWidth={0.75}
          strokeDasharray="2 2"
          strokeLinecap="round"
        />
      )}
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: passes (callers in next task will satisfy the new required prop).

> Note: this will leave `network-graph.tsx` complaining briefly because it doesn't yet pass `flagged`. That's fixed in Task 5. Don't commit yet.

---

## Task 5: Pass `flagged` from GraphNode to NetworkNode

**Files:**
- Modify: `src/components/network/network-graph.tsx`

- [ ] **Step 1: Locate the `NetworkNode` render call**

Open `src/components/network/network-graph.tsx` and find the `<NetworkNode` JSX (search for `understaked={isUnderstaked(n)}` — it's near line 664).

- [ ] **Step 2: Add the `flagged` prop**

Right after the `understaked={isUnderstaked(n)}` line, add:

```tsx
                flagged={n.flagged === true}
```

The block will look like:

```tsx
              <NetworkNode
                ...
                pending={isPending(n)}
                understaked={isUnderstaked(n)}
                flagged={n.flagged === true}
                ...
              />
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 4: Commit Tasks 4 + 5 together**

```bash
git add src/components/network/network-node.tsx src/components/network/network-graph.tsx
git commit -m "feat(network): render warning ring on flagged CRNs

Extends the understaked-CCN ring trigger to also fire for CRNs flagged
in buildGraph. Same amber ring geometry; no new visual primitives."
```

---

## Task 6: `dotStatusFor` and `crnStatuses` thread in `NetworkDetailPanel`

**Files:**
- Modify: `src/components/network/network-detail-panel.tsx`
- Modify: `src/components/network/network-detail-panel.test.tsx`

- [ ] **Step 1: Add `crnStatuses` to the Props**

Open `src/components/network/network-detail-panel.tsx`. Add the new prop to the `Props` type, right after `ownerBalances`:

```ts
type Props = {
  node: GraphNode | null;
  nodeState: NodeState | undefined;
  ownerBalances: Map<string, number> | undefined;
  crnStatuses: Map<string, string> | undefined;
  visibleGraph: Graph;
  focusNode: GraphNode | null;
  onClose: () => void;
  onFocus: (id: string) => void;
  onStepBackFocus: () => void;
  onClearFocus: () => void;
};
```

- [ ] **Step 2: Destructure and use it**

Update the function signature to destructure `crnStatuses`:

```ts
export function NetworkDetailPanel({
  node,
  nodeState,
  ownerBalances,
  crnStatuses,
  visibleGraph,
  focusNode,
  onClose,
  onFocus,
  onStepBackFocus,
  onClearFocus,
}: Props) {
```

After the `const ccnOwnerBal = ...` line (the lookup that already exists), add:

```ts
  const crnSchedulerStatus = crnInfo
    ? crnStatuses?.get(crnInfo.hash) ?? null
    : null;
  const crnUnreachable = crnSchedulerStatus === "unreachable";
```

- [ ] **Step 3: Pass `unreachable` into the CRN body**

Find the `<NetworkDetailPanelCRN` render call. Add a new prop:

```tsx
        {crnInfo && (
          <NetworkDetailPanelCRN
            info={crnInfo}
            parent={parentInfo}
            country={node.country}
            unreachable={crnUnreachable}
            onFocusParent={onFocus}
          />
        )}
```

- [ ] **Step 4: Extend `dotStatusFor` for flagged CRNs**

Find the `dotStatusFor` function (currently around line 28-36). Replace it with:

```ts
function dotStatusFor(node: GraphNode): DotStatus {
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

- [ ] **Step 5: Update existing tests to pass `crnStatuses={undefined}`**

In `src/components/network/network-detail-panel.test.tsx`, find every `<NetworkDetailPanel` render call (5 of them). After each `ownerBalances={undefined}` line, add:

```tsx
        crnStatuses={undefined}
```

- [ ] **Step 6: Run tests**

Run: `pnpm test --run src/components/network/network-detail-panel.test.tsx`
Expected: passes (we haven't changed observable behavior in the panel shell itself yet; the new branch in `dotStatusFor` only fires when `node.kind === "crn" && node.flagged === true`, which no existing test exercises).

- [ ] **Step 7: Run full check**

Run: `pnpm check`
Expected: lint + typecheck + tests all pass (callers in Task 8 will satisfy the new `unreachable` prop on the CRN body; the type checker won't accept this commit until that's done).

> Same as before — don't commit Task 6 until Tasks 7 + 8 are done; they coordinate to keep the type check green.

---

## Task 7: Page wiring — thread `crnStatuses` to the panel

**Files:**
- Modify: `src/app/network/page.tsx`

- [ ] **Step 1: Destructure `crnStatuses` from the hook**

In `src/app/network/page.tsx`, find the `useNetworkGraph()` destructure and add `crnStatuses`:

```tsx
  const {
    fullGraph,
    visibleGraph,
    focusId,
    isLoading,
    isFetching,
    nodeState,
    ownerBalances,
    crnStatuses,
  } = useNetworkGraph();
```

- [ ] **Step 2: Pass it to `NetworkDetailPanel`**

Find the `<NetworkDetailPanel` render call. Add `crnStatuses` after `ownerBalances`:

```tsx
          <NetworkDetailPanel
            node={selectedNode}
            nodeState={nodeState}
            ownerBalances={ownerBalances}
            crnStatuses={crnStatuses}
            visibleGraph={visibleGraph}
            focusNode={focusNode}
            onClose={onClosePanel}
            onFocus={onFocus}
            onStepBackFocus={onStepBackFocus}
            onClearFocus={onClearFocus}
          />
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: still fails — the CRN body doesn't accept `unreachable` yet. Task 8 closes the loop.

---

## Task 8: CRN panel — chip variant + unreachable prop + cascade messages (TDD)

**Files:**
- Modify: `src/components/network/network-detail-panel-crn.tsx`
- Modify: `src/components/network/network-detail-panel-crn.test.tsx`

- [ ] **Step 1: Read the existing test file to learn its shape**

Run: `cat src/components/network/network-detail-panel-crn.test.tsx | head -60` to see how the existing tests construct a CRN and render the panel. New tests follow the same shape.

- [ ] **Step 2: Add failing tests**

The existing test file's CRN fixture is named `CRN` (`src/components/network/network-detail-panel-crn.test.tsx` line 9). The file mocks `useNode` from `@/hooks/use-nodes` via `vi.mock`. New tests must set up the mock the same way the existing ones do — otherwise `useNode(info.hash)` will hit React Query.

Append these cases inside the existing `describe("NetworkDetailPanelCRN", ...)` block:

```tsx
  it("renders the unreachable message when scheduler health is failing", () => {
    useNodeMock.mockReturnValue({
      data: null,
      isLoading: false,
    } as unknown as ReturnType<typeof useNode>);

    renderWithQuery(
      <NetworkDetailPanelCRN
        info={{ ...CRN, status: "linked", score: 0.95 }}
        parent={PARENT}
        unreachable={true}
        onFocusParent={() => {}}
      />,
    );
    expect(
      screen.getByText(/Unreachable — scheduler health check is failing/i),
    ).toBeInTheDocument();
  });

  it("renders the low-score message when score is below 0.8 and reachable", () => {
    useNodeMock.mockReturnValue({
      data: null,
      isLoading: false,
    } as unknown as ReturnType<typeof useNode>);

    renderWithQuery(
      <NetworkDetailPanelCRN
        info={{ ...CRN, status: "linked", score: 0.65 }}
        parent={PARENT}
        unreachable={false}
        onFocusParent={() => {}}
      />,
    );
    expect(
      screen.getByText(/Low score \(0\.65\) — below the 0\.8 threshold/i),
    ).toBeInTheDocument();
  });

  it("prefers the unreachable message when both signals fire (severity cascade)", () => {
    useNodeMock.mockReturnValue({
      data: null,
      isLoading: false,
    } as unknown as ReturnType<typeof useNode>);

    renderWithQuery(
      <NetworkDetailPanelCRN
        info={{ ...CRN, status: "linked", score: 0.4 }}
        parent={PARENT}
        unreachable={true}
        onFocusParent={() => {}}
      />,
    );
    expect(
      screen.getByText(/Unreachable — scheduler health check is failing/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Low score/i),
    ).not.toBeInTheDocument();
  });
```

- [ ] **Step 3: Update existing render calls in this file to pass `unreachable={false}`**

The existing 4 `<NetworkDetailPanelCRN` render calls (lines 57, 87, 105, 121 in the original file) need `unreachable={false}` added — the prop becomes required after Step 5.

- [ ] **Step 4: Run tests, expect failures**

Run: `pnpm test --run src/components/network/network-detail-panel-crn.test.tsx`
Expected: the 3 new tests fail (unreachable / low-score / cascade); existing tests fail too because the panel doesn't accept `unreachable` yet.

- [ ] **Step 5: Update `Props` and destructure**

The current `Props` type in `src/components/network/network-detail-panel-crn.tsx` (line 12):

```ts
type Props = {
  info: CRNInfo;
  parent: CCNInfo | null;
  country?: string | undefined;
  onFocusParent: (parentId: string) => void;
};
```

Becomes:

```ts
type Props = {
  info: CRNInfo;
  parent: CCNInfo | null;
  country?: string | undefined;
  unreachable: boolean;
  onFocusParent: (parentId: string) => void;
};
```

Update the function destructure (line 25):

```tsx
export function NetworkDetailPanelCRN({
  info, parent, country, unreachable, onFocusParent,
}: Props) {
```

- [ ] **Step 6: Extend `crnChipVariant`**

The current `crnChipVariant` (lines 19-23):

```ts
function crnChipVariant(info: CRNInfo): "success" | "warning" | "default" {
  if (info.inactiveSince != null) return "default";
  if (info.status === "active" || info.status === "linked") return "success";
  return "warning";
}
```

Becomes:

```ts
function crnChipVariant(
  info: CRNInfo,
  unreachable: boolean,
): "success" | "warning" | "default" {
  if (info.inactiveSince != null) return "default";
  if (unreachable) return "warning";
  if (info.score < 0.8) return "warning";
  if (info.status === "active" || info.status === "linked") return "success";
  return "warning";
}
```

- [ ] **Step 7: Update the Badge call site**

The Status row Badge (line 43) currently calls `crnChipVariant(info)`. Update to pass `unreachable`:

```tsx
<Badge fill="outline" variant={crnChipVariant(info, unreachable)} size="sm">
  {info.status}
</Badge>
```

- [ ] **Step 8: Add the cascade messages at panel root**

The existing pending message lives inside the Parent CCN section as a ternary (line 89-92), only firing when `parent == null`. Leave it alone — it serves the no-parent case.

For the new unreachable / low-score notes, add them at the **panel root level**, immediately after the closing `</dl>` (around line 75), before the Parent CCN section. This mirrors the placement pattern from the CCN panel (italic note between dl and stat tiles):

```tsx
        )}
      </dl>

      {info.parent != null && info.inactiveSince == null && unreachable && (
        <p className="text-xs italic text-muted-foreground">
          Unreachable — scheduler health check is failing.
        </p>
      )}
      {info.parent != null && info.inactiveSince == null && !unreachable && info.score < CRN_SCORE_THRESHOLD && (
        <p className="text-xs italic text-muted-foreground">
          Low score ({info.score.toFixed(2)}) — below the 0.8 threshold.
        </p>
      )}

      <div className="space-y-1 border-t border-edge pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Parent CCN
        </h4>
```

Then add a new import at the top of the file so `CRN_SCORE_THRESHOLD` is available:

```ts
import { CRN_SCORE_THRESHOLD } from "@/lib/network-graph-model";
```

(The conditions never overlap with the existing pending note because pending requires `parent == null` and these require `parent != null`.)

- [ ] **Step 9: Run tests, expect pass**

Run: `pnpm test --run src/components/network/network-detail-panel-crn.test.tsx`
Expected: all tests pass (the 3 new + existing).

- [ ] **Step 10: Run full check**

Run: `pnpm check`
Expected: lint + typecheck + tests all pass.

- [ ] **Step 11: Commit Tasks 6 + 7 + 8 together**

```bash
git add src/components/network/network-detail-panel.tsx \
        src/components/network/network-detail-panel.test.tsx \
        src/components/network/network-detail-panel-crn.tsx \
        src/components/network/network-detail-panel-crn.test.tsx \
        src/app/network/page.tsx
git commit -m "feat(network): surface CRN flag in the detail panel

dotStatusFor returns degraded for flagged CRNs; chip variant flips to
warning. CRN panel now renders cause-specific italic notes —
\"Unreachable — scheduler health check is failing.\" or
\"Low score (X.XX) — below the 0.8 threshold.\" — with unreachable
winning when both signals fire."
```

---

## Task 9: Verify and refine

- [ ] **Step 1: Run full project checks**

Run: `pnpm check`
Expected: lint + typecheck + tests all pass.

- [ ] **Step 2: Manual smoke test in dev**

Run `preview start feature/crn-highlights` (or `pnpm dev`) and:
- Navigate to `/network`.
- Look for CRNs with the amber warning ring. There should be at least a few — CRNs with score < 0.8 exist in live data.
- Click one. The detail panel should:
  - Show an amber StatusDot in the header (not green).
  - Show an amber-outlined Status badge.
  - Show the italic note: either "Unreachable…" or "Low score (X.XX)…".
- Click an unflagged CRN to confirm the visual treatment is gated correctly (green dot, no italic note).
- Open the staker layer (if you haven't already) and confirm the warning ring still reads on the smaller CRN radius without colliding with the staker amber edges.

- [ ] **Step 3: Visual sanity check at default zoom**

At the default fit-all zoom, is the warning ring on CRNs (radius 11) still legible without overpowering the graph? If the amber ring at CRN scale looks too prominent or too faint, note it but do not change without user input. The visual was approved as "same treatment as understaked CCN" in the design — keep it consistent unless feedback comes in.

- [ ] **Step 4: Stop if anything fails**

If a check fails or the visual is broken, fix in place and re-run. If the failure isn't trivial, surface it to the user — don't bulldoze through.

---

## Task 10: Update docs and version

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/BACKLOG.md` (if applicable — likely no change)
- Modify: `src/changelog.ts`

- [ ] **Step 1: `CLAUDE.md` — extend the Network graph features paragraph**

In `CLAUDE.md`, find the "Pending / understaked states" block in the Network graph page bullet. Extend the description to include the CRN flag. Suggested wording:

> **Pending / understaked / flagged states** (Decisions #80, #83, #84, #85): `buildGraph` precomputes `pending` (CRN with `parent=null` OR CCN with no resource_nodes, both flagged by the activation rule below), `understaked` (CCN *with* attached CRNs but below the activation rule), and `flagged` (linked CRN with `score < CRN_SCORE_THRESHOLD = 0.8` OR scheduler reports `"unreachable"`). Visual: **pending** renders grey body + pending ring; **understaked** and **flagged** both render kind color body at full opacity + warning ring (same amber dotted geometry, `var(--color-warning-500)`) — the cause is surfaced in the detail panel.

- [ ] **Step 2: `docs/ARCHITECTURE.md` — same extension**

Mirror the wording from Step 1 in `docs/ARCHITECTURE.md`'s "Pending / understaked states" block. Reference Decisions #80, #83, #84, #85.

- [ ] **Step 3: `docs/DECISIONS.md` — add Decision #85**

Insert a new entry above #84 with the next sequential number. Use this template (fill in the SHA after the squash-merge):

```markdown
## Decision #85 - 2026-05-12
**Context:** The CCN visual vocabulary now distinguishes operational from pending and understaked, but CRNs only had the pending ring (no parent CCN). CRNs with operational issues — low score or scheduler-reported unreachable — rendered identically to healthy CRNs, hiding real problems.
**Decision:** Extend the warning ring (Decision #84) to CRNs via a new `flagged: boolean` field on `GraphNode`, computed in `buildGraph` as `!inactive && !pending && (score < CRN_SCORE_THRESHOLD || schedulerStatus === "unreachable")`. `CRN_SCORE_THRESHOLD = 0.8` is a new constant in `network-graph-model.ts`. Scheduler status is sourced from `useNodes()` (already used by `/nodes`), reduced to a `Map<crnHash, status>` in `useNetworkGraph` and threaded into `buildGraph` as a new `crnStatuses?` param. The visual is the warning ring — same `0.75 / 2-2 / 0.6` geometry as understaked CCNs — so the vocabulary is uniform. Detail panel cascades: pending > unreachable > low-score, with cause-specific italic notes. `dotStatusFor` flips to `degraded` for flagged CRNs; `crnChipVariant` to `warning`.
**Rationale:** Reuses the visual primitive established for understaked CCNs (Decision #84) so the alert vocabulary stays consistent across kinds. Sourcing scheduler health via `useNodes()` rather than a new endpoint costs nothing — the data is already in the React Query cache for users who have visited `/nodes`. The loading-window guard (missing `crnStatuses` entry → don't flag) prevents a transient flash of warning rings on first paint, same pattern as the owner-balance guard from Decision #83. Score < 0.8 was chosen for sparseness: most CRNs score well above 0.8, so the flag stays meaningful.
**Alternatives considered:** Red body for unreachable, warning ring for low score (rejected — introduces a second visual primitive; "broken vs underperforming" nuance is fine in the panel, not needed at glance). Stackable cues (body color + ring) (rejected — visual budget on 553 CRNs is tight, two channels per node is too much). Joining VM scheduling discrepancies (orphaned/misplaced VMs) as a third signal (rejected — already surfaced on the Issues page; no need for a parallel graph signal). New endpoint for graph-only health (rejected — `useNodes()` already serves the data and shares its cache).
```

- [ ] **Step 4: `docs/BACKLOG.md` — check for matching entries**

Skim the Ready / Needs Planning / Roadmap sections for any item matching "CRN highlights", "CRN warning ring", or similar. If found, move to Completed. Likely no match.

- [ ] **Step 5: `src/changelog.ts` — bump version and add VersionEntry**

Update `CURRENT_VERSION` from `"0.15.0"` to `"0.16.0"`. Insert a new entry at the top of `CHANGELOG`:

```ts
  {
    version: "0.16.0",
    date: "2026-05-12",
    changes: [
      {
        type: "feature",
        text: "Network graph CRN highlights: CRNs with score below 0.8 or that the scheduler reports as **unreachable** now wear the same amber warning ring used for understaked CCNs. The detail panel surfaces the cause — \"Unreachable — scheduler health check is failing.\" or \"Low score (X.XX) — below the 0.8 threshold.\" — with the StatusDot and Status Badge flipping to amber to match. One visual vocabulary across CCN and CRN alert states.",
      },
    ],
  },
```

- [ ] **Step 6: Run final check**

Run: `pnpm check`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md docs/ARCHITECTURE.md docs/DECISIONS.md docs/BACKLOG.md src/changelog.ts docs/superpowers/specs/2026-05-12-crn-highlights-design.md docs/superpowers/plans/2026-05-12-crn-highlights.md
git commit -m "docs: CRN highlights — Decision #85, ARCHITECTURE, CLAUDE.md, changelog v0.16.0"
```

(The two `docs/superpowers/` files are the spec + this plan, both currently untracked from the brainstorming session. Including them in this final commit ships the design artifacts alongside the feature.)

---

## Done

After Task 10:
- Branch `feature/crn-highlights` has the full feature + tests + docs.
- The plan's status frontmatter at the top should be updated to `status: done` before invoking the ship sequence.
- Run `/dio:ship` (or invoke the ship skill directly) to push, open the PR, run the CI gate, squash-merge, and clean up local state.
