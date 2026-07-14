#!/bin/sh
set -eu

ROOT="${AMF_AGENT_ROOT:-/opt/ai-media-factory-dev}"
if [ "$ROOT" != "/opt/ai-media-factory-dev" ]; then
  echo "agent_root_not_approved:$ROOT" >&2
  exit 1
fi
if [ "$(id -u)" -eq 0 ]; then
  echo "agent_refuses_root" >&2
  exit 1
fi
if [ "${AMF_ENVIRONMENT:-development}" = "production" ]; then
  echo "agent_refuses_production_environment" >&2
  exit 1
fi

cd "$ROOT"
branch="$(git branch --show-current)"
case "$branch" in
  ""|main|master)
    echo "agent_refuses_branch:${branch:-detached}" >&2
    exit 1
    ;;
esac

umask 077
mkdir -p agent/state agent/reports agent/tasks/queue agent/tasks/processing agent/tasks/completed agent/tasks/failed agent/tasks/blocked artifacts logs worktrees
exec /usr/bin/env npm run agent:orchestrator
