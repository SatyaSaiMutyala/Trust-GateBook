# Gatebook API contract

The single source of truth that `backend/`, `web/` and `mobile/` all implement against.

Type blocks below use TypeScript-style notation only to describe JSON shapes; all three projects are plain JavaScript.
Base URL: production `https://trusentinel.mytrustlab.co.in` (live AWS server; all paths below start with `/api`, so the base is the bare origin), local dev `http://localhost:4000`. All JSON. All timestamps are ISO-8601 strings (UTC).

## Auth

JWT bearer tokens: `Authorization: Bearer <token>`. Tokens last 7 days.

Roles:

| role       | can                                                                 |
|------------|---------------------------------------------------------------------|
| `admin`    | everything: settings, users, correct an exit time on a closed visit |
| `security` | check visitors in, record exits, read everything                    |
| `viewer`   | read only (visits and post room)                                    |
| `host`     | an employee ("Employee" in the UI): sees and confirms only post addressed to them (`/api/mail` is filtered to their items), and sees and answers only their own visitors (`/api/visits/mine*`, `/api/visits/:id/respond`); 403 on every other `/api/visits*`, `/api/stats*` and settings-write endpoint |

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
  isHost: boolean;                                 // always true when role = 'host'
  canPreRegister: boolean }                        // may register expected visitors / deliveries (admins always; others unless switched off)
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
interface Settings { sites: string[]; departments: string[]; purposes: string[]; mailKinds: string[]; overstayHours: number;
  hostReplyMinutes: number;    // = `after` of the first visitor escalation step to guards (see "Escalations")
  expectedPreapproved: boolean;  // new expected visitors start pre-approved (the form can change it)
  designations: string[];        // job-title suggestions for users
  visitorPhotoRequired: boolean; visitorPassRequired: boolean;      // check-in rules
  mailCoverRequired: boolean; mailPersonPhotoRequired: boolean;     // post logging rules (cover = front + back)
  company: Company;
  esc: { visitor: EscStep[]; overstay: EscStep[]; mail: EscStep[] } }
interface Company { name: string; legalName: string; address: string; phone: string; email: string; website: string;
  gstin: string; cin: string;
  logoUrl: string | null }   // public `/api/brand/logo?v=<ms>` (changes with each upload); set only via /api/settings/logo
```

Defaults:
- sites: `["Main Gate"]`
- departments: `["Administration","Accounts","HR","Laboratory","Sales","Marketing","Procurement","Logistics","IT","Other"]`
- purposes: `["Meeting","Delivery","Vendor / Service","Interview","Sample pickup","Customer","Government / Audit","Other"]`
- mailKinds: `["Registered post","Speed post","Courier","Letter","Parcel","Documents","Cheque / DD","Other"]`
- overstayHours: `4` (integer 1–24)
- hostReplyMinutes: `5` (integer 1–60)
- expectedPreapproved: `true`
- designations: Security guard, Security supervisor, Security manager, Facility manager, Department head, Manager, Executive, Director
- all four rules: `true`; company: all `''`, `logoUrl: null`; `esc`: see "Escalations"

| method | path            | role  | body                | response                 |
|--------|-----------------|-------|---------------------|--------------------------|
| GET    | `/api/settings` | any   |                     | `{ settings: Settings }` |
| PUT    | `/api/settings` | admin | full `Settings`     | `{ settings: Settings }` |
| POST   | `/api/settings/logo` | admin | multipart `logo`: PNG / JPEG ≤ 1.5 MB (resized to fit 800 × 400) | `{ settings }` |
| DELETE | `/api/settings/logo` | admin |              | `{ settings }` |
| GET    | `/api/brand`    | public |                    | `{ name, logoUrl }` (sign-in screens) |
| GET    | `/api/brand/logo` | public |                  | the image (404 when none) |

Validation: every list has at least one non-empty, unique, trimmed entry; `overstayHours` integer 1–24;
`hostReplyMinutes` integer 1–60. Every field added after the first release may be omitted (older clients): the stored
value is kept. `company` is merged field by field (`logoUrl` ignored). `esc` is merged per matrix. A changed
`hostReplyMinutes` (with the visitor matrix unchanged) moves the first visitor step to guards.

## Visits

```js
type IdType = 'Aadhaar'|'Driving licence'|'PAN'|'Voter ID'|'Company ID'|'Passport'|'Other'|'None';
type HostStatus = 'waiting'    // host is on Gatebook and has been asked to accept or decline
                | 'accepted'   // accepted in the app, or confirmed by phone by security
                | 'declined'   // host declined: collect the pass and record the exit
                | 'manual';    // host is not on Gatebook (typed name): security confirms by phone
interface GuardRef { id: string; name: string }
interface Visit {
  id: string;            // same as `pass`
  pass: string;          // entry id, server generated: GB-YYMMDD-XXXX (XXXX from ABCDEFGHJKLMNPQRSTUVWXYZ23456789)
  badge: string;         // physical pass-card number, uppercase [A-Z0-9-], 1–12 chars
  passReturned: boolean | null; // null while inside; true/false once exited
  name: string; phone: string; company: string; persons: number;
  purpose: string; host: string; dept: string;
  // Host approval (see "Host approval" below). Visits stored before it read as hostStatus 'manual', allowedAt = inAt.
  hostId: string | null;      // the Gatebook employee being visited; null when the host was typed
  hostPhone: string; hostLocation: string;   // copied from the employee at check-in
  hostStatus: HostStatus;
  hostAt: string | null;      // when the host answered (or security confirmed by phone)
  hostBy: GuardRef | null;    // who recorded the answer
  hostVia: 'app' | 'phone' | 'preapproved' | null;  // preapproved = checked in from a pre-approved Expected entry
  hostNote: string;           // the host's message to security, e.g. "Send to my office"
  escalatedAt: string | null; // when security was told the host had not replied
  allowedAt: string | null;   // when security let the visitor in
  allowedBy: GuardRef | null;
  expectedId: string | null;  // the Expected code this visit was checked in from
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
| GET    | `/api/visits`                | any      | **paginated**. Filters: `from`, `to` (ISO, on inAt, `to` exclusive), `site`, `status` = `all`\|`in`\|`out`\|`over`\|`waiting` (still at the gate: not let in, not declined)\|`declined` (host declined)\|`noreply` (security was told the host did not reply). `q` over badge, name, phone, pass, company, host, vehicle, dept. `sort` ∈ `inAt`,`outAt`,`name`,`badge` (default `-inAt`). → `Paginated<Visit>` plus `summary: { persons: number, inside: number }` for the whole filtered set (for the "24 entries · 31 persons · 3 still inside" line) |
| GET    | `/api/visits/inside`         | any      | **paginated**; open visits only. Filters: `site` (omit = all gates), `overstay` (`true` = only overstaying), `attention` (`true` = only visits security must act on now: host accepted but not yet let in, host declined, host did not reply in time, host not on Gatebook and not yet let in — the gate alert banner). `q` as above. `sort` default `inAt` (oldest first). → `Paginated<Visit>` (`pagination.total` = the Inside-now count) |
| GET    | `/api/visits/lookup`         | any      | query: `phone` (matches last 10 digits), plus `page`/`limit` (default limit 5) for the history. → `{ open: Visit \| null, data: Visit[], pagination }` (data = closed visits, newest first) |
| GET    | `/api/visits/badge-check`    | any      | query: `badge`, `site` (optional, defaults to the first gate). → `{ inUse: Visit \| null }` (an open visit at that site holding that badge, case-insensitive) |
| GET    | `/api/visits/export.csv`     | any      | same filters, `q` and `sort` as `GET /api/visits` but **not** paginated (exports every match, capped at 10 000 rows); returns `text/csv` with a UTF-8 BOM, filename `visitor-log-YYYY-MM-DD.csv`. Columns listed below. |
| GET    | `/api/visits/:id`            | any      | → `{ visit: Visit }` |
| POST   | `/api/visits`                | security, admin | `multipart/form-data` (see Check-in). → `201 { visit: Visit }` |
| POST   | `/api/visits/:id/exit`       | security, admin | `{ outAt?: ISO (default now), exitNote?: string, passReturned?: boolean }` → `{ visit: Visit }` |
| POST   | `/api/visits/:id/allow`      | security, admin | `{ viaPhone?: boolean }` — let the visitor in (see Host approval) → `{ visit: Visit }` |
| GET    | `/api/visits/mine`           | any signed-in | **paginated** visitors of the caller (`hostId` = caller). `scope` = `all` (default) \| `waiting` (open, waiting for the caller's answer; oldest first) \| `current` (open, answered) \| `earlier` (exited). `q` as above, `sort` ∈ `inAt`. → `Paginated<Visit>` plus `counts: { waiting, current }` |
| GET    | `/api/visits/mine/:id`       | any signed-in | one of the caller's own visitors → `{ visit: Visit }`; someone else's → `not_found` |
| POST   | `/api/visits/:id/respond`    | the host, or admin | `{ status: 'accepted' \| 'declined', note?: string (≤ 200) }` (see Host approval) → `{ visit: Visit }` |

### Check-in (`POST /api/visits`)

Multipart fields: `badge`*, `phone`*, `name`*, `company`, `persons` (int 1–50, default 1), `purpose`*,
`hostId` **or** `host`* (one of them: `hostId` = an employee from `GET /api/hosts`; `host` = a typed name), `dept`,
`idType` (default `Aadhaar`), `idLast4` (digits only, max 4), `vehicle` (stored uppercase), `items`, `notes`, `site` (optional; defaults to the first gate in settings — the deployment has a single gate, so the apps don't send it),
`expectedId` (optional: the Expected code the visitor was pre-registered under — see "Expected visitors and deliveries").
Files: `photo`* (image, ≤ 8 MB), `idPhoto` (image, optional, ≤ 8 MB). `*` = required.

Server rules, in order:
1. Required fields present → else `validation` with `field`.
2. `phone` has at least 10 digits → else `validation`, field `phone`.
3. `site` is in `settings.sites`; `purpose` is in `settings.purposes` → else `validation`.
4. No open visit anywhere with the same last-10-digit phone → else `already_inside` ("This mobile number is already inside. Close the open entry first.").
5. No open visit at the same site with the same badge → else `badge_in_use` ("Pass 12 is with Ravi Kumar (inside since 10:42 am). Use another pass or check them out first.").
6. `hostId`, when given, must be an active employee who can receive visitors/post (`GET /api/hosts`) → else
   `validation`, field `hostId`. `host` (name), `hostPhone`, `hostLocation` are copied from that employee and `dept`
   defaults to theirs. An employee who can sign in → `hostStatus: 'waiting'` and they are notified; one who can't
   (no password yet), or a typed `host` → `hostStatus: 'manual'`.
7. Images are resized server-side (photo max 520 px long edge, ID max 900 px, JPEG q72) and stored on disk.
`guardIn` = the caller. `inAt` = server now.

### Host approval

```
check-in ── hostId (can sign in) ──> waiting ──respond accepted──> accepted ──allow──> let in (allowedAt)
   │                                   │  └────respond declined──> declined  (record the exit; allow is refused)
   │                                   ├──no answer in hostReplyMinutes──> escalatedAt set, security told to call
   │                                   └──allow { viaPhone: true }──> accepted (hostVia 'phone') + let in
   └── typed host ──> manual ──allow { viaPhone: true }──> accepted (hostVia 'phone') + let in
```

- `POST /api/visits/:id/respond`: only the visited host (`hostId` = caller) or an admin (else `forbidden` "This visitor
  is not for you."); only while the visit is open and `waiting` (else `conflict` with the current visit in
  `error.visit` — e.g. security already confirmed by phone). Sets `hostStatus`, `hostAt`, `hostBy`, `hostVia: 'app'`,
  `hostNote`, and tells security.
- `POST /api/visits/:id/allow`: open visits not yet let in (else `conflict`). Without `viaPhone` the host must have
  accepted (else `conflict` "… has not accepted yet. Call them, then use "Confirmed by phone"."). With
  `viaPhone: true` a `waiting` or `manual` visit becomes `accepted` with `hostVia: 'phone'` and is let in at once.
  Declined visits are refused. Sets `allowedAt`, `allowedBy` = caller. Every change is an atomic conditional update,
  so two guards (or a guard and the host) acting at once get `conflict` instead of a double change.
- No reply: the first step to guards of the visitor escalation matrix (default 5 min, an alarm) sets `escalatedAt`
  (once) and notifies the guards on duty (`visit_no_reply`). The host can still answer afterwards. See "Escalations".
- Exit works in every state.

### Exit (`POST /api/visits/:id/exit`)

- `outAt` must be ≥ `inAt` and ≤ now + 5 min → else `validation`, field `outAt`.
- If the visit is already closed, only `admin` may call it (correcting the exit time) → else `conflict`.
- `passReturned` defaults to `true` when the visit has a badge.
- `guardOut` = the caller.

### CSV columns

`Pass no., Entry ID, Name, Mobile, Coming from, Persons, Purpose, Whom to meet, Department, ID type, ID last 4, Vehicle, Items,
Gate, In, Out, Duration, Checked in by, Checked out by, Pass returned, Remarks, Exit remarks, Host reply, Host replied at,
Host message, No-reply alert, Allowed in at, Allowed in by, Terms accepted` ("Yes, version 2, 19 Oct 2026, 10:42 am")
(dates formatted `12 Oct 2026, 10:42 am` in `Asia/Kolkata`; Duration like `1h 05m` / `25m`; Pass returned `Yes`/`No`/blank while inside;
Host reply `Accepted` / `Accepted (confirmed by phone)` / `Declined` / `No reply yet` / `Not on Gatebook`).

## Expected visitors and deliveries

Employees (and security) register a visitor or a delivery before it comes. Security sees it in "Expected", checks the
visitor in from it (details filled in), or marks the delivery received. Counting boxes and photographing the challan for
deliveries comes with material gate passes; until then a delivery is "received" in one tap.

```js
type ExpectedState = 'expected' | 'late' | 'missed' | 'arrived' | 'cancelled';
interface Expected {
  id: string; code: string;  // EX-YYMMDD-XXXX
  kind: 'visitor' | 'delivery';
  site: string;
  name: string;              // visitor, or driver / courier name for a delivery ('' if not known)
  phone: string; company: string;   // company = who the delivery is from, for deliveries
  purpose: string; persons: number; // visitors only
  host: { id: string; name: string };            // visited / receives the delivery
  contact: { id: string; name: string } | null;  // receives the visitor at the location, when not the host
  also: { id: string; name: string }[];          // other employees told when the visitor arrives
  expectedAt: string; untilAt: string | null;
  vehicle: string; items: string; notes: string; // notes = note for security
  preapproved: boolean;      // visitors: let in on arrival without asking the host again (always false for deliveries)
  boxes: number; challanType: string; challanNo: string;  // boxes coming (0 = none)
  status: 'expected' | 'arrived' | 'cancelled';
  state: ExpectedState;      // computed: late = past its window (untilAt, else expectedAt + 2 h) today; missed = an earlier day
  createdBy: { id: string; name: string }; createdAt: string;
  arrivedAt: string | null; arrivedBy: { id: string; name: string } | null;
  visitId: string | null;    // the visit it was checked in as
  cancelledAt: string | null; cancelledBy: { id: string; name: string } | null;
}
```

| method | path | role | notes |
|--------|------|------|-------|
| GET    | `/api/expected` | any signed-in | **paginated**. Gate users see all; others only entries they registered, host, receive (`contact`) or are in `also`. `when` = `all` (default) \| `today` (expectedAt today) \| `upcoming` (status expected, from today on) \| `earlier` (before today, or done today). `kind`, `q` (code, name, phone, company, host / contact name, challanNo, vehicle), `sort` ∈ `expectedAt`, `createdAt` (default `expectedAt`; `-expectedAt` for earlier), `tzOffset` (as overview). → `Paginated<Expected>` plus `counts: { today }` (still expected today, same scope) |
| GET    | `/api/expected/match` | admin, security, viewer | `phone` (last 10 digits) → `{ expected: Expected \| null }`: the open expected **visitor** for that number from yesterday or today (check-in prefill) |
| GET    | `/api/expected/:id` | scoped as the list | → `{ expected }` |
| POST   | `/api/expected` | anyone with `canPreRegister` (not viewers) | JSON: `kind`*, `hostId`*, `expectedAt`*, `untilAt`, `name` (visitor*), `phone`, `company` (delivery*), `purpose` (∈ settings.purposes), `persons`, `contactId`, `alsoIds` (≤ 10), `vehicle`, `items`, `notes`, `preapproved` (default `settings.expectedPreapproved`), `boxes` (delivery: ≥ 1*), `challanType`, `challanNo`. Employees must be active receivers (as `GET /api/hosts`) → else `validation` on that field. `expectedAt` no more than a day in the past; `untilAt` after it. No right → `forbidden`. Notifies security (`expected_new`), and the host / contact / also when someone else registered it. → `201 { expected }` |
| PATCH  | `/api/expected/:id` | security, admin, whoever registered it, the host | any create field except `kind`; only while `expected` (else `conflict`) → `{ expected }` |
| POST   | `/api/expected/:id/cancel` | as PATCH | only while `expected` → `cancelled`; notifies security and the people concerned (`expected_cancelled`) → `{ expected }` |
| POST   | `/api/expected/:id/received` | security, admin | deliveries only (visitors → `conflict`), only while `expected` → `arrived`; notifies the people concerned (`expected_arrived` "📦 Delivery from … received") → `{ expected }` |

Check-in with `expectedId`: the entry must be an open **visitor** entry (else `validation`, field `expectedId`). The visit
stores `expectedId`; the entry becomes `arrived` with `visitId`. If the entry is pre-approved and the visitor is checked in
to its host or contact (a picked employee who can sign in), the visit starts `hostStatus: 'accepted'`,
`hostVia: 'preapproved'` (security still taps "Allowed in"); otherwise the host is asked as usual. The people concerned
who weren't just asked in the app get `expected_arrived` "✅ {name} has arrived" (`data: { type: 'expected', id: code }`:
only the employee the visit was checked in to can open the visit itself).

## Module access

Each person is ticked into the modules they can use (`User.modules`); the role decides which modules can be given and
which start ticked. Admins always have every module. `GET /api/users/modules` (admin) returns the registry:

| key | label | can be given to | default for |
|---|---|---|---|
| `track` | Overview | security, viewer | security, viewer |
| `visitors` | Visitors (check in, Inside now, log) | security, viewer | security, viewer |
| `expected` | Expected | security, viewer, host | all three |
| `post` | Post room / My post | security, viewer, host | all three |
| `material` | Material gate passes / Gate passes | security, viewer, host | all three |
| `keys` | Key register | security, viewer | security, viewer |
| `incidents` | Incidents | security, viewer, host | all three |
| `patrol` | Patrols | security, viewer | security, viewer |
| `gen` | Generator & diesel | security, viewer | security, viewer |

The server refuses unticked modules with `403 forbidden` "You do not have access to this module. Ask the
administrator.": `/api/visits` gate routes need `visitors` or `track`; `/api/stats` needs `track`; `/api/expected`
needs `expected`; `/api/mail` needs `post` — except confirming your own item (`POST /api/mail/:id/confirm`) and an
employee opening their own item (`GET /api/mail/:id`). My visitors (`/api/visits/mine`, `/respond`) always works.
`POST/PATCH /api/users` take `modules: string[]` (unknown or not-allowed keys dropped); a role change without
`modules` resets to the new role's defaults. The user's open apps get `me:updated { user }`.

## Hierarchy

`User.reportsTo` (manager's id, or null = top of the chain), `designation`, `isSupervisor` (gate supervisor; never for
Employees). `POST/PATCH /api/users` validate `reportsTo`: an active other account (`validation`, field `reportsTo`),
and no loops: "{manager} already reports to this person (directly or through others). Pick someone higher up."
`GET /api/users/org` (admin) → `{ users: [{ id, name, role, designation, dept, location, reportsTo, isSupervisor, site, active }] }`
(everyone not deleted, unpaginated) for the org chart. A manager (any level up) can open a visitor of someone who
reports to them with `GET /api/visits/mine/:id`.

## Escalations

```js
interface EscStep { after: number;   // minutes from the clock start (0 = at once), ≤ 30 days
  to: 'guards' | 'person' | 'l1' | 'l2' | 'l3' | 'supervisors' | 'admins' | `user:${id}`;
  repeat: number;    // minutes, 0 = once
  alarm: boolean;    // rings longer (notification `alarm: true`, push data `alarm: '1'`)
  label: string }    // ≤ 120, used as the notification title
```

| matrix | clock starts | open while | person concerned | default steps |
|---|---|---|---|---|
| `visitor` | check-in | host still `waiting`, not let in, inside | the host | +5 min guards (alarm, the no-reply alert) · +15 min l1 |
| `overstay` | `inAt + overstayHours` | inside | the host | at once guards · at once person · +60 min l1 |
| `mail` | `receivedAt` | `lodged` | the receiver | +4 h person · +1 d person · +1 d l1 · +3 d admins |

Targets: **guards** = active security with the matrix's module (`visitors` / `post`), not gate supervisors or anyone
others report to (none like that → all such security); **person**; **l1/l2/l3** = 1–3 hops up `reportsTo` from the
person; **supervisors** = gate supervisors with the module; **admins**; **user:<id>**. Nobody there (level not set,
person not on Gatebook, user gone) → admins, with a note. Every 30 s the server sends each step that has come due
(repeats: once per interval); a step that came due more than 24 h ago is skipped (no backlog after downtime). Each
step goes out once per occurrence (unique log key). Notifications: `escalation` (title = step label), except the
no-reply step (`visit_no_reply`). Data `{ type: 'visit' | 'mail', id }`.

| method | path | role | query | response |
|---|---|---|---|---|
| GET | `/api/escalations` | admin | `days` (1 · 7 · 30 · 90, default 7), `matrix`, page, limit | paginated `EscalationEvent { id, matrix, refType, ref, item, site, step, occurrence, at, title, label, target, targetName, recipients: UserRef[], note, alarm }`, newest first |
| GET | `/api/escalations/export.csv` | admin | same | CSV: Date & time, Module, Gate, Item, Escalation, Sent to, People, Note |

## Rules

`visitorPhotoRequired` / `visitorPassRequired` (check-in: when off, `photo` / `badge` may be missing; visits without a
pass store `badge: ''` and several may be open at once), `mailCoverRequired` (front + back) / `mailPersonPhotoRequired`
(post). Enforced by the server (`validation` on the field) and mirrored by the forms. Missing photos serialize as `''`.

## Terms & agreement

```js
interface Terms { required: boolean;  // visitors must agree at check-in (default false)
  company: string;   // name printed on the agreement ('' = Company.legalName, else name)
  title: string;     // default "Visitor Terms & Confidentiality Agreement"
  body: string;      // plain text; blank line between sections; "1. Heading" on its own line starts a section
  version: number }  // set by the server
```

`Settings.terms`. `PUT /api/settings` takes `terms: { required?, company?, title?, body? }` (title / body not empty);
a changed company, title or body publishes the next version (every version's wording is kept), `required` alone does
not. Defaults: six sections (Confidentiality · Photographs and recordings · Restricted areas · Safety and security · My
details and CCTV · Visitor pass) and the closing "By checking in at the security desk with my photograph…".

| method | path | role | response |
|---|---|---|---|
| GET | `/api/terms/public?v=` | public | `{ version, current, title, company, body, logoUrl }` (`v` = an earlier version) |
| GET | `/api/terms` | signed in | `{ terms, versions: [{ version, at }] }` newest first |
| GET | `/api/terms/sample.pdf` | admin | an agreement with sample visitor details and the current wording |
| POST | `/api/visits/:id/agreement` | security, admin | (re)creates the PDF → `{ visit }`; no accepted terms → `conflict` |

Check-in: multipart `termsAccepted=true`. When `terms.required` and not accepted → `validation`, field `terms`, "The
visitor must agree to the terms and conditions." Accepted → the visit stores `termsVersion` and `termsAt` (= `inAt`),
and right after the response the server renders the agreement PDF (A4: logo, company + address + CIN, title,
"Agreement no. {pass} · Terms version {n}", visitor details beside the check-in photo, the accepted version's
terms, an "Accepted" box with the photo and "Recorded by security") and stores it with the visit (local:
`<32 hex>.pdf` behind `/api/files`, S3: `agreements/…`), then emits `visit:updated`. `Visit` adds
`termsVersion: number | null`, `termsAt: string | null`, `agreementUrl: string | null` (signed, short-lived).

## Material gate passes

Boxes coming in (received by an employee) or going out (sent by an employee, counted and released by security), with
the challan photographed. Module `material` ("Material passes" for security, "Gate passes" for employees). An
employee can always answer their own pass (`/receipt`, `/decision`) even without the module.

```js
interface MaterialPass { id: string;            // MP-YYMMDD-XXXX
  site: string; direction: 'in' | 'out'; mode: 'visitor' | 'gate' | 'pickup';
  boxes: number;                                 // ≥ 1, always items[0] ("Boxes", unit "Box")
  items: { desc, qty, unit, serial, outstanding }[];
  challanType, refNo, ewaybill: string; challanPhotoUrls: string[]; photoUrls: string[];   // signed
  carrier: { name, company, phone, vehicle, visitId, visitBadge, photoUrl };  // a visitor: their check-in photo
  purpose, remarks: string; returnable: boolean; returnDue: string | null; overdue: boolean;
  status: 'awaiting_receipt' | 'disputed' | 'received' | 'awaiting_approval' | 'ready' | 'awaiting_drop'
        | 'ready_for_pickup' | 'rejected' | 'cancelled' | 'pending_return' | 'partly_returned' | 'returned' | 'done';
  visitId, expectedId: string | null;
  authorisedBy: UserRef | null;   // the employee: receiving (IN) / sending or approving (OUT)
  requestedBy: UserRef | null;    // set when an employee made it
  createdBy, approvedBy, receivedBy, checkedBy, droppedBy, releasedBy, returnedBy, cancelledBy: UserRef | null;
  createdAt, approvedAt, receivedAt, checkedAt, droppedAt, releasedAt, returnedAt, cancelledAt: string | null;
  approvalNote, receiptNote, receiptVia ('app' | 'security'), returnNote: string; checkedBoxes, droppedBoxes: number | null;
  pickerName, pickerPhone, pickerCompany: string;
  returns: { at, by, lines: { i, qty }[], note, photoUrl }[] }
```

Initial status — IN: employee named → `awaiting_receipt` (they get `material_in`); none → `received` (returnable:
`pending_return`). OUT: security naming another employee with `mpApprovalInApp` → `awaiting_approval` (they get
`material_approval`); pickup → `awaiting_drop`; with a visitor → `ready` (counted at exit); otherwise counted and
released at once → `done` (returnable: `pending_return`).

| method | path | who | body | effect |
|---|---|---|---|---|
| GET | `/api/material` | module | gate: `tab` today · accept · gate · open · overdue · all (+ `days` 7 · 30 · 120); others: `tab` todo · sent · in · all (own passes only); `dir`, `visitId`, `q`, page, limit, tzOffset | paginated + `counts` (gate: boxesInToday, boxesOutToday, accept, gate, open, overdue; others: todo) |
| GET | `/api/material/visitors` | module | | visitors inside now `{ id, name, company, phone (gate only), badge, site, inAt, host, hostId, mine }` |
| GET | `/api/material/:id`, `/:id/pdf` | gate, or the employee on it | | the pass / the gate pass PDF |
| GET | `/api/material/export.csv` | gate users | list filters | CSV |
| POST | `/api/material` | security, admin, employees (OUT only) | multipart: direction*, boxes*, mode (pickup), visitId, authorisedBy, challanType, refNo, ewaybill, purpose, remarks, returnable, returnDue, items (JSON), carrierName / Company / Phone, vehicle, pickerName* (pickup) / Company / Phone, expectedId; files challan (≤ 4; required by `mpChallanPhotoRequired`), boxPhoto (≤ 6), carrier (required for a non-visitor by `mpCarrierPhotoRequired`) | 201 `{ pass }`. `mpAuthRequiredOut`: OUT needs `authorisedBy`. `expectedId` links the pre-registration (a delivery becomes arrived, `mpId` set). |
| POST | `/:id/receipt` | the receiving employee; security "on paper" (note required) | `{ ok, note }` | `awaiting_receipt` → `received` / `pending_return`; `ok: false` → `disputed` (security gets `material_disputed`). Security can also close a `disputed` one. |
| POST | `/:id/decision` | the employee named (or admin) | `{ approve, note }` | `awaiting_approval` → `ready` / `awaiting_drop` or `rejected`; security gets `material_decision` |
| POST | `/:id/drop` | security, admin | `{ boxes }` (must equal) | `awaiting_drop` → `ready_for_pickup` |
| POST | `/:id/release` | security, admin | multipart `boxes` (must equal), vehicle; pickup: pickerVisitId or pickerName / Phone + carrier photo | `ready` / `ready_for_pickup` → `done` / `pending_return` |
| POST | `/:id/return` | security, admin | multipart `lines` (JSON `[{ i, qty }]`, default all outstanding), note, returnPhoto | → `partly_returned` / `returned` |
| POST | `/:id/cancel` | security, admin, the employee who made it | | only before anything moved → `cancelled` |
| POST | `/:id/remind` | security, admin | | re-notifies the receiving employee |

Wrong counts: "The pass is for N boxes but you counted M. Do not release." / "The pass says N boxes. You counted M."
Realtime: `material:changed { pass }` to the gate and the employees on the pass. Notifications `material_in`,
`material_approval`, `material_decision`, `material_disputed` with `data { type: 'material', id }`. Escalation
matrices `mpreceipt` (IN not accepted: +15 min person, repeat 15 · +60 guards · +120 l1), `mpapproval` (waiting for
approval: +10 person, repeat 10 · +20 guards · +30 l1), `material` (returnable overdue, from `returnDue`: at once
guards and person · +1 d l1 · +3 d admins). Settings: `mpUnits`, `mpPurposesIn`, `mpPurposesOut`, `mpChallanIn`,
`mpChallanOut`, `mpAuthRequiredOut`, `mpApprovalInApp`, `mpChallanPhotoRequired`, `mpCarrierPhotoRequired` (all
`true`), `mpReturnDays` (7, 1–365).

## Key register

Keys kept at a gate desk and every issue / return (the "key diary"). Module `keys` (gate users only). Security and
admins issue and take back keys; admins add and edit keys (web Settings → Keys, or "Add key" on the Key register).

```js
interface Key { id: string; number: string;      // upper-case, unique per site, e.g. "SRV-1"
  name: string;          // what it opens
  location: string; site: string; copies: number;   // 1–20
  restricted: boolean; authorised: string;          // who may take a restricted key (shown when issuing)
  active: boolean;       // false = not in use (hidden from the board, cannot be issued)
  out: KeyMove[] }       // the copies out now
interface KeyMove { id: string; key: { id, number, name, location }; site: string;
  issuedAt: string; issuedBy: UserRef;
  taker: { id: string | null; name: string; phone: string };  // a Gatebook user (gets reminders) or anyone by name
  purpose: string; dueAt: string | null;
  returnedAt: string | null; returnedByName: string; receivedBy: UserRef | null; returnNote: string;
  state: 'out' | 'overdue' | 'returned' | 'returned_late' }
```

| method | path | who | body / query | effect |
|---|---|---|---|---|
| GET | `/api/keys` | gate + module | `site`, `q` | `{ keys, counts { total, out, available, overdue } }` (counts over keys in use) |
| POST | `/api/keys` | admin | `{ number*, name*, site*, location, copies, restricted, authorised }` | 201 `{ key }`. 400 "Key number, what it opens and gate/site are required." · 409 "Key number X already exists at <site>." |
| PATCH | `/api/keys/:id` | admin | any of the above, `active` | `{ key }`. 409 when `copies` < copies out, or `active: false` while out |
| POST | `/api/keys/:id/issue` | security, admin | `{ takerId?, takerName, takerPhone, purpose, dueAt? }` (`takerId` a user or `pace:` id; `dueAt` omitted = now + `keyReturnHours`, `null` = no return time, ≤ 30 days) | 201 `{ move, key }`; the taker (when on Gatebook) gets `key_issued`. 400 "Who is taking the key?" · 409 "Key X is already out." / "All N copies of key X are already out." / "Key X is not in use." (atomic: two guards cannot hand out the last copy) |
| GET | `/api/keymoves` | gate + module | `period` today · 7d (default) · 30d · 90d, `state` all · out · overdue · returned, `site`, `q`, page, limit, tzOffset | paginated diary, newest first, + `counts { out, overdue }`. Keys still out always show. |
| GET | `/api/keymoves/export.csv` | gate + module | same filters | CSV `key-diary.csv` |
| POST | `/api/keymoves/:id/return` | security, admin | `{ returnedByName, note }` (name defaults to the taker) | `{ move, key }`. 409 "This key has already been returned." |

Realtime: `keys:changed { key }` to gate sockets. Setting `keyReturnHours` (default 4, 0–720; 0 = no return time).
Escalation matrix `keys` (clock starts at `dueAt`; holder = the person concerned): at once guards "Key not returned"
and the holder "Please return the key" · +30 min supervisors · +2 h l1 (holder's manager) · +4 h admins.

## Incidents

Anything unsafe or wrong on site, followed up until closed. Module `incidents` (security, viewer, employees; all by
default). Gate users see every incident; others the ones they reported or were given. Viewers are read-only.

```js
interface Incident { id: string;                // IN-YYMMDD-XXXX (also `code`)
  site, location, type: string; severity: 'low' | 'medium' | 'high' | 'critical';
  occurredAt, reportedAt: string; reportedBy: UserRef;
  description, people, actionTaken: string; photoUrls: string[];   // ≤ 3, signed
  status: 'open' | 'in_progress' | 'closed'; assignedTo: UserRef | null;
  closedAt: string | null; closedBy: UserRef | null; resolution: string; source: '' | 'patrol';
  updates: { at, by: UserRef, text, status: string | null, assignTo: UserRef | null }[] }
```

| method | path | who | body / query | effect |
|---|---|---|---|---|
| GET | `/api/incidents` | module | `tab` open (default) · closed · all, `severity`, `site`, `q`, page, limit | paginated, newest first, + `counts { open, closed, critical }` (critical = open high + critical) |
| GET | `/api/incidents/:id` | gate, reporter, assignee | | `{ incident }` (others 404) |
| GET | `/api/incidents/assignees` | security, admin | | people with the module `{ id, name, role, designation, dept }` |
| GET | `/api/incidents/export.csv` | gate | list filters | CSV `incident-log.csv` |
| POST | `/api/incidents` | module, not viewers | multipart: type* (from `incidentTypes`), severity*, description*, site (default first), location, occurredAt (not in the future), people, actionTaken; files `photos` (≤ 3) | 201 `{ incident }`. 400 "Pick the type of incident." · "Pick how serious it is." · "Describe what happened." The matrix's "at once" steps go out immediately. |
| POST | `/:id/update` | security, admin (all); assignee (text, status); reporter (text) | `{ text, status (open · in_progress), assignTo (user id) }` | appends an update. 400 "Write an update, change the status or assign someone." · "<name> does not have the Incidents module." · 403 when not allowed · 409 when closed. The new assignee gets `incident_assigned`; the others on it `incident_update`. |
| POST | `/:id/close` | security, admin, assignee | `{ resolution* }` | → closed; the reporter / assignee get `incident_closed`. 400 "Write how it was resolved." · 409 already closed |
| POST | `/:id/reopen` | admin | `{ text }` | closed → open (update "Reopened") |

Realtime: `incident:changed { incident }` to gate sockets, the reporter and the assignee. Setting `incidentTypes`
(12 defaults: Theft / missing item … Other). Escalation matrices per severity, clock from `reportedAt`, person =
assignee (else reporter), running until closed: `incident_critical` at once supervisors + admins (alarm) · +15 min l1 ·
+1 h l2 (alarm); `incident_high` at once supervisors + admins · +2 h l1 · +8 h l2; `incident_medium` at once admins ·
+1 d l1; `incident_low` at once admins · +3 d l1. Notifications carry `data { type: 'incident', id }` /
`{ type: 'key', id: <move id> }`.

## Patrols

QR checkpoints guards scan on their rounds. Module `patrol` (gate users). Security and admins scan; admins set up
checkpoints and rounds (`code` is only in admin responses — it is printed under the QR; the QR holds
`<web>/?cp=<code>`, which opens Patrols → scan).

```js
interface Checkpoint { id, site, name, location: string; code?: string; photoRequired, active: boolean; sort: number }
interface Round { id, site, name: string; times: string[];   // "HH:MM", display time zone (TZ_DISPLAY)
  windowMin: number;   // time allowed to finish (10–240, default 45)
  onTimeMin: number;   // on time if started within (0–120, default 10)
  checkpointIds: string[]; active: boolean }
interface Slot { key: '<roundId>@<ms>'; roundId, roundName, site: string; at, end, onTimeTill: string;
  status: 'upcoming' | 'open' | 'done' | 'partial' | 'missed';
  logStatus: 'on_time' | 'late' | 'partial' | 'missed' | null;   // once ended
  done, total, lateMin, graceMin: number; late: boolean; firstAt, lastAt: string | null;
  checkpoints: { id, name, scannedAt, by, status }[]; missing: string[]; guards: string[];
  escalations: { at, label, targetName, recipients: string[] }[] }
interface Scan { id, checkpointId; checkpoint: { name, location }; site; by: UserRef; at; status: 'ok' | 'issue';
  note; photoUrl | null; manual: boolean; roundId, roundName, slotAt: string | null }   // null round = extra scan
```

Each start time each day is a slot from `at` to `at + windowMin`. A scan counts towards the open slot of an active round
covering the checkpoint (several: the oldest that still needs it). Late = the first scan came after `onTimeMin`.
Changing a round's times / time allowed / checkpoints / active restarts judging from now (earlier slots are not judged).

| method | path | who | body / query | effect |
|---|---|---|---|---|
| GET | `/api/patrol` | gate + module | | `{ checkpoints, rounds, slots (12 h back … 12 h ahead), now }` |
| GET | `/api/patrol/log` | gate + module | `days` 1 · 7 · 30 · 90, `filter` problems (default) · all | ended slots, newest first: `{ data: Slot[], summary { rounds, onTime, late, partial, missed, avgLateMin } }` |
| GET | `/api/patrol/log.csv` | gate + module | same | CSV `patrol-late-log.csv` |
| GET | `/api/patrol/scans` | gate + module | `days` (3), page, limit | paginated scan log |
| GET | `/api/patrol/lookup?code=` | gate + module | | `{ checkpoint, slot, round, done, total, missing }` (`slot: null` = no round due). 404 "This code does not match any active checkpoint" |
| POST | `/api/patrol/scan` | security, admin | multipart: code*, status ok · issue, note, manual; file `scanPhoto` | 201 `{ scan, checkpoint, slot, round, done, total, missing }`. 400 "Describe the issue in the note" · "A photo is required at this checkpoint" |
| POST / PATCH | `/api/patrol/checkpoints[/:id]` | admin | `{ site*, name*, location, photoRequired, active, sort }`; PATCH `newCode: true` issues a new code | 400 "Name and gate/site are required" |
| POST / PATCH | `/api/patrol/rounds[/:id]` | admin | `{ site*, name*, times* (array or "21:00, 23:00"), windowMin, onTimeMin, checkpointIds*, active }` | 400 "Give the round a name" · "Add at least one start time, like 22:00" · "Pick at least one checkpoint" (same gate) |

An issue scan can be reported as an incident: `POST /api/incidents` with `source: 'patrol'`. Realtime
`patrol:changed {}` to gate sockets. Escalation matrix `patrol` (clock: the round's start time; "person" and levels go
to the guards on duty and the people they report to): at once guards "Round due" · +10 min guards "Round late: alarm
on guard phone" (alarm, repeat every 5) · +30 min l1 "Escalate to supervisor" (alarm) · **when time runs out** l1
"Round missed: supervisor" and admins "Round missed: admin report". Steps after the start fire only while the round
has not started; nothing goes out once it is complete. Matrix steps may carry `end: true` ("when time runs out",
only for `patrol`). Notifications `data { type: 'patrol', id: <slot key> }`.

## Generator & diesel

Generator runs, diesel fills and the weekly level check. Module `gen` (gate users). Security and admins start / stop and
record diesel; admins add and edit generators.

```js
interface Generator { id, name, site, kva: string; tankL, rateLph, lowPct: number; active: boolean;
  running: Run | null;
  estimate: { litres, pct, baseAt, baseL, fills, hours } | null;   // last reading + fills since − run hours × rateLph
  low: boolean;                                                    // estimate below lowPct
  lastCheck: FuelEntry | null; checkDueAt: string; checkOverdue: boolean;
  month: { hours, starts, filledL }; lastHm: number | null }
interface Run { id, genId, genName, site; startAt, stopAt: string | null; hours; reason; hmStart, hmEnd: number | null;
  startedBy, stoppedBy: UserRef | null; note }
interface FuelEntry { id, genId, genName; at; kind: 'fill' | 'check'; litres, levelL, hm, amount: number | null;
  vendor, billNo, note: string; photoUrl: string | null; by: UserRef }
```

| method | path | who | body / query | effect |
|---|---|---|---|---|
| GET | `/api/gen` | gate + module | | `{ generators, reasons, genCheckDays, genCheckHour }` |
| POST / PATCH | `/api/gen/generators[/:id]` | admin | `{ name*, site*, kva, tankL*, rateLph, lowPct (5–90, 30), active }` | 400 "Name, gate/site and tank capacity are required" |
| POST | `/api/gen/:id/start` | security, admin | `{ reason (Power cut), hm }` | 201 `{ run }`. 409 "<name> is already running" (one open run, atomic) |
| POST | `/api/gen/runs/:id/stop` | security, admin | `{ hm, note }` | 400 "Hour meter can't be lower than at start (N)" · 409 already stopped |
| POST | `/api/gen/:id/fuel` | security, admin | multipart: kind fill · check, litres, levelL, hm, vendor, billNo, amount, note, at (not in the future); file `genPhoto` | 201 `{ entry }`. 400 "Enter the litres filled" · "Enter the level reading in litres" · "A photo of the gauge or dipstick is required" · "Level must be between 0 and the tank capacity (N L)" |
| GET | `/api/gen/runs`, `/runs.csv` | gate + module | `days` (30), `genId` | paginated + `hours` / CSV `generator-runs.csv` |
| GET | `/api/gen/fuel`, `/fuel.csv` | gate + module | `days` (90), `genId` | paginated (+ `consumption` between readings with `genId`: `{ from, to, used, hours, fills, lph, high, unexplained }`) / CSV `diesel-log.csv` |

Settings `genCheckDays` (7, 1–60) and `genCheckHour` (9, 0–23): the level check is due that many days after the last
one (or the day the generator was added) at that hour. Realtime `gen:changed {}`. Escalation matrices `gencheck` (clock:
when the check fell due; at once guards · +1 d supervisors · +2 d admins) and `genlow` (clock: when the estimate first
fell below the alert level; at once guards and admins · +4 h l1); runs until a level check / a fill. Notifications
`data { type: 'gen', id }`.

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
  coverPhotoUrl: string;          // cover FRONT (address label side)
  coverBackPhotoUrl: string | null;   // cover BACK — required for new items; null on items logged before it existed
  personPhotoUrl: string;         // delivery person   (all three are signed URLs, see Files)
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
| POST   | `/api/mail`                 | security, admin | `multipart/form-data`: `kind`*, `sender`*, `broughtBy`*, `recipientId` **or** `recipientName`* (one of them), `site` (optional, defaults to the first gate), `refNo`, `carrier`, `broughtPhone`, `pieces` (1–99, default 1), `dept`, `notes`; files `cover`* (front of the cover), `coverBack`* (back of the cover) and `person`* (delivery person) — all three required (images ≤ 8 MB; covers resized to 1100 px, person to 640 px long edge, JPEG q72). Missing one → `validation` with `field` = that name ("Take a photo of the back of the cover."). Rules: `kind` ∈ settings.mailKinds, `site` ∈ settings.sites, `recipientId` must be an active recipient (else `validation`, field `recipientId`). If `recipientId` is set, `dept` defaults to the recipient's dept and `notifiedAt` = now. → `201 { item }` |
| POST   | `/api/mail/:id/remind`      | security, admin | only `lodged` items with a recipient user (else `conflict`) → sets `remindedAt`; recipient gets a `mail:reminder` socket event. → `{ item }` |
| POST   | `/api/mail/:id/handover`    | security, admin | `{ collectedBy*, note? }`; only from `lodged` (else `conflict` "Already handed over"). Status → `handed` if there is a recipient user, otherwise `closed`. → `{ item }` |
| POST   | `/api/mail/:id/confirm`     | the recipient, or admin | `{ ok: boolean, note? }`; only from `handed` (else `conflict` "Security has not handed this over yet", with the current item in `error.item`). `ok:true` → `confirmed`; `ok:false` → `disputed` with `disputeNote` = note or "Receiver says it was not collected". Anyone else → `forbidden` "This item is not addressed to you". → `{ item }` |
| POST   | `/api/mail/:id/resolve`     | security, admin | `{ note* }` (else `validation` "Write what was found or done"); only from `disputed`. → `resolved`. → `{ item }` |

### Post CSV columns
`Entry ID, Type, Tracking / ref no., From (sender), Brought by, Delivery person, Delivery person mobile, For, Department,
Pieces, Gate, Received, Logged by, Status, Handed over, Collected by, Handed by, Receiver confirmed, Dispute, Resolution, Remarks`
(Status labels: To collect, Handed · awaiting confirmation, Handed over, Collected · confirmed, Receiver disputes, Resolved.)

## Feature switches, sign-up and account deletion

Two server switches in `backend/.env` (both default `false`):

| env | effect |
|-----|--------|
| `SIGNUP_ENABLED=true` | apps show **Create an account** on the login screen; `POST /api/auth/signup` works |
| `ACCOUNT_DELETION_ENABLED=true` | apps show **Delete account** in Account / My account; `DELETE /api/auth/me` works |

Account deletion is **forced on whenever sign-up is on** (Apple guideline 5.1.1(v): apps that let people create an
account must let them delete it in the app). Turning a switch off hides the option in the apps (after they next load
the config) and makes the endpoint return `404 { code: 'feature_disabled' }`.

| method | path | auth | notes |
|--------|------|------|-------|
| GET    | `/api/config` | none | → `{ features: { signup: boolean, accountDeletion: boolean } }` (apps load it at start, before login) |
| POST   | `/api/auth/signup` | none | `{ name*, email*, phone*, password* (8–100), dept? }` → `201 { message: "Account requested. An admin will approve it — you can sign in once it's approved." }`. Creates a **pending** user: role `host` (Employee), `active: false`, `status: 'pending'`, `isHost: true`. Email already used → `409 conflict` "An account with this email already exists." Rate-limited: 5 sign-ups per IP per hour → `429 rate_limited`. Notifies all active admins (`event: 'signup_request'`, data `{ type: 'user', id }`, title "🙋 New account request", body "{name} · {email}"). |
| POST   | `/api/users/:id/approve` | admin | pending user only; `{ role?: Role (default 'host') }` → sets `active: true`, `status: 'active'` → `{ user }` |
| POST   | `/api/users/:id/reject` | admin | pending user only → deletes the user → `{ ok: true }` |
| DELETE | `/api/auth/me` | any signed-in | `{ password* }` (wrong → `401` "Wrong password."). The last active admin can't delete themselves (`409 conflict`). Anonymises the account: name "Deleted user", email `deleted-<id>@deleted.invalid`, phone/dept/location cleared, password removed, `isHost: false`, `active: false`, `status: 'deleted'`, `deletedAt` set; deletes the user's devices and notifications; disconnects their sockets. Visit and post records are kept for the gate register's audit trail (people who appear in them stay as stored). → `{ ok: true }` |

Users gain `status: 'active' | 'pending' | 'deleted'` (existing users are `active`). `GET /api/users` accepts
`status=pending|active|deleted` (default: active + pending, deleted hidden). Login for a pending user → `403
forbidden` "Your account is waiting for admin approval."; for a deleted user → the normal "Wrong email or password.".

`AppNotification.event` gains `'signup_request'` and `data.type` gains `'user'` (admins: tapping opens Users →
pending requests).

## In-app notifications (inbox)

Every notification the backend sends (see the table in "Push notifications") is also **stored per user**, whether
or not that user has a phone registered for push. Web and mobile show them in a Notifications screen behind a 🔔
bell with an unread badge. Stored for 90 days (TTL index on `createdAt`).

```js
type NotificationEvent = 'mail_logged' | 'mail_reminder' | 'mail_confirm' | 'mail_disputed' | 'signup_request'
                       | 'visit_arrived' | 'visit_reply' | 'visit_no_reply'
                       | 'expected_new' | 'expected_cancelled' | 'expected_arrived' | 'escalation'
                       | 'material_in' | 'material_approval' | 'material_decision' | 'material_disputed'
                       | 'key_issued' | 'incident_assigned' | 'incident_update' | 'incident_closed';
interface AppNotification {
  id: string;
  event: NotificationEvent;
  title: string;            // same text as the push title, e.g. "📬 Courier for you"
  body: string;             // same text as the push body
  data: { type: 'mail' | 'user' | 'visit' | 'expected'; id: string };   // what to open when tapped (post item, pending user, visit, or Expected entry)
  readAt: string | null;
  createdAt: string;
}
```

| method | path | role | notes |
|--------|------|------|-------|
| GET    | `/api/notifications` | any signed-in | **paginated** (own notifications only). Filters: `unread=true` (only unread). `sort` ∈ `createdAt` (default `-createdAt`). → `Paginated<AppNotification>` plus `unreadCount` (total unread for the caller, ignoring filters) |
| GET    | `/api/notifications/unread-count` | any | → `{ count }` |
| POST   | `/api/notifications/:id/read` | owner | marks one read (idempotent) → `{ notification, unreadCount }`; someone else's id → `not_found` |
| POST   | `/api/notifications/read-all` | any | marks all the caller's unread as read → `{ updated, unreadCount: 0 }` |

Push messages carry the stored notification's id: `data: { type: 'mail', id, notificationId }`, so opening a push
marks that notification read.

Realtime (to the user's own socket room only):

| event | payload |
|-------|---------|
| `notification:new` | `{ notification: AppNotification, unreadCount }` |
| `notification:read` | `{ ids: string[] \| 'all', unreadCount }` (so other open devices/tabs update their badge) |

## TRACK

`GET /api/track?site=` (gate users) — everything at a gate that needs someone to act now, worked out on the server so
the web app and the phones show the same list. Each category is only included for people with its module.

```js
interface TrackItem { id: string;            // stable, e.g. "key_overdue:<moveId>"
  cat: 'visitors' | 'material' | 'keys' | 'patrol' | 'incidents' | 'gen' | 'post';
  kind: 'visit_go' | 'visit_declined' | 'visit_noreply' | 'visit_manual' | 'mail_disputed' | 'material_disputed'
      | 'material_overdue' | 'key_overdue' | 'patrol_late' | 'patrol_due' | 'incident_critical' | 'gen_low' | 'gen_check';
  tone: 'go' | 'bad' | 'slow' | 'phone' | 'alarm';   // alarm = a late patrol round (rings)
  title, body: string; at: string; ref: { type, id }; extra?: object }   // extra: visitId, hostPhone, moveId, phone, slotKey, genId…
```
→ `{ items, counts { total, urgent (not 'phone'), byCat }, cats [{ key, label }], expectedSoon [{ id, kind, title, body,
at }] (next 2 hours, not counted), materialInProgress, now }`.

| cat (module) | items |
|---|---|
| visitors (visitors / track) | host accepted → "Send X in" (go); declined → "X: host declined" (bad); no reply → "No reply in N min: call host" (slow); host not on Gatebook → "Call host to confirm X" (phone) |
| material | employee says not received; returnable material past its date |
| keys | key not returned by its time |
| patrol | a round open now: late → "LATE: Night round 23:00 not started" (alarm); otherwise "Patrol due" (phone) |
| incidents | critical incidents not closed |
| gen | low diesel (bad), level check due (slow) |
| post | receiver says they did not get it |

## Gates (several sites)

`Settings.sites` are the gates. `User.site` is the gate a person works at (`''` = all gates; POST / PATCH
`/api/users` take `site`, 400 "Choose the gate from the list."). Devices pick the gate they are at (web: "This gate" in
the rail / top bar, kept in the browser; phone: Account → This gate); the account's gate is the default, else the first.
Gate-desk lists take `?site=` (TRACK, inside now, overview, post room, material, keys, key diary, incidents, patrols,
patrol log, generator) and new visits / post / material carry `site`. Escalation steps to **guards** and **gate
supervisors** go to those at the item's gate plus those at all gates; patrol / generator "levels" go up from those
guards.

## Web push

Browser alerts ("Alerts on this device"), sent with every stored notification next to the phone (FCM) pushes. The
service worker is `/sw.js` (the web app); payload `{ title, body, data { type, id, notificationId }, alarm }`.
VAPID keys come from `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (contact `VAPID_SUBJECT`), or are made once and kept in
the database. Subscriptions that the push service reports gone (404 / 410) are removed.

| method | path | who | body | effect |
|---|---|---|---|---|
| GET | `/api/push/config` | public | | `{ publicKey }` |
| POST | `/api/push/subscribe` | signed in | `{ subscription: { endpoint, keys { p256dh, auth } }, device: "Windows · Chrome" }` | upsert by endpoint (moves to the caller) |
| POST | `/api/push/unsubscribe` | signed in | `{ endpoint }` | this browser stops getting alerts |
| GET | `/api/push/devices` | signed in | | `{ devices: [{ kind: 'web' \| 'android' \| 'ios', name, lastSeenAt }] }` |
| POST | `/api/push/test` | signed in | | a "🔔 Test alert" to all the caller's devices → `{ sent }` |

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
and `data` for routing: `{ type, id, notificationId }` (strings; `notificationId` = the stored in-app notification). Android: `priority: high`, channel `gatebook_default`.
iOS: `sound: default`.

| event | to | title | body | data |
|-------|----|-------|------|------|
| post logged for a recipient who can sign in | recipient | "📬 {kind} for you" | "From {sender} · collect it at the gate" | `{ type: 'mail', id }` |
| remind | recipient | "⏰ Reminder: {kind} waiting" | "From {sender} · still at the gate" | `{ type: 'mail', id }` |
| handover (status `handed`) | recipient | "✅ Please confirm collection" | "{kind} from {sender} was handed to {collectedBy}. Did you get it?" | `{ type: 'mail', id }` |
| receiver disputes | all active `security` + `admin` users | "⚠️ {recipientName} didn't get it" | "{kind} from {sender} · {disputeNote}" | `{ type: 'mail', id }` |
| visitor checked in for a host who can sign in (`visit_arrived`) | the host | "🚪 {name} is at the gate" | "{company} · {purpose} · tap to accept or decline" | `{ type: 'visit', id }` |
| host accepts / declines (`visit_reply`) | all active `security` + `admin` users | "✅ {host} accepted · send {name} in" / "❌ {host} declined {name}" | "“{hostNote}”", else "Pass {badge} · {hostLocation}" / "Collect pass {badge} and record the exit." | `{ type: 'visit', id }` |
| no reply in `hostReplyMinutes` (`visit_no_reply`) | the guards on duty (see "Escalations") | "⏰ No reply from {host}" | "{name} has waited {duration} · call {hostPhone}" (or "· call the host") | `{ type: 'visit', id }` |

A host opening a `visit` notification goes to their visitor (`GET /api/visits/mine/:id`); gate users open the visit.

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
  waitingAtGate: number;         // open visits not yet let in and not declined
  avgHostReplyMinutes: number | null; // today's visits answered by the host in the app: check-in → answer, 1 decimal
  noReplyToday: number;          // today's visits where security was told the host did not reply
  expectedToday: number;         // pre-registered for today and not arrived yet (status expected)
  keysOut: number;               // key copies out now (key register)
  keysOverdue: number;           // of those, past their return time
  incidentsOpen: number;         // incidents not closed
  patrolsToday: { ended, complete, missed, dueNow: number }; // patrol rounds today
  genRunning: number;            // generators running now
  genAlerts: number;             // generators with low diesel or an overdue level check
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
| `expected:changed` | `{ expected: Expected }` (created, edited, cancelled, arrived) |
| `material:changed` | `{ pass: MaterialPass }` |
| `keys:changed`     | `{ key: Key }` (gate sockets) |
| `incident:changed` | `{ incident: Incident }` (gate, reporter, assignee) |
| `patrol:changed` / `gen:changed` | `{}` (gate sockets; refetch) |

`expected:changed` goes to `admin`/`security`/`viewer` sockets and to the sockets of whoever registered it, the host, the
receiving contact and the "also" list.
Delivery scoping: `visit:*` events go to `admin`/`security`/`viewer` sockets and to the visited host's own socket
(`hostId`; a `host` user only ever receives their own visitors). `mail:*` events go to
`admin`/`security`/`viewer` sockets and to the recipient's own socket (a `host` user only ever receives their own items).

Clients refetch or patch their lists on these events; they never re-render a half-filled check-in form.

## Health

`GET /api/health` → `{ ok: true }` (no auth).
