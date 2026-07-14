#!/bin/sh
set -eu

ROOT="${AMF_AGENT_ROOT:-/opt/ai-media-factory-dev}"
AGENT_USER="${AMF_AGENT_USER:-amf-agent}"
AGENT_GROUP="${AMF_AGENT_GROUP:-amf-agent}"
if [ "$(id -u)" -ne 0 ]; then
  echo "installer_requires_human_root_approval" >&2
  exit 1
fi
if [ "$ROOT" != "/opt/ai-media-factory-dev" ]; then
  echo "installer_refuses_unapproved_root:$ROOT" >&2
  exit 1
fi

if ! getent group "$AGENT_GROUP" >/dev/null 2>&1; then
  groupadd --system "$AGENT_GROUP"
fi
if ! id "$AGENT_USER" >/dev/null 2>&1; then
  useradd --system --gid "$AGENT_GROUP" --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin "$AGENT_USER"
fi

install -d -o root -g "$AGENT_GROUP" -m 0750 /etc/ai-media-factory-agent
if [ ! -e /etc/ai-media-factory-agent/agent.env ]; then
  install -o root -g "$AGENT_GROUP" -m 0640 "$ROOT/agent/runtime/agent.env.example" /etc/ai-media-factory-agent/agent.env
fi
install -o root -g root -m 0644 "$ROOT/agent/runtime/ai-media-factory-agent.service" /etc/systemd/system/ai-media-factory-agent.service
install -o root -g root -m 0644 "$ROOT/agent/runtime/ai-media-factory-agent-summary.service" /etc/systemd/system/ai-media-factory-agent-summary.service
install -o root -g root -m 0644 "$ROOT/agent/runtime/ai-media-factory-agent-summary.timer" /etc/systemd/system/ai-media-factory-agent-summary.timer
install -o root -g root -m 0644 "$ROOT/agent/runtime/ai-media-factory-agent.logrotate" /etc/logrotate.d/ai-media-factory-agent

install -d -o "$AGENT_USER" -g "$AGENT_GROUP" -m 0750 \
  "$ROOT/worktrees" "$ROOT/artifacts" "$ROOT/logs" "$ROOT/agent/state" "$ROOT/agent/reports" \
  "$ROOT/agent/tasks/queue" "$ROOT/agent/tasks/processing" "$ROOT/agent/tasks/completed" \
  "$ROOT/agent/tasks/failed" "$ROOT/agent/tasks/blocked"
# Git refuses mixed-owner repositories even when the metadata is intentionally
# delegated. Give the service identity ownership of the repository directory
# itself, but keep it non-writable; reviewed source files remain root-owned.
chown "$AGENT_USER:$AGENT_GROUP" "$ROOT"
chmod 0555 "$ROOT"
chown -R "$AGENT_USER:$AGENT_GROUP" "$ROOT/.git"

find "$ROOT/agent/orchestrator" "$ROOT/agent/workers" "$ROOT/agent/evaluators" "$ROOT/agent/policies" "$ROOT/agent/prompts" "$ROOT/agent/notifications" "$ROOT/agent/runtime" "$ROOT/lib/subtitle-quality/v3" "$ROOT/scripts" -type f \( -name '*.ts' -o -name '*.json' -o -name '*.md' -o -name '*.sh' \) -print0 \
  | sort -z \
  | xargs -0 sha256sum > /etc/ai-media-factory-agent/policy.sha256
find "$ROOT/agent/tasks" -maxdepth 1 -type f -name '*.ts' -print0 | sort -z | xargs -0 sha256sum >> /etc/ai-media-factory-agent/policy.sha256
sha256sum "$ROOT/docs/AI_MEDIA_FACTORY_CONSTITUTION.md" "$ROOT/package.json" "$ROOT/package-lock.json" >> /etc/ai-media-factory-agent/policy.sha256
chown root:root /etc/ai-media-factory-agent/policy.sha256
chmod 0644 /etc/ai-media-factory-agent/policy.sha256

systemctl daemon-reload
systemctl enable --now ai-media-factory-agent.service
systemctl enable --now ai-media-factory-agent-summary.timer
