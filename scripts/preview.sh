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
