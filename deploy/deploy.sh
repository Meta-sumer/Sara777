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
"${SSH[@]}" "bash -s -- /tmp/rama777-src.tgz" < deploy/server-deploy.sh

echo "› health check"
curl -fsS https://rama777.tech/api/health && echo
