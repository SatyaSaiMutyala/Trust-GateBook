# Gatebook backend

Node 20 (`>=20 <21`; the AWS server runs 20.20.2 — `nvm use` picks it from `.nvmrc`), plain JavaScript (ESM), Express 5, MongoDB (Mongoose), Socket.IO. Implements `../docs/API.md`:
visitor register (check-in / exit / log / overview) and the **post room** (incoming mail & parcels).

## Run

```bash
cd backend
npm install
cp .env.example .env      # optional; every value has a dev default
npm run dev               # node --watch src/index.js, http://localhost:4000
npm run seed              # optional demo data (security user, 2 employees, ~15 visits, 8 post items)
```

On first start with an empty database an admin is created:

| user | email | password |
|------|-------|----------|
| admin (first start) | `admin@gatebook.local` | `admin123` |
| security (`npm run seed`) | `security@gatebook.local` | `security123` |
| employee / host (`npm run seed`) | `ravi@gatebook.local`, `priya@gatebook.local` | `host1234` |

Roles: `admin` (everything), `security` (check-in, exits, post room actions), `viewer` (read-only),
`host` = Employee (only `/api/mail` for their own items, `/api/hosts`, `/api/settings` read, own profile via
`PATCH /api/auth/me`; 403 on `/api/visits*`, `/api/stats*` and settings writes). Any non-host user with `isHost: true`
can also receive post.

Scripts: `dev`, `start` (`node src/index.js`), `build` (syntax check of `src/` with `node --check`; nothing to compile),
`lint` (ESLint flat config), `test` (vitest + supertest against an in-memory MongoDB), `seed`
(`--force` adds demo visits even when visits already exist: `npm run seed -- --force`).

## Database

- **`MONGODB_URI` set** → connects to it. Example: `MONGODB_URI=mongodb://localhost:27017/gatebook` or an Atlas
  `mongodb+srv://user:pass@cluster/gatebook` string. Indexes are created on start.
- **`MONGODB_URI` empty** → starts an **embedded dev database** (`mongodb-memory-server`, wiredTiger) whose files live in
  `backend/.data/mongo`, so data survives restarts. It listens on `127.0.0.1:27018` (`EMBEDDED_MONGO_PORT`). If one is
  already running (e.g. `npm run seed` while `npm run dev` is up) it is reused. The first start downloads a MongoDB binary
  (~100 MB, cached in `~/.cache/mongodb-binaries`). Development only. Delete `backend/.data` to reset.

## Environment

| var | default | notes |
|-----|---------|-------|
| `PORT` | `4000` | API + Socket.IO |
| `MONGODB_URI` | empty | empty = embedded dev DB |
| `JWT_SECRET` | dev value | **required** in production; tokens last 7 days |
| `FILE_URL_SECRET` | dev value | **required** in production; HMAC key for signed photo URLs |
| `CORS_ORIGIN` | any origin in dev | comma-separated list or `*`; production default `http://localhost:5173`, `:8081`, `:19006` (Expo) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | `admin@gatebook.local` / `admin123` / `Administrator` | first-start admin only |
| `UPLOAD_DIR` | `uploads` | relative to `backend/`; photos stored as random `<32 hex>.jpg` |
| `TZ_DISPLAY` | `Asia/Kolkata` | CSV dates, pass-number date, times in guard messages |
| `EMBEDDED_MONGO_PORT` | `27018` | embedded dev DB only |
| `PACE_EMPLOYEES_URL` | `https://pace.mytrustlab.co.in/api/v1/employees` | Pace HR employee API behind `GET /api/hosts`; set it to an empty value to use local `host` / `isHost` users instead |
| `FIREBASE_SERVICE_ACCOUNT` | `secrets/firebase-service-account.json` | Firebase Admin service account (relative to `backend/`, git-ignored, never commit). Missing = push disabled (one log line) |
| `NODE_ENV` | `development` | `production` enforces secrets and the CORS default |

## Layout

```
src/
  index.js           bootstrap: DB, first admin, HTTP + Socket.IO, graceful shutdown
  app.js             Express app (helmet, cors, morgan, routes, error envelope)
  config.js  db.js   env config; MongoDB / embedded dev DB
  realtime.js        Socket.IO with JWT handshake auth; visit:created / visit:updated / settings:updated
  seed.js            demo data
  models/            User (+ phone, dept, location, isHost), Visit (partial-unique open badge/phone),
                     MailItem (post room), Settings (singleton, incl. mailKinds)
  middleware/        auth (JWT, roles), error (ApiError -> { error: { code, message, field } })
  routes/            auth, users, hosts, settings, visits, stats, mail, files
  services/          pace (Pace HR directory proxy + recipient upsert), pagination, pass/entry numbers, image storage (sharp), URL signing, serialization, CSV, formatting
test/api.test.js     visitor register integration tests
test/mail.test.js    post room, roles, hosts directory, profile, settings migration
test/notifications.test.js  in-app inbox: triggers, pagination, read / read-all, socket rooms, notificationId in pushes
test/push.test.js    device tokens, FCM pushes (fake sender, no network), invalid-token cleanup
test/pace.test.js    Pace directory (fetch mocked: no network), Pace recipients, sign-in rules
```

## Notes

- Photos are never public: responses carry `/api/files/<name>?exp=&sig=` URLs (HMAC-SHA256, ~1 h). `GET /api/files/:name`
  answers 403 on a bad/expired signature and only serves well-formed stored names from `UPLOAD_DIR`.
- Every list endpoint is paginated (`page`, `limit` ≤ 100, `q`, whitelisted `sort`) and returns
  `{ data, pagination: { page, limit, total, totalPages, hasNextPage, hasPrevPage } }`. The CSV export is not paginated
  (capped at 10 000 rows).
- Open-visit rules (one open visit per phone; one holder per pass card per gate) are checked before insert and also
  enforced by partial unique indexes, so simultaneous check-ins cannot both succeed.

## Post room

`/api/mail` (see API.md "Post room"). Items get `ML-YYMMDD-XXXX` ids, two required photos (`cover` resized to 1100 px,
`person` to 640 px), and move through a small state machine; every transition is an atomic conditional update, so two
guards acting at once get `409 conflict` instead of a double transition:

```
lodged --handover--> handed --confirm ok:true--> confirmed
   |                   \--confirm ok:false-> disputed --resolve--> resolved
   \--handover (receiver not on Gatebook)--> closed
```

`remind` (lodged + recipient user only) sets `remindedAt` and sends `mail:reminder` to the recipient.
The list returns `counts: { lodged, handed, disputed }` for the same gate/recipient scope, ignoring status, search and dates.

Realtime delivery is scoped with Socket.IO rooms: admin/security/viewer sockets join `role:gate` (all `visit:*` and
`mail:*` events); every socket joins `user:<id>` (mail events for items addressed to that user, `mail:reminder`).
Changing a user's role or deactivating them disconnects their sockets so they rejoin with the right rooms.

Existing databases keep working: new user fields default to empty / `false`, and settings stored before the post room
get the default `mailKinds` on start-up.

## Employee directory (Pace)

`GET /api/hosts` proxies the company's **Pace** HR API (`PACE_EMPLOYEES_URL`): active employees sorted by name,
`page` / `limit` (≤ 100) / `q` / `dept` passed through, results cached in memory for 60 s per query, 8 s timeout.
Items map to `{ id: 'pace:<emp_code>', name, dept, location: 'designation · branch', phone, empCode, designation, branch }`
(phone only for admin/security callers). If Pace fails or times out the endpoint answers
`502 { code: 'upstream' }` and the apps fall back to a typed receiver name.

Posting mail to `recipientId: 'pace:<emp_code>'` looks the code up in Pace (exact match, active) and upserts a local
user: matched by `paceEmpCode`, else by email (the existing account gets linked and becomes a recipient), else a new
`host` **without a password**. Name, phone, department and location are refreshed from Pace on every resolve.
Password-less users can't sign in (`401` "This account can't sign in yet…"; `canSignIn: false` in `/api/users`) and get no
confirmation step: handover goes straight to `closed`, `remind` is a 409, and `notifiedAt` stays null. An admin sets a
password with `PATCH /api/users/:id { password }` to give them the full flow.
With `PACE_EMPLOYEES_URL=` (empty) the directory lists local `host` / `isHost` users instead.

## Push notifications (FCM)

On start-up the server reads `FIREBASE_SERVICE_ACCOUNT` and initialises `firebase-admin`
(`[push] enabled: Firebase project …`). If the file is missing or invalid it logs `[push] disabled: …` once and
everything else keeps working. Tests never initialise Firebase; they inject a fake sender.

- `POST /api/devices { token, platform: 'android' | 'ios' }` registers the phone's FCM token (upsert by token; a token
  moves to the caller if another user had it). `DELETE /api/devices/:token` removes the caller's own token on sign-out.
- Pushes (`src/services/push.js`, triggered from `src/routes/mail.js`), each with `notification { title, body }` and
  `data { type: 'mail', id }`, Android high priority on channel `gatebook_default`, iOS default sound:
  post logged / reminder / handover (`handed`) → the recipient (only recipients who can sign in);
  receiver disputes → every active `security` and `admin` user.
- Sends go out in chunks of 500 with `sendEachForMulticast`, fire-and-forget (never fail the request). Tokens FCM reports
  as unregistered / invalid are deleted; deactivating a user deletes their devices.

## In-app notifications (inbox)

Every mail notification is stored per user (`Notification`: event, title, body, `data { type: 'mail', id }`, readAt,
createdAt; kept 90 days via a TTL index), whether or not the user has a phone registered. `src/services/notify.js`
is the single entry point used by the mail triggers: it stores one notification per target user, emits
`notification:new { notification, unreadCount }` to that user's socket room, then pushes to that user's phones with
`data { type, id, notificationId }` (one push per user, so each carries the user's own notification id).
Storing works with push disabled.

- `GET /api/notifications` (paginated, own only; `unread=true`; `sort` = `createdAt`, default newest first) also
  returns `unreadCount`. `GET /api/notifications/unread-count` → `{ count }`.
- `POST /api/notifications/:id/read` (owner only, idempotent; others' / invalid ids → `not_found`) and
  `POST /api/notifications/read-all` → `{ updated, unreadCount: 0 }`. Both emit `notification:read { ids | 'all', unreadCount }`
  to the user's room when something changed, so other devices/tabs update their badge.
