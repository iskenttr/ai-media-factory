#!/bin/sh
set -eu

root=/var/lib/ai-media-factory
stamp=$(date -u +%Y%m%d-%H%M%S)
destination="$root/backups/$stamp"
mkdir -p "$destination"
chmod 700 "$root/backups" "$destination"

docker compose -f /opt/ai-media-factory/current/deploy/docker-compose.yml exec -T -u 0 web \
  sqlite3 /var/lib/ai-media-factory/db/ai-media-factory.sqlite ".backup '/var/lib/ai-media-factory/backups/$stamp/database.sqlite'"
tar -C "$root" --exclude=backups --exclude=work -czf "$destination/project-records.tar.gz" uploads renders
sha256sum "$destination/database.sqlite" "$destination/project-records.tar.gz" > "$destination/SHA256SUMS"
find "$root/backups" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +
echo "$destination"
