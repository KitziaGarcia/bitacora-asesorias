# Bitacora de asesorias - class QR registration MVP

A student logs in with their school ID, picks a class, and a QR code for that class is shown. Another student (or the same one on a phone) scans it with the phone camera, lands on the app, and the visit is registered against their ID. They can see their registrations in the app.

**Included:** student-ID login (JWT), preset class list, per-class signed QR, scan landing page, "Your registrations" list, 2-minute duplicate guard (re-scanning the same class within 2 minutes returns the existing row).
**Not included:** the teacher side, real authentication, time-limited QR codes.

Monorepo layout:

- `apps/api` - Express + Prisma (SQLite)
- `apps/web` - Vue 3 + Vite
- `packages/shared` - shared types, zod schemas and the preset `CLASSES`

## Setup

```sh
npm install
cp apps/api/.env.example apps/api/.env
npm run db:setup
```

`db:setup` creates the SQLite file `apps/api/prisma/dev.db`, applies the schema and seeds classes and students. It is idempotent (upserts only, never deletes), so run it as often as you like.

## Run

In two terminals:

```sh
npm run dev:api   # http://localhost:3000
npm run dev:web   # http://localhost:5173 (proxies /api to :3000)
```

Tests (all workspaces): `npm test`

## Demo student IDs

From `apps/api/prisma/students.ts`:

| ID | Name |
| --- | --- |
| A01000001 | Ana Martinez |
| A01000002 | Luis Hernandez |
| A01000003 | Sofia Ramirez |
| A01000004 | Carlos Lopez |
| A01000005 | Valeria Torres |

Preset classes (`packages/shared/src/index.ts`): `oop`, `iot`, `embedded-systems`, `advanced-electronics`, `software-engineering`, `ai`.

## Sharing data with teammates

Students live in `apps/api/prisma/students.ts` and classes in `packages/shared/src/index.ts`. The database file `apps/api/prisma/dev.db` is **not** committed.

1. Add a student or class to the file above and commit it.
2. A teammate runs `git pull && npm install && npm run db:setup` and sees it (the seed only upserts, never deletes).

The schema is `apps/api/prisma/schema.prisma`. The teacher side extends it: new models and migrations go there, so coordinate edits to that file.

## Phone testing

1. Put the computer and the phone on the same Wi-Fi.
2. Find the computer's LAN IP (`ipconfig` on Windows).
3. In `apps/api/.env` set `APP_BASE_URL=http://<LAN-IP>:5173` and restart the API (the QR encodes this URL).
4. On the computer open `http://<LAN-IP>:5173`, log in, and click a class to show its QR.
5. Scan it with the phone's native camera app. The first time, enter your student ID on the phone (the phone has its own browser session).

If the phone cannot connect, allow Node/ports 5173 and 3000 through the Windows firewall.

## Endpoints

All under `/api`. Errors use the envelope `{ "error": { "code", "message" } }`.

| Method | Path | Auth | Description / statuses |
| --- | --- | --- | --- |
| POST | `/login` | none | Body `{ studentId }`. 200 `{ token, student }`; 400 `VALIDATION_ERROR`; 404 `STUDENT_NOT_FOUND` |
| GET | `/me` | Bearer JWT | 200 `{ student }`; 401 if missing/invalid token |
| GET | `/classes` | none | 200 `{ items: [{ code, name }] }` |
| GET | `/classes/:code/qr` | none | SVG QR (`?format=png` for PNG); 404 `CLASS_NOT_FOUND` |
| POST | `/registrations` | Bearer JWT | Body `{ classCode, sig }`. 201 created; 200 duplicate within 2 min (existing row); 400 `VALIDATION_ERROR` / `INVALID_QR`; 404 `CLASS_NOT_FOUND`; 401 |
| GET | `/registrations` | Bearer JWT | 200 `{ items }`, only the caller's rows, newest first; 401 |

Web routes: `/login`, `/` (classes), `/scan?c=<code>&sig=<sig>` (scan landing).

## Limitations

- Login by student ID alone is **not secure**: anyone who knows an ID can sign in as that student.
- The QR image endpoint is public and the QR is not time-limited (the signature only proves the link was issued by this server for that class).
- One JWT per browser (stored locally); logging in as someone else on the same browser replaces it.

## Status

The UI pages have been verified only by unit tests, type-check/build, and `curl` through the Vite proxy. They have **not** yet been exercised in a real browser or on a phone. Manual check to run: login -> click a class -> QR appears -> scan with the phone -> "Registered" shown -> the row appears under "Your registrations"; then edit the `sig` in the scanned link and confirm an error is shown.

## Notes

- `apps/web` pins TypeScript `~5.9` and type-checks through `apps/web/typecheck.cjs`, because the repo root uses TypeScript 7, which breaks `vue-tsc`. Use `npm -w apps/web run build` (it runs the type-check first).
- The API test database is `apps/api/prisma/test.db`; it is reset by deleting that file, never `dev.db`.
- On Windows, `npm run db:setup` may print an `EPERM ... query_engine-windows.dll.node` rename error from Prisma client generation if another Node process (e.g. `dev:api`) is running. The schema push and seed still complete; stop the dev servers if you need to regenerate the client.
