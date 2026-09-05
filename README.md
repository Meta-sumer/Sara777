# Rama777 — React Native + TypeScript game app

A full-stack play-money number game app built to the supplied UI: Expo/React Native client,
Node + TypeScript API, SQLite storage.

**All balances are virtual coins.** There is no payment gateway, no real currency and no way to
convert coins to money — the deposit/withdraw screens move virtual coins through a request queue.

```
MatkaApp/
├─ server/            Node + TypeScript API (Express, node:sqlite)
├─ admin/             Admin panel — plain ES modules, served by the API at /admin
│  └─ src/            api, ui, auth, router + one module per page in pages/
└─ mobile/            Expo + React Native + TypeScript app
```

---

## 1. Run the API

```bash
cd server
npm install
npm run dev          # http://localhost:4100/api
```

On first boot it seeds 13 markets, 12 King Starline games, app settings and 45 days of past
results, then starts the result scheduler.

The console prints your LAN address, e.g. `http://192.168.1.8:4100/api` — the phone/emulator needs
that address, not `localhost`.

`server/.env`:

| key | default | meaning |
| --- | --- | --- |
| `PORT` | 4100 | API port |
| `JWT_SECRET` | dev secret | change before shipping |
| `ADMIN_USER` / `ADMIN_PASSWORD` | `admin` / `admin123` | admin panel login |
| `ADMIN_KEY` | `admin123` | `x-admin-key` header, for scripts/curl instead of logging in |
| `AUTO_DECLARE` | `1` | starting value for auto-publishing results; after first boot the admin panel's Settings page owns this |
| `REGISTER_BONUS` | 1000 | coins credited on signup |

Delete `server/data/matka.db` to reset everything.

## 2. Admin panel

Open **http://localhost:4100/admin** and log in with `admin` / `admin123`
(`ADMIN_USER` / `ADMIN_PASSWORD`). The files live in the top-level `admin/` folder and the API
serves them straight from there. It is plain ES modules loaded by the browser — `src/main.js`
boots, `src/router.js` maps each `#/route` to a module in `src/pages/`, and `src/api.js`,
`src/ui.js` and `src/auth.js` hold what every page shares. Nothing to build or bundle.

The same folder is deployed twice (see `render.yaml`): the API serves it at `/admin`, and
`sara777-admin` publishes it as its own Render static site on a separate URL. Static sites do not
spin down, so that copy opens instantly. `admin/config.js` decides which API it talks to — the
committed value is an empty string, meaning same origin, and the static site build overwrites it
with the API origin. Auth is a bearer token in localStorage, not a cookie, so the cross-origin copy
works without any session changes.

| Page | What you control |
| --- | --- |
| Dashboard | Bids, staked amount and payout for today, user counts, wallet float, pending requests, per-market table |
| Results | Declare open/close panna for any market and date, see pending bid counts, per-number exposure, cancel a market day and refund every pending bid |
| Markets | Add markets, rename, change open/close times and running days, reorder, enable/disable, delete |
| Bids | Every bid with filters (market, date, status, mobile), running totals, pagination |
| Users | Search, block/unblock, credit/debit coins with a note, reset password, full bid + transaction + payout-detail view |
| Fund requests | Approve or reject deposits and withdrawals (rejecting a withdrawal returns the held coins) |
| Game rates | Edit every payout multiplier and switch games on/off — takes effect on the next bid instantly |
| Notifications | Broadcast to everyone or notify one user |
| Support | Read every user's chat thread and reply as support |
| Ideas | Everything submitted from the app's Submit Idea screen |
| Settings | App name, support name, WhatsApp number, marquee, notice board, share text, videos, auto-approve deposits, auto-declare results |
| Activity log | Every admin action with timestamp |

Changing a rate or a setting flows straight through to the app — the mobile client reads game types,
rates and settings from the API, so a disabled game disappears from the bid screen and a new rate is
used for the next bid placed.

## 3. Run the app

```bash
cd mobile
npm install
npm run android      # or: npm start, then scan the QR with Expo Go
```

`mobile/.env` tells the app where the API is. Pick the line that matches how you run it:

```bash
# Android emulator — pair it with: adb reverse tcp:4100 tcp:4100
EXPO_PUBLIC_API_URL=http://127.0.0.1:4100/api

# real phone on the same WiFi — use the LAN address the server printed
EXPO_PUBLIC_API_URL=http://192.168.1.19:4100/api
```

`EXPO_PUBLIC_*` values are baked in at bundle time, so **restart Metro after editing `.env`**.

Two things that silently break the connection:

- **Windows Firewall** blocks inbound connections to `node.exe`, so a phone on the same WiFi cannot
  reach the API even though ping succeeds. Allow Node through the firewall for private networks, or
  use the emulator + `adb reverse` route above.
- **`expo start --localhost`** binds Metro to the IPv6 loopback only, which `adb reverse` (IPv4)
  cannot reach — start Metro without that flag.

---

## Screens

| Area | Screens |
| --- | --- |
| Auth | Login, Register (bonus coins), Forgot password |
| Home | Market list with live open/close status, result, King Starline banner, marquee |
| Play | Game type grid → bid screen (single digit, jodi, single/double/triple panna, half & full sangam) |
| My Bids | Bid history, Game result, Starline bid history, Starline result history |
| Passbook | Paginated ledger, expandable rows with amount + closing balance |
| Funds | Add fund, Withdraw fund, Payout details, Deposit/Withdraw/Bank-change history |
| Support | WhatsApp-style chat thread |
| Drawer | MPIN, Notifications, Videos, Notice board, Game rates, Charts, Submit idea, Settings, Share, Logout, Light/Dark toggle |

Theme is light/dark with the toggle in the drawer; the choice is stored on the device.

---

## Game rules implemented

Result format is `openPanna-openDigit closeDigit-closePanna`, e.g. `140-56-268`.
A panna's digit (ank) is the last digit of the sum of its three digits.

| Game | Wins when | Payout (per coin) |
| --- | --- | --- |
| Single Digit | pick == session digit | 10× |
| Jodi Digit | pick == open digit + close digit | 100× |
| Single Panna | pick == session panna, 3 different digits | 150× |
| Double Panna | pick == session panna, exactly two digits equal | 300× |
| Triple Panna | pick == session panna, all digits equal | 900× |
| Half Sangam | `openPanna-closeDigit` or `openDigit-closePanna` | 1000× |
| Full Sangam | `openPanna-closePanna` | 10000× |

Bidding windows: open-session bids close at the market's open time, close-session bids at its close
time. Jodi and sangam need both halves of the result, so they only accept bids before open time.
Starline games have a single result and a single window.

Settlement is automatic — publishing a result decides every pending bid for that market/day,
credits winners and writes passbook entries.

---

## API

Auth is `Authorization: Bearer <jwt>`.

```
POST   /api/auth/register           { name, mobile, password }
POST   /api/auth/login              { mobile, password }
POST   /api/auth/forgot-password    { mobile, password }
GET    /api/auth/me
PATCH  /api/auth/me                 { name }
POST   /api/auth/change-password    { oldPassword, newPassword }
POST   /api/auth/mpin               { mpin, oldMpin? }
POST   /api/auth/mpin/verify        { mpin }

GET    /api/markets?kind=main|starline
GET    /api/markets/game-types?kind=
GET    /api/markets/:id
GET    /api/markets/:id/results?limit=
GET    /api/markets/results/by-date?date=YYYY-MM-DD&kind=

POST   /api/bids                    { marketId, gameType, session, entries:[{pick, amount}] }
GET    /api/bids?kind=&status=&page=

GET    /api/wallet/balance
GET    /api/wallet/passbook?page=
POST   /api/wallet/deposit          { amount, method }
POST   /api/wallet/withdraw         { amount }
GET    /api/wallet/requests?type=deposit|withdraw
GET    /api/wallet/bank
POST   /api/wallet/bank             { holderName, accountNo, ifsc, bankName, paytm, phonepe, gpay }
GET    /api/wallet/bank/history

GET    /api/settings
GET    /api/game-rates
GET    /api/notifications
POST   /api/ideas                   { text }
GET    /api/support
POST   /api/support                 { text }
```

### Admin

Authenticate with either a login token (`Authorization: Bearer <token>` from `/api/admin/login`)
or the static `x-admin-key: admin123` header.

```
POST   /api/admin/login             { username, password }  ->  { token }
GET    /api/admin/stats             dashboard numbers + per-market totals

GET    /api/admin/markets?date=
POST   /api/admin/markets           { name, kind, openTime, closeTime, days?, sortOrder? }
PATCH  /api/admin/markets/:id       { name?, openTime?, closeTime?, days?, isActive?, sortOrder? }
DELETE /api/admin/markets/:id       (disables instead of deleting when the market has bids)
POST   /api/admin/markets/cancel    { marketId, date?, reason? }   refund pending bids

GET    /api/admin/results?date=
POST   /api/admin/results           { marketId, session, panna, date? }   publish + settle
DELETE /api/admin/results?marketId=&date=   (only while nothing is settled)
POST   /api/admin/results/settle    { marketId, date? }   re-run settlement

GET    /api/admin/bids?marketId=&userId=&date=&status=&gameType=&kind=&mobile=&page=
GET    /api/admin/bids/summary?marketId=&date=      per-number exposure

GET    /api/admin/users?search=&page=
GET    /api/admin/users/:id         profile + bids + transactions + requests + payout details
POST   /api/admin/users/:id/balance { delta, note? }
POST   /api/admin/users/:id/block   { blocked: true|false }
POST   /api/admin/users/:id/password { password }

GET    /api/admin/fund-requests?status=pending&type=
POST   /api/admin/fund-requests/:id { action: 'approve'|'reject', remark? }

GET    /api/admin/rates
POST   /api/admin/rates             { rates: [{ key, rate, isActive }] }

GET    /api/admin/notifications
POST   /api/admin/notifications     { title, body, userId? }
GET    /api/admin/support           thread list
GET    /api/admin/support/:userId
POST   /api/admin/support/:userId   { text }
GET    /api/admin/ideas
GET    /api/admin/settings
POST   /api/admin/settings          { anySettingKey: value }
GET    /api/admin/logs
```

Example — publish a close result by hand:

```bash
curl -X POST http://localhost:4100/api/admin/results \
  -H 'x-admin-key: admin123' -H 'Content-Type: application/json' \
  -d '{"marketId":7,"session":"close","panna":"140"}'
```
#   S a r a 7 7 7  
 #   S a r a 7 7 7  
 