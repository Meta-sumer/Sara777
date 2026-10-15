#!/usr/bin/env bash
# Deploy the code on GitHub to the Rama777 VPS (rama777.tech).
#
#   bash deploy/deploy.sh            from the repo root (Git Bash on Windows works)
#
# Code always goes through GitHub: this stops if server/, admin/ or deploy/ have
# uncommitted changes or if the branch is not pushed. Then the VPS pulls the
# branch into /opt/rama777/repo and runs deploy/server-deploy.sh, which builds it,
# keeps the database and server/.env, restarts the service and rolls back if the
# new build does not start.
#
# Needs the SSH key that is registered on the VPS (Hostinger → VPS → SSH keys).
set -euo pipefail

HOST="${RAMA777_HOST:-root@200.234.44.48}"
KEY="${RAMA777_KEY:-$HOME/.ssh/rama777_vps}"
BRANCH="${RAMA777_BRANCH:-admin-panel-v2}"
SSH=(ssh -i "$KEY" -o BatchMode=yes "$HOST")

cd "$(git rev-parse --show-toplevel)"

if [ -n "$(git status --porcelain -- server admin deploy)" ]; then
  echo "✗ uncommitted changes in server/, admin/ or deploy/ — commit and push them first" >&2
  git status --short -- server admin deploy >&2
  exit 1
fi
git fetch -q origin "$BRANCH"
if [ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$BRANCH")" ]; then
  echo "✗ this checkout is not what GitHub has on $BRANCH — run: git push origin $BRANCH" >&2
  exit 1
fi

echo "› deploying $(git log -1 --format='%h %s') from GitHub ($BRANCH)"
"${SSH[@]}" "cd /opt/rama777/repo && git checkout -q $BRANCH && git pull -q --ff-only origin $BRANCH && bash deploy/server-deploy.sh"

echo "› health check"
curl -fsS https://rama777.tech/api/health && echo
