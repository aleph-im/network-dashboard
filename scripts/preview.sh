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
		echo '{"previews":{}}' >"$STATE_FILE"
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
	cat >"$tmp"
	mv "$tmp" "$STATE_FILE"
}

# Remove entries whose PIDs are dead
prune_stale() {
	ensure_state_file
	local new_state
	new_state=$(cat "$STATE_FILE")

	# Check each preview PID
	while IFS= read -r _branch; do
		local _pid
		_pid=$(echo "$new_state" | jq -r ".previews[\"$_branch\"].pid")
		if [[ -n "$_pid" ]] && ! kill -0 "$_pid" 2>/dev/null; then
			new_state=$(echo "$new_state" | jq "del(.previews[\"$_branch\"])")
			echo "Pruned stale preview: $_branch (PID $_pid no longer running)"
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
	pnpm exec next dev --turbopack --port "$port" >"/tmp/previews/$safe_name.log" 2>&1 &
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

stop_dashboard() {
	local dash_pid
	dash_pid=$(read_state '.dashboard.pid // empty')
	if [[ -n "$dash_pid" ]] && kill -0 "$dash_pid" 2>/dev/null; then
		echo "Stopping dashboard (PID $dash_pid)..."
		kill "$dash_pid" 2>/dev/null || true
	fi
	jq 'del(.dashboard)' "$STATE_FILE" | write_state
}

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
	done <<<"$branches"

	# Ensure dashboard is stopped
	stop_dashboard 2>/dev/null || true

	echo ""
	echo "All previews stopped."
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
start) cmd_start "${2:-}" ;;
stop) cmd_stop "${2-}" ;;
stop-all) cmd_stop_all ;;
dashboard) cmd_dashboard ;;
*)
	usage
	exit 1
	;;
esac
