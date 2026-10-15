#!/usr/bin/env bash
# Deploy the current server/ and admin/ code to the Rama777 VPS (rama777.tech).
#
#   bash deploy/deploy.sh            from the repo root (Git Bash on Windows works)
#
# What it does: packs server/ and admin/ (tracked + new files, no .env, data or
# node_modules), uploads them, builds on the VPS as the "rama777" user, swaps the
# new build in (the database in server/data and server/.env are kept), restarts
# the service and checks https://rama777.tech/api/health.
#
# Needs the SSH key that is registered on the VPS (Hostinger → VPS → SSH keys).
set -euo pipefail

HOST="${RAMA777_HOST:-root@200.234.44.48}"
KEY="${RAMA777_KEY:-$HOME/.ssh/rama777_vps}"
SSH=(ssh -i "$KEY" -o BatchMode=yes "$HOST")

cd "$(git rev-parse --show-toplevel)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "› packing server/ and admin/"
git ls-files -co --exclude-standard -- server admin \
  | grep -v -E '(^|/)\.env$|/data/|node_modules/|/dist/' > "$TMP/files.txt"
tar -czf "$TMP/src.tgz" -T "$TMP/files.txt"

echo "› uploading"
scp -i "$KEY" -o BatchMode=yes -q "$TMP/src.tgz" "$HOST:/tmp/rama777-src.tgz"

echo "› building on the server"
"${SSH[@]}" 'bash -s' <<'REMOTE'
set -euo pipefail
export PATH=/opt/node-v24/bin:$PATH
run() { runuser -u rama777 -- env HOME=/opt/rama777 PATH="$PATH" "$@"; }

cd /opt/rama777
rm -rf app.new && mkdir app.new
tar -xzf /tmp/rama777-src.tgz -C app.new && rm -f /tmp/rama777-src.tgz
chown -R rama777:rama777 app.new
(cd app.new/server && run npm ci --no-audit --no-fund --loglevel=error && run npm run build --silent)
(cd app.new/admin && run npm ci --no-audit --no-fund --loglevel=error && run npm run build --silent >/dev/null)

# keep the live database, uploads and settings (.env keeps its rama777 owner and 600 mode)
mv app/server/data app.new/server/data
cp -p app/server/.env app.new/server/.env
rm -rf app.old && mv app app.old && mv app.new app
systemctl restart rama777

# wait until the app answers; if it never does, put the previous build back
for _ in $(seq 1 20); do
  sleep 1
  if curl -fs -m 3 http://127.0.0.1:4100/api/health >/dev/null; then echo "service up"; exit 0; fi
done
echo "new build did not start — rolling back" >&2
journalctl -u rama777 -n 20 --no-pager >&2
mv app/server/data app.old/server/data
mv app app.failed && mv app.old app
systemctl restart rama777
exit 1
REMOTE

echo "› health check"
curl -fsS https://rama777.tech/api/health && echo
echo "✓ deployed — previous build kept on the server in /opt/rama777/app.old"
