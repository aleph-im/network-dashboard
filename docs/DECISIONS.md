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
