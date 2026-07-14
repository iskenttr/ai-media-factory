#!/bin/sh
set -eu

# Idempotent base provisioning for the dedicated Debian 12 Compute Engine VM.
# Source delivery and service activation are deliberate operator steps performed
# after this script succeeds; no GitHub credential is embedded here.

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl ffmpeg git jq logrotate ripgrep xz-utils

if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'Number(process.versions.node.split(`.`)[0])')" -lt 26 ]; then
  curl -fsSL https://deb.nodesource.com/setup_26.x | sh -
  apt-get install -y --no-install-recommends nodejs
fi

npm install --global @google/gemini-cli
ln -sfn /usr/bin/ffmpeg /usr/local/bin/ffmpeg
ln -sfn /usr/bin/ffprobe /usr/local/bin/ffprobe
command -v gemini >/dev/null
command -v ffmpeg >/dev/null
command -v ffprobe >/dev/null

install -d -o root -g root -m 0755 /opt/ai-media-factory-dev
install -d -o root -g root -m 0750 /var/backups/ai-media-factory-agent-v2

node --version
gemini --version
ffmpeg -version | head -n 1
