# Rama777 — React Native + TypeScript game app

A full-stack play-money number game app built to the supplied UI: Expo/React Native client,
Node + TypeScript API, SQLite storage.

**All balances are virtual coins.** There is no payment gateway, no real currency and no way to
convert coins to money — the deposit/withdraw screens move virtual coins through a request queue.

```
MatkaApp/
├─ server/            Node + TypeScript API (Express, node:sqlite)
├─ admin/             Admin panel — React + TypeScript + Tailwind, built with Vite
│  └─ src/            api, ui, auth, Layout + one component per page in pages/
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
| `AUTO_DECLARE` | `1` | starting value for auto-publishing random results; after first boot Others → General Settings owns this. Turn it off once results are declared by hand |
| `REGISTER_BONUS` | 1000 | coins credited on signup |
| `DEMO_DATA` | — | `1` fills a **fresh** database with demo users, bids, deposits and withdrawals |
| `APP_TZ` | `Asia/Kolkata` | time zone for market times, "today" and report dates (hosts run in UTC) |
| `ADMIN_DIST` | `../admin/dist` | serve a different admin build at `/admin` |

Delete `server/data/matka.db` to reset everything.

### Demo data

```bash
npm run seed:demo    # adds demo data to the current database (once)
```

90 users (password `demo1234`), two weeks of bids on every market kind settled against the seeded
results, deposits, withdrawals in every status, bank-detail changes, a few blocked and deleted users,
and a staff account `ravi1` / `ravi@1234` with an Operations Manager permission set.

## 2. Admin panel

```bash
cd admin
npm install
npm run dev          # http://localhost:3000
```

Start the API first (`cd server && npm run dev`), then log in with `ADMIN_USER` / `ADMIN_PASSWORD`
from `server/.env` — `admin` / `admin123` by default.

React + TypeScript + Tailwind, built with Vite. It runs on its own and Vite proxies `/api` and
`/uploads` to the local backend on 4100, so the browser sees one origin and every fetch the app
makes stays relative:

```text
browser   http://localhost:3000/api/admin/login
proxied   http://localhost:4100/api/admin/login
```

There is no API base to configure and no environment to switch — the panel only ever talks to the
local backend. `PORT` is fixed at 3000 in `vite.config.ts`; pass `--port` to move it.

Inside `src/`: `main.tsx` mounts the app, `App.tsx` holds the routes, `Layout.tsx` is the sidebar
and topbar, `auth.tsx` owns the session, `api.ts` is the typed client, `ui.tsx` has the shared
pieces (toast, modal, card, table) and `pages/` has one component per screen. Routing is
hash-based, so `#/users?id=7` opens that user straight from a bid row.

`styles.css` carries the original design system (`.card`, `.btn`, `.chip`, the sidebar, the chat
view) so the panel looks exactly as it did; Tailwind is configured with the same palette in
`tailwind.config.js` and used for layout inside the components.

```bash
npm run build        # type-checks, then writes admin/dist
npm run typecheck    # types only
```

The API serves that build at `/admin` — same origin again, which is why the relative fetches work
there too. `render.yaml` builds the panel as part of the API's build, so a deploy picks it up.

The panel follows the client's specification document and its reference screenshots: orange sidebar,
breadcrumb cards, DataTables-style lists (Show N entries, search, sort, pagination), dark-header popups.

| Sidebar | Pages |
| --- | --- |
| Dashboard | User, bid, wallet, payout, deposit and withdraw totals; today's registrations with / without balance; registered-user log; today's deposit log |
| All Users | Search, device info, block / unblock, profile popup (payout details + account summary); `#/users?id=N` opens a profile |
| Games / Starline / Andar Bahar | **Provider** (add, edit, disable; Andar Bahar module on/off) · **Setting** (weekly timetable per day: bet open/close and result times, closed days, multiple-days edit) · **Rates** (multipliers, decimals allowed) · **Result** (declare → Get Winners List → "Are you sure?" → pay; revert, remove, refund) · Starline / AB **Profit Loss** |
| Bookie Corner | OC Cutting Group, Cutting Group (per digit and panna: stake, amount to pay, profit / loss, bid drill-down), Final OC Cutting Group (jodi + sangam) |
| Wallet | Fund requests (withdraw tabs + deposit approvals, bulk approve), export / download debit report (Kotak, generic bank and Paytm payout files), bulk PG payment (failed payouts), View Wallet (credit / debit, ledgers, transaction history), search account, bank change history, withdraw request on/off per weekday |
| Approved Debit Requests / Declined | Approved withdrawals by Paytm / bank with mark paid or failed; declined requests |
| Reports | Jodi All, Sales, Sales Summary, Starline and Andar Bahar sales and bids, Fund Report 1 / 2, UPI Fund, Total (detailed) bids, Credit / Debit, Daily, Bidding, User Analysis, User Reports, User Lists, Customer Balance, All User Bids |
| Notification · News · Deleted User | Broadcast notifications, login news popup, deleted users with restore and an optional "zero balance for N days" auto-delete |
| App Settings | How to Play, Notice Board (withdraw screen), Profile Note, Wallet Contact |
| Masters | Payment gateway list and active pay-in / pay-out gateway (configuration only), staff accounts with per-page permissions |
| Others | All bids, support inbox, ideas, general settings, activity log |

**Staff accounts.** `ADMIN_USER` is the super admin. Staff created under Masters log in with their own
username and only see the pages ticked for them; the API enforces the same permission keys
(`server/src/permissions.ts`). Blocking or deleting a staff account ends their session immediately.

Changing a rate, timetable or setting flows straight through to the app — the mobile client reads
markets, game types, rates and settings from the API.

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

Pannas are written in standard matka order (ascending, 0 counts as 10: `123`, `190`, `550`); a pick
typed in any order is stored that way, so `321` wins on `123`.

Default payouts per coin (editable per market kind under Game Rates):

| Game | Wins when | Main | Starline |
| --- | --- | --- | --- |
| Single Digit | pick == session digit | 9.5× | 10× |
| Jodi Digit | pick == open digit + close digit | 95× | — |
| Red Brackets | jodi from the red set (00, 05, 11, 16 …), off by default | 95× | — |
| Single Panna | pick == session panna, 3 different digits | 150× | 160× |
| Double Panna | pick == session panna, exactly two digits equal | 300× | 320× |
| Triple Panna | pick == session panna, all digits equal | 900× | 1000× |
| Half Sangam | `openPanna-closeDigit` or `openDigit-closePanna` | 1000× | — |
| Full Sangam | `openPanna-closePanna` | 10000× | — |

**Andar Bahar** is a two-digit draw (00–99, pays 100×) four times a day; it can be switched off from
the AB Provider page.

Bidding windows come from each market's weekly timetable (Game Settings): main markets stop open-
session bids at OBT and close-session bids at CBT; Starline and Andar Bahar slots take bets between
OBT and CBT. Jodi and sangam need both halves of the result, so they only accept bids before OBT.
A session stops taking bids as soon as its result is declared.

Settlement: declaring a result does not pay anyone. The admin opens **Get Winners List**, confirms,
and winners are credited (passbook entries record who paid them). **Revert** takes winnings back and
reopens the bids. With auto results on, the server declares a random result at each result time and
pays immediately.

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

Authenticate with a login token (`Authorization: Bearer <token>` from `POST /api/admin/login`,
for the super admin or a staff account) or the static `x-admin-key` header (full access). Every
route checks the caller's permission keys; a missing permission returns 403.

Each sidebar module has its own router in `server/src/routes/admin/`:

| Prefix | File | Covers |
| --- | --- | --- |
| `/api/admin` | `core.ts` | login, `/me` (permissions), sidebar stats, player search, all bids, support, ideas, general settings, activity log |
| `/api/admin/dashboard` | `dashboard.ts` | dashboard numbers, today's registrations |
| `/api/admin/users` | `users.ts` | users, profile, block, deleted users, auto-delete |
| `/api/admin/content` | `content.ts` | notifications, news, how to play, notice board, profile note, wallet contact |
| `/api/admin/games` | `games.ts` | providers, weekly timetable, rates, results (declare, winners, settle, revert, refund) for `main`, `starline`, `andarbahar` |
| `/api/admin/pnl` | `pnl.ts` | Starline / Andar Bahar profit-loss, Bookie Corner, bid history |
| `/api/admin/wallet` | `wallet.ts` | fund requests and their actions, debit reports, wallets, ledgers, bank history, withdraw on/off |
| `/api/admin/reports` | `reports1.ts`, `reports2.ts` | every report page |
| `/api/admin/masters` | `masters.ts` | payment gateways, staff accounts |

Example — declare an open result, then pay its winners:

```bash
curl -X POST http://localhost:4100/api/admin/games/results   -H 'x-admin-key: admin123' -H 'Content-Type: application/json'   -d '{"marketId":7,"session":"open","value":"140"}'
curl -X POST http://localhost:4100/api/admin/games/results/settle   -H 'x-admin-key: admin123' -H 'Content-Type: application/json'   -d '{"marketId":7,"session":"open"}'
```
#   S a r a 7 7 7  
 #   S a r a 7 7 7  
 