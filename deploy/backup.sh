#!/bin/sh
# Daily backup of the Rama777 database and uploaded files; keeps 14 days.
set -e
DATA=/opt/rama777/app/server/data
OUT=/opt/rama777/backups
STAMP=$(date +%F)
sqlite3 "$DATA/matka.db" ".backup $OUT/matka-$STAMP.db"
gzip -f "$OUT/matka-$STAMP.db"
[ -d "$DATA/uploads" ] && tar -czf "$OUT/uploads-$STAMP.tgz" -C "$DATA" uploads
find "$OUT" -name "matka-*.db.gz" -mtime +14 -delete
find "$OUT" -name "uploads-*.tgz" -mtime +14 -delete
