# Earnings Reconciliation Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Reward address breakdown" Card to the Earnings tab on both CRN and CCN node detail views that decomposes the reward address's window earnings into four buckets (this node / other same-kind / cross-kind / staking), anchored on the current node.

**Architecture:** Pure data derivation in `useNodeEarnings` — no new API calls, just looking up the current node's reward address in the existing `summary.recipients` (`RecipientTotal[]`). One new presentational component slotted between the chart Card and the per-VM/linked-CRN Card.

**Tech Stack:** React 19, TypeScript (strict), React Query (existing), Tailwind 4, `@aleph-front/ds` components (Card, CopyableText, Skeleton, Badge), Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-05-13-earnings-reconciliation-design.md`

---

## Task 1: Export `getRewardAddress` from `credit-distribution.ts`

The reconciliation hook needs to resolve a node's reward address (`node.reward || node.owner`). The function already exists privately in `credit-distribution.ts` — just needs to be exported so other modules can use it.

**Files:**
- Modify: `src/lib/credit-distribution.ts` (line 64)

- [ ] **Step 1: Export the function**

Open `src/lib/credit-distribution.ts` and change line 64 from:
```ts
function getRewardAddress(node: { reward: string; owner: string }): string {
  return node.reward || node.owner;
}
```
to:
```ts
export function getRewardAddress(node: { reward: string; owner: string }): string {
  return node.reward || node.owner;
}
```

- [ ] **Step 2: Verify no other call site needs updating**

Run: `rg "getRewardAddress" src/`
Expected: All usages are inside `src/lib/credit-distribution.ts`. No callers elsewhere yet (we'll add one in Task 2).

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add src/lib/credit-distribution.ts
git commit -m "refactor(credit): export getRewardAddress helper"
```

---

## Task 2: Extend `useNodeEarnings` with `reconciliation` field

Add a `Reconciliation` type to the hook's return shape, compute it from `summary.recipients`, and cover with tests.

**Files:**
- Modify: `src/hooks/use-node-earnings.ts`
- Modify: `src/hooks/use-node-earnings.test.tsx`

- [ ] **Step 1: Write the failing test for CRN view with overlap**

Append this test to `src/hooks/use-node-earnings.test.tsx` inside the `describe("useNodeEarnings", ...)` block, before the closing `});`:

```tsx
it("computes reconciliation for CRN view when reward address overlaps", async () => {
  // Two CRNs and a CCN all paying the same reward address `0xWALLET`.
  // crn1 earns this window; crn2 doesn't appear in expenses but counts toward crnCount.
  // The CCN earns via score weighting because it's `active`.
  const expenses = [
    makeExpense(NOW - 100, 100, "crn1", "vmA"),
    makeExpense(NOW - 200, 50, "crn1", "vmB"),
  ];
  (useCreditExpenses as ReturnType<typeof vi.fn>)
    .mockReturnValueOnce({ data: expenses, isLoading: false, isPlaceholderData: false })
    .mockReturnValueOnce({ data: [], isLoading: false, isPlaceholderData: false });
  (useNodeState as ReturnType<typeof vi.fn>).mockReturnValue({
    data: makeState(
      [
        makeCrn({ hash: "crn1", reward: "0xWALLET" }),
        makeCrn({ hash: "crn2", reward: "0xWALLET" }),
      ],
      [makeCcn({ hash: "ccn1", reward: "0xWALLET" })],
    ),
  });
  (useNode as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { hash: "crn1", vms: [], history: [] } as unknown as NodeDetail,
  });
  (useNodes as ReturnType<typeof vi.fn>).mockReturnValue({ data: [] });

  const { result } = renderHook(() => useNodeEarnings("crn1", "24h"), { wrapper });

  await waitFor(() => {
    expect(result.current.data).toBeDefined();
  });

  const recon = result.current.data!.reconciliation;
  expect(recon).not.toBeNull();
  expect(recon!.rewardAddr).toBe("0xWALLET");
  // thisNode = 60% of (100 + 50) = 90 (the CRN execution share for crn1)
  expect(recon!.thisNode).toBeCloseTo(90);
  expect(recon!.otherSameKind.count).toBe(1); // crn2
  expect(recon!.otherSameKind.aleph).toBeCloseTo(0); // crn2 didn't earn this window
  // The CCN got 15% of execution = 22.5
  expect(recon!.crossKind.role).toBe("ccn");
  expect(recon!.crossKind.aleph).toBeCloseTo(22.5);
  // No stakers configured on the CCN, so staker share didn't get distributed
  expect(recon!.staker).toBe(0);
  expect(recon!.windowAleph).toBeCloseTo(90 + 0 + 22.5 + 0);
});

it("computes reconciliation for CCN view with cross-kind CRN earnings", async () => {
  // CCN earns via score weighting; the same reward address also operates a CRN that earns.
  const expenses = [makeExpense(NOW - 100, 100, "crn1", "vmA")];
  (useCreditExpenses as ReturnType<typeof vi.fn>)
    .mockReturnValueOnce({ data: expenses, isLoading: false, isPlaceholderData: false })
    .mockReturnValueOnce({ data: [], isLoading: false, isPlaceholderData: false });
  (useNodeState as ReturnType<typeof vi.fn>).mockReturnValue({
    data: makeState(
      [makeCrn({ hash: "crn1", reward: "0xWALLET", parent: "ccn1" })],
      [makeCcn({ hash: "ccn1", reward: "0xWALLET" })],
    ),
  });
  (useNode as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { hash: "ccn1", vms: [], history: [] } as unknown as NodeDetail,
  });
  (useNodes as ReturnType<typeof vi.fn>).mockReturnValue({ data: [] });

  const { result } = renderHook(() => useNodeEarnings("ccn1", "24h"), { wrapper });

  await waitFor(() => {
    expect(result.current.data).toBeDefined();
  });

  const recon = result.current.data!.reconciliation;
  expect(recon).not.toBeNull();
  expect(recon!.rewardAddr).toBe("0xWALLET");
  // thisNode = the CCN's score-weighted share (15% of execution = 15)
  expect(recon!.thisNode).toBeCloseTo(15);
  expect(recon!.otherSameKind.count).toBe(0); // no other CCNs paying this reward
  expect(recon!.otherSameKind.aleph).toBeCloseTo(0);
  // Cross-kind is CRN share: 60% of 100 = 60
  expect(recon!.crossKind.role).toBe("crn");
  expect(recon!.crossKind.aleph).toBeCloseTo(60);
});

it("returns reconciliation = null when reward address has zero earnings in window", async () => {
  (useCreditExpenses as ReturnType<typeof vi.fn>).mockReturnValue({
    data: [],
    isLoading: false,
    isPlaceholderData: false,
  });
  (useNodeState as ReturnType<typeof vi.fn>).mockReturnValue({
    data: makeState([makeCrn({ reward: "0xWALLET" })], [makeCcn()]),
  });
  (useNode as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { hash: "crn1", vms: [], history: [] } as unknown as NodeDetail,
  });
  (useNodes as ReturnType<typeof vi.fn>).mockReturnValue({ data: [] });

  const { result } = renderHook(() => useNodeEarnings("crn1", "24h"), { wrapper });

  await waitFor(() => {
    expect(result.current.data).toBeDefined();
  });

  expect(result.current.data!.reconciliation).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/hooks/use-node-earnings.test.tsx`
Expected: 3 new tests FAIL with errors about `reconciliation` being undefined.

- [ ] **Step 3: Add the `Reconciliation` type to the hook**

Open `src/hooks/use-node-earnings.ts`. After the existing `NodeEarningsLinkedCrn` type (around line 33), add:

```ts
export type Reconciliation = {
  rewardAddr: string;
  windowAleph: number;
  thisNode: number;
  otherSameKind: { aleph: number; count: number };
  crossKind: { aleph: number; role: "crn" | "ccn" };
  staker: number;
};
```

Then extend the `NodeEarnings` type (around line 35) to include the field:

```ts
export type NodeEarnings = {
  role: "crn" | "ccn";
  totalAleph: number;
  delta: { aleph: number; secondaryCount: number };
  buckets: NodeEarningsBucket[];
  perVm?: NodeEarningsPerVm[];
  linkedCrns?: NodeEarningsLinkedCrn[];
  reconciliation: Reconciliation | null;
};
```

- [ ] **Step 4: Import `getRewardAddress` in the hook**

At the top of `src/hooks/use-node-earnings.ts`, update the import:

```ts
import {
  computeDistributionSummary,
  getRewardAddress,
} from "@/lib/credit-distribution";
```

- [ ] **Step 5: Implement the reconciliation computation**

Inside the `useMemo` body in `use-node-earnings.ts`, just before each of the two `return { role, totalAleph, ... }` statements (one in the CRN branch, one in the CCN branch), compute the reconciliation. Add this helper near the top of the `useMemo` body, after `const role: "crn" | "ccn" = isCcn ? "ccn" : "crn";`:

```ts
const node = isCcn ? nodeState.ccns.get(hash)! : nodeState.crns.get(hash)!;
const rewardAddr = getRewardAddress(node);
```

Then, just before the CRN branch's `return { role, totalAleph, delta, buckets: bucketsOut, perVm };` (around line 159), insert:

```ts
const recipient = currentSummary.recipients.find(
  (r) => r.address === rewardAddr,
);
const reconciliation = recipient
  ? {
      rewardAddr,
      thisNode: totalAleph,
      otherSameKind: {
        aleph: recipient.crnAleph - totalAleph,
        count: Math.max(0, recipient.crnCount - 1),
      },
      crossKind: { aleph: recipient.ccnAleph, role: "ccn" as const },
      staker: recipient.stakerAleph,
      windowAleph:
        recipient.crnAleph + recipient.ccnAleph + recipient.stakerAleph,
    }
  : null;
return {
  role,
  totalAleph,
  delta,
  buckets: bucketsOut,
  perVm,
  reconciliation,
};
```

Replace the existing CRN-branch return with the new one above.

Similarly, before the CCN branch's `return { role, totalAleph, delta, buckets: bucketsOut, linkedCrns };` (around line 173), insert:

```ts
const recipient = currentSummary.recipients.find(
  (r) => r.address === rewardAddr,
);
const reconciliation = recipient
  ? {
      rewardAddr,
      thisNode: totalAleph,
      otherSameKind: {
        aleph: recipient.ccnAleph - totalAleph,
        count: Math.max(0, recipient.ccnCount - 1),
      },
      crossKind: { aleph: recipient.crnAleph, role: "crn" as const },
      staker: recipient.stakerAleph,
      windowAleph:
        recipient.crnAleph + recipient.ccnAleph + recipient.stakerAleph,
    }
  : null;
return {
  role,
  totalAleph,
  delta,
  buckets: bucketsOut,
  linkedCrns,
  reconciliation,
};
```

Replace the existing CCN-branch return with the new one above.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run src/hooks/use-node-earnings.test.tsx`
Expected: All tests PASS, including the 3 new ones.

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: PASS — no callers should break because `reconciliation` is a new field, not a renamed one. The DS Spark component and earnings chart don't read it.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/use-node-earnings.ts src/hooks/use-node-earnings.test.tsx
git commit -m "feat(earnings): add reward-address reconciliation to useNodeEarnings"
```

---

## Task 3: Create `NodeEarningsReconciliation` component

Pure presentational component that takes the reconciliation object and renders the Card with stacked bar, label row, and "View full wallet →" link. Handles the no-overlap caption state internally. Returns `null` when `reconciliation === null`.

**Files:**
- Create: `src/components/node-earnings-reconciliation.tsx`
- Create: `src/components/node-earnings-reconciliation.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/node-earnings-reconciliation.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NodeEarningsReconciliation } from "./node-earnings-reconciliation";
import type { Reconciliation } from "@/hooks/use-node-earnings";

const fullReconciliation: Reconciliation = {
  rewardAddr: "0xWALLET",
  windowAleph: 14.28,
  thisNode: 7.42,
  otherSameKind: { aleph: 3.18, count: 3 },
  crossKind: { aleph: 2.40, role: "ccn" },
  staker: 1.28,
};

const noOverlap: Reconciliation = {
  rewardAddr: "0xWALLET",
  windowAleph: 7.42,
  thisNode: 7.42,
  otherSameKind: { aleph: 0, count: 0 },
  crossKind: { aleph: 0, role: "ccn" },
  staker: 0,
};

describe("NodeEarningsReconciliation", () => {
  it("returns null when reconciliation is null", () => {
    const { container } = render(
      <NodeEarningsReconciliation
        reconciliation={null}
        range="24h"
        kind="crn"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the no-overlap caption when no portfolio overlap", () => {
    render(
      <NodeEarningsReconciliation
        reconciliation={noOverlap}
        range="24h"
        kind="crn"
      />,
    );
    expect(
      screen.getByText(/earned only from this node in the last 24h/i),
    ).toBeInTheDocument();
    // No stacked bar segments rendered
    expect(screen.queryByTestId("reconciliation-bar")).toBeNull();
  });

  it("renders the stacked bar and labels for CRN view with overlap", () => {
    render(
      <NodeEarningsReconciliation
        reconciliation={fullReconciliation}
        range="24h"
        kind="crn"
      />,
    );
    // Stacked bar present
    expect(screen.getByTestId("reconciliation-bar")).toBeInTheDocument();
    // CRN view labels
    expect(screen.getByText("This node")).toBeInTheDocument();
    expect(screen.getByText(/Other CRNs \(3\)/)).toBeInTheDocument();
    expect(screen.getByText("CCN ops")).toBeInTheDocument();
    expect(screen.getByText("Staking")).toBeInTheDocument();
  });

  it("renders CCN-view labels for CCN kind", () => {
    render(
      <NodeEarningsReconciliation
        reconciliation={{
          ...fullReconciliation,
          otherSameKind: { aleph: 3.18, count: 2 },
          crossKind: { aleph: 2.40, role: "crn" },
        }}
        range="7d"
        kind="ccn"
      />,
    );
    expect(screen.getByText(/Other CCNs \(2\)/)).toBeInTheDocument();
    expect(screen.getByText("CRN ops")).toBeInTheDocument();
  });

  it("links to /wallet?address=<rewardAddr>", () => {
    render(
      <NodeEarningsReconciliation
        reconciliation={fullReconciliation}
        range="24h"
        kind="crn"
      />,
    );
    const link = screen.getByRole("link", { name: /view full wallet/i });
    expect(link).toHaveAttribute("href", "/wallet?address=0xWALLET");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/node-earnings-reconciliation.test.tsx`
Expected: FAIL with "Cannot find module './node-earnings-reconciliation'".

- [ ] **Step 3: Create the component**

Create `src/components/node-earnings-reconciliation.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@aleph-front/ds/card";
import { CopyableText } from "@aleph-front/ds/copyable-text";
import { formatAleph } from "@/lib/format";
import type { Reconciliation } from "@/hooks/use-node-earnings";
import type { CreditRange } from "@/hooks/use-credit-expenses";

type Props = {
  reconciliation: Reconciliation | null;
  range: CreditRange;
  kind: "crn" | "ccn";
};

type Segment = {
  key: "this" | "other" | "cross" | "staker";
  label: string;
  aleph: number;
  colorClass: string;  // Tailwind bg-* class
  swatchClass: string; // Tailwind bg-* class for the legend dot
};

const RANGE_LABEL: Record<CreditRange, string> = {
  "24h": "last 24h",
  "7d": "last 7d",
  "30d": "last 30d",
};

function buildSegments(
  r: Reconciliation,
  kind: "crn" | "ccn",
): Segment[] {
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
}: Props) {
  const [hoveredKey, setHoveredKey] = useState<Segment["key"] | null>(null);

  if (!reconciliation) return null;

  const r = reconciliation;
  const hasOverlap =
    r.otherSameKind.aleph + r.crossKind.aleph + r.staker > 0;
  const rangeLabel = RANGE_LABEL[range];
  const walletHref = `/wallet?address=${r.rewardAddr}`;

  return (
    <Card padding="md">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Reward address breakdown
        </div>
        <Link
          href={walletHref}
          className="text-xs text-primary-500 transition-colors hover:text-primary-300 dark:text-primary-300"
        >
          View full wallet →
        </Link>
      </div>

      {hasOverlap ? (
        <>
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
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
            onMouseLeave={() => setHoveredKey(null)}
          >
            {buildSegments(r, kind).map((seg) => {
              if (seg.aleph <= 0) return null;
              const widthPct = (seg.aleph / r.windowAleph) * 100;
              const dimmed = hoveredKey !== null && hoveredKey !== seg.key;
              return (
                <div
                  key={seg.key}
                  className={`${seg.colorClass} transition-opacity ${dimmed ? "opacity-50" : ""}`}
                  style={{ flexGrow: widthPct, minWidth: "4px" }}
                  aria-label={`${seg.label}: ${formatAleph(seg.aleph)} ALEPH`}
                  onMouseEnter={() => setHoveredKey(seg.key)}
                />
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            {buildSegments(r, kind).map((seg) => {
              const pct = r.windowAleph > 0 ? (seg.aleph / r.windowAleph) * 100 : 0;
              return (
                <div key={seg.key} className="flex items-start gap-2">
                  <span
                    className={`mt-1 inline-block h-2 w-2 rounded-full ${seg.swatchClass}`}
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
        </>
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/components/node-earnings-reconciliation.test.tsx`
Expected: All 5 tests PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/node-earnings-reconciliation.tsx src/components/node-earnings-reconciliation.test.tsx
git commit -m "feat(earnings): add NodeEarningsReconciliation panel component"
```

---

## Task 4: Slot reconciliation into CRN and CCN earnings tabs

Render the new component between the chart Card and the per-VM / linked-CRN Card.

**Files:**
- Modify: `src/components/node-earnings-tab.tsx`
- Modify: `src/components/node-earnings-tab-ccn.tsx`

- [ ] **Step 1: Add the import and slot to the CRN tab**

In `src/components/node-earnings-tab.tsx`, after the existing import of `NodeEarningsChart` (around line 19), add:

```ts
import { NodeEarningsReconciliation } from "@/components/node-earnings-reconciliation";
```

Then, in the JSX, immediately after the chart `</Card>` (around line 150) and before the `{perVm.length > 0 && (` per-VM Card, insert:

```tsx
<NodeEarningsReconciliation
  reconciliation={data.reconciliation}
  range={range}
  kind="crn"
/>
```

- [ ] **Step 2: Add the import and slot to the CCN tab**

In `src/components/node-earnings-tab-ccn.tsx`, after the existing import of `NodeEarningsChart` (around line 20), add:

```ts
import { NodeEarningsReconciliation } from "@/components/node-earnings-reconciliation";
```

Then, in the JSX, immediately after the chart `</Card>` (around line 151) and before the `{data.linkedCrns && data.linkedCrns.length > 0 && (` linked-CRN Card, insert:

```tsx
<NodeEarningsReconciliation
  reconciliation={data.reconciliation}
  range={range}
  kind="ccn"
/>
```

- [ ] **Step 3: Update existing tab-test mocks to include `reconciliation: null`**

The existing tests in `src/components/node-earnings-tab.test.tsx` and `src/components/node-earnings-tab-ccn.test.tsx` mock `useNodeEarnings` to return a `data` object that doesn't include the new `reconciliation` field. The mock is cast through `as ReturnType<typeof vi.fn>` so the test compiles, and at runtime `data.reconciliation` is `undefined` — which the component still treats as "render nothing" (because `if (!reconciliation) return null`). The tests will pass.

Even so, keep the mocks honest: in each `mockReturnValue({ data: { ... } })` call inside both files, add `reconciliation: null,` to the `data` object alongside the other fields (`role`, `totalAleph`, `delta`, `buckets`, etc.).

- [ ] **Step 4: Run tab tests**

Run: `pnpm vitest run src/components/node-earnings-tab.test.tsx src/components/node-earnings-tab-ccn.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/node-earnings-tab.tsx src/components/node-earnings-tab-ccn.tsx src/components/node-earnings-tab.test.tsx src/components/node-earnings-tab-ccn.test.tsx
git commit -m "feat(earnings): slot reconciliation panel into CRN and CCN earnings tabs"
```

---

## Task 5: Verify and refine

- [ ] **Step 1: Run full project checks**

Run: `pnpm check`
Expected: lint + typecheck + tests all PASS.

- [ ] **Step 2: Manual smoke test — CRN with portfolio overlap**

Start the dev server: `pnpm dev`

Open in browser: `http://localhost:3000/nodes?view=<some-crn-hash>&tab=earnings`

Pick a CRN whose owner is known to operate multiple nodes (any CRN owned by a busy operator — check `nodeState.crns` for `owner`/`reward` duplicates). Verify:
- Reconciliation Card appears between chart and per-VM table
- Stacked bar shows four segments proportional to ALEPH
- Label row shows correct values
- `View full wallet →` navigates to `/wallet?address=<addr>`
- Switching ranges (24h/7d/30d) updates the bar

- [ ] **Step 3: Manual smoke test — CRN with no overlap**

Find a CRN whose reward address only operates that one node and doesn't stake. Verify:
- The no-overlap caption appears: "<address> earned only from this node in the last 24h."
- Wallet link still works.

- [ ] **Step 4: Manual smoke test — CCN view**

Open: `http://localhost:3000/nodes?view=<some-ccn-hash>&tab=earnings`

Verify the reconciliation panel renders symmetrically for the CCN side: same shape, "Other CCNs (N)" / "CRN ops" labels.

- [ ] **Step 5: Manual smoke test — dark/light theme**

Toggle the theme. Verify segment colors remain legible on both backgrounds (the `--color-*-500` tokens already adapt).

- [ ] **Step 6: Fix any issues found**

If anything is off (proportions wrong, alignment broken, missing field on a node), fix inline and re-run `pnpm check`.

- [ ] **Step 7: Commit any fixes**

```bash
git add <changed-files>
git commit -m "fix(earnings): <specific issue>"
```

If no fixes were needed, skip this step.

---

## Task 6: Update docs and version

- [ ] **Step 1: Update `docs/ARCHITECTURE.md`**

Find the existing earnings-related section (run `rg -n "useNodeEarnings\|node-earnings-tab\|Earnings tab" docs/ARCHITECTURE.md` to locate the relevant heading). Add a short subsection or bullet item below it that says, in substance:

- New presentational component `src/components/node-earnings-reconciliation.tsx` renders the "Reward address breakdown" Card slot between the chart Card and the per-VM / linked-CRN Card on both CRN and CCN earnings tabs.
- `useNodeEarnings` now exposes `reconciliation: Reconciliation | null` on its return shape. It looks up the current node's reward address in `summary.recipients` (the `RecipientTotal[]` already emitted by `computeDistributionSummary`) — no new API calls, no extra summary computation.
- `getRewardAddress` is now exported from `src/lib/credit-distribution.ts` for reuse.
- The component handles its own no-overlap caption fallback; the parent tab doesn't branch.

- [ ] **Step 2: Update `docs/DECISIONS.md`**

Append a new decision entry:

```markdown
## Decision #92 - 2026-05-13
**Context:** Per-CRN/CCN Earnings tab (Decision #90) showed what one node earned, but operators using one reward address across many nodes had no in-context view of how that slice fit into the wallet's total window earnings.
**Decision:** Added a "Reward address breakdown" Card between the chart and the per-VM / linked-CRN table. Four buckets anchored on "this node": this node / other same-kind / cross-kind / staking. Same panel on both CRN and CCN earnings tabs. No-overlap state shown as a one-liner caption rather than a degenerate 100% bar.
**Rationale:** Reuses the existing `summary.recipients` (`RecipientTotal[]`) — no new API calls. Anchoring on "this node" preserves the Earnings tab's primary framing while adding portfolio context. The one-liner caption explicitly confirms the no-overlap case rather than hiding (which could read as a load failure).
**Alternatives considered:** Per-node drilldown inside the bar (rejected — `/wallet?address=` already provides that). Fifth KPI card (rejected — competes with node-scoped KPIs). Collapsible disclosure (rejected — fiddly for what is real info). Bucket-level previous-window deltas (deferred — adds complexity for marginal value, easy to add later).
```

- [ ] **Step 3: Update `docs/BACKLOG.md`**

Move the item *2026-05-12 - Earnings tab: distribution reconciliation view* from **Needs planning** to **Completed**, with the format:

```markdown
- ✅ 2026-05-13 - Earnings tab: distribution reconciliation view — new `NodeEarningsReconciliation` Card on both CRN and CCN earnings tabs. Four-bucket stacked bar (this node / other same-kind / cross-kind / staking) anchored on the current node, sourced from `summary.recipients` (RecipientTotal). New `Reconciliation` type on `useNodeEarnings` return shape. `getRewardAddress` exported from `credit-distribution.ts` for reuse. No-overlap state collapses to a one-liner caption + wallet link. Decision #92.
```

- [ ] **Step 4: Update `CLAUDE.md` Current Features**

In the **Node detail Earnings tab** bullet (search for "Node detail Earnings tab:"), append a sentence describing the reconciliation panel. Example addition:

> "Below the chart sits a Reward address breakdown Card (`NodeEarningsReconciliation`): a horizontal stacked bar splitting the reward address's window earnings into four buckets — this node (kind color) / other same-kind nodes (kind color at 0.45) / cross-kind (the other kind's color) / staking (amber). Reads `summary.recipients` directly so no new API calls; renders a one-liner caption when this node is the wallet's only source. `View full wallet →` links to `/wallet?address=`. (Decision #92.)"

- [ ] **Step 5: Bump version and add changelog entry**

Open `src/changelog.ts`. Update `CURRENT_VERSION` from `"0.21.0"` to `"0.22.0"` (new user-facing feature → minor bump). Prepend a new `VersionEntry` to the top of the `CHANGELOG` array:

```ts
{
  version: "0.22.0",
  date: "2026-05-13",
  changes: [
    {
      type: "feature",
      text: "Earnings tab gets a **Reward address breakdown** Card between the chart and the per-VM / linked-CRN table on both CRN and CCN node detail views. Horizontal stacked bar splits the reward address's window earnings into four buckets — this node / other same-kind nodes / cross-kind ops / staking — so operators using one reward address across many nodes can see this node's contribution in portfolio context. Hover a segment to dim the others. When the reward address only earned from this node in the window, a one-liner caption replaces the bar. `View full wallet →` deep links to `/wallet?address=`. No new API calls — built on the existing `summary.recipients`.",
    },
  ],
},
```

- [ ] **Step 6: Commit docs and version**

```bash
git add docs/ARCHITECTURE.md docs/DECISIONS.md docs/BACKLOG.md CLAUDE.md src/changelog.ts
git commit -m "docs(earnings): document reconciliation panel + version bump"
```

- [ ] **Step 7: Run `pnpm check` one last time**

Run: `pnpm check`
Expected: PASS.

---

## Summary

Five small TDD cycles + verification + docs.

- Task 1 exports a helper (foundational, ~2 lines).
- Task 2 extends the hook with tests-first (data layer; no new API calls).
- Task 3 builds the presentational component with tests-first.
- Task 4 slots the component into both tabs (UI integration).
- Task 5 verifies end-to-end in dev.
- Task 6 updates the 4 docs + changelog (per CLAUDE.md workflow).

No new API endpoints. No new dependencies. The reward-address recipient totals already exist on `summary.recipients` from the credits page work — this plan is essentially "thread that data into the Earnings tab and shape it visually."
