#!/bin/sh
set -eu
ROOT=/opt/ai-media-factory-dev
OUT=/etc/ai-media-factory-agent/policy.sha256

find "$ROOT/agent/orchestrator" "$ROOT/agent/workers" "$ROOT/agent/evaluators" \
     "$ROOT/agent/policies" "$ROOT/agent/prompts" "$ROOT/agent/notifications" \
     "$ROOT/agent/runtime" "$ROOT/lib/subtitle-quality/v3" "$ROOT/scripts" \
     -type f \( -name '*.ts' -o -name '*.json' -o -name '*.md' -o -name '*.sh' \) -print0 \
  | sort -z \
  | xargs -0 sha256sum > "$OUT"

find "$ROOT/agent/tasks" -maxdepth 1 -type f -name '*.ts' -print0 \
  | sort -z | xargs -0 sha256sum >> "$OUT"

sha256sum \
  "$ROOT/docs/AI_MEDIA_FACTORY_CONSTITUTION.md" \
  "$ROOT/package.json" \
  "$ROOT/package-lock.json" >> "$OUT"

chown root:root "$OUT"
chmod 0644 "$OUT"
echo "policy.sha256 updated: $(wc -l < "$OUT") entries"
