#!/bin/sh
set -eu

compose=/opt/ai-media-factory/current/deploy/docker-compose.yml
curl --fail --silent http://127.0.0.1:3000/api/health >/dev/null
docker compose -f "$compose" exec -T worker npm exec tsx scripts/worker-healthcheck.ts
docker image inspect ai-media-factory/pyannote-community-1:4.0.3 >/dev/null
docker image inspect ai-media-factory/argos-translate:1.9.6 >/dev/null
docker compose -f "$compose" exec -T worker ffmpeg -version >/dev/null
docker compose -f "$compose" exec -T worker ffprobe -version >/dev/null
docker compose -f "$compose" exec -T worker whisper-cli --help >/dev/null
available_kb=$(df --output=avail /var/lib/ai-media-factory | tail -1)
test "$available_kb" -gt 20971520
echo healthy
