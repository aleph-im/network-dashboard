#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
SANDBOX_USER=$(id -un)
SANDBOX_HOME="/home/$SANDBOX_USER"
SANDBOX_PATH=${SANDBOX_PATH:-$PATH}
NPM_CACHE=${SANDBOX_NPM_CACHE:-$HOME/.npm-sandbox}
PNPM_DATA=${SANDBOX_PNPM_DATA:-$HOME/.local/share/pnpm}
PNPM_CACHE=${SANDBOX_PNPM_CACHE:-$HOME/.cache/pnpm}
PNPM_STATE=${SANDBOX_PNPM_STATE:-$HOME/.local/state/pnpm}
mkdir -p "$NPM_CACHE" "$PNPM_DATA" "$PNPM_CACHE" "$PNPM_STATE"

NET=0
RO=0
TTY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --net) NET=1; shift ;;
    --ro) RO=1; shift ;;
    --tty) TTY=1; shift ;;
    --) shift; break ;;
    *) break ;;
  esac
done
if [ $# -eq 0 ]; then
  echo "usage: $0 [--net] [--ro] [--tty] -- command ..." >&2
  exit 2
fi

mounts=(
  --ro-bind /nix /nix
  --ro-bind /etc /etc
  --ro-bind-try /run/current-system /run/current-system
  --ro-bind-try /usr /usr
  --ro-bind-try /bin /bin
  --ro-bind-try /lib /lib
  --ro-bind-try /lib64 /lib64
  --dev /dev
  --proc /proc
  --tmpfs /tmp
  --tmpfs /home
  --bind "$NPM_CACHE" "$SANDBOX_HOME/.npm"
  --bind "$PNPM_DATA" "$SANDBOX_HOME/.local/share/pnpm"
  --bind "$PNPM_CACHE" "$SANDBOX_HOME/.cache/pnpm"
  --bind "$PNPM_STATE" "$SANDBOX_HOME/.local/state/pnpm"
  --ro-bind-try "$HOME/.npm-global" "$SANDBOX_HOME/.npm-global"
  --clearenv
  --setenv HOME "$SANDBOX_HOME"
  --setenv PATH "$SANDBOX_PATH"
  --setenv TERM "${TERM:-dumb}"
  --setenv LANG "${LANG:-C.UTF-8}"
  --setenv TMPDIR /tmp
  --setenv XDG_DATA_HOME "$SANDBOX_HOME/.local/share"
  --setenv XDG_CACHE_HOME "$SANDBOX_HOME/.cache"
  --setenv XDG_STATE_HOME "$SANDBOX_HOME/.local/state"
  --setenv XDG_CONFIG_HOME "$SANDBOX_HOME/.config"
  --setenv npm_config_cache "$SANDBOX_HOME/.npm"
  --setenv CI 1
  --setenv NEXT_TELEMETRY_DISABLED 1
)

if [ "$RO" = 1 ]; then
  mounts+=(--ro-bind "$PROJECT_DIR" /workspace)
else
  mounts+=(--bind "$PROJECT_DIR" /workspace)
fi

mounts+=(--chdir /workspace --unshare-all --cap-drop ALL --die-with-parent)
if [ "$NET" = 1 ]; then
  mounts+=(--share-net)
fi
if [ "$TTY" = 0 ]; then
  mounts+=(--new-session)
fi

exec bwrap "${mounts[@]}" -- "$@"
