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
