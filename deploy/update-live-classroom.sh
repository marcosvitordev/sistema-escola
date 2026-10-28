#!/bin/bash
set -euo pipefail
/usr/local/sbin/aprender-backup
release="/opt/aprender/releases/$(date -u +%Y%m%dT%H%M%SZ)"
cp -a --reflink=auto "$(readlink -f /opt/aprender/current)" "$release"
tar --no-same-owner -xzf /root/aprender-install/live-classroom.tar.gz -C "$release"
chown -R aprender:aprender "$release"
cd "$release"
set -a; source /etc/aprender.env; set +a
runuser -u aprender -- npm ci --include=dev --no-audit --no-fund > /var/log/aprender-install.log 2>&1
runuser -u aprender -- npm run db:migrate > /var/log/aprender-migrate.log 2>&1
runuser -u aprender -- env NODE_OPTIONS='--max-old-space-size=768 --max-semi-space-size=4' NEXT_LOW_DISK=1 npm run build > /var/log/aprender-build.log 2>&1
ln -sfn "$release" /opt/aprender/current
systemctl restart aprender
systemctl is-active aprender
echo AULA_AO_VIVO_PUBLICADA
