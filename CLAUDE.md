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
- Network Health page (`/status`): left-aligned title with status `Badge` (success/error), glassmorphism stat cards (endpoints healthy, avg latency, last checked + recheck button), Scheduler API + Aleph API endpoint sections side-by-side (`lg:grid-cols-2`) with StatusDot/HTTP code/latency, auto-refresh every 60s, `?api=` URL override
- API client (`/api/v1`) with snake→camel transform layer, `fetchAllPages()` for paginated responses (max 200/page, parallel fetching)
- React Query hooks with automatic polling (15-30s intervals)
- Cross-page navigation via URL search params (`?status=`, `?selected=`, `?hasVms=`, `?sort=`, `?order=`, `?view=`): overview stat cards link to filtered list pages, overview activity cards (Top Nodes, Latest VMs) link to detail views via `?view=hash`, detail panels cross-link between nodes and VMs via `?view=`, selected row highlighted with left border accent
- Wallet view page: `/wallet?address=0x...` with back navigation (`← Back` via `router.back()`), showing owned nodes (from scheduler), created VMs with scheduler status (api2 cross-ref), credit rewards (24h) per node and role (CRN/CCN/staker breakdown with ALEPH amounts, auto-growing card height), activity timeline with manual refresh (all message types), permissions granted/received with inline scope tags, wallet-to-wallet navigation, Explorer deep links. Entry points: clickable owner addresses in node and VM detail views/panels.
- Credits page: `/credits` with DS Tabs pill-variant range selector (24h/7d/30d), "Powered by Aleph Cloud" watermark below flow diagram, credit expense distribution flow diagram (DS Card, SVG particle animation along gradient-stroked bezier paths with glow-effect highlight particles, pre-populated particles on load via negative `begin` offsets, pill badge percentage labels at bezier parametric points with hover-expand showing ALEPH amounts, hover interaction with dim/highlight, single origin point per source box, accent bars on sources, distinct color per flow: lime/green/purple/amber/coral), summary stat cards (total with cumulative revenue SVG sparkline/storage/execution/dev fund), recipient table using DS `Table` component with sortable columns (Address/Sources/CRN/CCN/Staking/Total/%) where Sources is a row of `Badge fill="outline"` chips (`CRN: N` / `CCN: N` / `Staker`) derived from `nodeState` per reward address, `FilterToolbar` with role tabs (All/CRN/CCN/Staker with counts) + search across address **or any node name owned by that recipient** (matched node names render as one `Matched: <full-name>` info chip per match in the Sources cell — full names, no truncation, so users can scan rows and pick the right one without clicking through; search query persists in `?q=` so navigating back from the wallet view restores it), whole row is clickable and navigates to `/wallet?address=…`, `CopyableText` for addresses (copy button stops propagation so it doesn't also navigate), `TablePagination` for pagination, sidebar nav entry with coins icon. Uses api2 credit expense messages + corechannel aggregate for node state. Distribution logic: 5% dev fund, CRN share (60% execution), CCN share (75% storage / 15% execution, score-weighted), staker share (20%, stake-weighted). Shared React Query cache for 24h data across credits and wallet pages via stable 5-minute-rounded timestamps. Persisted cache (localStorage, 24h max age, busted by app version) so repeat visits within a day are instant. Prefetch on sidebar hover/focus warms the cache before navigation. `placeholderData: keepPreviousData` keeps prior range numbers visible while a new range is fetched. Flow diagram renders a greyed-out structural placeholder (boxes, thin connectors, em-dash values) while the api2 query is in flight, so the page composition appears immediately.
- Changelog page (`/changelog`): version history with categorized entries (Feature/UI/Infra/Refactor badges), version number link in sidebar footer (`v0.8.0`), data in `src/changelog.ts`
- Static export for IPFS deployment
- `@aleph-front/ds` integration via npm (pinned version) and `transpilePackages`
