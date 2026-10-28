# Class QR Registration (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student logs in with their student ID, picks one of the preset classes, a QR code appears, and scanning that QR with a phone registers the student's attendance in a shared database.

**Architecture:** npm-workspaces monorepo: `packages/shared` (class list, zod schemas, DTO types), `apps/api` (Express + Prisma/SQLite: student-ID login, QR generation, signed-scan registration), `apps/web` (Vue 3 + Vite: login, classes, scan pages). The database schema and a **committed seed file** are the sharing mechanism: a teammate who pulls runs `npm run db:setup` and gets the same classes and students. The teacher side (built by a teammate) will extend the same `schema.prisma`.

**Tech Stack:** Node 20+, TypeScript, Express 4, Prisma 6 + SQLite, jsonwebtoken, zod, qrcode, vitest + supertest, Vue 3, Vite, Vue Router 4.

**Spec:** `bitacora-qr-spec.md` — **narrowed by the team**: only student-ID login, class list, QR generation, scan, register. Roles/teacher/admin, history screens, SSE, PWA and passwords are out of scope.

## Global Constraints

- Scope: student-ID login → class list → QR on click → scan registers. No passwords, no roles, no teacher/admin features in this plan.
- Preset classes (exact labels, in this order): `OOP`, `IoT`, `Embedded Systems`, `Advanced Electronics`, `Software Engineering`, `AI`.
- Login is by student ID only ("Insert your student ID"); the ID must exist in the `Student` table (no self-registration). This is a team decision and is **not secure** — note it in the README.
- Identity travels as a JWT (`Authorization: Bearer`), `JWT_EXPIRES_IN` default `12h`.
- QR payload URL: `<APP_BASE_URL>/scan?c=<classCode>&sig=<signature>`; `sig = HMAC-SHA256(key = QR_SECRET, message = classCode)`, base64url, truncated to 16 chars; verified by the backend before registering.
- Business rule (from spec §4): a repeated scan by the same student for the same class within **2 minutes** returns the existing registration (`200`) instead of creating a new one (`201`).
- API (base `/api`): `POST /login`, `GET /me`, `GET /classes`, `GET /classes/:code/qr?format=svg|png` (default `svg`), `POST /registrations`, `GET /registrations`. Errors are `{ error: { code, message } }` with codes `VALIDATION_ERROR` 400, `INVALID_QR` 400, `UNAUTHORIZED` 401, `STUDENT_NOT_FOUND` 404, `CLASS_NOT_FOUND` 404, `NOT_FOUND` 404, `INTERNAL` 500.
- Database: Prisma 6 (pinned; v7 changes configuration) with SQLite at `apps/api/prisma/dev.db` (git-ignored). Students and classes are added by editing committed seed files and running `npm run db:setup`, which must be idempotent (upserts, never deletes).
- Env (api): `PORT` 3000, `DATABASE_URL` `file:./dev.db`, `JWT_SECRET`, `QR_SECRET`, `APP_BASE_URL` (default `http://localhost:5173`). Web calls relative `/api/...` (Vite proxies to the API).
- Mobile-first UI; every async action shows loading, success and error states.

## Review Focus

1. **Unknown / blank student ID** at login → clear error, no token (Task 3).
2. **Wrong-length / empty `sig`** → `INVALID_QR`, never a crash in `timingSafeEqual`; another class's valid sig must not register this class (Task 4).
3. **Two simultaneous scans** from one student for one class → one row (Task 4).
4. **Phone opens `/scan?c=&sig=` while logged out** → login, then back to the same URL with the query intact; `?redirect=//evil.com` is ignored (Task 5).
5. **Re-running the seed** must neither duplicate rows nor delete students a teammate added in the DB (Task 2).

## File Structure

```
package.json  tsconfig.base.json  .gitignore  README.md
packages/shared/src/index.ts                 CLASSES, schemas, DTOs        (Task 1, extended in 2)
apps/api/
  prisma/schema.prisma  students.ts  seedData.ts  seed.ts
  src/{db,errors,auth,lock,qr,app,server}.ts
  src/routes/{auth,classes,registrations}.ts
  tests/{globalSetup,helpers}.ts  *.test.ts
apps/web/
  vite.config.ts  index.html
  src/{main,router,api,style}.* App.vue
  src/lib/{token,scan}.ts
  src/pages/{LoginPage,ClassesPage,ScanPage}.vue
```

---

### Task 1: Monorepo scaffold + shared package — ✅ DONE (commit 9e39fd6)

Produced `@bitacora/shared`: `CLASSES: readonly ClassInfo[]` (codes `oop, iot, embedded-systems, advanced-electronics, software-engineering, ai`), `findClass(code)`, `ScanBody`, types `ClassInfo`, `RegistrationDto`. Root workspaces `apps/*`, `packages/*`; scripts `dev:api`, `dev:web`, `test`.

---

### Task 2: Database — Prisma schema, shared seed files, setup command

**Files:**
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/index.test.ts`, root `package.json` (add `"db:setup": "npm -w apps/api run db:setup"`)
- Create: `apps/api/package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`
- Create: `apps/api/prisma/schema.prisma`, `prisma/students.ts`, `prisma/seedData.ts`, `prisma/seed.ts`, `apps/api/src/db.ts`
- Create: `apps/api/tests/globalSetup.ts`, `tests/helpers.ts`, `tests/seed.test.ts`

**Interfaces:**
- Produces (shared, added): `LoginBody` (zod `{ studentId: string trimmed, min 1 }`), `StudentDto = { studentId: string; name: string }`; `RegistrationDto` becomes `{ id: string; studentId: string; classCode: string; className: string; registeredAt: string }`.
- Produces (api): `prisma: PrismaClient` (`src/db.ts`); `STUDENTS: { id: string; name: string }[]` (`prisma/students.ts` — **the file teammates edit to add students**); `seed(db: PrismaClient): Promise<void>` (`prisma/seedData.ts`); test helpers `resetDb(): Promise<void>` and `seedTestData(): Promise<void>` (classes `oop`, `iot`, `ai`; students `S1` "Student One", `S2` "Student Two") in `tests/helpers.ts`.
- Command: `npm run db:setup` (root) = `prisma db push` + run the seed.

- [ ] **Step 1: Extend shared (TDD).** Add to `packages/shared/src/index.test.ts`:
```ts
import { LoginBody } from './index';
it('LoginBody trims and requires a student id', () => {
  expect(LoginBody.parse({ studentId: '  A01  ' })).toEqual({ studentId: 'A01' });
  expect(LoginBody.safeParse({ studentId: '   ' }).success).toBe(false);
  expect(LoginBody.safeParse({}).success).toBe(false);
});
```
Run `npm -w packages/shared test` → FAIL; then add to `src/index.ts`:
```ts
export const LoginBody = z.object({ studentId: z.string().trim().min(1) });
export interface StudentDto { studentId: string; name: string }
```
and change `RegistrationDto` to include `studentId: string`. Run → PASS.

- [ ] **Step 2: API package setup.**

`apps/api/package.json`:
```json
{
  "name": "@bitacora/api", "version": "0.0.0", "private": true,
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts",
    "test": "vitest run",
    "db:setup": "prisma db push && tsx prisma/seed.ts",
    "db:seed": "tsx prisma/seed.ts"
  }
}
```
Run:
```bash
npm i -w apps/api express@4 cors qrcode dotenv jsonwebtoken @prisma/client@6 @bitacora/shared
npm i -D -w apps/api prisma@6 tsx typescript vitest supertest @types/express@4 @types/cors @types/qrcode @types/jsonwebtoken @types/supertest @types/node
```
`tsconfig.json`: `{ "extends": "../../tsconfig.base.json", "include": ["src", "tests", "prisma"] }`.
`.env.example`:
```
PORT=3000
DATABASE_URL="file:./dev.db"
JWT_SECRET=change-me
QR_SECRET=change-me-too
APP_BASE_URL=http://localhost:5173
```
Copy to `.env` (git-ignored). `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globalSetup: ['./tests/globalSetup.ts'],
    fileParallelism: false, // one shared SQLite file
    env: { DATABASE_URL: 'file:./test.db', JWT_SECRET: 'test-jwt', QR_SECRET: 'test-secret', APP_BASE_URL: 'http://localhost:5173' },
  },
});
```
`tests/globalSetup.ts`:
```ts
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
// Start every run from a fresh throwaway test DB. We delete the file ourselves instead of using
// `prisma db push --force-reset`, which Prisma blocks for AI agents without explicit user consent.
export default function setup() {
  const testDb = path.resolve(__dirname, '../prisma/test.db');
  for (const f of [testDb, `${testDb}-journal`]) fs.rmSync(f, { force: true });
  execSync('npx prisma db push', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: 'file:./test.db' } });
}
```

- [ ] **Step 3: `prisma/schema.prisma`** (the schema teammates will extend; the school student ID is the Student primary key, the class code is the Class primary key):
```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "sqlite"; url = env("DATABASE_URL") }

model Student {
  id            String         @id            // school student ID, e.g. "A01000001"
  name          String
  createdAt     DateTime       @default(now())
  registrations Registration[]
}
model Class {
  code          String         @id            // e.g. "oop"
  name          String
  registrations Registration[]
}
model Registration {
  id           String   @id @default(uuid())
  studentId    String
  classCode    String
  registeredAt DateTime @default(now())
  student      Student  @relation(fields: [studentId], references: [id])
  class        Class    @relation(fields: [classCode], references: [code])
  @@index([studentId, classCode, registeredAt])
}
```
`src/db.ts`: `export const prisma = new PrismaClient();`

- [ ] **Step 4: Write the failing tests** `tests/seed.test.ts` and `tests/helpers.ts`.

`tests/helpers.ts`:
```ts
import { prisma } from '../src/db';

export async function resetDb() {
  await prisma.registration.deleteMany();
  await prisma.student.deleteMany();
  await prisma.class.deleteMany();
}
export async function seedTestData() {
  await resetDb();
  await prisma.class.createMany({ data: [
    { code: 'oop', name: 'OOP' }, { code: 'iot', name: 'IoT' }, { code: 'ai', name: 'AI' },
  ] });
  await prisma.student.createMany({ data: [
    { id: 'S1', name: 'Student One' }, { id: 'S2', name: 'Student Two' },
  ] });
}
```
`tests/seed.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CLASSES } from '@bitacora/shared';
import { prisma } from '../src/db';
import { resetDb } from './helpers';
import { seed } from '../prisma/seedData';
import { STUDENTS } from '../prisma/students';

beforeEach(resetDb);

describe('seed', () => {
  it('creates the six classes and every student from students.ts', async () => {
    await seed(prisma);
    expect((await prisma.class.findMany({ orderBy: { code: 'asc' } })).map(c => c.name).sort())
      .toEqual(CLASSES.map(c => c.name).sort());
    expect(await prisma.student.count()).toBe(STUDENTS.length);
  });
  it('is idempotent and keeps rows a teammate added directly in the DB', async () => {
    await seed(prisma);
    await prisma.student.create({ data: { id: 'EXTRA-1', name: 'Added by teammate' } });
    await seed(prisma);
    expect(await prisma.class.count()).toBe(6);
    expect(await prisma.student.count()).toBe(STUDENTS.length + 1);
    expect(await prisma.student.findUnique({ where: { id: 'EXTRA-1' } })).not.toBeNull();
  });
  it('updates a changed student name instead of duplicating', async () => {
    await seed(prisma);
    await prisma.student.update({ where: { id: STUDENTS[0].id }, data: { name: 'Stale' } });
    await seed(prisma);
    expect((await prisma.student.findUniqueOrThrow({ where: { id: STUDENTS[0].id } })).name).toBe(STUDENTS[0].name);
  });
  it('STUDENTS has unique ids and at least 3 entries', () => {
    expect(new Set(STUDENTS.map(s => s.id)).size).toBe(STUDENTS.length);
    expect(STUDENTS.length).toBeGreaterThanOrEqual(3);
  });
});
```
- [ ] **Step 5: Run to verify failure** — `npx prisma generate` in `apps/api`, then `npm -w apps/api test` → FAIL (seed modules missing).
- [ ] **Step 6: Implement.**
  - `prisma/students.ts`: header comment "Add students here, then run `npm run db:setup`", exporting `STUDENTS: { id: string; name: string }[]` with 5 demo entries (`A01000001`…`A01000005`, plausible fake names).
  - `prisma/seedData.ts`: `seed(db)` upserts every `CLASSES` entry (`where: { code }`, `update: { name }`) and every `STUDENTS` entry (`where: { id }`, `update: { name }`). Never deletes.
  - `prisma/seed.ts`: `import 'dotenv/config'`; run `seed(new PrismaClient())`, log counts, `process.exit(0)`; exit 1 on error.
- [ ] **Step 7: Run to verify pass** — `npm -w apps/api test` → all pass; `npm -w packages/shared test` → pass.
- [ ] **Step 8: Real setup check** — from the repo root `npm run db:setup`; then `sqlite`-free check: run it twice and confirm no error and the second run is a no-op.
- [ ] **Step 9: Commit** — `git add . && git commit -m "feat(api): prisma schema, shared seed files, db:setup"` (trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`).

---

### Task 3: API — server skeleton, error envelope, student-ID login

**Files:**
- Create: `apps/api/src/{errors,auth,app,server}.ts`, `src/routes/auth.ts`
- Test: `apps/api/tests/auth.test.ts`

**Interfaces:**
- Consumes: `prisma`, `LoginBody`, `StudentDto`, test helpers `seedTestData`.
- Produces: `class HttpError(status: number, code: string, message: string)`; `notFound` and `errorHandler` middlewares (`src/errors.ts`); `signToken(studentId: string): string` and `authenticate: RequestHandler` (sets `req.student: { id: string; name: string }`; `401 UNAUTHORIZED` for missing/invalid/expired token or a student that no longer exists) (`src/auth.ts`); `createApp(): Express` (mounts routers under `/api`, then `notFound`, `errorHandler`); routes `POST /api/login` → `{ token, student: StudentDto }`, `GET /api/me` (auth) → `{ student }`.

- [ ] **Step 1: Write the failing test** `tests/auth.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { seedTestData } from './helpers';

const app = createApp();
beforeEach(seedTestData);

describe('POST /api/login', () => {
  it('logs in an existing student id and returns token + student', async () => {
    const res = await request(app).post('/api/login').send({ studentId: 'S1' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.student).toEqual({ studentId: 'S1', name: 'Student One' });
  });
  it('trims whitespace around the id', async () => {
    const res = await request(app).post('/api/login').send({ studentId: '  S2 ' });
    expect(res.body.student.studentId).toBe('S2');
  });
  it('unknown id → 404 STUDENT_NOT_FOUND and no token', async () => {
    const res = await request(app).post('/api/login').send({ studentId: 'NOPE' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('STUDENT_NOT_FOUND');
    expect(res.body.token).toBeUndefined();
  });
  it('blank or missing id → 400 VALIDATION_ERROR', async () => {
    expect((await request(app).post('/api/login').send({ studentId: '   ' })).body.error.code).toBe('VALIDATION_ERROR');
    expect((await request(app).post('/api/login').send({})).status).toBe(400);
  });
  it('malformed JSON → 400 VALIDATION_ERROR envelope', async () => {
    const res = await request(app).post('/api/login').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400); expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/me', () => {
  it('returns the logged-in student', async () => {
    const { body } = await request(app).post('/api/login').send({ studentId: 'S1' });
    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${body.token}`);
    expect(res.body.student).toEqual({ studentId: 'S1', name: 'Student One' });
  });
  it('no token, garbage token → 401 UNAUTHORIZED', async () => {
    expect((await request(app).get('/api/me')).body.error.code).toBe('UNAUTHORIZED');
    expect((await request(app).get('/api/me').set('Authorization', 'Bearer x.y.z')).status).toBe(401);
  });
  it('token of a student that was deleted → 401', async () => {
    const { body } = await request(app).post('/api/login').send({ studentId: 'S2' });
    const { prisma } = await import('../src/db');
    await prisma.student.delete({ where: { id: 'S2' } });
    expect((await request(app).get('/api/me').set('Authorization', `Bearer ${body.token}`)).status).toBe(401);
  });
  it('unknown route → 404 NOT_FOUND envelope', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404); expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
```
- [ ] **Step 2: Run to verify failure** — FAIL (modules missing).
- [ ] **Step 3: Implement.**
  - `src/errors.ts`: `HttpError`; `notFound` → `next(new HttpError(404,'NOT_FOUND','Route not found'))`; `errorHandler(err,_req,res,_next)`: `HttpError` → its status/code/message; `err.type === 'entity.parse.failed'` → 400 `VALIDATION_ERROR` "Invalid JSON"; else `console.error(err)` and 500 `INTERNAL`. Always `{ error: { code, message } }`.
  - `src/auth.ts`: `signToken` = `jwt.sign({}, JWT_SECRET, { subject: studentId, expiresIn: JWT_EXPIRES_IN ?? '12h' })`; `authenticate` async middleware (catch → `next(err)`): reads `Bearer` token, `jwt.verify`, loads the `Student` by `sub`, sets `req.student`, else `HttpError(401,'UNAUTHORIZED','Please sign in')`. Env read at call time (`process.env.JWT_SECRET ?? 'dev-secret'`). Add `src/types.d.ts` augmenting `Express.Request` with `student?: { id: string; name: string }`.
  - `src/routes/auth.ts`: `POST /login` — `LoginBody.safeParse` fail → 400 `VALIDATION_ERROR`; `findUnique({ where: { id } })` none → 404 `STUDENT_NOT_FOUND` ("That student ID is not registered"); respond `{ token: signToken(id), student: { studentId: id, name } }`. `GET /me` with `authenticate`.
  - `src/app.ts`: `createApp()` with `cors()`, `express.json()`, `app.use('/api', authRouter)`, `notFound`, `errorHandler`. `src/server.ts`: `import 'dotenv/config'`; listen on `0.0.0.0:PORT`.
- [ ] **Step 4: Run to verify pass** — `npm -w apps/api test` → all pass.
- [ ] **Step 5: Commit** — `git add . && git commit -m "feat(api): student-id login, jwt auth, error envelope"`.

---

### Task 4: API — classes, QR generation, registration

**Files:**
- Create: `apps/api/src/{qr,lock}.ts`, `src/routes/classes.ts`, `src/routes/registrations.ts`
- Modify: `apps/api/src/app.ts` (mount both routers under `/api`)
- Test: `apps/api/tests/qr.test.ts`, `tests/lock.test.ts`, `tests/registrations.test.ts`

**Interfaces:**
- Consumes: `prisma`, `authenticate`, `HttpError`, `ScanBody`, `RegistrationDto`, helpers `seedTestData`, `signToken`.
- Produces: `signClass(code: string): string`, `verifySig(code: string, sig: string): boolean`, `buildScanUrl(code: string): string` (`src/qr.ts`); `withLock<T>(key: string, fn: () => Promise<T>): Promise<T>` (`src/lock.ts`, serialises calls per key in one process; keeps working after a task throws). Routes: `GET /api/classes` → `{ items: ClassInfo[] }` (ordered as in shared `CLASSES`, falling back to name for unknown extras); `GET /api/classes/:code/qr`; `POST /api/registrations` (auth) → `201`/`200 { registration: RegistrationDto }`; `GET /api/registrations` (auth) → `{ items: RegistrationDto[] }` (own, newest first).

- [ ] **Step 1: Write the failing tests**

`tests/qr.test.ts` — same cases as: deterministic 16-char `^[A-Za-z0-9_-]{16}$` signature; `verifySig('oop', signClass('oop'))` true; `verifySig('ai', signClass('oop'))` false; `verifySig('oop','abc')` and `verifySig('oop','')` return `false` without throwing; `buildScanUrl('oop')` parses to origin `http://localhost:5173`, pathname `/scan`, `c=oop`, `sig=signClass('oop')`.

`tests/lock.test.ts`:
```ts
import { it, expect } from 'vitest';
import { withLock } from '../src/lock';

it('runs same-key tasks one at a time, in order', async () => {
  const log: string[] = [];
  const task = (n: string, ms: number) => withLock('k', async () => {
    log.push(`start ${n}`); await new Promise(r => setTimeout(r, ms)); log.push(`end ${n}`);
  });
  await Promise.all([task('a', 20), task('b', 1)]);
  expect(log).toEqual(['start a', 'end a', 'start b', 'end b']);
});
it('keeps going after a task throws', async () => {
  await expect(withLock('k2', async () => { throw new Error('x'); })).rejects.toThrow('x');
  await expect(withLock('k2', async () => 5)).resolves.toBe(5);
});
```
`tests/registrations.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { signClass } from '../src/qr';
import { signToken } from '../src/auth';
import { seedTestData } from './helpers';

const app = createApp();
const auth = (id: string) => ({ Authorization: `Bearer ${signToken(id)}` });
const register = (id: string, body: object) => request(app).post('/api/registrations').set(auth(id)).send(body);
beforeEach(seedTestData);

describe('GET /api/classes and QR', () => {
  it('lists classes from the database', async () => {
    const res = await request(app).get('/api/classes');
    expect(res.body.items.map((c: any) => c.code).sort()).toEqual(['ai', 'iot', 'oop']);
  });
  it('QR is an SVG by default and a PNG with format=png', async () => {
    const svg = await request(app).get('/api/classes/oop/qr');
    expect(svg.headers['content-type']).toContain('image/svg+xml');
    expect(svg.text).toContain('<svg');
    const png = await request(app).get('/api/classes/oop/qr?format=png').buffer().parse((r, cb) => {
      const c: Buffer[] = []; r.on('data', d => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c)));
    });
    expect(png.headers['content-type']).toContain('image/png');
    expect((png.body as Buffer).subarray(1, 4).toString()).toBe('PNG');
  });
  it('unknown class QR → 404 CLASS_NOT_FOUND', async () => {
    const res = await request(app).get('/api/classes/nope/qr');
    expect(res.status).toBe(404); expect(res.body.error.code).toBe('CLASS_NOT_FOUND');
  });
});

describe('POST /api/registrations', () => {
  it('registers the logged-in student with a valid signature', async () => {
    const res = await register('S1', { classCode: 'oop', sig: signClass('oop') });
    expect(res.status).toBe(201);
    expect(res.body.registration).toMatchObject({ studentId: 'S1', classCode: 'oop', className: 'OOP' });
    expect(await prisma.registration.count()).toBe(1);
  });
  it('requires login → 401', async () => {
    const res = await request(app).post('/api/registrations').send({ classCode: 'oop', sig: signClass('oop') });
    expect(res.status).toBe(401);
  });
  it('tampered, wrong-length and empty sigs → 400 INVALID_QR and nothing saved', async () => {
    for (const sig of ['AAAAAAAAAAAAAAAA', 'abc']) {
      const res = await register('S1', { classCode: 'oop', sig });
      expect(res.status).toBe(400); expect(res.body.error.code).toBe('INVALID_QR');
    }
    expect((await register('S1', { classCode: 'oop', sig: '' })).body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.registration.count()).toBe(0);
  });
  it("another class's valid sig does not register the requested class", async () => {
    const res = await register('S1', { classCode: 'ai', sig: signClass('oop') });
    expect(res.body.error.code).toBe('INVALID_QR');
  });
  it('unknown class → 404 CLASS_NOT_FOUND; missing fields → 400 VALIDATION_ERROR', async () => {
    expect((await register('S1', { classCode: 'nope', sig: 'x' })).body.error.code).toBe('CLASS_NOT_FOUND');
    expect((await register('S1', {})).body.error.code).toBe('VALIDATION_ERROR');
  });
  it('same student + class within 2 minutes returns the existing registration (200)', async () => {
    const a = await register('S1', { classCode: 'oop', sig: signClass('oop') });
    const b = await register('S1', { classCode: 'oop', sig: signClass('oop') });
    expect(b.status).toBe(200); expect(b.body.registration.id).toBe(a.body.registration.id);
  });
  it('a registration older than 2 minutes does not block a new one', async () => {
    await prisma.registration.create({ data: { studentId: 'S1', classCode: 'oop', registeredAt: new Date(Date.now() - 3 * 60_000) } });
    expect((await register('S1', { classCode: 'oop', sig: signClass('oop') })).status).toBe(201);
  });
  it('different student or different class is not a duplicate', async () => {
    await register('S1', { classCode: 'oop', sig: signClass('oop') });
    expect((await register('S2', { classCode: 'oop', sig: signClass('oop') })).status).toBe(201);
    expect((await register('S1', { classCode: 'ai', sig: signClass('ai') })).status).toBe(201);
  });
  it('two simultaneous scans yield exactly one registration', async () => {
    const [a, b] = await Promise.all([
      register('S1', { classCode: 'oop', sig: signClass('oop') }),
      register('S1', { classCode: 'oop', sig: signClass('oop') }),
    ]);
    expect(a.body.registration.id).toBe(b.body.registration.id);
    expect(await prisma.registration.count()).toBe(1);
  });
});

describe('GET /api/registrations', () => {
  it("lists only the caller's registrations, newest first", async () => {
    await prisma.registration.create({ data: { studentId: 'S1', classCode: 'oop', registeredAt: new Date(Date.now() - 600_000) } });
    await prisma.registration.create({ data: { studentId: 'S1', classCode: 'ai', registeredAt: new Date(Date.now() - 300_000) } });
    await prisma.registration.create({ data: { studentId: 'S2', classCode: 'iot' } });
    const res = await request(app).get('/api/registrations').set(auth('S1'));
    expect(res.body.items.map((r: any) => r.classCode)).toEqual(['ai', 'oop']);
    expect(res.body.items[0]).toMatchObject({ studentId: 'S1', className: 'AI' });
  });
  it('requires login → 401', async () => {
    expect((await request(app).get('/api/registrations')).status).toBe(401);
  });
});
```
- [ ] **Step 2: Run to verify failure** — FAIL.
- [ ] **Step 3: Implement.**
  - `src/qr.ts`:
```ts
import { createHmac, timingSafeEqual } from 'node:crypto';
const secret = () => process.env.QR_SECRET ?? 'dev-secret';
const baseUrl = () => process.env.APP_BASE_URL ?? 'http://localhost:5173';

export const signClass = (code: string) =>
  createHmac('sha256', secret()).update(code).digest('base64url').slice(0, 16);

export function verifySig(code: string, sig: string): boolean {
  const expected = Buffer.from(signClass(code));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
export function buildScanUrl(code: string): string {
  const url = new URL('/scan', baseUrl());
  url.searchParams.set('c', code);
  url.searchParams.set('sig', signClass(code));
  return url.toString();
}
```
  - `src/lock.ts`: a `Map<string, Promise<unknown>>` of tails; each call chains `prev.catch(noop).then(fn)`, stores a never-rejecting tail, removes the map entry in `finally` when it is still the tail.
  - `src/routes/classes.ts`: `GET /classes` (public); `GET /classes/:code/qr` (public, because `<img>` cannot send headers — the image only encodes a signed URL): class from `prisma.class.findUnique` else `HttpError(404,'CLASS_NOT_FOUND',…)`; `format === 'png'` → `QRCode.toBuffer(url, { width: 512, margin: 2 })` with `res.type('png')`, else `QRCode.toString(url, { type: 'svg', margin: 2 })` with `res.type('image/svg+xml')`. Async handlers forward errors with `next`.
  - `src/routes/registrations.ts`: `POST /registrations` (`authenticate`) — `ScanBody.safeParse` fail → `HttpError(400,'VALIDATION_ERROR','classCode and sig are required')`; class lookup → 404 `CLASS_NOT_FOUND`; `!verifySig` → `HttpError(400,'INVALID_QR','This QR code is not valid')`; then, inside `withLock(`${student.id}:${classCode}`, …)`, `findFirst` for the same student + class with `registeredAt >= now − 2 min` (ordered newest first) → return it with `200`, else `create` → `201`. Both respond `{ registration }` mapped by a shared `toDto(r: Registration & { class: Class }): RegistrationDto` (`registeredAt` as ISO string, `className` from the class). `GET /registrations` (`authenticate`) → `{ items }` own rows, `orderBy registeredAt desc`, include `class`.
  - Mount both routers in `app.ts` before `notFound`.
- [ ] **Step 4: Run to verify pass** — `npm -w apps/api test` → whole API suite passes.
- [ ] **Step 5: Smoke check with curl** — run `npm run dev:api` (after `npm run db:setup`); `curl -s -X POST localhost:3000/api/login -H 'content-type: application/json' -d '{"studentId":"A01000001"}'` returns a token; `curl -s localhost:3000/api/classes/oop/qr | head -c 100` starts with `<svg`.
- [ ] **Step 6: Commit** — `git add . && git commit -m "feat(api): class list, QR generation, signed-scan registration"`.

---

### Task 5: Web — login, classes + QR, scan landing

**Files:**
- Create: `apps/web/{package.json,tsconfig.json,index.html,vite.config.ts,env.d.ts}`
- Create: `apps/web/src/{main.ts,App.vue,router.ts,api.ts,style.css}`
- Create: `apps/web/src/lib/{token,scan}.ts`, `src/lib/scan.test.ts`
- Create: `apps/web/src/pages/{LoginPage,ClassesPage,ScanPage}.vue`

**Interfaces:**
- Consumes: shared types `ClassInfo`, `RegistrationDto`, `StudentDto`.
- Produces (`src/lib/scan.ts`, pure):
  - `parseScanQuery(q: Record<string, unknown>): { classCode: string; sig: string } | null` — non-empty string `c` and `sig`, else `null`
  - `errorMessage(code: string): string` — distinct friendly text for `INVALID_QR`, `CLASS_NOT_FOUND`, `STUDENT_NOT_FOUND`, `UNAUTHORIZED`, `NETWORK`, `VALIDATION_ERROR`; generic "Something went wrong. Please try again." otherwise
  - `safeRedirect(raw: unknown): string | null` — only same-origin paths: starts with `/`, not `//`, no `\`
  - `resolveGuard(loggedIn: boolean, to: { fullPath: string; meta: { public?: boolean } }): true | string` — logged out on a non-public route → `/login?redirect=<encodeURIComponent(fullPath)>`; logged in on `/login` (public) → `'/'`; otherwise `true`
- Produces (`src/lib/token.ts`): `getToken(): string | null`, `setToken(t: string | null): void` — `localStorage` key `bitacora.token`, every access in try/catch.
- Produces (`src/api.ts`): `class ApiError(code, message)`; `login(studentId): Promise<{ token: string; student: StudentDto }>`; `getMe()`; `getClasses(): Promise<ClassInfo[]>`; `registerScan(classCode, sig): Promise<RegistrationDto>`; `getRegistrations(): Promise<RegistrationDto[]>`; `qrUrl(code): string` (`/api/classes/<encoded>/qr`); `setUnauthorizedHandler(fn)`. All requests use `fetch`, send `Authorization: Bearer` when a token exists, map network failure to `ApiError('NETWORK', …)`, and call the unauthorized handler on `401` for every request except `login`.

- [ ] **Step 1: Package setup.** Run:
```bash
npm i -w apps/web vue vue-router @bitacora/shared
npm i -D -w apps/web vite @vitejs/plugin-vue vue-tsc typescript vitest
```
`package.json` scripts: `"dev": "vite"`, `"build": "vue-tsc --noEmit && vite build"`, `"test": "vitest run"`. `tsconfig.json` extends base with `"jsx": "preserve"`, include `src/**/*.ts`, `src/**/*.vue`, `env.d.ts`. `env.d.ts` references `vite/client` and shims `*.vue`. `index.html` has the viewport meta and title "Class Registration". `vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()],
  server: { host: true, allowedHosts: true, proxy: { '/api': 'http://localhost:3000' } },
});
```
- [ ] **Step 2: Write the failing test** `src/lib/scan.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { parseScanQuery, errorMessage, safeRedirect, resolveGuard } from './scan';

describe('parseScanQuery', () => {
  it('extracts c and sig', () => {
    expect(parseScanQuery({ c: 'oop', sig: 'abc' })).toEqual({ classCode: 'oop', sig: 'abc' });
  });
  it('returns null when missing, empty, or not a plain string', () => {
    for (const q of [{}, { c: 'oop' }, { sig: 'x' }, { c: '', sig: '' }, { c: ['a', 'b'], sig: 'x' }])
      expect(parseScanQuery(q)).toBeNull();
  });
});
describe('errorMessage', () => {
  it('has distinct friendly messages per known code and a generic fallback', () => {
    const known = ['INVALID_QR', 'CLASS_NOT_FOUND', 'STUDENT_NOT_FOUND', 'UNAUTHORIZED', 'NETWORK', 'VALIDATION_ERROR'].map(errorMessage);
    expect(new Set(known).size).toBe(6);
    expect(errorMessage('WHATEVER')).toMatch(/something went wrong/i);
  });
});
describe('safeRedirect', () => {
  it('accepts same-origin paths (query kept) and rejects open redirects', () => {
    expect(safeRedirect('/scan?c=oop&sig=abc')).toBe('/scan?c=oop&sig=abc');
    for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', '', undefined, ['/a']])
      expect(safeRedirect(bad)).toBeNull();
  });
});
describe('resolveGuard', () => {
  const to = (fullPath: string, pub = false) => ({ fullPath, meta: { public: pub } });
  it('logged out on a protected route → /login with the full path encoded', () => {
    const r = resolveGuard(false, to('/scan?c=oop&sig=abc')) as string;
    expect(r.startsWith('/login?redirect=')).toBe(true);
    expect(decodeURIComponent(r.split('redirect=')[1])).toBe('/scan?c=oop&sig=abc');
  });
  it('logged out on a public route passes; logged in passes; logged in on /login goes home', () => {
    expect(resolveGuard(false, to('/login', true))).toBe(true);
    expect(resolveGuard(true, to('/'))).toBe(true);
    expect(resolveGuard(true, to('/login', true))).toBe('/');
  });
});
```
- [ ] **Step 3: Run to verify failure** — `npm -w apps/web test` → FAIL.
- [ ] **Step 4: Implement `src/lib/scan.ts`, `src/lib/token.ts`, `src/api.ts`** per Interfaces. Run tests → PASS.
- [ ] **Step 5: Implement app shell and pages.**
  - `router.ts`: routes `/login` (`meta.public`), `/` (ClassesPage), `/scan` (ScanPage), catch-all → `/`. `beforeEach(to => resolveGuard(!!getToken(), to))`.
  - `main.ts`: mount `App.vue` with the router; `setUnauthorizedHandler(() => { setToken(null); router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } }); })`; import `style.css`.
  - `App.vue`: header "Class Registration" + `<RouterView/>`.
  - `LoginPage.vue`: one input labelled "Insert your student ID" (autofocus, `inputmode="text"`, `autocapitalize="off"`), submit button disabled while empty or loading; calls `login`; on success `setToken(token)`, store the student name for the greeting (`localStorage` in try/catch or re-fetch via `getMe`), then `router.replace(safeRedirect(route.query.redirect) ?? '/')`; on error shows `errorMessage(code)` inline.
  - `ClassesPage.vue`: on mount `getMe()` (greeting "Hi, {name}" + "Log out" button that clears the token and goes to `/login`) and `getClasses()` (loading / error-with-retry / empty states) rendered as a grid of large buttons. Clicking a class sets `selected` and opens a modal with the class name, `<img :src="qrUrl(selected.code)">` (alt "QR code for {name}", loading state until `@load`, error + "Retry" with cache-busting `?t=` on `@error`), the text "Scan this QR with your phone camera to register", and "Close" (also Escape/backdrop). Below the grid, "Your registrations": `getRegistrations()` on mount and every 3 s (cleared on unmount), each row class name + `toLocaleString()` time; empty state "No registrations yet".
  - `ScanPage.vue`: on mount `parseScanQuery(route.query)`; `null` → error "This link is missing its QR data. Scan a class QR code again." with a link to `/`. Otherwise `loading` ("Registering…") → `registerScan(...)` → `success` ("Registered ✅", class name, `registeredAt` via `toLocaleString()`) or `error` with `errorMessage(code)` and a "Try again" button. Link "Back to classes".
  - `style.css`: mobile-first; CSS variables; centered `max-width: 640px`; class grid two columns ≥ 480 px, one below; buttons min-height 56 px; `.card`, `.btn`, `.error`, `.success`, `.spinner`; modal overlay; QR image `width: min(320px, 80vw)` on white.
- [ ] **Step 6: Verify.** `npm -w apps/web test` and `npm -w apps/web run build` pass. Manual (API + web running, `npm run db:setup` done): `/` redirects to `/login`; unknown ID shows the error; `A01000001` logs in and lands on the classes grid; click "OOP" → QR appears; open the QR's URL in a second browser profile (or private window) → redirected to login, enter `A01000001` → back on `/scan?...` → "Registered ✅"; the first window's "Your registrations" shows the new row within ~3 s; editing one char of `sig` shows the "not valid" message; `/login?redirect=//evil.com` logs in and lands on `/`.
- [ ] **Step 7: Commit** — `git add . && git commit -m "feat(web): login, classes with QR, scan landing"`.

---

### Task 6: README and teammate onboarding

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`** with: overview (what the MVP does and what is excluded); **setup** (`npm install`, `cp apps/api/.env.example apps/api/.env`, `npm run db:setup`); **run** (`npm run dev:api`, `npm run dev:web`); **demo student IDs** (from `apps/api/prisma/students.ts`); **sharing data with teammates** — students and classes live in `apps/api/prisma/students.ts` and `packages/shared/src/index.ts`; after adding one, commit it; a teammate runs `git pull && npm install && npm run db:setup` and sees them (the seed only upserts, never deletes); the DB file `apps/api/prisma/dev.db` is not committed; the schema is `apps/api/prisma/schema.prisma` and the teacher side extends it (new models/migrations go there; coordinate edits to that file); **phone testing** — same Wi-Fi, set `APP_BASE_URL=http://<LAN-IP>:5173` in `apps/api/.env`, restart the API, open `http://<LAN-IP>:5173` on the computer, click a class, scan with the phone's native camera app, enter the student ID on the phone the first time; endpoints table; **limitations** — login by student ID alone is not secure (anyone who knows an ID can sign in), the QR image is public and not time-limited, one JWT per browser.
- [ ] **Step 2: Full run** — `npm test` from the root → shared, api and web suites all pass; `npm run db:setup` twice is a no-op the second time.
- [ ] **Step 3: Walk the flow on a real phone** and note the result in the commit message: login → class → QR → phone scan → "Registered ✅" → row visible under "Your registrations"; tampered link shows the error.
- [ ] **Step 4: Commit** — `git add README.md && git commit -m "docs: README and teammate onboarding"`.

---

## Self-Review

**Requirement coverage:** student-ID login → Tasks 2 (Student table, seed), 3 (login/JWT), 5 (login page); preset classes → Tasks 1, 2 (seeded), 4 (`GET /classes`), 5 (grid); QR on click → Tasks 4, 5; scan registers with identity → Tasks 4, 5; shared DB visible to teammates after pull → Task 2 (`students.ts`, `db:setup`, idempotent seed) and Task 6 (docs); spec §4 2-minute duplicate rule and §5.1 signature retained.

**Type consistency:** `StudentDto`, `LoginBody`, `RegistrationDto.studentId` added in Task 2 and used by Tasks 3–5; `seedTestData`, `resetDb` (Task 2) used in Tasks 3–4; `signToken`/`authenticate` (Task 3) used in Task 4; `signClass` signature (one argument) identical in tests and implementation; error codes in Task 3/4 match `errorMessage` in Task 5.

**Rulings for the executor:** Student primary key is the school ID and Class primary key is the class code (no surrogate IDs); `GET /api/classes/:code/qr` and `GET /api/classes` are public; `GET /api/registrations` returns only the caller's rows; Prisma pinned to v6.
