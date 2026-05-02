#!/usr/bin/env bash
set -euo pipefail

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd"
    exit 1
  fi
}

require_env() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    echo "Missing required env var: $key"
    exit 1
  fi
}

timestamp_now() {
  date +%F-%H%M%S
}

slugify() {
  local text="$1"
  echo "$text" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/--+/-/g' | cut -c1-48
}

ensure_parent_dir() {
  local path="$1"
  mkdir -p "$(dirname "$path")"
}
