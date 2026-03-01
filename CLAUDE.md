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
2. If backlog: log to `docs/BACKLOG.md` and return to the original task
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
- When dev starts, create feature branch from main before any file edits
- Branch naming: `feature/[plan-name]`

**Before merging:** Update ALL docs before squash merging to main.
- `docs/ARCHITECTURE.md` -- add/update patterns for any new architectural decisions, new files, or changed structure
- `CLAUDE.md` -- update the Current Features list if user-facing behavior changed
- `docs/DECISIONS.md` -- log any key decisions made during the feature
- `docs/BACKLOG.md` -- move completed items to Completed section, add any deferred ideas

**Checklist before merge:**
1. ARCHITECTURE.md updated?
2. CLAUDE.md features updated?
3. DECISIONS.md has implementation decisions?
4. BACKLOG.md item moved to Completed?

**During development:** Track intent, not metrics.

- **Scope drift:** "This started as [X] but now includes [Y]. Commit [X] first?"
- **Feature complete:** When user says "done" or "that's it" -> squash merge to main
- **Pre-break:** When user says "break", "later", "tomorrow" -> "Push before you go?"

**Completion:** Squash merge keeps main history clean (one commit per feature).

Never interrupt based on file count or commit count.

---

## Context Recovery

On "sync up" or "catch me up":

1. Read `docs/DECISIONS.md`, `docs/BACKLOG.md`, `docs/ARCHITECTURE.md`
2. Check git status (branch, uncommitted changes, unpushed commits)
3. Check recent git log for context
4. Summarize:
   - Last decision logged
   - Open backlog items
   - Any blockers
   - Git status
5. State readiness

---

## Docs

| File | Purpose |
|------|---------|
| `docs/DECISIONS.md` | Decision log with rationale |
| `docs/BACKLOG.md` | Parking lot for scope creep and deferred ideas |
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
- **Post-implementation:** Run build/lint verification, handle git workflow, update ARCHITECTURE.md and DECISIONS.md if new patterns or decisions emerged.

### Session Workflow

Brainstorming, planning, and implementation happen across separate sessions:

1. **Brainstorm + Plan (current session):** Explore design, write the plan to `docs/plans/`. This session ends after the plan is written.
2. **Implement (new session):** Start a fresh session, say "sync up", then execute the plan using `executing-plans` or `subagent-driven-development`. The plan file on disk is the handoff artifact — no brainstorm context carries over.

Why: brainstorm sessions accumulate rejected ideas, design exploration, and back-and-forth that wastes context window during implementation. A clean session starts with only what matters: the plan + project docs.

### Plans Must Include Doc Updates

Every implementation plan must include a final step with this exact checklist. This is not optional — it's part of the definition of done, not a merge-time afterthought.

The final plan task should be:

```
### Task N: Update docs

- [ ] ARCHITECTURE.md — new patterns, new files, or changed structure
- [ ] DECISIONS.md — design decisions made during this feature
- [ ] BACKLOG.md — completed items moved, deferred ideas added
- [ ] CLAUDE.md — Current Features list if user-facing behavior changed
```

Copy this checklist verbatim into every plan. Do not paraphrase or summarize — the explicit checklist prevents items from being forgotten.

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
├── api/           # API client, types, mock data
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

- Responsive layout: off-canvas sidebar drawer on mobile, inline on desktop; detail panels as slide-in overlays on mobile, inline on desktop
- App shell with sidebar navigation (Overview, Nodes, VMs) and header with page title and hamburger menu (mobile)
- Dark theme default with light/dark toggle (localStorage persistence)
- Overview page: stat cards, node health bar, VM allocation summary, event feed with category filters
- Nodes page: sortable table with status filters, StatusDot indicators, resource usage bars, detail panel with VMs and events
- VMs page: sortable table with status filters, discrepancy highlighting, detail panel with scheduling history
- API client with mock data fallback (`NEXT_PUBLIC_USE_MOCKS=true`)
- React Query hooks with automatic polling (10-30s intervals)
- Static export for IPFS deployment
- `@aleph-front/ds` integration via `file:` link and `transpilePackages`
