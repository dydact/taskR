#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/toolfront-registry/providers.json"
SOURCE="$ROOT/../toolfront-registry/providers.json"

if ! diff -u "$SOURCE" "$TARGET" >/dev/null; then
  echo "ToolFront manifest drift detected between master registry and taskR copy."
  diff -u "$SOURCE" "$TARGET"
  exit 1
fi
echo "ToolFront manifest matches upstream."
