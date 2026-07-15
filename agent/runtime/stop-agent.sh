#!/bin/sh
set -eu

UNIT="${AMF_AGENT_SYSTEMD_UNIT:-ai-media-factory-agent.service}"
exec systemctl stop "$UNIT"
