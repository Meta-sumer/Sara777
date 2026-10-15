#!/usr/bin/env bash
# Build and start Rama777 on the VPS. Run it on the server as root.
#
#   cd /opt/rama777/repo && git pull && bash deploy/server-deploy.sh
#       builds the code checked out in the server's git clone (push → pull → deploy)
#   bash server-deploy.sh /tmp/rama777-src.tgz
#       builds an uploaded source archive instead (what deploy/deploy.sh does)
#
# Builds in /opt/rama777/app.new as the "rama777" user, moves the live database
# (server/data) and server/.env across, swaps the new build in, restarts the
# service and puts the previous build back if the new one does not answer.
set -euo pipefail
export PATH=/opt/node-v24/bin:$PATH
run() { runuser -u rama777 -- env HOME=/opt/rama777 PATH="$PATH" "$@"; }

SRC="${1:-}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]:-.}")/.." && pwd)"

cd /opt/rama777
rm -rf app.new && mkdir app.new
if [ -n "$SRC" ]; then
  tar -xzf "$SRC" -C app.new && rm -f "$SRC"
else
  echo "› building $(git -C "$REPO" log -1 --format='%h %s')"
  git -C "$REPO" archive HEAD server admin | tar -x -C app.new
fi
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
  if curl -fs -m 3 http://127.0.0.1:4100/api/health >/dev/null; then
    echo "✓ deployed and running — previous build kept in /opt/rama777/app.old"
    exit 0
  fi
done
echo "new build did not start — rolling back" >&2
journalctl -u rama777 -n 20 --no-pager >&2
mv app/server/data app.old/server/data
rm -rf app.failed && mv app app.failed && mv app.old app
systemctl restart rama777
exit 1
