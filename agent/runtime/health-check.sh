#!/bin/sh
set -eu

ROOT="${AMF_AGENT_ROOT:-/opt/ai-media-factory-dev}"
if [ "$ROOT" != "/opt/ai-media-factory-dev" ]; then
  echo "agent_root_not_approved:$ROOT" >&2
  exit 1
fi
cd "$ROOT"
exec /usr/bin/env npm run agent:health
