# Multi-Branch Preview System

**Date:** 2026-03-21
**Status:** Approved

## Problem

The current workflow only allows previewing one branch at a time via `pnpm dev`. When multiple features are in flight, there's no way to compare them side by side before deciding which to merge and deploy. The development flow also auto-pushes and creates PRs before the user has previewed the work.

## Solution

A CLI tool (`preview`) and a lightweight dashboard that manage multiple concurrent dev servers, each running a different branch in its own git worktree.

## Components

### 1. CLI script: `scripts/preview.sh`

Starts with `set -euo pipefail`. A bash script with the following commands:

| Command | Description |
|---------|-------------|
| `preview start <branch>` | Create worktree, install deps, start dev server, launch dashboard if not running |
| `preview stop <branch>` | Kill dev server, remove worktree |
| `preview stop-all` | Stop all servers + dashboard, clean up |
| `preview list` | Print active previews (branch, port, uptime) |
| `preview dashboard` | Start dashboard only (if not already running) |

The script resolves `PROJECT_ROOT` from its own location (`$(cd "$(dirname "$0")/.." && pwd)`) and uses it for all absolute paths.

**`preview start <branch>` flow:**

1. Validate the branch exists (`git rev-parse --verify`)
2. Create worktree at `/tmp/previews/<sanitized-branch-name>/` via `git worktree add`
3. Copy `node_modules` via hard-links (`cp -al "$PROJECT_ROOT/node_modules" "$WORKTREE/"`) — absolute path, symlinks break Turbopack
4. Copy `.env.local` (and `.env` if present) into the worktree — gitignored files aren't included in worktrees, and `NEXT_PUBLIC_API_URL` is required for real data
5. Assign next available port (3001, 3002, ...) by scanning `.previews.json`, skipping ports that are actually bound (`lsof -i :$port`)
6. Start `next dev --turbopack --port <port>` in background, capture PID
7. Write entry to `.previews.json`
8. Check if port 3000 is already bound before launching dashboard — if occupied (e.g. by `pnpm dev`), warn and skip dashboard start
9. Start dashboard on port 3000 if not already running
10. Print: `Preview running at http://localhost:<port>` and `Dashboard: http://localhost:3000`

**`preview stop <branch>` flow:**

1. Read entry from `.previews.json`
2. Kill the dev server process (and children)
3. Remove the git worktree (`git worktree remove --force`) — worktrees are ephemeral, no edits expected
4. Remove entry from `.previews.json`
5. If no previews remain, stop the dashboard too

**Stale PID cleanup:** All commands that read `.previews.json` verify each PID is still alive (`kill -0 $pid 2>/dev/null`). Dead entries are automatically pruned and their ports freed.

### 2. State file: `.previews.json`

Location: project root (gitignored).

```json
{
  "previews": {
    "feature/credits-v2": {
      "port": 3001,
      "pid": 12345,
      "worktree": "/tmp/previews/feature-credits-v2",
      "startedAt": "2026-03-21T10:30:00Z"
    }
  },
  "dashboard": {
    "pid": 12340,
    "port": 3000
  }
}
```

### 3. Dashboard: `scripts/preview-dashboard.mjs`

A single-file Node.js HTTP server (~60 lines, zero dependencies) that:

- Listens on port 3000
- On each request, reads `.previews.json` from disk (always fresh)
- Returns an HTML page with:
  - Header: project name + "Branch Previews"
  - Card per active preview: branch name, port, clickable link (`http://localhost:<port>`), time since started
  - Empty state message when no previews are running
  - Dark theme matching the dashboard's aesthetic
  - Auto-refresh via `<meta http-equiv="refresh" content="5">`

No frameworks, no build step, no dependencies — just `node scripts/preview-dashboard.mjs`.

### 4. Package script

Add to `package.json`:

```json
"preview": "bash scripts/preview.sh"
```

So usage is `pnpm preview start feature/credits-v2`.

## File changes

| File | Action | Purpose |
|------|--------|---------|
| `scripts/preview.sh` | Create | CLI management script |
| `scripts/preview-dashboard.mjs` | Create | Dashboard server |
| `package.json` | Edit | Add `preview` script |
| `.gitignore` | Edit | Add `.previews.json` |

## Constraints

- **Port 3000** is reserved for the dashboard. Previews start at 3001+. Normal `pnpm dev` also uses 3000, so if you want to run main's dev server alongside previews, use `preview start main` instead. If port 3000 is already bound, the script warns and skips the dashboard.
- **Worktrees in `/tmp/previews/`** — outside the project tree, auto-cleaned on reboot. The `/tmp/` path avoids polluting the workspace.
- **Hard-linked `node_modules`** — proven pattern for this project (see MEMORY.md). Uses absolute path from `PROJECT_ROOT`. Avoids full `pnpm install` per worktree while keeping Turbopack happy.
- **`.env.local` copied** — gitignored files don't appear in worktrees, so the script copies env files to ensure dev servers connect to the real API.
- **No `basePath` needed** — each preview is a standalone dev server with its own port, so routing and assets work without modification.
- **Read-only dashboard** — no start/stop controls in the browser. All management via CLI.
- **Stale PID detection** — all commands verify PIDs are alive and auto-prune dead entries.

## Workflow integration

The finishing-a-branch flow in CLAUDE.md now includes a preview gate:

1. `pnpm check` passes
2. Prompt: "Ready to preview? Run `preview start <branch>`"
3. User previews and approves
4. Push + create PR
5. Squash-merge

## Out of scope

- CI preview deploys to IPFS (backlogged as separate item)
- Auto-detecting branches / PRs to preview
- Browser-based start/stop controls
- Production builds (these are dev servers with HMR)

## Doc updates

- [ ] ARCHITECTURE.md — add preview system to tooling/scripts section
- [ ] DECISIONS.md — log decision to use worktree-based previews with dashboard
- [ ] BACKLOG.md — completed items moved, deferred ideas added
- [ ] CLAUDE.md — Current Features list if user-facing behavior changed
- [ ] src/changelog.ts — if user-facing behavior changed: bump CURRENT_VERSION (semver: major=breaking, minor=feature, patch=fix), add VersionEntry with changes
