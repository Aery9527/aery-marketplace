#!/usr/bin/env sh
set -eu

command -v pwsh >/dev/null 2>&1 || {
  echo "pwsh is required to run scripts/sync-codex-plugins.sh" >&2
  exit 1
}

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
exec pwsh -NoLogo -NoProfile -File "$SCRIPT_DIR/sync-codex-plugins.ps1" "$@"
