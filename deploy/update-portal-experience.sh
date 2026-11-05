#!/bin/bash
set -euo pipefail
/usr/local/sbin/aprender-backup
release="/opt/aprender/releases/$(date -u +%Y%m%dT%H%M%SZ)"
cp -a --reflink=auto "$(readlink -f /opt/aprender/current)" "$release"
tar --no-same-owner -xzf /root/aprender-install/portal-experience.tar.gz -C "$release"
chown -R aprender:aprender "$release"
cd "$release"
set -a; source /etc/aprender.env; set +a
runuser -u aprender -- env NODE_OPTIONS='--max-old-space-size=768 --max-semi-space-size=4' NEXT_LOW_DISK=1 npm run build > /var/log/aprender-experience-build.log 2>&1
ln -sfn "$release" /opt/aprender/current
systemctl restart aprender
systemctl is-active aprender
echo PORTAL_EXPERIENCE_PUBLISHED
