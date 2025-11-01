#!/usr/bin/env sh
# Prints the host bridge for containers to reach host services.
# - Colima: host.lima.internal
# - Docker Desktop: host.docker.internal

set -eu

CTX="$(docker context show 2>/dev/null || echo default)"
if printf "%s" "$CTX" | grep -qi colima; then
  echo host.lima.internal
else
  echo host.docker.internal
fi

