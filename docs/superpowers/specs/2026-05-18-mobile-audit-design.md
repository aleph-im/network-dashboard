# Mobile Audit & Fix — Below `md` (< 768px)

**Status:** Design approved, awaiting implementation plan.
**Mode:** Triage audit and targeted fixes, not a redesign.
**Primary mobile user:** Node owner casually checking earnings on a phone.
**Device target:** Anything below Tailwind `md` (< 768px), matching existing responsive logic in the codebase.

---

## Context

The dashboard has had responsive primitives since PR #1 (mobile sidebar drawer, detail-panel overlay, adaptive column hiding). The May 2026 shell redesign (Decision #94) replaced the custom `AppSidebar` / `AppHeader` with DS primitives — `ProductStrip`, `AppShellSidebar`, `PageHeader`. The DS `AppShellSidebar` provides expanded ↔ icon-rail collapse but **no off-canvas drawer mode**, so the previous mobile drawer behavior silently regressed during that redesign. CLAUDE.md L288 still claims drawer behavior, which is now a doc gap.

A node-owner-on-mobile pass needs three primary surfaces to be usable:
- `/wallet?address=...` — owned nodes, created VMs, credit rewards (24h), activity timeline
- `/nodes?view=<hash>&tab=earnings` — KPI cards, chart, reconciliation bar, per-VM breakdown
- `/credits` — distribution flow diagram, summary stat cards, recipient table

This spec audits those surfaces (plus the shell chrome that wraps them) and proposes fixes for the issues that actually block or significantly degrade use. Pages outside this user's flow (Network graph, Issues page, Health) are not in scope; they remain at whatever responsive state they're in.

## Scope

**In scope (below `md`):**
- Sidebar drawer behavior (shell chrome)
- Credits flow diagram fallback
- Wide-table → stacked-card rendering on Wallet, Credits, and Earnings tab surfaces
- Earnings chart tooltip behavior

**Out of scope:**
- `ProductStrip` overflow at 375px — DS-owned, defer to a DS issue if visibly broken on a real phone
- Network graph (already has a `md:hidden` CCN-list fallback)
- Issues page, Health page, Changelog (not in the node-owner-on-mobile flow)
- Filter UI mobile adaptation (existing BACKLOG entry from 2026-03-05) — adjacent but separate scope
- Mobile-first redesigns of any page — only triage fixes here

---

## Audit Findings

| # | Severity | Surface | Issue |
|---|----------|---------|-------|
| 1 | **S1 — broken** | Shell chrome | Sidebar never goes off-canvas. Icon-rail eats ~60–80px of a 375px viewport; expanded blocks content. DS `AppShellSidebar` has no drawer mode. CLAUDE.md L288 is stale on this. |
| 2 | **S1 — broken** | `/credits` flow diagram | `CreditFlowDiagram` is `mx-auto w-full max-w-[900px]` with `viewBox 0 0 W H` — scales proportionally, so at 375px the entire diagram becomes ~42% of design size and labels go unreadable. |
| 3 | **S2 — painful** | Wide tables: Wallet Nodes / Wallet VMs / Credit Recipients / Earnings per-VM | `overflow-x-auto` works but users miss columns and tabular data at small text on a phone is rough. |
| 4 | **S2 — painful** | Node Earnings chart tooltip | `NodeEarningsChart` HoverCard side-anchors with translate offsets — narrow viewports may push it off-screen; touch interaction shows the tooltip but doesn't dismiss cleanly. |
| 5 | **S3 — suboptimal** | `ProductStrip` cross-app tabs | 4 tabs + logo + theme toggle at 54px on 375px is tight. Out of scope. |

Severity definitions (this spec only):
- **S1 — broken:** content unusable; user cannot accomplish the task.
- **S2 — painful:** content visible but takes effort (excessive scroll, text too small, awkward tap targets).
- **S3 — suboptimal:** works but doesn't feel mobile-native.

**Already OK, no work needed:**
- `DualLineChart` / `Sparkline` / `NodeEarningsReconciliation` (preserveAspectRatio + container queries already fluid)
- Wallet `SummaryStats` (`grid-cols-2 sm:grid-cols-4` stacks correctly)
- Main padding (`p-4 md:p-6` already responsive)
- Detail-panel overlay below `lg` (`/nodes`, `/vms`) — works as-is

---

## Fix 1 — Mobile sidebar drawer

**Behavior below `md`:** sidebar is an off-canvas drawer, default closed. Toggling the ☰ button in `PageHeader`'s `leading` slot slides it in from the left over a semi-opaque backdrop; tapping the backdrop or selecting a nav item closes it.

**Behavior above `md`:** current inline behavior is unchanged — `useSidebarCollapse` continues to drive expanded ↔ icon-rail.

**Implementation outline:**
- New consumer-side wrapper component (`MobileSidebarDrawer`) around `AppShellSidebar`. Below `md`: applies `fixed inset-y-0 left-0 z-50 w-[<sidebar-width>] transition-transform` with `translate-x-0` (open) / `-translate-x-full` (closed). Above `md`: passthrough wrapper, no positioning changes.
- Backdrop element (`fixed inset-0 z-40 bg-black/40 md:hidden`) mounted only while drawer is open. `onClick` closes the drawer.
- Body scroll lock while drawer is open (`overflow-hidden` on `<body>`).
- Drawer open/closed state managed by a new hook or a small `useState` on `AppShell`. Drawer state is **independent** of `useSidebarCollapse` — the existing rail/expand toggle is desktop-only.
- `PageHeader`'s `leading` ☰ button below `md`: toggles drawer open/closed. Above `md`: keeps current rail/expand toggle behavior (unchanged).
- Auto-close on route change (`usePathname` effect): drawer closes when the user navigates from a nav item.
- Auto-close on `md+` resize (matchMedia listener): drawer closes if the user rotates landscape or resizes past `md`, so it doesn't get visually stuck open.

**Edge cases / risks:**
- The `useSidebarCollapse` localStorage state (`sidebar.collapsed`) is desktop-only behavior. Drawer open/closed is ephemeral — do not persist it.
- The "above `md`" passthrough must not change the existing layout flow. Verify the inline sidebar still occupies its column above `md` with no margin/positioning regressions.

**Files likely touched:**
- `src/components/app-shell.tsx` (drawer wrapper + state)
- New: `src/components/mobile-sidebar-drawer.tsx` (or inline in app-shell.tsx if small enough)
- `CLAUDE.md` L288 — update the stale claim about drawer behavior

---

## Fix 2 — Credits flow list fallback

**Behavior below `md`:** replace the SVG `CreditFlowDiagram` with a `CreditFlowList` rendering the same distribution data as a vertical list:
- Two sections: **Credits** (customer-paid, top) and **Hold** (protocol-subsidized holder-tier, below). Each section header shows the source total in ALEPH.
- Each section contains four destination rows: Dev fund (5%), CRN execution (60%), CCN storage (75%) + execution (15%), Stakers (20%).
- Each row: a small color swatch matching the desktop diagram's per-flow color + destination label + percentage + ALEPH amount.
- Loading state: skeleton rows in the same vertical structure.

**Behavior above `md`:** keep `CreditFlowDiagram` unchanged.

**Implementation outline:**
- New: `src/components/credit-flow-list.tsx` consumes the same `summary: DistributionSummary` prop as `CreditFlowDiagram`.
- `CreditFlowDiagram` wrapper renders `<CreditFlowList class="md:hidden" />` + `<CreditFlowDiagramSvg class="hidden md:block" />`, OR the parent page conditionally renders one or the other. The wrapper approach keeps the prop interface tidy.
- Color swatches reuse the same kind tokens the SVG uses (lime / green / purple / amber / coral per CLAUDE.md L311).

**Risks:**
- Re-using the per-flow colors across two surfaces means changing them in one place changes both — fine, but worth a colocated comment.
- The "credits + hold" split is two sources; if either is empty (e.g. all-credits range), the empty section should collapse silently rather than render an empty header.

**Files likely touched:**
- `src/components/credit-flow-diagram.tsx` (wrapper / dispatch)
- New: `src/components/credit-flow-list.tsx`
- `src/app/credits/page.tsx` (if dispatch happens here instead of the wrapper)

---

## Fix 3 — Tables → stacked cards below `md`

**Behavior below `md`:** wide tables render as stacked-card rows. Each card has:
- Top line: primary identifier (`CopyableText` on hash, address copy, etc.) — same component as the desktop row.
- Supporting fields as label/value pairs below — same `Badge` / `StatusDot` / `relativeTime` patterns as the desktop cells.
- Whole card is `<Link>` when the desktop row was a click-through (recipient → `/wallet?address=`, hash → `/nodes?view=`, etc.).

**Behavior above `md`:** current `<table>` rendering unchanged.

**Affected tables:**
- Wallet page: Nodes section, VMs section, Activity section (if not already a vertical list — verify), Authorizations sections (verify).
- Credits page: `CreditRecipientTable`.
- Node Earnings tab: per-VM breakdown (`NodeEarningsTab`, CRN role).
- Node Earnings CCN tab: linked-CRN table (`NodeEarningsTabCcn`) — verify width, may be narrow enough to keep as table.

**Implementation outline:**
- Pattern A (preferred): a small `MobileTableCardRow` helper component that takes a `primary` slot (top-line identifier) and an `items: { label: string; value: ReactNode }[]` array (label/value pairs below). Each table renders `<table class="hidden md:table">…</table>` + `<div class="space-y-3 md:hidden">{rows.map(r => <MobileTableCardRow ... />)}</div>`.
- Pattern B (alternative): per-table inline `md:hidden` block. More duplication but easier to customize per surface.
- Decision: start with A; fall back to B for tables where the card structure differs enough to justify it.

**Considerations:**
- Pagination still applies — the same `pageItems` array feeds both desktop and mobile renders.
- Sort indicators are desktop-only; on mobile the stacked cards reflect the current sort but don't show indicators. That's acceptable — sort is a desktop power-user feature.
- Hover styles on the desktop row don't translate; mobile cards rely on tap feedback only.

**Files likely touched:**
- New: `src/components/mobile-table-card-row.tsx` (helper)
- `src/app/wallet/page.tsx` (Nodes / VMs sections)
- `src/components/credit-recipient-table.tsx`
- `src/components/node-earnings-tab.tsx` (per-VM breakdown)
- `src/components/node-earnings-tab-ccn.tsx` (verify; may not need)

---

## Fix 4 — Earnings chart tooltip below `md`

**Behavior below `md`:** the `NodeEarningsChart` tooltip renders inline below the chart instead of as a side-anchored floating `HoverCard`:
- Always-visible read-out row beneath the chart showing bucket time + ALEPH + secondary count for the currently highlighted bucket.
- Default empty state (no bucket highlighted): "Tap chart to inspect" hint.
- Tap on the chart sets `hoverIndex`; tapping outside clears it.

**Behavior above `md`:** current floating `HoverCard` with side-anchoring is unchanged.

**Implementation outline:**
- `NodeEarningsChart` detects `< md` via `useMediaQuery` (or a simple CSS-driven swap with `md:hidden` / `hidden md:block`).
- The inline read-out row reads `buckets[hoverIndex]` and renders the same fields the desktop HoverCard renders (time, ALEPH, secondary).
- Touch dismissal: a global `onPointerDown` listener (or click-outside helper) clears `hoverIndex` when the user taps outside the chart's pointer-capture rect.

**Considerations:**
- `DualLineChart`'s pointer-capture rect already uses `onPointerMove` which handles touch — no change to the chart primitive itself.
- The reconciliation bar's hover/dim behavior is separate and not in scope here.

**Files likely touched:**
- `src/components/node-earnings-chart.tsx`

---

## Fix 5 — ProductStrip overflow

**Out of scope this PR.** DS-owned component. Verify in browser during implementation; if visibly broken at 375px, file a DS issue and add a BACKLOG entry.

---

## Success criteria

- On a 375px viewport, the dashboard's primary surfaces (Wallet, Node Earnings tab, Credits) read and function for a node owner who wants to check earnings.
- The sidebar is hidden by default and one tap away.
- The Credits page communicates the flow without requiring a desktop browser.
- All wide tables on the affected surfaces are scannable as vertical stacks.
- The Earnings chart can be inspected by tap.

## Out of scope follow-ups (BACKLOG candidates)

- Mobile filter UI (existing BACKLOG entry from 2026-03-05)
- Network graph mobile experience (currently a CCN-list fallback)
- Issues page mobile pass
- A proper DS feature for `AppShellSidebar` drawer mode (this PR's consumer-side wrapper is a stop-gap)
- `ProductStrip` overflow handling if the DS doesn't already handle it

## Decisions to log on merge

- One Decision entry covering the consumer-side drawer wrapper choice + the stop-gap rationale (DS feature to follow).
- Optionally: a note that the CLAUDE.md drawer claim is being corrected, with context on when it regressed (the shell redesign).
