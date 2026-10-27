#!/bin/bash
set -euo pipefail
umask 077
install -d -m 700 /var/backups/aprender
target="/var/backups/aprender/escola-$(date -u +%Y%m%dT%H%M%SZ).dump"
runuser -u postgres -- /usr/lib/postgresql/17/bin/pg_dump -p 5432 --format=custom --no-owner --no-acl escola > "$target.partial"
test -s "$target.partial"
mv "$target.partial" "$target"
find /var/backups/aprender -maxdepth 1 -type f -name 'escola-*.dump' -mtime +14 -delete
echo "Backup concluído: $(basename "$target")"
