#!/usr/bin/env sh
# Prints docker context and resolved HOST_BRIDGE.

set -eu

CTX="$(docker context show 2>/dev/null || echo default)"
HOST_BRIDGE="${HOST_BRIDGE:-}"
if [ -z "$HOST_BRIDGE" ]; then
  HOST_BRIDGE="$({ dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"; } && sh "$dir/host_bridge.sh")"
fi

printf "docker context: %s\n" "$CTX"
printf "HOST_BRIDGE:   %s\n" "$HOST_BRIDGE"

exit 0

