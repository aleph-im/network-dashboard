# Multi-Branch Preview System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable previewing multiple feature branches side by side via concurrent dev servers, with a dashboard listing all active previews.

**Architecture:** A bash CLI script (`scripts/preview.sh`) manages git worktrees and Next.js dev servers on separate ports. State is tracked in `.previews.json`. A zero-dependency Node.js HTTP server (`scripts/preview-dashboard.mjs`) serves a dashboard page on port 3000 that reads state and renders clickable links. `package.json` gets a `preview` script for `pnpm preview` usage.

**Tech Stack:** Bash, Node.js (stdlib only — `http`, `fs`, `path`), git worktrees

**Spec:** `docs/plans/2026-03-21-multi-branch-preview-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/preview.sh` | Create | CLI: start/stop/list/stop-all/dashboard commands, worktree + process management, state file I/O, stale PID cleanup |
| `scripts/preview-dashboard.mjs` | Create | HTTP server on port 3000, reads `.previews.json`, renders HTML dashboard with auto-refresh |
| `package.json` | Edit | Add `"preview"` script |
| `.gitignore` | Edit | Add `.previews.json` |

---

### Task 1: Create the preview dashboard server

The dashboard is a dependency-free file, so build it first. It can be tested standalone.

**Files:**
- Create: `scripts/preview-dashboard.mjs`

- [ ] **Step 1: Create `scripts/preview-dashboard.mjs`**

```js
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = resolve(__dirname, "..", ".previews.json");
const PORT = 3000;

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { previews: {} };
  }
}

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderPage(state) {
  const entries = Object.entries(state.previews || {});
  const cards = entries.length
    ? entries
        .map(
          ([branch, info]) => `
      <a href="http://localhost:${info.port}" class="card" target="_blank">
        <div class="branch">${escapeHtml(branch)}</div>
        <div class="meta">
          <span class="port">:${info.port}</span>
          <span class="time">${timeAgo(info.startedAt)}</span>
        </div>
      </a>`,
        )
        .join("")
    : '<div class="empty">No active previews. Run <code>pnpm preview start &lt;branch&gt;</code> to get started.</div>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="5">
  <title>Branch Previews</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0a0a0f;
      color: #e4e4e7;
      min-height: 100vh;
      padding: 3rem 1.5rem;
    }
    .container { max-width: 640px; margin: 0 auto; }
    h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.25rem; }
    .subtitle { color: #71717a; font-size: 0.875rem; margin-bottom: 2rem; }
    .card {
      display: block;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 0.75rem;
      padding: 1.25rem;
      margin-bottom: 0.75rem;
      text-decoration: none;
      color: inherit;
      transition: border-color 0.15s;
    }
    .card:hover { border-color: #6d28d9; }
    .branch { font-weight: 600; font-size: 1rem; margin-bottom: 0.5rem; font-family: "SFMono-Regular", "Consolas", monospace; }
    .meta { display: flex; gap: 1rem; font-size: 0.8rem; color: #a1a1aa; }
    .port { color: #a78bfa; }
    .empty { color: #71717a; text-align: center; padding: 3rem 1rem; }
    code { background: #27272a; padding: 0.2em 0.5em; border-radius: 0.25rem; font-size: 0.85em; }
    .count { color: #71717a; font-size: 0.875rem; font-weight: 400; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Branch Previews <span class="count">(${entries.length})</span></h1>
    <div class="subtitle">Scheduler Dashboard</div>
    ${cards}
  </div>
</body>
</html>`;
}

const server = createServer((req, res) => {
  const state = readState();
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(renderPage(state));
});

server.listen(PORT, () => {
  console.log(`Preview dashboard: http://localhost:${PORT}`);
});
```

- [ ] **Step 2: Smoke-test the dashboard**

Run: `node scripts/preview-dashboard.mjs &`

Open `http://localhost:3000` in a browser — should show "No active previews" empty state with dark theme. Kill the process after verifying.

Run: `kill %1`

- [ ] **Step 3: Commit**

```bash
git add scripts/preview-dashboard.mjs
git commit -m "feat(preview): add dashboard server for branch previews"
```

---

### Task 2: Create the preview CLI script — core helpers and `list` command

Build the script incrementally. Start with the state file helpers, stale PID cleanup, and `list` command since they're used by everything else.

**Files:**
- Create: `scripts/preview.sh`

- [ ] **Step 1: Create `scripts/preview.sh` with header, helpers, and `list`**

```bash
#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE_FILE="$PROJECT_ROOT/.previews.json"
PREVIEWS_DIR="/tmp/previews"
DASHBOARD_PORT=3000
FIRST_PREVIEW_PORT=3001

# ── Helpers ──────────────────────────────────────────

ensure_state_file() {
  if [[ ! -f "$STATE_FILE" ]]; then
    echo '{"previews":{}}' > "$STATE_FILE"
  fi
}

# Read a jq expression from the state file
read_state() {
  ensure_state_file
  jq -r "$1" "$STATE_FILE"
}

# Write the full state (stdin)
write_state() {
  local tmp="$STATE_FILE.tmp"
  cat > "$tmp"
  mv "$tmp" "$STATE_FILE"
}

# Remove entries whose PIDs are dead
prune_stale() {
  ensure_state_file
  local new_state
  new_state=$(cat "$STATE_FILE")

  # Check each preview PID
  while IFS= read -r branch; do
    local pid
    pid=$(echo "$new_state" | jq -r ".previews[\"$branch\"].pid")
    if [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then
      new_state=$(echo "$new_state" | jq "del(.previews[\"$branch\"])")
      echo "Pruned stale preview: $branch (PID $pid no longer running)"
    fi
  done < <(echo "$new_state" | jq -r '.previews | keys[]' 2>/dev/null)

  # Also check dashboard PID
  local dash_pid
  dash_pid=$(echo "$new_state" | jq -r '.dashboard.pid // empty')
  if [[ -n "$dash_pid" ]] && ! kill -0 "$dash_pid" 2>/dev/null; then
    new_state=$(echo "$new_state" | jq 'del(.dashboard)')
    echo "Pruned stale dashboard (PID $dash_pid no longer running)"
  fi

  echo "$new_state" | write_state
}

sanitize_branch() {
  echo "$1" | tr '/' '-'
}

# Find next free port starting from FIRST_PREVIEW_PORT
next_port() {
  local port=$FIRST_PREVIEW_PORT
  local used_ports
  used_ports=$(read_state '[.previews[].port] | .[]' 2>/dev/null || true)

  while true; do
    local in_use=false
    for p in $used_ports; do
      if [[ "$p" == "$port" ]]; then
        in_use=true
        break
      fi
    done
    if ! $in_use && ! lsof -i :"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "$port"
      return
    fi
    ((port++))
  done
}

is_port_bound() {
  lsof -i :"$1" -sTCP:LISTEN >/dev/null 2>&1
}

# ── Commands ─────────────────────────────────────────

cmd_list() {
  prune_stale
  local count
  count=$(read_state '.previews | length')

  if [[ "$count" == "0" ]]; then
    echo "No active previews."
    return
  fi

  printf "%-30s %-8s %s\n" "BRANCH" "PORT" "STARTED"
  printf "%-30s %-8s %s\n" "------" "----" "-------"

  read_state '.previews | to_entries[] | "\(.key)\t\(.value.port)\t\(.value.startedAt)"' |
    while IFS=$'\t' read -r branch port started; do
      printf "%-30s %-8s %s\n" "$branch" ":$port" "$started"
    done

  # Dashboard status
  local dash_pid
  dash_pid=$(read_state '.dashboard.pid // empty')
  if [[ -n "$dash_pid" ]]; then
    echo ""
    echo "Dashboard: http://localhost:$DASHBOARD_PORT"
  fi
}

# ── Main ─────────────────────────────────────────────

usage() {
  echo "Usage: preview <command> [args]"
  echo ""
  echo "Commands:"
  echo "  start <branch>    Start a preview for the given branch"
  echo "  stop <branch>     Stop a preview and remove its worktree"
  echo "  stop-all          Stop all previews and the dashboard"
  echo "  list              List active previews"
  echo "  dashboard         Start the dashboard (if not running)"
}

case "${1:-}" in
  list) cmd_list ;;
  start|stop|stop-all|dashboard)
    echo "Command '${1}' not yet implemented."
    exit 1
    ;;
  *)
    usage
    exit 1
    ;;
esac
```

- [ ] **Step 2: Make executable**

Run: `chmod +x scripts/preview.sh`

- [ ] **Step 3: Verify `list` works with no state**

Run: `bash scripts/preview.sh list`

Expected: `No active previews.`

- [ ] **Step 4: Commit**

```bash
git add scripts/preview.sh
git commit -m "feat(preview): add CLI script with helpers and list command"
```

---

### Task 3: Implement `start` command

**Files:**
- Modify: `scripts/preview.sh`

- [ ] **Step 1: Add `cmd_start` function and `cmd_dashboard` function**

Add these functions before the `# ── Main ──` section:

```bash
cmd_dashboard() {
  prune_stale
  local dash_pid
  dash_pid=$(read_state '.dashboard.pid // empty')

  if [[ -n "$dash_pid" ]]; then
    echo "Dashboard already running on http://localhost:$DASHBOARD_PORT (PID $dash_pid)"
    return
  fi

  if is_port_bound "$DASHBOARD_PORT"; then
    echo "⚠ Port $DASHBOARD_PORT is already in use (maybe pnpm dev?). Dashboard not started."
    echo "  Stop the other process or use 'preview start main' instead of 'pnpm dev'."
    return 1
  fi

  node "$PROJECT_ROOT/scripts/preview-dashboard.mjs" &
  dash_pid=$!
  disown "$dash_pid"

  ensure_state_file
  jq --argjson pid "$dash_pid" --argjson port "$DASHBOARD_PORT" \
    '.dashboard = {pid: $pid, port: $port}' "$STATE_FILE" | write_state

  echo "Dashboard: http://localhost:$DASHBOARD_PORT"
}

cmd_start() {
  local branch="${1:?Usage: preview start <branch>}"

  # Validate branch exists
  if ! git rev-parse --verify "$branch" >/dev/null 2>&1; then
    echo "Error: Branch '$branch' does not exist."
    echo "Available branches:"
    git branch --format='  %(refname:short)' | head -20
    exit 1
  fi

  prune_stale

  # Check if already running
  local existing_port
  existing_port=$(read_state ".previews[\"$branch\"].port // empty")
  if [[ -n "$existing_port" ]]; then
    echo "Preview for '$branch' is already running on port $existing_port"
    echo "  http://localhost:$existing_port"
    return
  fi

  local safe_name
  safe_name=$(sanitize_branch "$branch")
  local worktree="$PREVIEWS_DIR/$safe_name"

  # Create worktree
  mkdir -p "$PREVIEWS_DIR"
  if [[ -d "$worktree" ]]; then
    echo "Worktree already exists at $worktree, reusing..."
  else
    echo "Creating worktree for '$branch'..."
    git worktree add "$worktree" "$branch" --quiet
  fi

  # Hard-link node_modules
  if [[ ! -d "$worktree/node_modules" ]]; then
    echo "Linking node_modules (hard-link copy)..."
    cp -al "$PROJECT_ROOT/node_modules" "$worktree/node_modules"
  fi

  # Copy env files
  for envfile in .env.local .env; do
    if [[ -f "$PROJECT_ROOT/$envfile" ]]; then
      cp "$PROJECT_ROOT/$envfile" "$worktree/$envfile"
    fi
  done

  # Find available port
  local port
  port=$(next_port)

  # Start dev server
  echo "Starting dev server on port $port..."
  cd "$worktree"
  pnpm exec next dev --turbopack --port "$port" > "/tmp/previews/$safe_name.log" 2>&1 &
  local pid=$!
  disown "$pid"
  cd "$PROJECT_ROOT"

  # Record in state
  local started_at
  started_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  ensure_state_file
  jq --arg branch "$branch" \
     --argjson port "$port" \
     --argjson pid "$pid" \
     --arg worktree "$worktree" \
     --arg started "$started_at" \
    '.previews[$branch] = {port: $port, pid: $pid, worktree: $worktree, startedAt: $started}' \
    "$STATE_FILE" | write_state

  echo ""
  echo "Preview running: http://localhost:$port"
  echo "  Branch:   $branch"
  echo "  Worktree: $worktree"
  echo "  Log:      /tmp/previews/$safe_name.log"

  # Start dashboard if not running
  cmd_dashboard 2>/dev/null || true
}
```

- [ ] **Step 2: Wire `start` and `dashboard` into the case statement**

Replace the placeholder entries in the `case` block:

```bash
case "${1:-}" in
  list) cmd_list ;;
  start) cmd_start "${2:-}" ;;
  dashboard) cmd_dashboard ;;
  stop|stop-all)
    echo "Command '${1}' not yet implemented."
    exit 1
    ;;
  *)
    usage
    exit 1
    ;;
esac
```

- [ ] **Step 3: Test `start` with an existing branch**

Create a test branch, then start a preview:

```bash
git branch test/preview-test HEAD
bash scripts/preview.sh start test/preview-test
```

Expected output includes:
- "Creating worktree..."
- "Linking node_modules..."
- "Starting dev server on port 3001..."
- "Preview running: http://localhost:3001"
- "Dashboard: http://localhost:3000"

Verify: open `http://localhost:3000` — dashboard should show the `test/preview-test` card. Open `http://localhost:3001` — should load the app.

Clean up:

```bash
bash scripts/preview.sh list
# Should show test/preview-test on port 3001
```

- [ ] **Step 4: Commit**

```bash
git add scripts/preview.sh
git commit -m "feat(preview): implement start and dashboard commands"
```

---

### Task 4: Implement `stop` and `stop-all` commands

**Files:**
- Modify: `scripts/preview.sh`

- [ ] **Step 1: Add `cmd_stop` and `cmd_stop_all` functions**

Add before the `# ── Main ──` section:

```bash
cmd_stop() {
  local branch="${1:?Usage: preview stop <branch>}"

  prune_stale

  local pid port worktree
  pid=$(read_state ".previews[\"$branch\"].pid // empty")

  if [[ -z "$pid" ]]; then
    echo "No active preview for '$branch'."
    return 1
  fi

  port=$(read_state ".previews[\"$branch\"].port")
  worktree=$(read_state ".previews[\"$branch\"].worktree")

  # Kill the dev server and all child processes (next dev spawns Node + Turbopack children)
  if kill -0 "$pid" 2>/dev/null; then
    echo "Stopping dev server (PID $pid) and children..."
    pkill -P "$pid" 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
    # Wait briefly for clean shutdown, then force-kill stragglers
    sleep 1
    pkill -9 -P "$pid" 2>/dev/null || true
    kill -9 "$pid" 2>/dev/null || true
  fi

  # Remove worktree and log file
  if [[ -d "$worktree" ]]; then
    echo "Removing worktree at $worktree..."
    git worktree remove --force "$worktree" 2>/dev/null || true
  fi
  local safe_name
  safe_name=$(sanitize_branch "$branch")
  rm -f "/tmp/previews/$safe_name.log"

  # Update state
  jq --arg branch "$branch" 'del(.previews[$branch])' "$STATE_FILE" | write_state

  echo "Stopped preview for '$branch' (was on port $port)"

  # If no previews left, stop dashboard
  local remaining
  remaining=$(read_state '.previews | length')
  if [[ "$remaining" == "0" ]]; then
    stop_dashboard
  fi
}

stop_dashboard() {
  local dash_pid
  dash_pid=$(read_state '.dashboard.pid // empty')
  if [[ -n "$dash_pid" ]] && kill -0 "$dash_pid" 2>/dev/null; then
    echo "Stopping dashboard (PID $dash_pid)..."
    kill "$dash_pid" 2>/dev/null || true
  fi
  jq 'del(.dashboard)' "$STATE_FILE" | write_state
}

cmd_stop_all() {
  prune_stale

  local branches
  branches=$(read_state '.previews | keys[]' 2>/dev/null || true)

  if [[ -z "$branches" ]]; then
    echo "No active previews to stop."
    stop_dashboard 2>/dev/null || true
    return
  fi

  while IFS= read -r branch; do
    cmd_stop "$branch"
  done <<< "$branches"

  # Ensure dashboard is stopped (cmd_stop does this when last preview removed,
  # but be explicit)
  stop_dashboard 2>/dev/null || true

  echo ""
  echo "All previews stopped."
}
```

- [ ] **Step 2: Wire `stop` and `stop-all` into the case statement**

Replace the remaining placeholders:

```bash
case "${1:-}" in
  list) cmd_list ;;
  start) cmd_start "${2:-}" ;;
  stop) cmd_stop "${2:-}" ;;
  stop-all) cmd_stop_all ;;
  dashboard) cmd_dashboard ;;
  *)
    usage
    exit 1
    ;;
esac
```

- [ ] **Step 3: Test stop and stop-all**

If the test preview from Task 3 is still running:

```bash
bash scripts/preview.sh stop test/preview-test
```

Expected:
- "Stopping dev server..."
- "Removing worktree..."
- "Stopped preview for 'test/preview-test'"
- Dashboard also stops (last preview removed)

Verify port 3001 and 3000 are no longer bound:

```bash
lsof -i :3001 -sTCP:LISTEN  # should return nothing
lsof -i :3000 -sTCP:LISTEN  # should return nothing
```

Clean up the test branch:

```bash
git branch -D test/preview-test
```

- [ ] **Step 4: Commit**

```bash
git add scripts/preview.sh
git commit -m "feat(preview): implement stop and stop-all commands"
```

---

### Task 5: Add package.json script and gitignore entry

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Add `preview` script to `package.json`**

Add after the `"check"` script:

```json
"preview": "bash scripts/preview.sh"
```

- [ ] **Step 2: Add `.previews.json` to `.gitignore`**

Add after the `# pnpm` comment section, before `# superpowers`:

```
# preview
.previews.json
```

- [ ] **Step 3: Verify `pnpm preview list` works**

Run: `pnpm preview list`

Expected: `No active previews.`

- [ ] **Step 4: Lint the bash script**

Run: `shellcheck scripts/preview.sh && shfmt -d scripts/preview.sh`

Fix any issues before proceeding.

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore scripts/preview.sh
git commit -m "chore(preview): add pnpm script and gitignore entry"
```

---

### Task 6: End-to-end test

Full integration test using a real branch.

- [ ] **Step 1: Create a test branch and start preview**

```bash
git branch test/e2e-preview HEAD
pnpm preview start test/e2e-preview
```

Verify:
- Dashboard loads at `http://localhost:3000` with one card
- App loads at `http://localhost:3001`

- [ ] **Step 2: Start a second preview**

```bash
git branch test/e2e-preview-2 HEAD
pnpm preview start test/e2e-preview-2
```

Verify:
- `pnpm preview list` shows two entries (ports 3001, 3002)
- Dashboard shows two cards
- Both apps load independently

- [ ] **Step 3: Stop one, then stop-all**

```bash
pnpm preview stop test/e2e-preview
pnpm preview list
# Should show only test/e2e-preview-2
pnpm preview stop-all
pnpm preview list
# Should show "No active previews."
```

- [ ] **Step 4: Clean up test branches**

```bash
git branch -D test/e2e-preview test/e2e-preview-2
```

---

### Task 7: Update docs and version

- [ ] **Step 1: Update ARCHITECTURE.md** — add preview system to project structure or a new "Scripts" section:
  - `scripts/preview.sh` — CLI for managing multi-branch preview servers
  - `scripts/preview-dashboard.mjs` — lightweight dashboard on port 3000
  - `.previews.json` — state file (gitignored)

- [ ] **Step 2: Update DECISIONS.md** — add Decision #59:
  - Context: Wanted to preview multiple feature branches simultaneously before deciding which to merge
  - Decision: Worktree-based dev servers with a local dashboard, CLI-managed
  - Rationale: Zero infrastructure, reuses existing worktree + hard-link patterns, each branch gets a full independent dev server (no basePath hacks). CI preview deploys backlogged for later.

- [ ] **Step 3: Update BACKLOG.md** — no items to complete (CI preview deploys already added as new item)

- [ ] **Step 4: Update CLAUDE.md** — no Current Features change needed (this is a dev tool, not a user-facing feature). The workflow changes (preview gate in "Finishing a branch" and "Feature complete" sections) were already applied during the brainstorming session and are in the working tree. Verify the changes are present; do not re-apply.

- [ ] **Step 5: Changelog** — not needed (dev tooling, not user-facing)

- [ ] **Step 6: Commit docs**

```bash
git add docs/ARCHITECTURE.md docs/DECISIONS.md
git commit -m "docs: add preview system to architecture and decisions"
```
