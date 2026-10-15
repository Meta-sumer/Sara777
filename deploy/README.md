# Production: rama777.tech

The API and the admin panel run on the Hostinger VPS `srv1934291` (`200.234.44.48`, Ubuntu 24.04).
The same VPS also hosts `betexch.superzone4u.com` through aaPanel. Rama777 is set up beside it
and never touches its files.

| | |
| --- | --- |
| Admin panel | https://rama777.tech/admin (`https://rama777.tech` redirects there) |
| API (used by the app) | https://rama777.tech/api |
| Android app download | https://rama777.tech/download/Rama777.apk (files in `/www/wwwroot/rama777.tech/download`) |
| Code | `/opt/rama777/app` (`server/` + `admin/`), owned by the `rama777` user |
| Database and uploads | `/opt/rama777/app/server/data` (`matka.db`, `uploads/`) |
| Settings | `/opt/rama777/app/server/.env` (admin login, secrets, `AUTO_DECLARE`) |
| Node | `/opt/node-v24` (separate from aaPanel's Node 20 used by the other site) |
| Service | systemd unit `rama777` (file: `deploy/rama777.service`), listens on `127.0.0.1:4100` only |
| nginx site | `/www/server/panel/vhost/nginx/rama777.tech.conf` (file: `deploy/nginx-rama777.tech.conf`) |
| HTTPS | Let's Encrypt via `acme.sh` (root), renewed automatically by root's crontab |
| Backups | daily 02:30 IST into `/opt/rama777/backups`, 14 days kept (`deploy/backup.sh`) |

## Update the live site

From the repo root, with the deploy SSH key in `~/.ssh/rama777_vps`:

```bash
bash deploy/deploy.sh
```

It builds on the server, keeps the database and `.env`, restarts the service and checks the health
URL. The previous build stays in `/opt/rama777/app.old` until the next deploy.

### Or: push to GitHub, pull on the VPS, deploy

The VPS has a clone of this repo in `/opt/rama777/repo` (public repo, so pulling needs no login).

```bash
git push origin admin-panel-v2                      # 1. on your PC
ssh rama777                                         # 2. log in to the VPS (alias in ~/.ssh/config)
cd /opt/rama777/repo && git pull                    # 3. get the pushed code
bash deploy/server-deploy.sh                        # 4. build, swap in, restart, health check
```

Only committed and pushed code is deployed this way; `deploy.sh` also sends uncommitted changes.
Both run the same `deploy/server-deploy.sh`. If the new build does not start, it puts the previous
one back by itself.

## Publish a new APK

After a release build (`mobile/android/app/build/outputs/apk/release/app-release.apk`):

```bash
V=1.2.0   # the new versionName
scp -i ~/.ssh/rama777_vps mobile/android/app/build/outputs/apk/release/app-release.apk \
  root@200.234.44.48:/www/wwwroot/rama777.tech/download/Rama777-v$V.apk
ssh -i ~/.ssh/rama777_vps root@200.234.44.48 \
  "cd /www/wwwroot/rama777.tech/download && cp -f Rama777-v$V.apk Rama777.apk"
```

The share link `https://rama777.tech/download/Rama777.apk` then serves the new version; older
`Rama777-vX.Y.Z.apk` files stay downloadable by their own name.

## Day-to-day commands (on the VPS)

```bash
systemctl status rama777            # running?
journalctl -u rama777 -n 100 -f     # logs
systemctl restart rama777           # restart (e.g. after editing .env)
/opt/rama777/backup.sh              # backup now
```

Change the admin password: edit `ADMIN_PASSWORD` in `/opt/rama777/app/server/.env`, then
`systemctl restart rama777`.

Restore a backup: `systemctl stop rama777`, then
`gunzip -c /opt/rama777/backups/matka-YYYY-MM-DD.db.gz > /opt/rama777/app/server/data/matka.db`,
then `chown rama777:rama777` the file and `systemctl start rama777`.

nginx is aaPanel's: test with `/www/server/nginx/sbin/nginx -t` before `/etc/init.d/nginx reload`.
