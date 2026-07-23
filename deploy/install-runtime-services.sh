#!/bin/sh
set -eu

release_root="${AMF_RUNTIME_RELEASE_ROOT:-/opt/ai-media-factory-runtime/current}"
runtime_user="${AMF_RUNTIME_USER:-amf-runtime}"
runtime_group="${AMF_RUNTIME_GROUP:-amf-runtime}"

if [ "$(id -u)" -ne 0 ]; then
  echo "runtime_service_installer_requires_root" >&2
  exit 1
fi
if [ "$release_root" != "/opt/ai-media-factory-runtime/current" ]; then
  echo "runtime_service_installer_refuses_unapproved_root:$release_root" >&2
  exit 1
fi
if [ ! -f "$release_root/package.json" ] || [ ! -d "$release_root/.next" ]; then
  echo "runtime_release_not_built:$release_root" >&2
  exit 1
fi

if ! getent group "$runtime_group" >/dev/null 2>&1; then
  groupadd --system "$runtime_group"
fi
if ! id "$runtime_user" >/dev/null 2>&1; then
  useradd --system --gid "$runtime_group" --home-dir /var/tmp/amf-runtime \
    --no-create-home --shell /usr/sbin/nologin "$runtime_user"
fi

install -d -o root -g "$runtime_group" -m 0750 /etc/ai-media-factory
install -d -o "$runtime_user" -g "$runtime_group" -m 0750 \
  /var/lib/ai-media-factory /var/lib/ai-media-factory/db /var/lib/ai-media-factory/uploads \
  /var/lib/ai-media-factory/work /var/lib/ai-media-factory/renders /var/tmp/amf-runtime
install -d -o root -g "$runtime_group" -m 0750 /var/lib/ai-media-factory-models

if [ ! -f /etc/ai-media-factory/runtime.env ]; then
  install -o root -g "$runtime_group" -m 0640 \
    "$release_root/deploy/runtime.env.example" /etc/ai-media-factory/runtime.env
fi

install -o root -g root -m 0644 \
  "$release_root/deploy/systemd/ai-media-factory-web.service" \
  /etc/systemd/system/ai-media-factory-web.service
install -o root -g root -m 0644 \
  "$release_root/deploy/systemd/ai-media-factory-worker.service" \
  /etc/systemd/system/ai-media-factory-worker.service

if systemctl cat ai-media-factory-google-agent.service >/dev/null 2>&1; then
  install -d -o root -g root -m 0755 \
    /etc/systemd/system/ai-media-factory-google-agent.service.d
  install -o root -g root -m 0644 \
    "$release_root/deploy/systemd/ai-media-factory-google-agent-runtime-boundary.conf" \
    /etc/systemd/system/ai-media-factory-google-agent.service.d/runtime-boundary.conf
fi

systemctl daemon-reload
systemctl enable ai-media-factory-web.service ai-media-factory-worker.service
