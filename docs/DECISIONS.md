# Decisions Log

Key decisions made during development. When you wonder "why did we do X?", the answer should be here.

---

## How Decisions Are Logged

Decisions are captured when these phrases appear:
- "decided" / "let's go with" / "rejected"
- "choosing X because" / "not doing X because"
- "actually, let's" / "changed my mind"

Each entry includes:
- Context (what we were working on)
- Decision (what was chosen)
- Rationale (why - the most important part)

---

## Decision #67 - 2026-05-04
**Context:** Reza on Telegram raised that the VMs page lists VMs allocated to dead-ish nodes (unreachable / removed / unknown) alongside live workload, mirroring the "Show inactive nodes" pattern from the Aleph Account app. The long tail dilutes the operational signal — the All tab reads ~7,900 even though only ~1,150 VMs are actually dispatched. Status pill bar also overcrowded: 10 statuses competing for visual real estate.
**Decision:** Default-on filter on `/vms` that hides VMs whose `allocatedNode` resolves to a node in `{unreachable, removed, unknown}`. Toggle lives in the FilterPanel (not the toolbar) under Payment & Allocation. Two-way URL persistence via `?showInactive=true`. Count badge stays plain when only the default-on inactive-hide is culling — the slash suffix returns when other filters stack on top. Fail-open on unloaded nodes: VMs whose allocated node isn't yet in the loaded `useNodes()` set stay visible until the memo re-runs, so the table never disappears during a refresh. Status pills capped to 3 visible (All / Dispatched / Scheduled) via a new `maxVisible` prop on the DS Tabs component (`@aleph-front/ds@0.14.0`); the rest live in the existing `⋯` overflow dropdown. `STATUS_PILLS` reordered to put the three "healthy baseline" statuses first, with the long tail (Duplicated, Misplaced, Missing, Orphaned, Unschedulable, Unscheduled, Unknown) in priority order in the dropdown.
**Rationale:** Strict node-status semantics keep the toggle conceptually crisp — "is the home this VM lives in alive?" — and avoid bundling VM-status long-tail filtering, which the existing status pills already handle. Including `unknown` in the inactive set treats prolonged silence as effectively dead; if a node recovers it flips back to `healthy` and its VMs reappear automatically. FilterPanel placement keeps the filter quiet by default — the user's intent was "don't give it more attention than it needs". Plain-count fast path prevents the All-tab from constantly screaming `1234/7800` on every page load. URL persistence is in scope here (single-boolean two-way sync) even though the broader URL-persistence retrofit for other advanced filters stays parked as a roadmap item — sharing a "show me inactive too" link is the meaningful use case. Tab cap at 3 (not the existing width-based collapse) is deliberate: width-based collapse depends on available room, which expands when the detail panel closes — giving an inconsistent visible-tab count. A hard count cap is predictable: same 3 tabs regardless of viewport or selected-row state.
**Alternatives considered:** Bundling VM-status long-tail (rejected — confusing). Toolbar placement next to status pills (rejected — toolbar is for navigation/scope, not advanced filters). Inline banner on culling state (rejected — too loud for a default-on filter). Always showing `filtered/unfiltered` (rejected — noisy by default). Width-only collapse for the tab cap (rejected — inconsistent with detail panel open/close). Hiding less-common statuses entirely instead of moving to overflow (rejected — Unknown has 6,307 VMs, hiding the access path would be hostile).

## Decision #66 - 2026-05-04
**Context:** Many node operators search the credits page by node name to find their rewards, but the recipient table's search predicate only matched `r.address` — typing a node name returned an empty result. The table's row unit is a reward address (one address can own many CRNs/CCNs), so the question was how to make node-name search work without breaking that model, and what should happen when the user clicks a row.
**Decision:** (1) Extend the search predicate to also match any node name where `node.reward || node.owner === r.address`, by building an `address → [{ name, kind }]` lookup once per `nodeState` change with `useMemo`. Placeholder updated to "Search address or node name…". (2) When a row matched via node name (not address), render one `Badge fill="outline" variant="info" size="sm"` per matched node name in the Sources cell, each reading `Matched: <full-name>` — full names, no truncation, no `+N` overflow — so the user can scan rows visually and pick the right one without clicking through. (3) Make the whole row clickable via DS Table's `onRowClick`, navigating to `/wallet?address=…`. The `CopyableText` cell already calls `e.stopPropagation()` on its copy button and address link, so clicking copy still copies without triggering the row navigation. (4) Persist the search query as `?q=` in the URL via `router.replace` (no history pollution, `scroll: false`); the table reads `q` on mount via `useSearchParams`. This way the browser back button from the wallet view restores both the URL and the search state, so users don't lose their query when drilling into a row and bouncing back.
**Rationale:** Preserves the address-centric model — a row still represents a reward address, the node name is a discovery vector, not a new row type. The `Matched:` chip gives users explicit feedback on *why* a row appeared (otherwise an unfamiliar address with no obvious connection to their typed query would feel like a false positive). Detail context for credits is the wallet page — it already shows credit rewards per node and role for the owner, which matches what users searching by node name want to see ("see my rewards"). No new detail panel was added on credits since the wallet view already serves that purpose. Clicking through is the convenience layer; the address link inside `CopyableText` remains the proper anchor for accessibility (right-click → "Open in new tab", middle-click, hover URL preview).
**Alternatives considered:** Adding a credits-scoped detail panel on the page itself (rejected — the wallet view already covers this with no new surface area to maintain); jumping to `/nodes?view=hash` when the match was via node name (rejected — breaks row→address consistency, and users searching here want rewards, not node ops); fuzzy matching on names (rejected — plain `includes` matches the rest of the dashboard's search behavior).

## Decision #65 - 2026-05-04
**Context:** Reza on Telegram noticed the Overview "Total VMs" headline shows ~7.8k while the three visible status cards (Dispatched + Missing + Unschedulable) only sum to ~1.2k, and the subtitle "Virtual machines currently scheduled across the network" is the opposite of what `vms.length` from `/api/v1/vms` actually counts (the long tail of `unscheduled` / `scheduled` / `unknown` / `orphaned` rows is included). Same issue makes the donut rings on Dispatched/Missing/Unschedulable nearly empty since the total denominator is wildly bigger than the active counts.
**Decision:** Redefine `OverviewStats.totalVMs` as the count of VMs in *currently active* statuses — `dispatched + duplicated + misplaced + missing + unschedulable` — via a new `ACTIVE_VM_STATUSES` set in `src/api/client.ts:250`. Subtitle on the Total VMs card updated to "VMs currently active across the network — running, expected, or awaiting placement". The all-time count remains reachable via the All tab on `/vms`.
**Rationale:** Active statuses are the operationally meaningful grouping (Decision #56). The headline now matches the sum of the visible status cards, and the donut rings around Dispatched/Missing/Unschedulable now use a denominator that makes their proportions readable. `duplicated` and `misplaced` are included in the active total (they're VMs that *are* running, just imprecisely) even though they're not surfaced as their own overview cards — those issues live on the Issues page. `scheduled` (assigned but never observed), `unscheduled` (no assignment yet), `orphaned` (running but no allocation record), and `unknown` are all forms of long-tail noise the scheduler keeps on file but aren't part of the live operational picture.
**Alternatives considered:** Keeping the original "all VMs ever seen" semantics and renaming the card to "All VMs" (less useful — operators want the active baseline at a glance, not the cumulative count). Counting only `dispatched + duplicated` (too narrow — `missing` and `unschedulable` are exactly the kind of issues an ops dashboard should keep front-and-center in the total). Adding a backend `?status_in=` filter and recomputing on each render (premature — the scheduler API already returns full pages, the client filter is one pass over an array we already loaded).

## Decision #64 - 2026-05-03
**Context:** Community member AwAZ noticed that the credit recipient table only shows one node per address and asked whether the row's totals are per-node or per-address. The Node column was a `findNode(address)` lookup that returned the first matching node by `reward`/`owner` — misleading for any address that operates more than one node, and the Roles column (`CRN` / `CCN` / `Staker` badges) duplicated information already visible from which numeric columns were non-zero.
**Decision:** Drop the Node column; lead with Address. Replace the Roles column with a Sources column rendering DS `Badge fill="outline"` chips per address — `CRN: N` (success), `CCN: N` (default/purple), `Staker` (warning). Counts derived from `nodeState` by counting CRNs/CCNs whose `getRewardAddress(node)` matches the recipient address; the `Staker` chip appears whenever `stakerAleph > 0` (no count — staking is binary at the address level). `RecipientTotal` swaps `nodeHash`/`nodeName` for `crnCount`/`ccnCount`. Search filter narrowed to address-only since node search across a single arbitrary match was already unreliable.
**Rationale:** The change makes the table honestly answer "where do these rewards come from?" without inventing a primary node. Counting in `computeDistributionSummary` is a single pass over `nodeState.crns` / `nodeState.ccns` (O(N), not O(N·M) like the per-recipient scan would be). Counting all nodes regardless of `status` matches operational scope — an inactive CCN still belongs to the operator's stack, and the CCN column already shows the current-period earnings separately, so the joint reading remains accurate. The full per-node breakdown (which CRN earned what, etc.) already exists in the wallet detail view at `/wallet?address=…`, one click away via the address link, so the credits table doesn't need to duplicate it.
**Alternatives considered:** Inline expandable rows showing per-node breakdown (duplicates wallet view's job, requires extending `RecipientTotal` to carry the breakdown). Counting only active nodes (would diverge from operational scope and produce confusing zero-source rows for fully-inactive operators who still earned via staking/CCN backlog). Keeping node search by retaining `nodeHash`/`nodeName` privately for filter purposes (janky data model — node lookup was never reliable since only one was ever stored).

## Decision #63 - 2026-05-02
**Context:** Users reported that clicking "VMs" / "Memory" / "vCPU" descending in the Nodes and VMs tables didn't show the highest-stat rows first. Root cause: every paginated table (`node-table`, `vm-table`, `issues-vm-table`, `issues-node-table`, `credit-recipient-table`) passed only the current page (`pageItems`) to the DS Table, which sorted internally. Sort was scoped to the visible 25 rows; high-stat nodes/VMs on later pages never bubbled up. Same users also reported that the VMs filter showed memory in MB ("0 MB–262144 MB") which was hard to read.
**Decision:** Add controlled-sort props (`sortColumn` / `sortDirection` / `onSortChange`) to the DS Table in `@aleph-front/ds@0.13.3`, then lift sort state into each paginated dashboard table. Each table now applies sort to the full filtered dataset via `applySort` from `src/lib/sort.ts` before pagination, and DS Table renders the indicator from the controlled props. Rename the VMs `memoryMbRange` filter to `memoryGbRange` (storage in GB, slider step 1 GB, max derived from data); tooltip and labels read in human-friendly units. URL `?sort=vms` / `?sort=vcpus` / `?sort=memory` map to the controlled-sort header strings via a small lookup in `src/app/nodes/page.tsx`.
**Rationale:** DS Table change is additive (uncontrolled mode still works), so the credits/issues tables that already used the bug-free uncontrolled path continue working until they opt in. Identifying columns by `header` string (not index) makes consumers stable across column re-orderings. Reusing the column's existing `sortValue` getter externally is small enough (one helper) that the DS doesn't need to expose a sort utility. Storing the memory filter in GB rather than translating MB at the slider boundary keeps state and display in the same unit, matching how the Nodes filter already works.
**Alternatives considered:** Listen-only `onSortChange` callback while keeping the table uncontrolled (rejected — URL-driven initial sort can't seed the indicator, and external state changes can't drive it). Move pagination into DS Table itself (rejected — too opinionated for a primitive). Keep memory filter in MB and only relabel (rejected — `262144 MB` in the slider tooltip would still be unreadable; storing in GB lets the tooltip render `64`).

## Decision #62 - 2026-05-01
**Context:** User reported that the Nodes page vCPUs and memory range filters capped at 128 vCPUs and 512 GB — nodes above those values were hidden the moment the slider was touched. Same hardcoded ceilings existed in `vm-table.tsx` (32 vCPUs, 65536 MB).
**Decision:** Compute slider extents from the loaded data via `computeNodeFilterMaxes(nodes)` / `computeVmFilterMaxes(vms)` in `src/lib/filters.ts`, rounded up to the next power of two with a floor (`NODE_FILTER_MAX_FLOOR`, `VM_FILTER_MAX_FLOOR`). The same maxes flow into `applyNodeAdvancedFilters` / `applyVmAdvancedFilters` so `isRangeActive` checks against the dynamic extent rather than a hardcoded constant.
**Rationale:** Bumping the constants was the quick fix but kicks the bug down the road — the fleet keeps growing and a 1024-core node would hit the same wall. Power-of-two rounding keeps the slider's max snapping to readable values (200 → 256, 257 → 512). Floor values preserve a stable minimum extent during loading or for tiny test fleets.
**Alternatives considered:** Raising the constants to a higher fixed value (same bug, just deferred). Encoding range bounds as `[number, number | null]` to mean "no upper bound" (more invasive type change for marginal benefit). Making `?hasVms=true` use a separate boolean filter instead of `vmCountRange: [1, MAX]` — left alone since the slider extent is now dynamic, the `[1, floor]` pre-fill is just a refinable starting point.

## Decision #61 - 2026-05-01
**Context:** After Decision #60 introduced the persisted query cache, the credits page crashed on refresh with two distinct errors. First: `expenses is not iterable` in `computeDistributionSummary` (the `node-state` query data contains `Map<>` instances, which JSON roundtrips as `{}`, losing entries and `.get()`/`.values()` methods — surfaced via a misleading source-mapped error pointing at the outer `expenses` loop). After dropping `node-state` from the whitelist a second crash appeared: `Cannot read properties of undefined (reading 'time')` in `buildCumulativeSeries` — `expenses` was a plain Object `{}` (not an array), produced when React Query's persister captured a `credit-expenses` query mid-flight (`status: pending`) — `dehydrateQuery` then includes the in-flight `Promise` field, which `JSON.stringify` silently turns into `{}`, and on rehydration `useQuery` returned that empty object as `data` via the `placeholderData: keepPreviousData` path.
**Decision:** Two-part fix in `src/app/providers.tsx`: (1) drop `node-state` from the persisted-query whitelist — it stays in-memory only, refetches on each page load (small/fast); (2) require `query.state.status === "success"` in `shouldDehydrateQuery` so pending and error states never reach localStorage. Adds defensive `Array.isArray(expenses)` guards in `CreditSummaryBar`/`buildCumulativeSeries`. Bumps `CURRENT_VERSION` to `0.8.2` so the persister `buster` invalidates pre-existing bad localStorage entries on first load post-deploy. Establishes two project-wide rules in ARCHITECTURE.md: **never persist queries whose data contains `Map`, `Set`, `Date`, or `BigInt`** and **never persist queries that aren't `success` — the dehydration path includes the `promise` field for pending queries, and JSON roundtrips it as `{}` which masquerades as data on rehydration.**
**Rationale:** The two pitfalls are easy to hit when adopting persistence and have non-obvious symptoms (misleading source-mapped stack traces, plain-object-shaped "data" silently bypassing length checks). Codifying both in the architecture doc and enforcing the success-only rule via `shouldDehydrateQuery` makes future persisted queries safe by default. Custom Map serializers and partial-state hydration both work but add complexity for marginal benefit — the slow query that the persisted cache exists for is `credit-expenses`, a clean array of plain objects.
**Alternatives considered:** Custom Map-aware serialize/deserialize (extra code path to maintain); converting `NodeState` from Maps to plain objects (large refactor for no in-memory benefit); only the defensive `Array.isArray` guard without the persister fix (treats the symptom, leaves the dirty-data trap for the next page that uses persisted data).

## Decision #60 - 2026-05-01
**Context:** The credits page felt slow because the api2 messages query for `aleph_credit_expense` takes ~20s on a throttled 4G connection. Everything visible on the page (summary cards, flow diagram, recipient table, sparkline) blocked on that single fetch.
**Decision:** Three perceived-speed wins, no backend changes: (1) persist React Query cache to localStorage via `PersistQueryClientProvider`, scoped to `credit-expenses` and `node-state` query-key prefixes only, with `maxAge: 24h` and `buster: CURRENT_VERSION`; (2) prefetch `credit-expenses` (7d) and `node-state` on `onMouseEnter`/`onFocus` of the Credits sidebar link, once per mount; (3) add `placeholderData: keepPreviousData` to `useCreditExpenses` so range-tab switches keep showing the previous range's numbers; (4) replace the single grey skeleton block on the flow diagram with a structured greyed-out diagram (boxes, thin connectors, em-dash values) so the page composition is visible immediately. Stable 5-minute-rounded timestamps moved into a shared `getStableExpenseRange()` helper exported from `use-credit-expenses` and reused by `useWalletRewards` so persisted cache hits across visits and across pages.
**Rationale:** The bottleneck is server-side and not under our control without a backend change (deferred — see BACKLOG). The combination addresses all three slow paths: cold load (the page composition appears even before data), navigation into the page (prefetch warms cache during pointer travel), and range switching (previous numbers stay on screen). Persisting only credit/node-state queries avoids stuffing localStorage with rapidly-changing list data. The placeholder diagram uses the same SVG layout constants as the live diagram so there's no visual jump on data arrival. Buster keyed to `CURRENT_VERSION` invalidates persisted entries automatically when shipping a new version.
**Alternatives considered:** Pagination-based progressive rendering (more code, distribution percentages would be wrong with partial data); switching default range from 7d to 24h (UX decision punted — affects what users see first); pre-aggregated AGGREGATE messages from backend (requested as backlog item, blocked on Olivier).

## Decision #59 - 2026-03-21
**Context:** Wanted to preview multiple feature branches simultaneously before deciding which to merge and deploy
**Decision:** Worktree-based dev servers with a local Node.js dashboard, managed via CLI script
**Rationale:** Zero infrastructure — reuses git worktrees and hard-linked node_modules (proven patterns in this project). Each branch gets a full independent dev server on its own port, avoiding basePath hacks. Dashboard auto-refreshes every 5s. CI preview deploys to IPFS backlogged as a separate enhancement.
**Alternatives considered:** (A) Static builds per branch with basePath — fiddly for Next.js static export, assets break without proper configuration. (C) CI preview deploys to IPFS — more capable but needs CI workflow changes, added to backlog.

## Decision #58 - 2026-03-20
**Context:** Adding a "total credits over time" chart to the credits page. Needed to choose a charting approach.
**Decision:** Pure SVG sparkline (`<polyline>` + `<polygon>` gradient fill) with zero dependencies. No charting library.
**Rationale:** The chart is a tiny sparkline inside a stat card — only needs a polyline and a gradient fill. Recharts (~45KB gzipped) or @visx are overkill for this. A ~60-line SVG component gives full control over styling (bleed-to-edge layout, theme-aware CSS variables) with no bundle cost. The `Sparkline` component is reusable if we want sparklines on other cards later.
**Alternatives considered:** Recharts (too heavy for one sparkline), @visx (modular but still more code/deps than needed), canvas (no SSR, worse accessibility)

## Decision #57 - 2026-03-20
**Context:** Making the dashboard more appealing to prospective node operators and people evaluating Aleph Cloud vs competitors. Needed to decide between a signature brand color approach (like RunPod's purple or Cloudflare's orange) and a craft-quality approach (like Linear's precision and whitespace).
**Decision:** "Premium through craft" — no signature hue. Three-tier typography (Rigid Square headings, Titillium Web body, Source Code Pro data), staggered card entrance animations, and a shared spring easing variable. Network Health page reframe of the API status page with glassmorphism stat cards and side-by-side endpoint sections. "Powered by Aleph Cloud" watermark on credits page. SEO images (OG, Twitter, Apple touch icon) with DS logo mark and Rigid Square font. Semantic colors (green/red/amber) stay pure for status — brand identity comes from craft quality and data visualization.
**Rationale:** Research across RunPod, Vercel, Railway, DigitalOcean, Cloudflare, Datadog, and Linear showed that every premium dashboard has a visual signature. The dashboard's distinctive elements are the credits flow particle animation and glassmorphism stat cards — not a color. Forcing a brand color onto status indicators creates tension (is green "healthy" or "brand"?). The DS lime accent (`#D4FF00`) was considered but rejected — it conflicts with semantic success green and the dashboard uses it in only 3 places. A slot-roll number animation was prototyped but removed — it added complexity without sufficient visual payoff.
**Alternatives considered:** Lime accent as signature color (conflicts with status green), purple-to-lime gradient (adds complexity), slot-roll billboard number animation (prototyped and removed — didn't add enough value)

## Decision #56 - 2026-03-19
**Context:** The scheduler API is adding more precise VM statuses. The original 6-value `VmStatus` union (`scheduled`, `missing`, `orphaned`, `unschedulable`, `unscheduled`, `unknown`) didn't distinguish between VMs running correctly vs. VMs with extra copies, and had no concept of misplacement.
**Decision:** Expand `VmStatus` to 10 values: add `dispatched` (running on the correct node), `duplicated` (correct node + extra copies), `misplaced` (running only on wrong nodes). Color mapping: `dispatched=success`, `misplaced=warning` (it IS running somewhere), `unschedulable=error` (can't run at all — promoted from warning). `migrating` added as a future placeholder (info/purple, not yet implemented by the API). Default tab on the VMs page changed from "Scheduled" to "All" (since `scheduled` now means "assigned but never polled", not the healthy state). Overview hero cards: Orphaned replaced by Dispatched (green) — the overview should highlight the healthy baseline; orphaned/missing details live on the Issues page. Tab ordering prioritizes operational statuses first (dispatched, duplicated, misplaced, missing, orphaned, unschedulable) and rare/ambiguous statuses last (scheduled, unscheduled, unknown). Issues page `DiscrepancyStatus` expanded from 3 to 5 values: adds `duplicated` and `misplaced`. Node perspective gets new Duplicated and Misplaced columns + filter pills.
**Rationale:** `dispatched` is the new canonical "healthy" VM state — green makes the healthy baseline visible on the overview. `misplaced` is warning (amber) because the VM is running somewhere, just in the wrong place; it's not as severe as `missing`. `unschedulable` is promoted to error because the VM literally cannot be placed. `migrating` is info/purple to distinguish future in-flight state from error states. Node counting: `duplicated` excludes `allocatedNode` (that node is correct; only extras are discrepant); `misplaced` counts all `observedNodes` (all are wrong since the VM isn't on the allocated node). Flat tab ordering with priority ensures the most actionable statuses appear first without requiring overflow for typical workflows.
**Alternatives considered:** Keeping `scheduled=success` (now misleading — scheduled means "assigned, not yet observed", not "healthy"), keeping Orphaned on overview (overview should show health, not discrepancy count — that's the Issues page's job), putting duplicated/misplaced in error tier (too severe — VMs are running, just with imprecision)

## Decision #55 - 2026-03-18
**Context:** Issues page had a prominent sidebar entry with an amber badge count showing live discrepancy numbers, plus two "Affected VMs/Nodes" stat cards on the overview page.
**Decision:** Demote Issues to the sidebar utility section (alongside API Status), remove the amber badge, remove the overview stat cards and `affectedNodes` computation. Move Credits from Operations to Resources section, remove empty Operations section.
**Rationale:** The Issues page is primarily a dev/ops diagnostic tool for investigating scheduling discrepancies and stuck migrations. Showing "Issues: 12" in amber in the main nav alarmed regular users into thinking the network is broken, when it's normal operational noise. The utility footer signals "secondary tool" without hiding it. Overview stat cards for individual VM statuses (Orphaned/Missing/Unschedulable) already link to filtered `/vms` pages which show the same data. Future: contextual entry points from VM/node detail pages when discrepancies are detected.
**Alternatives considered:** Hiding Issues completely (too hidden for devs), keeping in sidebar without badge (still prominent for a secondary tool), config/gear menu (over-engineering for 2 utility links)

## Decision #54 - 2026-03-17
**Context:** Credit flow diagram used simple animated dashes (`stroke-dasharray` with `flow-dash` CSS keyframe). The animation felt mechanical — all paths animated at the same speed, no stagger, no interactivity, no entrance effect.
**Decision:** Replace dashes with particle stream animation (SVG `<animateMotion>` circles) + source→destination gradient strokes. Add entrance draw animation, hover interaction (dim/highlight + tooltip), arrowheads at destinations, and accent bars on source boxes.
**Rationale:** Compared three variants side-by-side (particle+gradient, glow-pulse+gradient, shimmer-sweep). Particles won — they feel alive and organic, clearly convey flow directionality, and the randomized sizes/speeds/opacity prevent the mechanical "marching ants" look. Gradients make the source→destination relationship instantly readable (blue→gold, green→purple, etc.). Seeded pseudo-random (`Math.sin` based) avoids `Math.random()` hydration mismatches while still producing visually random particle distributions.
**Alternatives considered:** Animated dashes (original — too dull), glow pulse + gradient (dramatic but busy with multiple pulses), shimmer sweep (subtle but less directional than particles)

## Decision #53 - 2026-03-17
**Context:** Credit flow page used raw HTML form elements (`<button>`, `<input>`, `<select>`) and a hand-rolled table instead of DS components and shared patterns.
**Decision:** Refactor all credit flow components to use DS elements: `Table` component (with `Column` definitions and sortable columns) for the recipient table, `FilterToolbar` for role filter tabs with counts + search, `Tabs` (pill variant) for the date range selector, `TablePagination` for pagination, `CopyableText` for addresses/hashes, `Badge` with `fill="outline" size="sm"` for role tags. Aligned page spacing (`mb-10` header, `mt-12` sections) and stat card borders (`border-edge`, `bg-muted/30`) with the rest of the dashboard.
**Rationale:** Component policy (Decision #3) requires all UI primitives from the DS. Using the DS `Table` component gives consistent header styling (`bg-muted/50`, uppercase, `font-semibold`), row striping, hover states, and built-in column sorting — matching nodes/VMs pages exactly. `FilterToolbar` provides the standard tabs-with-counts + search layout. Raw elements created visual inconsistencies (different borders, padding, font sizes) and missed accessibility features (ARIA roles, keyboard navigation).

## Decision #52 - 2026-03-17
**Context:** Wallet page needs 24h credit reward data per node and role, and the Credits page already fetches the same data.
**Decision:** Share the 24h credit expense query via React Query caching. `useWalletRewards()` uses stable 5-minute-rounded timestamps so the query key stays consistent across mounts and page navigations. `computeWalletRewards()` replays the distribution logic scoped to a single address, producing per-node CRN/CCN earnings and total staker earnings.
**Rationale:** React Query already deduplicates and caches by query key. Rounding timestamps to 5-minute intervals ensures the wallet page and credits page (when viewing 24h) hit the same cache entry. Computing wallet rewards client-side from the cached expense data avoids a separate API call. The distribution function precomputes node weights once (they're stable across expense messages) for efficiency.
**Alternatives considered:** Separate API endpoint for per-wallet rewards (not available), storing precomputed rewards in the distribution summary (couples wallet logic to the general summary), no caching (redundant fetches)

## Decision #51 - 2026-03-16
**Context:** Glassmorphism borders and backgrounds used hardcoded `white` (`border-white/[0.06]`, `bg-white/[0.03]`), which was invisible in light mode.
**Decision:** Replace all `white/[0.06]` and `white/[0.03]` with `foreground/[0.06]` and `foreground/[0.03]` across all glassmorphism components. Use `bg-background` for the content area and `bg-surface` (dark) / `bg-muted/40` (light) for sidebar/header chrome.
**Rationale:** `--foreground` is dark in light mode and light in dark mode, so `foreground/[0.06]` always contrasts with its background. Eliminates the need for `dark:` variant overrides. Content area changed from `bg-surface` to `bg-background` so DS Card (`bg-surface`) is visually distinct from the page background. Filter panel switched from custom glassmorphism to DS `Card` component for consistency.
**Alternatives considered:** `dark:` variants on each instance (more verbose, same result), semantic token like `--glass-border` (over-engineering for one pattern)

## Decision #50 - 2026-03-16
**Context:** Issues page had a filter toggle button that did nothing — `onFiltersToggle={() => {}}` was passed as a no-op.
**Decision:** Make `onFiltersToggle`, `filtersOpen`, and `activeFilterCount` optional in `FilterToolbar`. Only render the filter button when `onFiltersToggle` is provided. Issues tables omit these props.
**Rationale:** The Issues page has no advanced filters. Showing a clickable button that does nothing misleads users. Making the props optional is cleaner than passing no-op handlers.

## Decision #49 - 2026-03-16
**Context:** Filter toolbar status tabs used DS `Tabs` pill variant, which had a visual "tail" artifact on the sliding indicator and felt heavy for a filter bar.
**Decision:** Switch to `variant="underline" size="sm"` for status filter tabs. Keep `variant="pill" size="sm"` for the Issues page perspective toggle (VMs/Nodes). Constrain Tabs container with `flex-1 min-w-0` so overflow kicks in at ~5 visible items. Downsize search input to `size="sm"`.
**Rationale:** Underline variant is lighter and more appropriate for filter navigation — just text + thin underline, no container chrome. Pill variant suits the perspective toggle because it's a binary choice (2 items), not a filter bar. The `flex-1 min-w-0` lets the overflow mechanism naturally limit visible tabs based on available space rather than a brittle pixel breakpoint.
**Alternatives considered:** Pill `size="sm"` (still had indicator tail bug), adding `xs` size to DS (not supported), count-based `maxVisible` prop (DS overflow is width-based, not count-based)

## Decision #48 - 2026-03-16
**Context:** Filter toolbar (status pills, search, filter toggle) got squeezed when the detail panel opened on list pages, especially the Issues page with its perspective toggle adding extra items.
**Decision:** Restructure layout so FilterToolbar always renders above the flex container that holds Table + DetailPanel. Table components (NodeTable, VMTable) accept a `sidePanel` prop. Replace custom status pill buttons with DS `Tabs` pill variant (`overflow="collapse"`).
**Rationale:** The toolbar was inside the flex column that the detail panel squeezed. Moving it above means it always gets full width. DS Tabs with `overflow="collapse"` automatically collapses excess tabs into a `⋯` dropdown when space is tight (useful for the VMs page with 7 status options). Native `title` attribute used for tooltips instead of DS `Tooltip` wrapping (Radix Tooltip event handlers can interfere with Radix Tabs activation).
**Alternatives considered:** Flex-wrap with shrinking search input (patched symptom, didn't fix root cause), horizontal scroll on pills (hides items), truncated tab labels (destroys meaning per NNGroup), collapsing pills into a dropdown (overkill for 4-7 items)

## Decision #47 - 2026-03-16
**Context:** Status filter pills were custom-styled `<button>` elements with hand-rolled active/inactive styling, no overflow handling.
**Decision:** Replace with DS `Tabs` component (`variant="pill"`, `overflow="collapse"`). Use a `toTabValue()` helper to map the generic status type (which includes `undefined` for "All") to string values for Radix Tabs.
**Rationale:** Eliminates ~20 lines of custom pill styling. DS Tabs provides sliding indicator animation, keyboard navigation, and automatic overflow collapse into a dropdown. Consistent with the existing VMs/Nodes perspective toggle on the Issues page which already uses DS Tabs pill variant.

## Decision #46 - 2026-03-13
**Context:** Status filter pills (Unscheduled vs Unschedulable, Has Orphaned vs Has Missing) use API terminology that isn't immediately clear to operators.
**Decision:** Add hover tooltips to all status pills across all pages (VMs, Nodes, Issues VM, Issues Node) explaining what each status means. Keep the API label names unchanged.
**Rationale:** Renaming labels would create a disconnect between the UI and API values, making debugging harder. Tooltips add clarity without changing the data model. The confusing pair (Unscheduled = waiting for assignment, Unschedulable = no node meets requirements) is now disambiguated on hover.
**Alternatives considered:** Renaming "Unschedulable" to "Blocked" (clearer but inconsistent with API), adding a legend section (takes space, always visible)

## Decision #45 - 2026-03-13
**Context:** CopyableText styling consistency across the dashboard
**Decision:** Standardize all CopyableText: equal `startChars`/`endChars` (min 8), default color for copy-only, `text-primary-400` when an `href` is present, no other text color overrides.
**Rationale:** Inconsistent truncation (10/4, 16/6, 8/4) made hashes harder to compare visually. Warning/muted colors on hashes conflicted with semantic color use (badges, status indicators). Purple for linked hashes gives a clear affordance that the text is clickable.

## Decision #44 - 2026-03-13
**Context:** Badge fill style across the dashboard
**Decision:** Use `fill="outline"` on all Badge instances instead of the default `fill="solid"`.
**Rationale:** Outline badges are lighter and less visually dominant, better suited for dense data tables and detail panels where many badges appear together. Solid fill competed with status indicators and action buttons for visual attention.

## Decision #43 - 2026-03-11
**Context:** Wallet view — whether to add a sidebar nav entry for the wallet page
**Decision:** No sidebar entry. Wallet is a utility page reached via clicking wallet addresses.
**Rationale:** Users don't navigate to the wallet page independently — they arrive by clicking an owner address in a node detail view or a permission address on another wallet. Adding it to the sidebar would imply it's a primary navigation destination. Follows the same pattern as detail views (`?view=hash`) which also aren't in the sidebar.

## Decision #42 - 2026-03-11
**Context:** Wallet view activity section — auto-polling vs manual refresh
**Decision:** Manual refresh button with `staleTime: 5min` and no auto-polling.
**Rationale:** Wallet activity data is fetched from api2 which is slower than the scheduler API. Auto-polling at 15-30s would hammer api2 unnecessarily. Manual refresh gives operators control during active troubleshooting. `staleTime: 5min` means returning to the page within 5 minutes uses cached data.

## Decision #41 - 2026-03-11
**Context:** Wallet view — how to get VMs owned by a wallet
**Decision:** Fetch from api2 `messages.json?addresses=` (INSTANCE+PROGRAM types), then cross-reference against `useVMs()` for scheduler status.
**Rationale:** The scheduler API has no owner/wallet field on VMs. VM hashes are Aleph message item_hashes, so api2's `addresses` filter returns messages created by the wallet. Cross-referencing with the scheduler cache (already loaded) adds status without extra scheduler API calls. VMs not in the scheduler show "not tracked" — they exist on the network but aren't managed by this scheduler.
**Alternatives considered:** Adding a wallet filter to the scheduler API (backend change, not available), fetching all VMs and filtering client-side (VMs don't have an owner field in the scheduler)

## Decision #40 - 2026-03-11
**Context:** Wallet view page — inline section components vs separate files
**Decision:** Keep all section components (SummaryStats, NodesSection, VMsSection, ActivitySection, PermissionsCard) inline in the page file.
**Rationale:** These components are tightly coupled to the wallet page — display-only, no reuse outside this context. Splitting them into 5 separate files would scatter related code without any organizational benefit. The file is ~400 lines, which is manageable for a single-page component.

## Decision #39 - 2026-03-11
**Context:** Issues page design — whether to create a derived "misplaced" status for VMs running on a different node than allocated
**Decision:** Stick with API statuses only (orphaned, missing, unschedulable). No derived statuses.
**Rationale:** The API's categorization is the source of truth. Inventing client-side statuses risks inconsistency if the API adds its own interpretation later. The three discrepancy statuses already cover the meaningful divergences between plan and reality.

## Decision #38 - 2026-03-11
**Context:** Issues page — whether to add advanced filters (VM type, payment, resource ranges) like the Nodes/VMs pages
**Decision:** Deferred. Status pills + text search only.
**Rationale:** The discrepancy data set is small (typically dozens, not hundreds). Advanced filters add complexity without proportional value. Can be added later if the data set grows.

## Decision #37 - 2026-03-11
**Context:** Making overview stat cards clickable — the `Stat` component uses `TooltipTrigger asChild` wrapping a `<div>`, which conflicts with nesting a `<Link>`
**Decision:** Split into `StatCard` (visual-only) and `Stat` (wraps with tooltip + optional Link). When `href` is provided, a `<Link>` wraps the card content.
**Rationale:** Keeps the tooltip on hover and navigation on click without conflicting interactive elements. The `asChild` pattern works cleanly with the Link as the trigger element.

## Decision #36 - 2026-03-10
**Context:** Both list pages display 400–500+ rows at once, making scanning difficult. The DS now ships a `Pagination` component (v0.6.0).
**Decision:** Client-side pagination with `usePagination` hook, DS `Pagination` component, page-size dropdown (25/50/100, default 50), in-memory state only (no URL persistence).
**Rationale:** Pagination is a display concern — data fetching stays unchanged (`fetchAllPages` returns full arrays). In-memory state is simpler than URL params, and filter changes already reset to page 1 so bookmarkable pagination has limited value. The dropdown uses a native `<select>` rather than button group to keep chrome minimal. 50 rows default balances scannability with scroll length.
**Alternatives considered:** URL-persisted page state (adds complexity, limited benefit since filters reset page), infinite scroll (harder to jump to specific pages, no clear position indicator), server-side pagination (blocked on expanded `/stats` endpoint for overview page)

## Decision #35 - 2026-03-09
**Context:** Setting up automated IPFS deployment. The Aleph CLI doesn't expose the `address` parameter on `file upload` / `file pin`, which is needed for delegated billing (CI wallet signs, main wallet pays). The CLI always checks the signer's balance, failing with "insufficient funds" even when the main wallet has credits.
**Decision:** Use the Aleph Python SDK directly via `scripts/deploy-ipfs.py` instead of the CLI. Pass `address=owner_wallet` to `create_store()` for delegated billing. Use `aiohttp.FormData` with explicit `filename=` for IPFS directory uploads. Manual trigger (`workflow_dispatch`) only.
**Rationale:** The SDK's `create_store(address=...)` is the only way to bill a different wallet than the signer. `FormData` with explicit filenames is required because the IPFS `/api/v0/add` endpoint uses the `filename` from `Content-Disposition` headers to build the directory tree — without it, the gateway serves all files as `text/plain` (can't infer MIME types without extensions). Manual trigger chosen over auto-deploy because deployments should be intentional.
**Alternatives considered:** Using CLI directly (no delegation support), sending ALEPH tokens to CI wallet (unnecessary ongoing cost), auto-deploy on push to main (deployments should be deliberate)

## Decision #34 - 2026-03-09
**Context:** Adding CPU info to the nodes page. The API returns `cpu_vendor` (CPUID string like "AuthenticAMD"/"GenuineIntel"), `cpu_architecture` (e.g. "x86_64"), and `cpu_features` (e.g. ["sev", "sev_snp"]). The vendor filter initially included an "Unknown" option for nodes with null cpu_vendor.
**Decision:** Map CPUID vendor strings to display labels (AMD, Intel) via `formatCpuLabel()`. Show CPU column in table, vendor multi-select filter (AMD/Intel only), CPU section in detail panel/view. Features shown only in detail views (conditional). Remove "Unknown" from vendor filter options.
**Rationale:** CPUID strings aren't user-friendly ("AuthenticAMD" vs "AMD"). Features are too niche for the table column but useful in detail context (e.g. SEV-SNP indicates confidential computing capability). "Unknown" was removed from the vendor filter because all 54 null-vendor nodes are Unreachable — with the default Healthy status filter, checking "Unknown" produced zero results, which is confusing. Users filter for specific hardware (AMD/Intel), not for "nodes that haven't reported CPU info." Nodes with unknown CPU still appear when no vendor filter is active.
**Alternatives considered:** Including "Unknown" with auto-status-switch (breaks filter independence), architecture-based filter instead of vendor (only x86_64 in current data)

## Decision #33 - 2026-03-09
**Context:** Adding GPU info to the dashboard. The API returns `gpus: { used: [...], available: [...] }` on nodes and `gpu_requirements: [...]` on VMs. Each GPU object has vendor, model, device_name, device_class, device_id.
**Decision:** Keep only vendor, model, and deviceName in the app type (`GpuDevice`). Drop device_class and device_id (PCI identifiers). Display as badge with `formatGpuLabel` (groups by model, count prefix). Simple "Has GPU" / "Requires GPU" boolean checkbox filters.
**Rationale:** PCI identifiers aren't useful for display. Boolean filters are appropriate given the small GPU population (8/543 nodes, 4/462 VMs) — model-based filtering can be added later when GPU adoption grows. The badge column pattern matches existing vCPUs/Memory columns.

## Decision #32 - 2026-03-09
**Context:** New Rust scheduler v1 API now returns paginated responses (max 200 items/page). v0 is incompatible (different schema with `node_id`/`url` instead of `node_hash`/`address`). API reference doc had incorrect paths (showed v0 paths with v1 schema).
**Decision:** Stay on /api/v1/, add `fetchAllPages()` helper to fetch all pages in parallel and return full arrays. No component changes needed.
**Rationale:** Minimal change to existing code — list consumers still get full arrays. Detail endpoints unchanged. Avoids rewriting all components for pagination UI. `fetchAllPages` makes at most 3 parallel requests for current data sizes (~543 nodes, ~462 VMs at 200/page).
**Alternatives considered:** Switch to v0 (incompatible schema), implement proper pagination UI (deferred — much larger scope), request increased page_size cap (fragile)

## Decision #31 - 2026-03-06
**Context:** The dashboard had a local `CopyableHash` component for displaying truncated hashes with copy-to-clipboard. The DS now ships `CopyableText` with the same functionality plus middle-ellipsis, clip-path animation, Phosphor icons, and size variants.
**Decision:** Replace local `CopyableHash` with DS `CopyableText` (`@aleph-front/ds/copyable-text`). Delete the local component and its CSS keyframe animation.
**Rationale:** DS-first component policy (Decision #3). The DS version is strictly better: middle-ellipsis preserves both prefix and suffix of hashes (useful for visual disambiguation), clip-path circle-reveal animation is smoother than CSS keyframe icon swap, and Phosphor icons are consistent with the rest of the DS. No reason to maintain a local version.

## Decision #30 - 2026-03-06
**Context:** VM type filter checkboxes didn't match any data — all 455 VMs showed as filtered out
**Decision:** Update `VmType` to lowercase values (`"microvm"`, `"persistent_program"`, `"instance"`) matching the API wire format
**Rationale:** The API sends lowercase `vm_type` values but the TypeScript type had PascalCase (`"MicroVm"`, `"Instance"`). The client transform passed values through as-is, so the filter compared PascalCase constants against lowercase data. The type definition was speculative (written before verifying real data). All 455 VMs in production are type `"instance"`.

## Decision #29 - 2026-03-06
**Context:** Multi-select filter checkboxes (VM type, payment status) — what should "all unchecked" mean?
**Decision:** "All unchecked" = "no filter active" (show everything), same as "all checked"
**Rationale:** Users interpret deselecting all options as "I don't care about this filter" not "show me nothing." The filter function skips when the set is empty (size 0) or full (size === total options). Same principle applies to payment statuses.

## Decision #28 - 2026-03-06
**Context:** List page filter panels needed better layout — two-column layout was cramped, filter groups ran together, pill toggle buttons for VM type/payment were confusing
**Decision:** Three-column layout with checkboxes, descriptions, and generous spacing. VM Type / Payment & Allocation / Requirements (VMs); Properties / Workload / Hardware (Nodes). Glassmorphism card with subtle dividers between sub-groups.
**Rationale:** Checkboxes are unambiguous for multi-select (vs pill toggles where "highlighted" could mean selected or active). Descriptions explain domain terms ("Micro VM — short-lived functions"). Three columns use the available width better and give each filter group its own visual column. Dividers at 4% white opacity separate sub-groups without competing with card borders.

## Decision #27 - 2026-03-05
**Context:** Detail panels for nodes/VMs could become very tall (30+ VMs, long history) pushing the "View full details →" CTA below the viewport
**Decision:** Truncate lists to 6 VMs / 6 observed nodes / 5 history entries with "+N more" indicator, sticky panel on desktop, no internal scroll
**Rationale:** Internal scroll inside a card that's already inside a scrolling page creates nested scroll confusion. Truncating with "+N more" makes it obvious there's more data on the full detail view, nudging users toward the CTA. Sticky positioning keeps the panel visible while browsing the table.
**Alternatives considered:** Internal scroll with fixed CTA footer (nested scroll UX), collapsible accordion sections (more complex, still tall when expanded)

## Decision #26 - 2026-03-05
**Context:** Stat cards had solid `bg-surface` backgrounds — the original design spec called for glassmorphism/noise texture
**Decision:** Glass card treatment: `bg-white/[0.03]` + `border-white/[0.06]` + SVG noise texture (`feTurbulence` at 3% opacity) via `::after` pseudo-element. Same treatment applied to detail panels.
**Rationale:** True `backdrop-blur` doesn't work on a flat solid background (nothing to blur). The noise texture via inline SVG `feTurbulence` creates perceived depth without an image file. Very low opacity (3%) keeps it subtle. The semi-transparent white background lifts the card just enough off the dark surface.

## Decision #25 - 2026-03-05
**Context:** Overview page redesign — sidebar/header had straight edges with borders while content cards had rounded corners, creating visual disconnect
**Decision:** Recessed content panel pattern — sidebar and header use `bg-background` (darkest layer, no borders), main content area uses `bg-surface` with `rounded-tl-2xl`
**Rationale:** Creates a three-layer visual hierarchy (dark chrome → lighter content panel → cards) without a literal wrapping card. A wrapping card was considered but rejected: double borders, padding stacking on mobile, and loss of individual card identity. The rounded top-left corner where content meets sidebar is enough to create the inset effect.
**Alternatives considered:** One big card wrapping all content (double borders, padding stacking), keeping borders but rounding sidebar (doesn't match the flat chrome pattern)

## Decision #24 - 2026-03-05
**Context:** Overview page redesign — content cards initially used the DS `noise` variant (purple radial gradient + SVG grain texture) for depth
**Decision:** Reverted to default card variant (flat surface + border). Also removed the gradient underline from card headers.
**Rationale:** The purple background was too dominant and clashed with the dark theme. The gradient underline next to card titles added visual noise without clear purpose. Both were user-rejected during iterative review. Keeping the default variant lets the stat cards (which do have subtle tinted backgrounds) stand out as the hero section.

## Decision #23 - 2026-03-05
**Context:** Adding dedicated detail views for nodes and VMs — needed a routing strategy for full-width entity pages
**Decision:** Use `?view=hash` search params on existing `/nodes` and `/vms` pages instead of dynamic route segments (`/nodes/[hash]`)
**Rationale:** IPFS static export can't resolve arbitrary dynamic paths — `next build` would need to know every possible hash at build time. Search params work because the pages are already statically exported, and the `?view=` param is read client-side. This also keeps the URL structure flat and avoids Next.js dynamic route complexity.
**Alternatives considered:** Dynamic routes with `generateStaticParams` (impossible — hashes aren't known at build time), hash-based routing (breaks clean URLs), separate `/node-detail` page (unnecessary — same page, different view)

## Decision #22 - 2026-03-05
**Context:** The mock data layer (`NEXT_PUBLIC_USE_MOCKS`, `mock.ts`, `useMocks()` guards) was no longer in use — real API integration has been stable since Decision #14
**Decision:** Remove the entire mock data system: `mock.ts`, `mock.test.ts`, `useMocks()` function, all 6 mock guards in `client.ts`, and the `NEXT_PUBLIC_USE_MOCKS` env var
**Rationale:** Dead code adds maintenance burden and misleads both developers and LLMs. The mock layer was a scaffolding tool for early development — with real API integration proven and the API status page providing diagnostics, there's no remaining use case. The `.env.example` defaulting to mocks was actively misleading for new clones.

## Decision #21 - 2026-03-04
**Context:** Global git hook blocks `git push origin main`, conflicting with the local squash merge + push workflow
**Decision:** Switch to `gh pr merge --squash` for all feature completions — never push directly to main
**Rationale:** The hook is a global safety guard that prevents accidental direct pushes. Rather than carving out exceptions, align the workflow: push branch → create PR → `gh pr merge --squash`. Same result (one commit per feature on main), but goes through GitHub so the hook is never triggered. PRs also close automatically.

## Decision #20 - 2026-03-04
**Context:** api2.aleph.im hash lookups fail with 400 when sending all 426 VM hashes in a single GET request (~28KB URL)
**Decision:** Batch hash lookups into chunks of 100, fetch in parallel with `Promise.all`
**Rationale:** The api2 endpoint only supports GET (POST returns 405). Browser/server URL limits are ~8KB. 100 hashes × 66 chars ≈ 6.6KB per request, safely under the limit. `Promise.all` keeps latency low — 5 concurrent requests complete in roughly the same time as one.
**Alternatives considered:** POST request (not supported by api2), reducing the number of VMs queried (would miss the truly latest ones), server-side proxy (adds infrastructure)

## Decision #19 - 2026-03-04
**Context:** Adding Latest VMs card to overview page — VM creation timestamps not available from the scheduler API
**Decision:** Progressive loading from two APIs — scheduler data renders immediately, creation timestamps from api2.aleph.im arrive asynchronously via a separate React Query hook
**Rationale:** The scheduler API has no `createdAt` field. VM hashes are Aleph message `item_hash` values, so `api2.aleph.im/api/v0/messages.json?hashes=...` returns the creation timestamps. Rather than blocking the card render on both APIs, we show scheduler data immediately (hash + status badge) with inline Skeleton placeholders for timestamps. Once api2 responds, rows re-sort by creation time. `staleTime: 5min` and no polling since creation timestamps are immutable.
**Alternatives considered:** Single combined API call (scheduler doesn't have the data), blocking render until both APIs respond (worse UX — scheduler is fast, api2 is slower), storing creation times in local cache permanently (timestamps never change but cache invalidation is simpler with React Query's staleTime)

## Decision #18 - 2026-03-04
**Context:** `hasVms` checkbox on nodes page caused a visible delay when toggling
**Decision:** Keep client-side filters out of the React Query key; apply them post-fetch in the component; wrap state setters in `useTransition`
**Rationale:** Including `hasVms` in the query key (`["nodes", {hasVms: true}]`) made React Query treat it as a different query on toggle — triggering a new network request + loading state for what's actually just a client-side `vmCount > 0` filter. Moving filtering into the component makes the toggle instant (same cached data, different view). `useTransition` defers the expensive table re-render so the checkbox updates in the current frame.
**Alternatives considered:** `useDeferredValue` on the filtered array (less explicit), keeping in query key with `keepPreviousData` (still causes unnecessary refetch)

## Decision #17 - 2026-03-04
**Context:** Adding two activity cards to the overview page (Top Nodes + Latest VMs)
**Decision:** Split into two separate implementation plans and execute sequentially
**Rationale:** Each card has different complexity — Top Nodes only needs scheduler data, while Latest VMs requires api2.aleph.im integration for creation timestamps. Separate plans avoid context bloat and allow independent review. The `hasVms` filter is client-side since the scheduler API doesn't support it natively.
**Alternatives considered:** Single combined plan — rejected due to context window concerns

## Decision #16 - 2026-03-04
**Context:** API status page design — considered adding a version dropdown to switch between v0/v1
**Decision:** No version dropdown; hardcode `/api/v1` prefix
**Rationale:** v0 has a known bug (per Olivier), and there's no use case for toggling between versions in the dashboard. The `?api=` query param already allows overriding the base URL for debugging. Adding a version selector would be premature complexity.

## Decision #15 - 2026-03-04
**Context:** Switching API prefix from `/api/v0` to `/api/v1`
**Decision:** Replace all v0 references with v1 across client and tests
**Rationale:** Per Olivier's guidance, `/api/v0/nodes` has a bug and `/api/v1` is the stable version. All 12 integration tests pass against v1 endpoints on `rust-scheduler.aleph.im`.

## Decision #14 - 2026-03-04
**Context:** Migrating from mock-only data to real scheduler API integration (`/api/v0` at port 8081)
**Decision:** Full type rewrite (not incremental field renames), remove EventFeed and sparklines, derive per-status counts client-side
**Rationale:** The API's data model differs significantly from the mock model: snake_case wire format, flat resources instead of nested `ResourceSnapshot`, single VM status instead of dual scheduled/observed, `HistoryRow` instead of `SchedulerEvent`, and no global events or stats history endpoints. Incremental patching would have been messier than a clean rewrite. EventFeed removed because there's no global events endpoint — history is per-resource and shown in detail panels. Sparklines removed because there's no `/stats/history` endpoint; client-side accumulation deferred to backlog. `getOverviewStats()` fetches `/stats` + `/vms` + `/nodes` in parallel to compute per-status breakdowns not available from `/stats` alone — React Query deduplicates the concurrent `/vms` call.
**Alternatives considered:** Keeping sparklines via client-side accumulation in React Query cache (adds complexity for a feature that should come from the backend), adapter layer to preserve old type shapes (more code to maintain than a clean rewrite), keeping EventFeed with per-resource history aggregation (API doesn't support it efficiently).

## Decision #13 - 2026-03-04
**Context:** `@aleph-front/ds` is now published on npm; the `file:` link required the DS repo cloned locally
**Decision:** Migrate from `file:../aleph-cloud-ds/packages/ds` to pinned npm version (`0.0.3`)
**Rationale:** npm dependency removes the requirement to have the DS repo cloned adjacent to the dashboard. CI/CD can install without local filesystem access. Version pinning (exact, no `^`) ensures reproducible builds. The DS still publishes raw `.tsx` source, so `transpilePackages`, `@ac/*` alias, and Tailwind `@source` directive remain unchanged.
**Alternatives considered:** Using `^0.0.x` range (risky with 0.x semver — patch versions can break), publishing pre-compiled output (more work in DS, no benefit yet since only one consumer).

## Decision #12 - 2026-03-03
**Context:** Page refresh on `/nodes` or `/vms` shows IPFS gateway directory listing instead of the app
**Decision:** Add `trailingSlash: true` to `next.config.ts`
**Rationale:** IPFS gateways do directory-based resolution. When a `nodes/` directory exists (from RSC data files), the gateway redirects `/nodes` → `/nodes/` and looks for `index.html` inside it. Without `trailingSlash`, Next.js exports `nodes.html` at the root — never found after the redirect. With `trailingSlash: true`, routes export as `nodes/index.html`, matching gateway expectations.
**Alternatives considered:** Hash-based routing (significant refactor, loses clean URLs), `_redirects` file (not supported by `aleph.sh` gateway).

## Decision #11 - 2026-03-02
**Context:** Sparkline colors invisible on dark backgrounds — `var(--color-destructive)` doesn't exist in the DS
**Decision:** Use DS `--color-*-400` token vars instead of hardcoded OKLCH values or non-existent semantic aliases
**Rationale:** The DS uses `error` not `destructive`. The 400 shade has enough lightness (0.64–0.83 in OKLCH) for dark background contrast. Using token vars instead of raw OKLCH means colors stay in sync if the DS palette changes.
**Alternatives considered:** Adding `--color-destructive` alias to the DS (backlogged — broader naming convention decision), hardcoding brighter OKLCH values (fragile, disconnected from DS).

## Decision #10 - 2026-03-02
**Context:** Choosing how to display 24h trend data on stat cards
**Decision:** Recharts `<AreaChart>` sparklines with monotone interpolation, no animation, 15% fill opacity
**Rationale:** Sparklines need to convey trend direction at a glance, not precise values. Monotone interpolation produces smooth curves. Animation disabled because 30s polling would re-trigger it constantly. Low fill opacity keeps the chart subtle — the number is the primary metric, the sparkline is secondary context.
**Alternatives considered:** Line-only (no fill — harder to see), bar charts (too busy for 24 data points in a small area), SVG path without Recharts (Recharts already a dependency).

## Decision #9 - 2026-03-02
**Context:** Making the selected row visible in node/VM tables after cross-navigation
**Decision:** Left border accent via inset box-shadow, reused as hover affordance on all clickable rows
**Rationale:** Background tint alone (`bg-primary-600/10`) was too subtle against zebra stripes. A 3px left border is the standard "selected item" indicator (VS Code, Slack, etc.) — high contrast, no ambiguity. Reusing it as a hover effect gives consistent visual language for "this row is interactive/active."
**Alternatives considered:** Glow/ring via box-shadow (too flashy for a data table), animated pulse on arrival (motion can be distracting during repeated navigation), scale + drop shadow (feels heavy in dense tables).

## Decision #8 - 2026-03-01
**Context:** Implementing cross-page navigation between overview, nodes, and VMs
**Decision:** URL search params with read-once-on-mount pattern (no write-back to URL)
**Rationale:** URL params are the simplest cross-page communication that works with static exports and supports deep-linking/bookmarking. Read-once avoids complexity of syncing URL state with component state on every filter change. No global state store needed.
**Alternatives considered:** React context for shared state (overkill for one-way navigation), `router.push` with state (not bookmarkable), write-back to URL on every filter change (adds complexity for minimal benefit in an ops dashboard).

## Decision #7 - 2026-03-01
**Context:** DS renamed `--card` token to `--surface`
**Decision:** Replace all `bg-card` with `bg-surface` across the dashboard
**Rationale:** The DS changed the token name. Tailwind's `bg-card` generates `background-color: var(--color-card)` which no longer resolves, causing transparent backgrounds. Silent failure — builds pass but visuals break.

## Decision #6 - 2026-03-01
**Context:** Making the dashboard responsive for mobile and tablet
**Decision:** Off-canvas sidebar drawer on mobile (`md` breakpoint), slide-in detail panel overlays (`lg` breakpoint)
**Rationale:** Sidebar at 256px + detail panel at 384px = 640px of fixed-width chrome, which overflows on anything below ~1100px. Mobile drawer with backdrop is the standard pattern for persistent navigation. Detail panels become full-width overlays below `lg` since there isn't enough room for table + panel side-by-side.
**Alternatives considered:** Bottom navigation for mobile (too few nav items to justify), responsive table with column hiding (table already has overflow-x-auto which is sufficient).

## Decision #5 - 2026-03-01
**Context:** DS components use `@ac/*` path alias internally
**Decision:** Map `@ac/*` to `node_modules/@aleph-front/ds/src/*` in dashboard tsconfig
**Rationale:** Since we transpile raw `.tsx` source from the DS via `transpilePackages`, the DS's internal path aliases aren't available in the consumer's build context. Adding the alias to the dashboard's tsconfig resolves the imports without modifying the DS.
**Alternatives considered:** Could have changed the DS to use relative imports, but that would break the DS's own build and tests.

## Decision #4 - 2026-03-01
**Context:** Choosing default theme for the dashboard
**Decision:** Dark theme by default, with toggle to switch
**Rationale:** User directive. Operations dashboards are typically viewed in dark environments (server rooms, NOCs). Dark theme reduces eye strain during extended monitoring.

## Decision #3 - 2026-03-01
**Context:** Where to put UI components
**Decision:** DS-first component policy — all reusable UI primitives go in `@aleph-front/ds`, dashboard-specific compositions stay local
**Rationale:** Prevents duplicate components across projects. The DS is the single source of truth for brand-consistent UI. Dashboard components are domain-specific compositions that wire DS primitives to scheduler data.

## Decision #2 - 2026-03-01
**Context:** How to fetch data in a static-exported app
**Decision:** React Query with `refetchInterval` polling over server components
**Rationale:** `output: "export"` disables server components with data fetching. React Query provides caching, deduplication, and automatic polling.
**Alternatives considered:** Server components (incompatible with static export), SWR (less feature-rich), manual fetch+useState (no caching/deduplication).

## Decision #1 - 2026-03-01
**Context:** Deployment target for the scheduler dashboard
**Decision:** Static export (`output: "export"`) for IPFS hosting
**Rationale:** Aleph Cloud infrastructure is decentralized. Hosting on IPFS aligns with the platform philosophy — no centralized server dependency. Static export means no server runtime, all data fetching client-side.
**Alternatives considered:** Vercel/Cloudflare deployment (centralized), SSR (requires server runtime).
