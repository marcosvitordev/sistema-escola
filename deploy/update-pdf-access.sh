#!/bin/bash
set -euo pipefail
: "${SOURCE_COMMIT:?Informe o commit do pacote em SOURCE_COMMIT}"
previous="$(readlink -f /opt/aprender/current)"
/usr/local/sbin/aprender-backup
release="/opt/aprender/releases/$(date -u +%Y%m%dT%H%M%SZ)-pdf-access"
mkdir -p "$release"
tar --no-same-owner -xzf /root/aprender-install/pdf-access-source.tar.gz -C "$release"
printf '%s\n' "$SOURCE_COMMIT" > "$release/.release-commit"
chown -R aprender:aprender "$release"
cd "$release"
set -a; source /etc/aprender.env; set +a
runuser -u aprender -- npm ci --include=dev --no-audit --no-fund > /var/log/aprender-pdf-access-install.log 2>&1
runuser -u aprender -- env NODE_OPTIONS='--max-old-space-size=768 --max-semi-space-size=4' NEXT_LOW_DISK=1 npm run build > /var/log/aprender-pdf-access-build.log 2>&1
runuser -u aprender -- npm run db:migrate > /var/log/aprender-pdf-access-migrate.log 2>&1
ln -sfn "$release" /opt/aprender/current
systemctl restart aprender
healthy=0
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 5 http://127.0.0.1:3000/ -o /dev/null; then healthy=1; break; fi
  sleep 1
done
if [ "$healthy" != 1 ]; then
  ln -sfn "$previous" /opt/aprender/current
  systemctl restart aprender
  echo PDF_ACCESS_DEPLOY_ROLLED_BACK
  exit 1
fi
systemctl is-active aprender aprender-livekit nginx
curl -fsS --max-time 15 https://191.252.155.205/ -o /dev/null
echo PDF_ACCESS_PUBLISHED
