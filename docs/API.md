# Gatebook API contract

The single source of truth that `backend/`, `web/` and `mobile/` all implement against.

Type blocks below use TypeScript-style notation only to describe JSON shapes; all three projects are plain JavaScript.
Base URL: `http://localhost:4000` (configurable). All JSON. All timestamps are ISO-8601 strings (UTC).

## Auth

JWT bearer tokens: `Authorization: Bearer <token>`. Tokens last 7 days.

Roles:

| role       | can                                                                 |
|------------|---------------------------------------------------------------------|
| `admin`    | everything: settings, users, correct an exit time on a closed visit |
| `security` | check visitors in, record exits, read everything                    |
| `viewer`   | read only (visits and post room)                                    |
| `host`     | an employee ("Employee" in the UI): sees and confirms only post addressed to them (`/api/mail` is filtered to their items); 403 on every `/api/visits*`, `/api/stats*` and settings-write endpoint |

Any user can also be a post **recipient**: role `host`, or any other role with `isHost: true`.

On first start, if there are no users, the backend creates an admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME`
(defaults `admin@gatebook.local` / `admin123` / `Administrator`).

| method | path               | role  | body / query                           | response                    |
|--------|--------------------|-------|----------------------------------------|-----------------------------|
| POST   | `/api/auth/login`  | none  | `{ email, password }`                  | `{ token, user: User }`     |
| GET    | `/api/auth/me`     | any   |                                        | `{ user: User }`            |
| PATCH  | `/api/auth/me`     | any   | any of `{ phone, dept, location }` (own profile) | `{ user: User }`  |
| GET    | `/api/hosts`       | any   | paginated list of **users who can receive post** (active users with role `host`, or `isHost` "Can also receive post"); `q` (name, dept), `dept`, `page`, `limit`; sort `name` | `Paginated<Host>` |
| GET    | `/api/users`       | admin | paginated; `q` (name, email, phone, dept), `role`, `active` (`true`/`false`), `sort` ∈ `name`,`email`,`createdAt` (default `name`) | `Paginated<User>` |
| POST   | `/api/users`       | admin | `{ name, email, password, role, phone?, dept?, location?, isHost? }` | `{ user: User }` |
| PATCH  | `/api/users/:id`   | admin | any of `{ name, role, password, active, phone, dept, location, isHost }` | `{ user: User }` |

```js
type Role = 'admin' | 'security' | 'viewer' | 'host';
interface User { id: string; name: string; email: string; role: Role; active: boolean; createdAt: string;
  phone: string; dept: string; location: string;   // location = "where visitors/post should go", e.g. "2nd floor, cabin 3"
  isHost: boolean }                                // always true when role = 'host'
interface Host {
  id: string;          // 'pace:<emp_code>' for Pace employees
  name: string; dept: string;
  location: string;    // "<designation> · <branch>" for Pace employees
  phone: string;       // '' for host/viewer callers
  empCode?: string; designation?: string; branch?: string;
}
```

## Employee directory (Pace) — optional, OFF

> **Not used.** Post receivers are Gatebook's own users who can receive post (see `GET /api/hosts`). The Pace
> integration below stays in the backend but is disabled unless `PACE_EMPLOYEES_URL` is set.

The company's employee list lives in the **Pace** HR system: `GET https://pace.mytrustlab.co.in/api/v1/employees`
(no auth; `q`, `page`, `per_page` ≤ 100, `department`, `status`, `sort`, `dir`; envelope
`{ success, data: { items, pagination: { current_page, per_page, total, last_page, has_more } } }`).
Gatebook never exposes Pace to the apps directly — the backend proxies it (env `PACE_EMPLOYEES_URL`;
empty = fall back to local `host`/`isHost` users):

- `GET /api/hosts` → Pace with `status=active`, `sort=name`, `page`, `per_page=limit`, `q`, `department=dept`;
  each item maps to `Host` `{ id: 'pace:<emp_code>', name, dept: department, location: 'designation · branch',
  phone (gate users only), empCode, designation, branch }`; pagination maps to Gatebook's shape. Results are cached
  for 60 s. Pace down / slow (8 s timeout) → `502 { code: 'upstream', message: "The employee directory (Pace) can't be
  reached right now. Type the receiver's name instead." }`.
- A `recipientId` of `pace:<emp_code>` on `POST /api/mail` is resolved by asking Pace for that code (exact
  `emp_code` match, status active, else `validation` field `recipientId`). The employee is then **upserted as a local
  user** (role `host`, linked by `paceEmpCode`; matched by email if an account already exists) holding Pace's name,
  email, phone, department and "designation · branch" as location. The post item's `recipient` points at that local user.
- Pace-linked users have **no password** until an admin sets one (`PATCH /api/users/:id { password }`); they cannot
  sign in before that (`401` "This account can't sign in yet. Ask an admin to set a password.").
- A recipient who **can sign in** (active, has a password) gets the confirmation flow (`handed` → confirm). One who
  can't is treated like someone not on Gatebook: handover goes straight to `closed`, and `remind` is a `conflict`.

## Errors

Every non-2xx response is `{ error: { code: string, message: string, field?: string } }`.
`message` is written for the guard and can be shown as-is. Codes used:
`unauthorized` (401), `forbidden` (403), `not_found` (404), `validation` (400, `field` set when it points at one input),
`badge_in_use` (409), `already_inside` (409), `conflict` (409), `upstream` (502, Pace directory unreachable), `internal` (500).

## Pagination & query params (applies to EVERY list endpoint)

Every list endpoint is driven entirely by URL query params, so any list can be paged, searched, filtered and sorted
just by changing the URL. No list endpoint ever returns an unbounded array.

| param   | type   | default | notes |
|---------|--------|---------|-------|
| `page`  | int ≥ 1 | `1`    | 1-based page number |
| `limit` | int 1–100 | `20` | page size |
| `q`     | string | —       | case-insensitive search (fields listed per endpoint); trimmed; regex characters escaped |
| `sort`  | string | per endpoint | field name, `-` prefix = descending (e.g. `-inAt`); only the fields listed per endpoint are allowed |
| filters | —      | —       | per endpoint (e.g. `site`, `status`, `from`, `to`, `role`) |

Invalid values (non-numeric page, limit > 100, unknown sort field) → `400 validation` with `field` set.
A page past the end returns an empty `data` array with correct `pagination`.

Every list response has this exact shape:

```js
interface Paginated<T> {
  data: T[];
  pagination: {
    page: number; limit: number;
    total: number;        // total matches for the current filters/search
    totalPages: number;   // Math.ceil(total / limit), 0 when total = 0
    hasNextPage: boolean; hasPrevPage: boolean;
  };
}
```

Client rules:
- **Web** keeps each list's params (`page`, `limit`, `q`, filters, `sort`) in the browser URL (`useSearchParams`), so
  reload / back / sharing a link restores the same view. Tables use MUI `TablePagination` (rows per page 10/20/50/100);
  card lists on phone width use "Load more" (next page appended). Search input is debounced 300 ms and resets `page` to 1;
  changing any filter resets `page` to 1.
- **Mobile** lists use `FlatList` infinite scroll: load `page=1`, request `page+1` on `onEndReached` while `hasNextPage`,
  pull-to-refresh reloads page 1, footer spinner while loading, debounced search (300 ms) and filter changes restart at page 1.
- Both: realtime events (`visit:created` / `visit:updated`) refresh the first page (or patch an already-loaded item in place);
  they never wipe pages the user has scrolled to without reason, and never touch a half-filled form.
- Counts shown in the UI (e.g. "Inside now 12", "24 entries") come from `pagination.total`, never from `data.length`.

## Settings

```js
interface Settings { sites: string[]; departments: string[]; purposes: string[]; mailKinds: string[]; overstayHours: number }
```

Defaults:
- sites: `["Main Gate"]`
- departments: `["Administration","Accounts","HR","Laboratory","Sales","Marketing","Procurement","Logistics","IT","Other"]`
- purposes: `["Meeting","Delivery","Vendor / Service","Interview","Sample pickup","Customer","Government / Audit","Other"]`
- mailKinds: `["Registered post","Speed post","Courier","Letter","Parcel","Documents","Cheque / DD","Other"]`
- overstayHours: `4` (integer 1–24)

| method | path            | role  | body                | response                 |
|--------|-----------------|-------|---------------------|--------------------------|
| GET    | `/api/settings` | any   |                     | `{ settings: Settings }` |
| PUT    | `/api/settings` | admin | full `Settings`     | `{ settings: Settings }` |

Validation: every list has at least one non-empty, unique, trimmed entry; `overstayHours` integer 1–24.

## Visits

```js
type IdType = 'Aadhaar'|'Driving licence'|'PAN'|'Voter ID'|'Company ID'|'Passport'|'Other'|'None';
interface GuardRef { id: string; name: string }
interface Visit {
  id: string;            // same as `pass`
  pass: string;          // entry id, server generated: GB-YYMMDD-XXXX (XXXX from ABCDEFGHJKLMNPQRSTUVWXYZ23456789)
  badge: string;         // physical pass-card number, uppercase [A-Z0-9-], 1–12 chars
  passReturned: boolean | null; // null while inside; true/false once exited
  name: string; phone: string; company: string; persons: number;
  purpose: string; host: string; dept: string;
  idType: IdType; idLast4: string; vehicle: string; items: string; notes: string;
  site: string;
  inAt: string; outAt: string | null;
  photoUrl: string;          // signed, short-lived URL (see Files)
  idPhotoUrl: string | null;
  guardIn: GuardRef | null; guardOut: GuardRef | null;
  exitNote: string;
  overstay: boolean;         // computed: still inside and inside longer than settings.overstayHours
}
```

| method | path                         | role     | notes |
|--------|------------------------------|----------|-------|
| GET    | `/api/visits`                | any      | **paginated**. Filters: `from`, `to` (ISO, on inAt, `to` exclusive), `site`, `status` = `all`\|`in`\|`out`\|`over`. `q` over badge, name, phone, pass, company, host, vehicle, dept. `sort` ∈ `inAt`,`outAt`,`name`,`badge` (default `-inAt`). → `Paginated<Visit>` plus `summary: { persons: number, inside: number }` for the whole filtered set (for the "24 entries · 31 persons · 3 still inside" line) |
| GET    | `/api/visits/inside`         | any      | **paginated**; open visits only. Filters: `site` (omit = all gates), `overstay` (`true` = only overstaying). `q` as above. `sort` default `inAt` (oldest first). → `Paginated<Visit>` (`pagination.total` = the Inside-now count) |
| GET    | `/api/visits/lookup`         | any      | query: `phone` (matches last 10 digits), plus `page`/`limit` (default limit 5) for the history. → `{ open: Visit \| null, data: Visit[], pagination }` (data = closed visits, newest first) |
| GET    | `/api/visits/badge-check`    | any      | query: `badge`, `site` (optional, defaults to the first gate). → `{ inUse: Visit \| null }` (an open visit at that site holding that badge, case-insensitive) |
| GET    | `/api/visits/export.csv`     | any      | same filters, `q` and `sort` as `GET /api/visits` but **not** paginated (exports every match, capped at 10 000 rows); returns `text/csv` with a UTF-8 BOM, filename `visitor-log-YYYY-MM-DD.csv`. Columns listed below. |
| GET    | `/api/visits/:id`            | any      | → `{ visit: Visit }` |
| POST   | `/api/visits`                | security, admin | `multipart/form-data` (see Check-in). → `201 { visit: Visit }` |
| POST   | `/api/visits/:id/exit`       | security, admin | `{ outAt?: ISO (default now), exitNote?: string, passReturned?: boolean }` → `{ visit: Visit }` |

### Check-in (`POST /api/visits`)

Multipart fields: `badge`*, `phone`*, `name`*, `company`, `persons` (int 1–50, default 1), `purpose`*, `host`*, `dept`,
`idType` (default `Aadhaar`), `idLast4` (digits only, max 4), `vehicle` (stored uppercase), `items`, `notes`, `site` (optional; defaults to the first gate in settings — the deployment has a single gate, so the apps don't send it).
Files: `photo`* (image, ≤ 8 MB), `idPhoto` (image, optional, ≤ 8 MB). `*` = required.

Server rules, in order:
1. Required fields present → else `validation` with `field`.
2. `phone` has at least 10 digits → else `validation`, field `phone`.
3. `site` is in `settings.sites`; `purpose` is in `settings.purposes` → else `validation`.
4. No open visit anywhere with the same last-10-digit phone → else `already_inside` ("This mobile number is already inside. Close the open entry first.").
5. No open visit at the same site with the same badge → else `badge_in_use` ("Pass 12 is with Ravi Kumar (inside since 10:42 am). Use another pass or check them out first.").
6. Images are resized server-side (photo max 520 px long edge, ID max 900 px, JPEG q72) and stored on disk.
`guardIn` = the caller. `inAt` = server now.

### Exit (`POST /api/visits/:id/exit`)

- `outAt` must be ≥ `inAt` and ≤ now + 5 min → else `validation`, field `outAt`.
- If the visit is already closed, only `admin` may call it (correcting the exit time) → else `conflict`.
- `passReturned` defaults to `true` when the visit has a badge.
- `guardOut` = the caller.

### CSV columns

`Pass no., Entry ID, Name, Mobile, Coming from, Persons, Purpose, Whom to meet, Department, ID type, ID last 4, Vehicle, Items,
Gate, In, Out, Duration, Checked in by, Checked out by, Pass returned, Remarks, Exit remarks`
(dates formatted `12 Oct 2026, 10:42 am` in `Asia/Kolkata`; Duration like `1h 05m` / `25m`; Pass returned `Yes`/`No`/blank while inside).

## Post room (incoming mail & parcels)

Security logs every item that arrives at the gate (photo of the cover + photo of the delivery person), the receiver is
notified, security records the handover, and the receiver confirms on their own device that they got it (or disputes it,
which raises an issue for security to resolve).

```js
type MailStatus = 'lodged'     // at the gate, waiting to be collected
                | 'handed'     // handed over, waiting for the receiver to confirm (receiver is a Gatebook user)
                | 'closed'     // handed over to a receiver who is NOT on Gatebook (no confirmation step)
                | 'confirmed'  // receiver confirmed collection
                | 'disputed'   // receiver says they did not get it  → shows as an issue for security
                | 'resolved';  // security wrote what was found/done
interface MailItem {
  id: string;                 // server generated: ML-YYMMDD-XXXX (same alphabet as visit passes)
  kind: string;               // one of settings.mailKinds
  refNo: string;              // tracking / reference number, stored uppercase
  sender: string; carrier: string;            // "Income Tax Department", "India Post"
  broughtBy: string; broughtPhone: string;    // delivery person
  recipient: { id: string; name: string; phone: string; location: string } | null; // null when not on Gatebook
  recipientName: string;      // recipient.name, or the typed name when not on Gatebook
  dept: string; pieces: number; notes: string; site: string;
  receivedAt: string; receivedBy: GuardRef;
  coverPhotoUrl: string; personPhotoUrl: string;   // signed URLs, see Files
  status: MailStatus;
  notifiedAt: string | null; remindedAt: string | null;
  handedAt: string | null; handedBy: GuardRef | null; collectedBy: string; handedNote: string;
  confirmedAt: string | null; disputeNote: string;
  resolvedAt: string | null; resolvedBy: GuardRef | null; resolveNote: string;
}
```

| method | path                        | role | notes |
|--------|-----------------------------|------|-------|
| GET    | `/api/mail`                 | any  | **paginated**. Filters: `site`, `status` (one status or a comma list, e.g. `handed,disputed`), `from`/`to` (ISO, on receivedAt, `to` exclusive), `recipient` (`me` or a user id). `q` over id, refNo, sender, carrier, broughtBy, broughtPhone, recipientName, dept, kind, collectedBy. `sort` ∈ `receivedAt`, `handedAt` (default `-receivedAt`). For role `host` the list is always limited to items addressed to them. → `Paginated<MailItem>` plus `counts: { lodged, handed, disputed }` = totals for the same `site` (and recipient scope) ignoring `status`/`q`/dates, for the tab badges |
| GET    | `/api/mail/export.csv`      | security, admin, viewer | same filters/q/sort as the list, not paginated (cap 10 000); filename `post-register-YYYY-MM-DD.csv` |
| GET    | `/api/mail/:id`             | any (host: own items only) | → `{ item: MailItem }` |
| POST   | `/api/mail`                 | security, admin | `multipart/form-data`: `kind`*, `sender`*, `broughtBy`*, `recipientId` **or** `recipientName`* (one of them), `site` (optional, defaults to the first gate), `refNo`, `carrier`, `broughtPhone`, `pieces` (1–99, default 1), `dept`, `notes`; files `cover`* and `person`* (images ≤ 8 MB; resized to 1100 px / 640 px long edge, JPEG q72). Rules: `kind` ∈ settings.mailKinds, `site` ∈ settings.sites, `recipientId` must be an active recipient (else `validation`, field `recipientId`). If `recipientId` is set, `dept` defaults to the recipient's dept and `notifiedAt` = now. → `201 { item }` |
| POST   | `/api/mail/:id/remind`      | security, admin | only `lodged` items with a recipient user (else `conflict`) → sets `remindedAt`; recipient gets a `mail:reminder` socket event. → `{ item }` |
| POST   | `/api/mail/:id/handover`    | security, admin | `{ collectedBy*, note? }`; only from `lodged` (else `conflict` "Already handed over"). Status → `handed` if there is a recipient user, otherwise `closed`. → `{ item }` |
| POST   | `/api/mail/:id/confirm`     | the recipient, or admin | `{ ok: boolean, note? }`; only from `handed` (else `conflict` "Security has not handed this over yet", with the current item in `error.item`). `ok:true` → `confirmed`; `ok:false` → `disputed` with `disputeNote` = note or "Receiver says it was not collected". Anyone else → `forbidden` "This item is not addressed to you". → `{ item }` |
| POST   | `/api/mail/:id/resolve`     | security, admin | `{ note* }` (else `validation` "Write what was found or done"); only from `disputed`. → `resolved`. → `{ item }` |

### Post CSV columns
`Entry ID, Type, Tracking / ref no., From (sender), Brought by, Delivery person, Delivery person mobile, For, Department,
Pieces, Gate, Received, Logged by, Status, Handed over, Collected by, Handed by, Receiver confirmed, Dispute, Resolution, Remarks`
(Status labels: To collect, Handed · awaiting confirmation, Handed over, Collected · confirmed, Receiver disputes, Resolved.)

## Push notifications (Firebase Cloud Messaging)

Firebase project **trustlab-diagnostics**; apps registered as `com.app.gatebook` (Android + iOS). The backend
sends with the Firebase Admin SDK using the service account at `FIREBASE_SERVICE_ACCOUNT`
(default `backend/secrets/firebase-service-account.json`, git-ignored). If the file is missing, push is disabled
(logged once) and everything else keeps working.

### Device tokens

| method | path | role | body | response |
|--------|------|------|------|----------|
| POST   | `/api/devices` | any signed-in | `{ token*, platform*: 'android' \| 'ios' }` | `{ ok: true }` — upsert by token; a token moves to the caller if another user had it |
| DELETE | `/api/devices/:token` | any signed-in | — | `{ ok: true }` — removes the caller's token (sign-out) |

Tokens are also removed when FCM reports them invalid (`messaging/registration-token-not-registered`,
`invalid-registration-token`, `invalid-argument`) and when a user is deactivated.

### What is pushed

Every message has a `notification { title, body }` (shown by the OS when the app is in the background / closed)
and `data` for routing: `{ type, id }` (strings). Android: `priority: high`, channel `gatebook_default`.
iOS: `sound: default`.

| event | to | title | body | data |
|-------|----|-------|------|------|
| post logged for a recipient who can sign in | recipient | "📬 {kind} for you" | "From {sender} · collect it at the gate" | `{ type: 'mail', id }` |
| remind | recipient | "⏰ Reminder: {kind} waiting" | "From {sender} · still at the gate" | `{ type: 'mail', id }` |
| handover (status `handed`) | recipient | "✅ Please confirm collection" | "{kind} from {sender} was handed to {collectedBy}. Did you get it?" | `{ type: 'mail', id }` |
| receiver disputes | all active `security` + `admin` users | "⚠️ {recipientName} didn't get it" | "{kind} from {sender} · {disputeNote}" | `{ type: 'mail', id }` |

Pushes are best-effort and never fail the API request that triggered them.

## Overview stats

`GET /api/stats/overview?site=<site>&tzOffset=<minutes>` (any role; omit `site` = all gates; `tzOffset` = the client's
`new Date().getTimezoneOffset()`, used to find "today" and the hour buckets, default `-330` for IST).

```js
interface Overview {
  insideNow: number;
  entriesToday: number;
  personsToday: number;          // sum of persons for today's entries
  avgStayMinutes: number | null; // over today's closed entries
  overstayCount: number;         // open visits past overstayHours (the list itself comes from GET /api/visits/inside?overstay=true, paginated)
  byHour: { hour: number; count: number }[]; // hours 6..22; before 6 counts in 6, after 22 counts in 22
  byPurpose: { label: string; count: number }[]; // desc
  byDept: { label: string; count: number }[];    // desc, top 6, empty dept = "Not set"
  overstayHours: number;
}
```
→ `{ overview: Overview }`

## Files

Photos are sensitive (faces, ID cards), so they are never public. Every `photoUrl` / `idPhotoUrl` in a response is
`/api/files/<name>?exp=<unix seconds>&sig=<hex HMAC-SHA256 of "name:exp">`, valid for 1 hour, so it works in a plain
`<img src>` / `<Image source>` without a header. Clients prefix it with the API base URL. `GET /api/files/:name` returns
403 on a bad or expired signature.

## Realtime

Socket.IO on the same origin/port. Connect with `io(BASE_URL, { auth: { token } })`; unauthenticated sockets are rejected.
Server events (payloads carry fresh signed URLs):

| event              | payload              |
|--------------------|----------------------|
| `visit:created`    | `{ visit: Visit }`   |
| `visit:updated`    | `{ visit: Visit }`   |
| `settings:updated` | `{ settings: Settings }` |
| `mail:created`     | `{ item: MailItem }` |
| `mail:updated`     | `{ item: MailItem }` |
| `mail:reminder`    | `{ item: MailItem }` (only to the recipient) |

Delivery scoping: `visit:*` events go only to `admin`/`security`/`viewer` sockets. `mail:*` events go to
`admin`/`security`/`viewer` sockets and to the recipient's own socket (a `host` user only ever receives their own items).

Clients refetch or patch their lists on these events; they never re-render a half-filled check-in form.

## Health

`GET /api/health` → `{ ok: true }` (no auth).
