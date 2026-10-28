#!/bin/bash
set -euo pipefail
version=1.13.11
install -d -m700 /root/aprender-install/livekit
cd /root/aprender-install/livekit
archive="livekit_${version}_linux_amd64.tar.gz"
curl -fsSLo "$archive" "https://github.com/livekit/livekit/releases/download/v${version}/${archive}"
curl -fsSLo checksums.txt "https://github.com/livekit/livekit/releases/download/v${version}/checksums.txt"
grep " ${archive}$" checksums.txt | sha256sum -c -
tar -xzf "$archive" livekit-server
install -m755 livekit-server /usr/local/bin/aprender-livekit
id aprender-livekit >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin aprender-livekit
python3 - <<'PY'
import os, secrets, json, pathlib
envpath=pathlib.Path('/etc/aprender.env')
text=envpath.read_text()
values=dict(line.split('=',1) for line in text.splitlines() if '=' in line and not line.startswith('#'))
key=values.get('LIVEKIT_API_KEY', 'aprender-'+secrets.token_hex(8))
secret=values.get('LIVEKIT_API_SECRET', secrets.token_hex(32))
new={'LIVEKIT_API_KEY':key, 'LIVEKIT_API_SECRET':secret, 'LIVEKIT_API_URL':'http://127.0.0.1:7880', 'LIVEKIT_URL':'wss://191.252.155.205/livekit'}
lines=[line for line in text.splitlines() if not any(line.startswith(k+'=') for k in new)]
envpath.write_text('\n'.join(lines)+'\n'+'\n'.join(k+'='+v for k,v in new.items())+'\n')
config={
 'port':7880, 'bind_addresses':['0.0.0.0'],
 'rtc':{'node_ip':'191.252.155.205','use_external_ip':False,'tcp_port':7881,'udp_port':7882},
 'keys':{key:secret},
 'turn':{'enabled':True,'domain':'191.252.155.205','udp_port':443,'tls_port':0,'relay_range_start':30000,'relay_range_end':30100},
 'room':{'auto_create':False,'empty_timeout':60,'departure_timeout':20,'max_participants':64},
 'webhook':{'api_key':key,'urls':['http://127.0.0.1:3000/api/live/webhook']},
 'logging':{'level':'warn'}
}
pathlib.Path('/etc/aprender-livekit.yaml').write_text(json.dumps(config))
path=pathlib.Path('/etc/nginx/conf.d/aprender-https.conf')
nginx=path.read_text()
if 'location ^~ /livekit/' not in nginx:
 path.with_suffix('.conf.before-livekit').write_text(nginx)
 location='''    location ^~ /livekit/ {
        proxy_pass http://127.0.0.1:7880/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
        access_log off;
        error_log /var/log/nginx/aprender-livekit-error.log crit;
    }
'''
 if '    location / {' not in nginx: raise Exception('Nginx layout changed')
 path.write_text(nginx.replace('    location / {',location+'    location / {',1))
PY
chown root:aprender /etc/aprender.env
chmod 640 /etc/aprender.env
chown root:aprender-livekit /etc/aprender-livekit.yaml
chmod 640 /etc/aprender-livekit.yaml
cat > /etc/systemd/system/aprender-livekit.service <<'UNIT'
[Unit]
Description=Aprender - transmissao ao vivo
After=network-online.target
Wants=network-online.target
[Service]
User=aprender-livekit
Group=aprender-livekit
ExecStart=/usr/local/bin/aprender-livekit --config /etc/aprender-livekit.yaml
Restart=always
RestartSec=3
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
LimitNOFILE=65536
MemoryMax=512M
[Install]
WantedBy=multi-user.target
UNIT
nginx -t
ufw allow 7881/tcp comment 'Aprender live ICE TCP'
ufw allow 7882/udp comment 'Aprender live ICE UDP'
ufw allow 443/udp comment 'Aprender live TURN UDP'
systemctl daemon-reload
cat > /etc/sysctl.d/90-aprender-live.conf <<'SYSCTL'
net.core.rmem_max=7500000
net.core.wmem_max=7500000
SYSCTL
sysctl -p /etc/sysctl.d/90-aprender-live.conf
systemctl enable --now aprender-livekit
systemctl reload nginx
systemctl is-active aprender-livekit
