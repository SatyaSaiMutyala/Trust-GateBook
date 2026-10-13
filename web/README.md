# Gatebook web

Browser app for the Gatebook visitor register: check visitors in (photo, details, pass card), see who is inside,
record exits, review the log and today's numbers. Plain JavaScript (JSX) on Vite + React 19 + MUI, React Router,
Socket.IO. Implements `../docs/API.md` and `../docs/SPEC.md`.

## Run

```sh
cp .env.example .env    # optional
npm install
npm run dev             # http://localhost:5173, proxies /api and /socket.io to http://localhost:4000
```

Start the backend (`../backend`) first. On a fresh database it creates `admin@gatebook.local` / `admin123`.

| script            | what it does                     |
|-------------------|----------------------------------|
| `npm run dev`     | Vite dev server with API proxy   |
| `npm run build`   | production build into `dist/`    |
| `npm run preview` | serve `dist/` (same proxy)       |
| `npm run lint`    | ESLint                           |

## Configuration

- `VITE_API_URL`: API origin baked into the build. Empty (default) means same origin: in dev the Vite proxy forwards
  `/api` and `/socket.io`; in production serve the app behind the same host as the API, or set this.
- `API_PROXY_TARGET`: where the dev/preview proxy points (default `http://localhost:4000`).

## Layout

```
src/
  api/          fetch client (ApiError, bearer token, signed photo URL prefixing) and typed endpoints
  auth/         AuthProvider (token in localStorage, /auth/me restore), RequireAuth guard, role helpers
  realtime/     Socket.IO provider + event bus hooks (useRealtimeEvent, useVisitChanges)
  state/        settings, Inside-now and post counts, toasts, check-in / post drafts
                (survive live updates and navigation), details + exit host, post room sheets
  hooks/        usePaginatedQuery, useUrlListParams, useNow (30 s tick), useIsDesktop (861 px)
  theme/        SPEC tokens and the single MUI theme (light + dark via prefers-color-scheme)
  components/   AppShell (rail / top bar + bottom tabs), VisitorCard, StatusChip, PassBadge, ExitDialog,
                VisitorDetailsDrawer, mail/* (post cards, drawer, sheets, issue strip)
  pages/        Login, Check in (+ Pass issued), Inside now, Visitor log, Overview, Settings (+ Users)
  utils/        en-IN formatting, durations, initials, image downscaling
```

## Post room

- Gate users (admin / security / viewer) get **Post room** (`/post`, tabs To collect / Awaiting confirmation / Issues /
  All items with a period, all in the URL), **Log incoming post** (`/post/new`, cover + delivery-person photos, recipient
  type-ahead over `/api/hosts`), Handover and Resolve sheets, the post item drawer, and a red issue strip above every
  gate screen (`/api/mail?status=disputed&limit=5`).
- Employees (role `host`) only see **My post** (`/my-post`: confirm / dispute, waiting at the gate, earlier) and
  **My account** (`/settings`, My details via `PATCH /api/auth/me`). No visitor screens.
- Nav counts come from the `counts` of `GET /api/mail?limit=1`; lists refresh on `mail:*` socket events.

## Single gate

This deployment has one gate, so the app has no gate selector, gate filter, Gate column or Gates settings list, and
never sends `site`; the backend stamps every record with its only gate.

## Lists and pagination

Every list is server-paginated (`{ data, pagination }`) and keeps its state in the URL:

- `useUrlListParams(defaults)` reads/writes `page`, `limit`, `q`, `sort` and filters with `useSearchParams`;
  search is debounced 300 ms; any filter or search change resets `page` to 1; defaults are left out of the URL.
- `usePaginatedQuery(fetcher, params, { append })` fetches, aborts stale requests, and either replaces the page
  (tables) or appends the next page (`loadMore`, phone card lists). `refresh()` reloads the first page without
  dropping pages already loaded; `patch()` updates a loaded item in place on realtime events.
- Visitor log: desktop table with `TablePagination` (10/20/50/100) and sortable Pass no. / Visitor / In / Out;
  phone cards with "Load more". Inside now: cards + "Load more", `?overstay=true` filter. Overview "Needs attention":
  first 5 overstaying visitors + "View all". Users (Settings): `u.`-prefixed params + `TablePagination`.
  Returning-visitor history: 5 per page + "Load more".
- Counts come from `pagination.total` (the nav Inside-now badge is `/api/visits/inside?limit=1`).

## Layout grid

All page layouts use the MUI v2 `Grid` (12 columns), e.g. check-in photo column `{ xs: 12, md: 4, lg: 3 }` beside the
form `{ xs: 12, md: 8, lg: 9 }` with fields `{ xs: 12, sm: 6 }`. The theme's `md` breakpoint is 861 px so Grid and the
phone/desktop shell switch at the same width.
