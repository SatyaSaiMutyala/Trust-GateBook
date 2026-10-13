# Trust Gatebook

Visitor register for gate security: check visitors in with a photo and a pass card, see who is inside, record exits,
review the log and today's numbers.

| folder      | what                                   | stack |
|-------------|----------------------------------------|-------|
| `backend/`  | REST API + realtime updates            | Node 24, Express, JavaScript (ESM), MongoDB (Mongoose), Socket.IO |
| `web/`      | Admin / desk web app                   | React, Vite, JavaScript, MUI (12-column `Grid`) |
| `mobile/`   | Guard app for phones                   | React Native CLI (no Expo), JavaScript, Redux Toolkit, react-native-size-matters |
| `docs/`     | `API.md` (contract all three follow), `SPEC.md` (screens and design) | |

## Quick start

```bash
npm run install:all   # installs backend, web and mobile
npm run dev:backend   # http://localhost:4000 (uses an embedded dev MongoDB if MONGODB_URI is not set)
npm run dev:web       # http://localhost:5173
npm run dev:mobile    # Metro bundler; then `npm --prefix mobile run ios` or `run android`
```

Default admin login: `admin@gatebook.local` / `admin123` (change it via `backend/.env`).
Run `npm --prefix backend run seed` for demo data and a `security@gatebook.local` / `security123` guard account.

Each folder has its own README with details.
