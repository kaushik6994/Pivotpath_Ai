#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")/.."
if command -v python3 >/dev/null 2>&1; then
  exec python3 scripts/start.py "$@"
fi
exec python scripts/start.py "$@"
