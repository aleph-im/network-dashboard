# Working Habits

Persistent habits for maintaining project memory across sessions.

---

## Quick Start

**Sync up:** Say "sync up" or "catch me up" to restore context at session start.

---

## Three Habits

### 1. Decision Logging

Log decisions to `docs/DECISIONS.md` when these phrases appear:
- "decided" / "let's go with" / "rejected"
- "choosing X because" / "not doing X because"
- "actually, let's" / "changed my mind"

Before proposing anything, check if it contradicts a past decision. If conflict found:
> This would contradict Decision #N (summary). Override?

**Format:**
```
## Decision #[N] - [Date]
**Context:** [What we were working on]
**Decision:** [What was decided]
**Rationale:** [Why - this is the important part]
**Alternatives considered:** [If any were discussed]
```

### 2. Scope Drift Detection

**This is an active interrupt, not a passive log.**

When the conversation drifts from the stated task:
1. Stop and say: "This is drifting from [original task]. Add to backlog and refocus, or pivot?"
2. If backlog: log to `docs/BACKLOG.md` (default to **Needs planning**; use **Ready to execute** only if scope is fully clear and the work fits a single sitting) and return to the original task
3. If pivot: continue, but note the scope change

**Triggers to watch for:**
- "Would it be useful to add X?" (when X wasn't part of original request)
- "We could also do Y" (when Y is unrelated to core ask)
- "While we're at it, let's add Z"
- Any work that extends beyond what was asked

**Do NOT flag** clarifying questions about the core feature or technical approaches to achieve the original goal.

**Backlog format:**
```
### [Date] - [Short title]
**Source:** Identified while working on [context]
**Description:** [What needs to be done]
**Priority:** Low/Medium/High
```

### 3. Git Discipline

**Branching:**
- Brainstorm and plan on main
- **Pull main before branching** — stale main causes merge conflicts
- When dev starts, create feature branch from main before any file edits
- Branch naming: `<type>/[name]` (e.g. `feature/`, `fix/`, `chore/`, `refactor/`)

**Doc updates:** Update docs incrementally during development. When touching any doc file, always check all four — never update one in isolation.
- `docs/ARCHITECTURE.md` -- add/update patterns for any new architectural decisions, new files, or changed structure
- `CLAUDE.md` -- update the Current Features list if user-facing behavior changed
- `docs/DECISIONS.md` -- log any key decisions made during the feature
- `docs/BACKLOG.md` -- move completed items to Completed section, add any deferred ideas (sorted into Ready to execute / Needs planning / Roadmap ideations)

**Checklist before merge:**
1. ARCHITECTURE.md updated?
2. CLAUDE.md features updated?
3. DECISIONS.md has implementation decisions?
4. BACKLOG.md item moved to Completed?
5. Plan file status updated? (if a plan file exists for this branch)

**During development:** Track intent, not metrics.

- **Scope drift:** "This started as [X] but now includes [Y]. Commit [X] first?"
- **Implementation complete:** When coding tasks are done -> "Ready to verify and refine, or still working?"
- **Feature complete:** When user says "done" or "that's it" -> "Ready to preview? Run `preview start <branch>` to check it in dev." Only push and create a PR after the user has previewed and approved.
- **Pre-break:** When user says "break", "later", "tomorrow" -> "Push before you go?"

**Completion:** `gh pr merge --squash` keeps main history clean (one commit per feature). Never push directly to main — always go through a PR.

Never interrupt based on file count or commit count.

**Finishing a branch** (overrides the `finishing-a-development-branch` skill options):

**Use `/dio:ship`.** The skill runs the full sequence below end-to-end — including a doc audit against the actual `git diff main...HEAD` — without intermediate confirmation prompts. The steps below are documented for transparency and so this project can override individual steps. If the user says "ship", "ship this", "merge this", or "wrap it up", invoke `/dio:ship` rather than running the steps manually.

1. **Catch up on main** — `git fetch origin main`; if branch is behind (`! git merge-base --is-ancestor origin/main HEAD`), run `git rebase origin/main`. Stop and surface conflicts if any — do NOT auto-resolve. Idempotent: no rebase happens if main hasn't moved.
2. **Doc audit** — `git diff main...HEAD --stat`, grep `docs/` and `CLAUDE.md` for references to changed files and identifiers, output a table of likely doc updates, apply them
3. Run `pnpm check` — stop if anything fails
4. **Project-specific:** Prompt for preview — "Ready to preview? Run `preview start <branch>` to check it in dev." **Wait for user approval** — do not push until the user has previewed and confirmed
5. Commit any doc/audit changes
6. Push branch: `git push -u origin <branch> --force-with-lease`
7. Create PR if none exists: `gh pr create --title "..." --body "..."`
8. Squash-merge: `gh pr merge <number> --squash --delete-branch`
9. Sync local main: `git checkout main && git pull --ff-only origin main`
10. Delete local branch: `git branch -D <branch>`

**Never merge locally.** Option 1 ("Merge back to main locally") from the finishing skill is not allowed — a hook blocks direct pushes to main, and local merges cause SHA divergence after squash-merge. Always go through the PR.

**Project-specific overrides** to the ship sequence: the preview gate (step 4) is mandatory — the `/dio:ship` skill must wait for user approval before pushing.

---

## Context Recovery

On "sync up" or "catch me up":

1. Read `docs/DECISIONS.md`, `docs/BACKLOG.md`, `docs/ARCHITECTURE.md`
2. Check for pending plans — list `docs/plans/` and read the most recent file. If a plan exists that hasn't been fully implemented, surface it in the summary.
3. Check git status and recent git log — use **separate parallel Bash calls** (not chained with `&&`), so each matches `Bash(git status*)` / `Bash(git log*)` allow rules and avoids permission prompts
4. **Scan local branches for in-progress work** — run `git branch` and for each non-main branch, run `git log main..<branch> --oneline` to see what's on it. Cross-reference branches with plan files (branch names often match plan topics). Report each branch with a short summary of its status:
   - How many commits ahead of main
   - Whether it's pushed to remote (`git branch -vv` shows tracking info)
   - Whether it corresponds to a known plan file
   - This catches work done by parallel agents in worktrees, which is otherwise invisible from main
5. Present the summary as a structured table, not prose paragraphs:

```
## Sync Up

| Area | Status |
|------|--------|
| **Branch** | `main` — clean / 2 uncommitted files |
| **Last commit** | `abc1234` — Short commit message |
| **Last decision** | #N — Summary of decision |
| **Pending plan** | None / `2026-03-12-badge-redesign.md` — Brief summary |
| **Blockers** | None / description |

### Active Branches

| Branch | Commits | Remote | Plan |
|--------|---------|--------|------|
| `feature/draft-preview` | 5 ahead | not pushed | `2026-03-31-cms-draft-preview.md` |
| `fix/scroll-bug` | 2 ahead | pushed | — |

### Open Backlog

| Section | Items |
|---------|-------|
| **Ready to execute** | Item 1, Item 2 |
| **Needs planning** | Item 3, Item 4 |
| **Roadmap ideations** | Item 5 |

Ready to go — what are we working on?
```

6. State readiness

---

## Docs

| File | Purpose |
|------|---------|
| `docs/DECISIONS.md` | Decision log with rationale |
| `docs/BACKLOG.md` | Parking lot for scope creep and deferred ideas, triaged into Ready to execute / Needs planning / Roadmap ideations / Completed |
| `docs/ARCHITECTURE.md` | Technical patterns, component structure, and recipes |
| `docs/plans/` | Design and implementation plans (read-only reference) |

Auto memory handles informal operational learnings (build quirks, debugging tips, environment gotchas); `docs/` handles structured project knowledge. Don't duplicate between them.

**Template updates:** Run `/template-check` to see if the project template has changed since this repo was bootstrapped and get help adopting relevant changes.

---

## Skill Integration

Skills (superpowers) are tools, not separate processes. Use them naturally:

- **Brainstorming:** Use for non-trivial design work. Flag scope creep during brainstorming.
- **Planning:** Use `writing-plans` or `EnterPlanMode` for multi-file changes, new features, unclear requirements.
- **Implementation:** Use `subagent-driven-development` or `executing-plans` for complex implementations.
- **Debugging state/sync bugs:** Before writing any fix, trace the full data flow (write -> store -> fetch -> parse -> render). Identify all integration points that need coordinated changes. Don't patch one step without understanding the chain.
- **Post-implementation:** Use `/dio:ship` to run the full finishing sequence (catch-up + doc audit + `pnpm check` + preview gate + commit + push + PR + squash-merge + cleanup) end-to-end. The skill audits docs against the actual diff so they don't drift across feedback iterations.

### Session Workflow

Brainstorming, planning, and implementation happen across separate sessions:

1. **Brainstorm + Plan (current session):** Explore design, write the plan to `docs/plans/`. This session ends after the plan is written.
2. **Implement (new session):** Start a fresh session, say "sync up", then execute the plan using `executing-plans` or `subagent-driven-development`. The plan file on disk is the handoff artifact — no brainstorm context carries over.

Why: brainstorm sessions accumulate rejected ideas, design exploration, and back-and-forth that wastes context window during implementation. A clean session starts with only what matters: the plan + project docs.

### Plan Status Tracking

When an agent finishes executing a plan (all tasks complete, or stopped mid-way), it must add a status line to the **top** of the plan file:

```
---
status: done | in-progress | blocked
branch: feature/branch-name
date: 2026-03-31
note: awaiting testing / blocked on X / Task 3 deferred to BACKLOG
---
```

This makes plan status visible during sync-up without needing to inspect branches. The branch scan (Context Recovery step 4) cross-references these annotations to give a complete picture.

The `note:` field captures execution-time context, not post-merge bookkeeping. Once `status: done` is set and the branch is squash-merged, the PR/SHA pairing is recoverable via `git log --grep` / `gh pr list` — duplicating it in the plan frontmatter creates a post-merge dirty bit that can't be pushed (main is hooked closed). For wave manifests (`docs/superpowers/waves/<wave-id>.md`), the per-row PR/SHA tracking *is* the audit artifact and lands cleanly through chore PRs.

### Plans Must Include Verification and Doc Updates

Every implementation plan must include verification and doc update tasks at the end. This is not optional — it's part of the definition of done, not a merge-time afterthought.

The final two plan tasks should be:

```
### Task N-1: Verify and refine

- [ ] Run full project checks (`pnpm check`)
- [ ] Manual testing / smoke test the feature
- [ ] Fix any issues found
- [ ] Re-run checks until clean

### Task N: Update docs and version

- [ ] ARCHITECTURE.md — new patterns, new files, or changed structure
- [ ] DECISIONS.md — design decisions made during this feature
- [ ] BACKLOG.md — completed items moved, deferred ideas added
- [ ] CLAUDE.md — Current Features list if user-facing behavior changed
- [ ] src/changelog.ts — if user-facing behavior changed: bump CURRENT_VERSION (semver: major=breaking, minor=feature, patch=fix), add VersionEntry with changes
```

Copy these tasks verbatim into every plan. Do not paraphrase or summarize — the explicit checklist prevents items from being forgotten.

---

## Project: Scheduler Dashboard

Operations dashboard for monitoring the Aleph Cloud scheduler — node health, VM scheduling, and real-time events. Hosted as static export on IPFS.

### Tech Stack

- **Framework:** Next.js 16 (App Router, static export)
- **Language:** TypeScript (strict, ESM only)
- **Styling:** Tailwind CSS 4 + @aleph-front/ds
- **Database:** None (client-side only, REST API polling)
- **Deployment:** IPFS (static export)

### Commands

```bash
pnpm dev          # Dev server (Turbopack)
pnpm build        # Static export to out/
pnpm test         # Vitest
pnpm lint         # oxlint
pnpm typecheck    # tsc --noEmit
pnpm check        # lint + typecheck + test
```

### Key Directories

```
src/
├── app/           # Next.js App Router pages
├── api/           # API client and types
├── hooks/         # React Query hooks
└── components/    # Dashboard-specific compositions
```

### Component Policy

**All reusable UI components must be created in `@aleph-front/ds` (../aleph-cloud-ds) and imported here.** No generic components (Table, Badge, Card, etc.) should be created locally. Dashboard-specific compositions that combine DS components with domain logic live in `src/components/`.

### DS Component Lifecycle

When adding a new component to `@aleph-front/ds`, follow the "Adding a New Component" recipe in the DS repo's `docs/ARCHITECTURE.md` § Recipes. That recipe is the single source of truth — do not duplicate it here.

**Key steps to remember (see DS ARCHITECTURE.md for full details):**
- Build component, test, and subpath export
- Create preview page + sidebar entry, then **ask the user to verify** before proceeding
- Run `pnpm check` — all must pass
- Update **all five docs**: DESIGN-SYSTEM.md, ARCHITECTURE.md, DECISIONS.md, BACKLOG.md, CLAUDE.md

**Never commit a DS component without its preview page and full documentation.**

### Current Features

- Responsive layout: off-canvas sidebar drawer on mobile, inline on desktop; detail panels as slide-in overlays on mobile, inline on desktop; adaptive column hiding when detail panel is open (lower-priority columns hidden to prevent table squeeze, restored when panel closes)
- App shell with borderless sidebar and header (`bg-muted/40` light, `bg-surface` dark), recessed content panel (`bg-background`, `rounded-tl-2xl`), accent radial glow, scroll-to-top on navigation, hamburger menu (mobile), DS `LogoFull` in sidebar header, categorized sidebar nav (Dashboard/Resources sections with uppercase titles), "More" overflow popover in sidebar footer (Issues + Network Health with health dot, opens upward, click-outside-to-close)
- Dark theme default with light/dark toggle (localStorage persistence)
- Overview page: hero is a 2-column layout (stacks below `lg`) — left side a 2×2 stat grid with clickable cards linking to filtered list pages (text-4xl numbers, glassmorphism bg with noise texture, colored status indicators, tinted backgrounds, explanatory subtitles, hover tooltips, animated donut rings with status icons showing value/total ratio), Nodes section (Total/Healthy), Virtual Machines section (Total/Dispatched; Total counts active statuses only — dispatched + duplicated + misplaced + missing + unschedulable); right side the `WorldMapCard` (see below). Below the hero: top nodes by VM count card (links to detail view via `?view=hash`), latest VMs by creation time card (progressive loading from api2.aleph.im, pre-sorted by `updatedAt` with top 100 candidates sent to api2, dash shown when no creation time found, links to detail view via `?view=hash`), page title with subtitle, `?` info tooltips on all card headers, hover glow on content cards. Dropped from the hero in v0.9 (Decision #69): Unreachable/Removed/Missing/Unschedulable cards — still reachable as per-status pills on `/nodes` and `/vms`.
- Worldmap card on Overview hero (`WorldMapCard`): Vemaps Web Mercator world map (`public/world-map.svg`, dark navy `#2B2B44` continents, viewBox cropped to `100 140 600 333` — Europe-leaning, no Antarctica) with one green SVG `<circle>` per sampled active node (CRN+CCN combined into one color), positioned at country centroid + deterministic per-hash elliptical scatter (~2° lat × ~3.2° lng). Live node state from `useNodeState()` joined with a build-time JSON snapshot (`src/data/node-locations.json`) keyed by node hash; snapshot generated by `scripts/build-node-locations.ts` (CCN multiaddr IP parsing + CRN hostname DNS resolution + `ip3country` country lookup) chained into `pnpm build` as a prebuild step. Per-country sampling at 1-in-10 (`Math.max(1, ceil(N/10))` per country, ~60 dots total from ~500 nodes) so heavy clusters (FR, US, DE) don't form bright blobs and small countries (RU, IT, CA) always get at least 1 dot. Mercator projection calibrated empirically to the Vemaps SVG (`centerX: 400.8, equatorY: 395.7, R: 117.27, lngOffset: 11`) — the SVG is centered on lng+11°. Map fills the card edge-to-edge via `object-cover` + SVG `preserveAspectRatio="xMidYMid slice"` so dots stay aligned regardless of card aspect. Hash-seeded per-dot flicker animation (4–6s, 0–5s delay) respecting `prefers-reduced-motion`. In-card header (green dot + "Aleph Cloud Nodes") + disabled expand button with "Coming soon" tooltip; external `Network Map` section label sits above the card so its top edge aligns with the StatsBar labels. Theme-aware chrome (dot pattern bg + soft inner vignette) via `--map-dot-color` / `--map-vignette` CSS variables. Map opacity is 0.2 in light theme, 1.0 in dark. Snapshot script aborts and keeps the previous JSON if api2 is unreachable or returns < 50% of the previous dataset, so production builds never silently regress to an empty map. Vemaps attribution link bottom-left (license-required).
- Shared filter chrome: `FilterToolbar` (optional `leading` slot, DS Tabs underline variant `size="sm"` with `overflow="collapse"` for status filters with sliding indicator and automatic overflow dropdown, `flex-1 min-w-0` on Tabs container to naturally limit visible items, optional icon-only filter toggle with active badge dot — hidden when no `onFiltersToggle` provided, `size="sm"` search input with clear) and `FilterPanel` (collapsible DS Card with reset button) used by list pages; toolbar always renders above the table+detail flex container so it never gets squeezed by the detail panel
- Client-side table pagination: `usePagination` hook + `TablePagination` component (DS `Pagination`, page-size dropdown 25/50/100, "Showing X–Y of Z"), resets to page 1 on filter changes, hidden when ≤1 page. Sort is lifted into each table and runs over the full filtered dataset before pagination via `applySort` (`src/lib/sort.ts`); DS Table operates in controlled-sort mode so clicking a header re-orders all rows, not just the current page
- Nodes page: sortable table with text search (hash, owner, name), status filter pills with count badges, collapsible advanced filters (Properties: Staked/IPv6/Has GPU/Confidential checkboxes; CPU Vendor: AMD/Intel multi-select; Workload: VM count range; Hardware: vCPUs/Memory ranges), 4-column glassmorphism filter panel, StatusDot indicators, vCPUs and Memory columns, CPU column (vendor + architecture via `formatCpuLabel`), GPU badge column (e.g. "2x RTX 6000 ADA"), ShieldCheck icon on confidential nodes (tooltip), sticky glass side panel with CPU section (architecture/vendor/features) and GPU section (in-use/available badges), Confidential row in panel/detail, truncated lists (6 VMs, 5 history, "+N more"), full detail view via `?view=hash` (owner, IPv6, discoveredAt, confidential computing, CPU info, GPU card with per-device status, complete history table)
- VMs page: sortable table with text search (hash, node), 10 status filter pills with count badges (visible cap of 3: All / Dispatched / Scheduled — rest in the `⋯` overflow dropdown via DS Tabs `maxVisible` prop; overflow ordering: duplicated, misplaced, missing, orphaned, unschedulable, unscheduled, unknown; default tab is All), collapsible advanced filters (VM Type: micro_vm/persistent_program/instance checkboxes with descriptions; Payment & Allocation: validated/invalidated checkboxes, allocated-to-node checkbox, requires-GPU checkbox, requires-confidential checkbox, default-on "Show inactive VMs" checkbox hiding VMs whose status is not in ACTIVE_VM_STATUSES (matches Overview Total VMs definition); bypassed when a specific status pill is selected so per-status views show their true counts; `?showInactive=true` URL persistence; Requirements: vCPUs/Memory ranges in GB), 3-column glassmorphism filter panel, ShieldCheck icon on confidential VMs (tooltip), sortable Last Updated column (relative time, hidden in compact mode), sticky glass side panel with allocated node name (right-aligned), GPU requirements and Confidential row in Requirements section, truncated lists (6 observed nodes, 5 history, "+N more"), full detail view via `?view=hash` (allocated node name, allocatedAt, lastObservedAt, paymentType, GPU requirements row, confidential computing row, complete history table). All-tab count is plain when only the default-on inactive-hide is culling; switches to `filtered/total` slash format when other filters or search stack on top.
- Issues page: scheduling discrepancy investigation with VMs|Nodes perspective toggle (DS Tabs pill variant `size="sm"`, `?perspective=vms|nodes`), VM perspective (table with Status/VM Hash/Issue/Scheduled On/Observed On/Last Updated, status pills All/Orphaned/Duplicated/Misplaced/Missing/Unschedulable with counts, detail panel with Schedule vs Reality card + amber issue explanation + quick facts + link to full details), Node perspective (table with Status/Node Hash/Name/Orphaned/Duplicated/Misplaced/Missing/Total VMs/Last Updated, status pills All/Has Orphaned/Has Duplicated/Has Misplaced/Has Missing, detail panel with per-discrepancy-type summary cards + discrepancy VM list), no new API calls (derived from `useIssues()` hook combining `useVMs()` + `useNodes()`), text search on both perspectives; 5 DiscrepancyStatus values: orphaned/duplicated/misplaced/missing/unschedulable
- Three-tier typography: Rigid Square headings (Typekit), Titillium Web body (Typekit), Source Code Pro data (`--font-mono` override). Staggered card entrance on overview page (`card-entrance` keyframe with `--ease-spring` easing). Respects `prefers-reduced-motion`.
- Network graph page (`/network`): force-directed layout of the Aleph network rendered full-bleed inside the recessed content panel via `md:-m-6 md:h-[calc(100%+3rem)] md:overflow-hidden` (so the map ignores `<main>`'s `p-6`), with page chrome (title, layer toggles, reset-view, search, focus banner) overlaying via `pointer-events-none` on the wrapper + `pointer-events-auto` on each interactive element so blank-area clicks pass through to the graph. Detail panel is a 280px floating card anchored `right-6 top-40` (right edge aligns with the toolbar's search input), sized to its content with `max-h-[calc(100%-11rem)]` so tall content scrolls inside instead of overflowing the viewport. Background matches the sidebar (`bg-muted/40 dark:bg-surface`) so the panel reads as part of the same chrome layer rather than a separate surface. Composed of a shared shell (`network-detail-panel.tsx`: StatusDot + title + Focus + × in the header, optional "View full details →" footer for CCN/CRN) plus three presentational bodies selected by `node.kind`: `network-detail-panel-ccn.tsx` (type, status, score, Location row with flag emoji + country name, CRNs/Stakers stat tiles, total staked, owner, reward — reads `CCNInfo` from `nodeState`), `network-detail-panel-crn.tsx` (type, status, VM count, Location row, parent CCN clickable, CPU/Memory bars, owner — reads `CRNInfo` + `useNode(hash)`), `network-detail-panel-address.tsx` (address with copy + wallet link, "Connected to N CCNs/nodes" degree summary against `visibleGraph`, `NetworkStakingSection` listing every CCN where the address appears in `c.stakers` with per-position + total ALEPH). Heavier content (GPU/VM/history) lives only on `/nodes?view=`. The Focus action sets both `?focus` and `?selected` so the panel stays open after focusing — clicking a CRN's parent-CCN link rebinds the panel to the parent in one click. Focus state is exposed as a compact pill (`‹ Focused: <name> ×`): the leading `‹` pops one entry off the URL-encoded focus stack (comma-separated `?focus=A,B,C` — last = active), the trailing `×` clears focus entirely. `router.push` is still used on Focus so browser back/forward also walks the chain — but the pill is independent of history, so it always stays on `/network` even when the user arrived from another route. Selection clicks use `router.replace` so they don't pollute the stack. The pill renders inside the panel between header and content when the panel is open, so back-and-forth navigation feels like one motion; when the panel is closed but focus is active, it falls back to the toolbar row so focus is always escapable. Component: `network-focus-pill.tsx`. `useNetworkGraph` exposes `nodeState` so the shell needs no extra API call for CCN/parent lookups. Architecture: `d3-force` owns simulation, React owns DOM, positions live in a `positionsRef` that's pre-populated by `simNodes` useMemo using d3-force's Fibonacci-spiral seed so `<g data-id>` elements are present from the first render; tick batches updates via `requestAnimationFrame` and re-renders via `setTickKey`. On fresh mounts (initial load and reset-view) the same useMemo runs a throwaway `forceSimulation` synchronously for 300 ticks before commit so the first paint shows the converged layout — the camera fits in one transition instead of fitting a tight spiral and re-centering after a multi-second outward expansion. Live sim then starts at `alpha(0)` after warmup so it doesn't re-shake (`SETTLE_MS = 500` in `network/page.tsx` covers the 450ms refit transition). Drag is delegated to the parent `<g ref={gRef}>` via d3-drag's `.container()` + `.subject()` pattern (one listener resolves the dragged node from `event.target.closest("g[data-id]")`) so attachment is timing-independent. Long-press to drag (200ms timer in `drag.start`; offset captured from `lastDragPointRef` on timer fire so the node doesn't jump to the cursor); `alphaTarget(0.05)` during drag keeps neighbor reaction subtle; on release `alphaDecay(0.15)` is set temporarily and restored to `SIM_DECAY = 0.05` via a namespaced `end.dragCooldown` sim listener so post-drag settles in ~0.4s without affecting initial layout. Cursor stays `default` everywhere — no hand variants. Auto-refit only fires when `refitKey = layers|focus|address` changes (URL-driven), not on background data refetches, so polling never disturbs the user's viewport. Layers: `structural` (CCN↔CRN) and `staker` on by default, plus `owner` / `reward` overlays toggleable; URL-persisted via `?layers=`. **Geo layer** (off by default, fifth toggle): groups located CCN/CRN around a per-country hub node — clustering, not geographic mapping. `buildGraph` emits a `kind: "country"` node per represented country (id `country:<ISO>`, label = centroid name from `src/data/country-centroids.json`) plus a `type: "geo"` edge per located CCN/CRN to its country. **Layout is force-driven, not projected:** countries are regular sim nodes (no `fx`/`fy` pin), placed by the simulation based on cluster mass — heavy clusters drift to the edges, smaller ones nestle in between. Geo edges live in a separate `forceLink` (distance 25, strength 1) so the relational `forceLink` keeps d3's degree-aware default strength for non-geo edges; country charge is boosted to `-800` (vs `-180` for other nodes) so country clusters can't overlap. Geo edges render as a country-tinted dashed tether (`var(--network-country)`, `1 2` dash, 0.5 stroke, 0.35 opacity, no arrowhead) so the hub-and-spoke topology reads explicitly — selecting a country brightens its tethers via the same incident-color path as CCN/CRN selection (country → `var(--network-country)` highlight). Country labels bypass `LABEL_ZOOM_THRESHOLD` so the grouping is always legible (`Badge variant="info"`). Country is the **top-tier visual** when the layer is on: `RADIUS.country=22` (bigger than CCN's 16), full node treatment (opaque background underlay, `fillOpacity=0.18` colored fill, stroke, outer ring at `r+3`, selection halo) using a new `--network-country` token (cyan/teal — distinct from CCN purple, CRN green, staker amber, error red). Countries are clickable (open the detail panel), focusable (Focus builds an ego subgraph via geo edges, naturally pulling in located nodes + their structural/owner/staker neighbors), and searchable — `network-search.tsx` matches `country:FR` by id and `France` by label, and a country match fires both `?focus` and `?selected`. Detail panel adds `NetworkDetailPanelCountry` (flag emoji via regional-indicator codepoints in `src/lib/country-flag.ts`, CCN/CRN/total/owner stat tiles aggregated from incident geo edges in `visibleGraph`, faint inactive footnote when > 0). Legend gains a "Country" node swatch and a "Country tether" line swatch when the geo layer is on. Search input has an Info icon trigger to the left with a tooltip explaining the four supported query types (hash / node name / 0x address / country) and noting that country search requires Geo. Stakers/rewards/unlocated nodes float as today; no world-map backdrop. Selected node's incident edges are recolored to the node's kind color (CCN purple, CRN green) and the node itself gets a translucent halo at `r + 8` in its own color at `fillOpacity=0.25` (no animation; the address-deep-link pulse stays its own visual). **Spotlight on selection / address:** with a node selected, `relevantIds = {selected} ∪ direct-neighbors-via-any-visible-layer`; with no selection but `?address=` set, the same spotlight runs on `relevantIds = highlightedIds ∪ 1-hop neighbors` so address search also reads as a focused subgraph. Nodes outside the set render at opacity `0.18`, edges where neither endpoint is in the incident set become `faded` (existing 20%-of-base path), labels of dimmed nodes also drop to `0.18` — so the focused subgraph reads as a clean spotlight. ForceLink uses d3's degree-aware default link strength so dense overlay cliques (same-owner / same-staker / same-reward groups) don't crush together. Edges render below an opaque `var(--color-background)` underlay on each node so links don't bleed through; dashed/dotted patterns use `strokeWidth=0.5` with `strokeLinecap="round"` (`owner: "1.5 1"`, `reward: "0 0.4"` becomes round dots). **Edge palette:** structural at `0.6` opacity (was `0.4`); owner overlay at `0.2` and now uses `currentColor` (the same neutral gray as structural) instead of blue, so its dashed pattern reads as an overlay rather than competing with the structural backbone. **Arrowheads on structural CCN→CRN edges:** a single `<marker id="arrow-end">` sized `10 × nodeScale` user-space units, with `fill="context-stroke"` so the arrow inherits the line's color (gray default, kind-color highlight, dim-faded otherwise); the line endpoint is shortened by `RADIUS.crn × nodeScale + 1.5` so the arrow tip lands just outside the CRN border instead of being masked by the node's opaque underlay. Node labels (CCN/CRN) render as DS `Badge` (`fill="outline"`, `size="sm"`) above `LABEL_ZOOM_THRESHOLD=1.5`, with kind/status-mapped variants (CCN purple, CRN green, unreachable error, inactive info); gap of `r * nodeScale * k + 8`px below the node. Initial fit / reset-view pads the bounding box by 2×, caps zoom at `2`, and floors at `MIN_FIT_ZOOM = 0.3` so the full graph shows without aggressive zoom-in. **Node sizing:** base radii `CCN=16, CRN=11, staker=5, reward=6, country=22` (country only present when Geo is on); multiplied by a zoom-adaptive `nodeScale` (`nodeScaleForZoom(k)`: boosts up to ~1.9× below `k=0.6` so dots stay readable when zoomed out, eases to `0.7×` above `k=1.5` so dense clusters don't crowd, quantized to 0.1 steps so smooth zoom doesn't thrash 500+ memoized node renders). Selection halo, CCN outer ring, label gap, and structural arrow size all scale through the same `nodeScale`. Focus mode renders an ego subgraph via `egoSubgraph(graph, focusId)`. Address deep-link / search (`?address=`) opens a dedicated `NetworkSearchAddressPanel` (right side, 280px, same chrome as the node panel) with copyable address, "Linked to N nodes" count, staking section listing CCNs the address stakes on with ALEPH amounts, and an "Open wallet view →" link. `highlightedIds` matches nodes where `n.id === address` (staker self-match), `n.owner === address`, or `n.reward === address` — three sources merged. Matching nodes pulse, the camera fits them, and the selection spotlight dims everything else (see above). Closing the address panel clears both `?address=` and the search input. **Search** input is controlled by the page (`q` + `onChange` + `onSearchFit`) so close-panel and close-address can clear it; the form is `max-w-[280px]` to match the detail card width with `gap-0.5` between a 28×28 Info-icon Button and the input. Node hash/name searches call `onSearchFit(match.id)` which bumps a `fitNonce` and triggers a refit to the matched node + 1-hop neighbors (450ms transition). Country attribution is always run by `buildGraph` (decoupled from the geo layer toggle) so the Location row shows up on CCN/CRN panels regardless of layer state. `--network-country` token uses `oklch(L 0.13 200)` — chroma capped at `0.13` because Lightning CSS silently drops out-of-gamut OKLCH at hue 200° (Decision #77). Layer toggles, focus, search, and selection all persist via URL params. Suspense boundary at the page root for `useSearchParams()` static-export compatibility. Mobile fallback: a list of CCNs (no graph), inside `md:hidden`.
- Network Health page (`/status`): left-aligned title with status `Badge` (success/error), glassmorphism stat cards (endpoints healthy, avg latency, last checked + recheck button), Scheduler API + Aleph API endpoint sections side-by-side (`lg:grid-cols-2`) with StatusDot/HTTP code/latency, auto-refresh every 60s, `?api=` URL override
- API client (`/api/v1`) with snake→camel transform layer, `fetchAllPages()` for paginated responses (max 200/page, parallel fetching)
- React Query hooks with automatic polling (15-30s intervals)
- Cross-page navigation via URL search params (`?status=`, `?selected=`, `?hasVms=`, `?sort=`, `?order=`, `?view=`): overview stat cards link to filtered list pages, overview activity cards (Top Nodes, Latest VMs) link to detail views via `?view=hash`, detail panels cross-link between nodes and VMs via `?view=`, selected row highlighted with left border accent
- Wallet view page: `/wallet?address=0x...` with back navigation (`← Back` via `router.back()`), showing owned nodes (from scheduler), created VMs with scheduler status (api2 cross-ref), credit rewards (24h) per node and role (CRN/CCN/staker breakdown with ALEPH amounts, auto-growing card height), activity timeline with manual refresh (all message types), permissions granted/received with inline scope tags, wallet-to-wallet navigation, Explorer deep links. Entry points: clickable owner addresses in node and VM detail views/panels.
- Credits page: `/credits` with DS Tabs pill-variant range selector (24h/7d/30d), "Powered by Aleph Cloud" watermark below flow diagram, credit expense distribution flow diagram (DS Card, SVG particle animation along gradient-stroked bezier paths with glow-effect highlight particles, pre-populated particles on load via negative `begin` offsets, pill badge percentage labels at bezier parametric points with hover-expand showing ALEPH amounts, hover interaction with dim/highlight, single origin point per source box, accent bars on sources, distinct color per flow: lime/green/purple/amber/coral), summary stat cards (total with cumulative revenue SVG sparkline/storage/execution/dev fund), recipient table using DS `Table` component with sortable columns (Address/Sources/CRN/CCN/Staking/Total/%) where Sources is a row of `Badge fill="outline"` chips (`CRN: N` / `CCN: N` / `Staker`) derived from `nodeState` per reward address, `FilterToolbar` with role tabs (All/CRN/CCN/Staker with counts) + search across address **or any node name owned by that recipient** (matched node names render as one `Matched: <full-name>` info chip per match in the Sources cell — full names, no truncation, so users can scan rows and pick the right one without clicking through; search query persists in `?q=` so navigating back from the wallet view restores it), whole row is clickable and navigates to `/wallet?address=…`, `CopyableText` for addresses (copy button stops propagation so it doesn't also navigate), `TablePagination` for pagination, sidebar nav entry with coins icon. Uses api2 credit expense messages + corechannel aggregate for node state. Distribution logic: 5% dev fund, CRN share (60% execution), CCN share (75% storage / 15% execution, score-weighted), staker share (20%, stake-weighted). Shared React Query cache for 24h data across credits and wallet pages via stable 5-minute-rounded timestamps. Persisted cache (localStorage, 24h max age, busted by app version) so repeat visits within a day are instant. Prefetch on sidebar hover/focus warms the cache before navigation. `placeholderData: keepPreviousData` keeps prior range numbers visible while a new range is fetched. Flow diagram renders a greyed-out structural placeholder (boxes, thin connectors, em-dash values) while the api2 query is in flight, so the page composition appears immediately.
- Changelog page (`/changelog`): version history with categorized entries (Feature/UI/Infra/Refactor badges), version number link in sidebar footer (`v0.8.0`), data in `src/changelog.ts`
- Static export for IPFS deployment
- `@aleph-front/ds` integration via npm (pinned version) and `transpilePackages`
