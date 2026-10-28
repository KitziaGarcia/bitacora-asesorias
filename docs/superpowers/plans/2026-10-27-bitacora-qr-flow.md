# Automated Advising Log — Frontend + QR Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Vue 3 PWA (Student / Teacher / Admin) plus a minimal TypeScript API so a student can scan a signed cubicle QR, a teacher confirms the session live, and it lands in both histories.

**Architecture:** npm-workspaces monorepo: `packages/shared` (zod schemas, DTO types, error codes — consumed as TS source), `apps/api` (Express + Prisma, SQLite for dev/test, JWT auth, SSE hub), `apps/web` (Vue 3 + Vite + Pinia + Router + `vite-plugin-pwa`). The web app talks only through `src/api/*` service files; mocked reports live behind the same layer.

**Tech Stack:** Node 20+, TypeScript, Express 4, Prisma (>= 6.2, needed for enums on SQLite), zod, jsonwebtoken, bcryptjs, qrcode, vitest + supertest, Vue 3, Vite, Pinia, Vue Router 4, axios, qr-scanner, vite-plugin-pwa.

**Spec:** `bitacora-qr-spec.md`

## Global Constraints

- Base path `/api/v1`; all responses JSON; errors are `{ error: { code, message } }`.
- Roles: `STUDENT`, `TEACHER`, `ADMIN`. Session status: `PENDING | CONFIRMED | REJECTED`. Method: `QR | MANUAL`.
- QR payload URL: `https://<host>/scan?c=<cubicleCode>&sig=<signature>`; `sig = HMAC-SHA256(cubicleCode, qrSecret)`, base64url, truncated to 16 chars. Rotating `qrSecret` invalidates old QRs.
- A student can't have two `PENDING` sessions; only the assigned teacher confirms/rejects; `durationMinutes = endedAt - startedAt` (computed, never stored); a duplicate scan within **2 minutes** for the same student + cubicle returns the existing session.
- Error codes (exact): `INVALID_QR` 400, `CUBICLE_NOT_FOUND` 404, `NO_TEACHER_ASSIGNED` 409, `SESSION_ALREADY_PENDING` 409, `FORBIDDEN` 403, `UNAUTHORIZED` 401.
- Student name/ID/email come from the user record, never typed in the QR flow.
- Camera needs HTTPS or localhost; `<video>` needs `playsinline` (iOS); prefer `facingMode: 'environment'`; stop the stream on unmount and after a successful read.
- Teacher must see a new pending session in ≤ 5 s (SSE + 5 s polling safety net).
- Every async action shows loading, success and error states. Mobile-first. Unauthenticated users go to `/login?redirect=...`.
- PWA: manifest with name, 192/512 icons, `display: standalone`, theme color.
- Mocked sections (`/admin/reports`) are visibly labeled "Coming soon / sample data".
- Env: api `DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN=8h, APP_BASE_URL, CORS_ORIGIN`; web `VITE_API_URL`.
- Seed: 1 admin, 3 teachers, 10 students (known passwords), 3 cubicles each with a teacher, historical sessions in every status.

## Review Focus

Failure modes the spec implies but doesn't spell out (each has a test in the owning task):

1. **Double scan race** — two simultaneous `/sessions/scan` calls from one student must yield one session, not two (Task 5).
2. **Malformed `sig`** — a signature of the wrong length must return `INVALID_QR`, not crash `timingSafeEqual` (Task 3).
3. **Open redirect** — `/login?redirect=//evil.com` must be ignored (Task 9).
4. **Double / foreign confirm** — confirming an already-confirmed session, or another teacher's session, must fail with 409 / `FORBIDDEN` (Task 6).
5. **Rejected students aren't locked out** — a `REJECTED` or `CONFIRMED` (older than 2 min) session must not block a new scan (Task 5).

---

## File Structure

```
package.json  tsconfig.base.json  .gitignore  README.md
packages/shared/src/index.ts                  zod schemas, DTOs, error codes
apps/api/
  prisma/schema.prisma  seed.ts  seedData.ts
  src/app.ts  server.ts
  src/lib/{env,prisma,errors,jwt,qr,lock,events}.ts
  src/middleware/{auth,error}.ts
  src/services/{auth,sessions,cubicles}.service.ts
  src/routes/{auth,sessions,cubicles}.ts
  tests/{globalSetup.ts,helpers.ts,*.test.ts}
apps/web/
  vite.config.ts  index.html  pwa-assets.config.ts  public/logo.svg
  src/{main.ts,App.vue,style.css}
  src/lib/{token,errors,parseScanUrl}.ts
  src/api/{http,auth,sessions,cubicles,reports}.ts
  src/stores/auth.ts
  src/router/{index,guard}.ts
  src/composables/{useAsync,useQrScanner,useSessionStream}.ts
  src/components/{AppShell,StatusBadge,SessionList,ConfirmModal}.vue
  src/pages/{LoginPage}.vue  student/*  teacher/*  admin/*
```

---

### Task 1: Monorepo scaffold + shared package

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`
- Create: `packages/shared/package.json`, `packages/shared/src/index.ts`, `packages/shared/src/index.test.ts`

**Interfaces:**
- Produces (`@bitacora/shared`): `RoleSchema, SessionStatusSchema, RegistrationMethodSchema, LoginBody, ScanBody, ManualBody, ConfirmBody, PageQuery, QrFormatQuery`; types `Role, SessionStatus, RegistrationMethod, UserDto, SessionDto, CubicleDto, Paginated<T>, SessionEvent, ErrorCode`; `ERROR_STATUS: Record<ErrorCode, number>`.

- [ ] **Step 1: Root files**

`package.json`:
```json
{
  "name": "bitacora-asesorias",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev:api": "npm -w apps/api run dev",
    "dev:web": "npm -w apps/web run dev",
    "test": "npm -ws --if-present run test"
  }
}
```
`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true, "esModuleInterop": true, "skipLibCheck": true,
    "noEmit": true, "resolveJsonModule": true
  }
}
```
`.gitignore`: `node_modules`, `dist`, `*.db`, `*.db-journal`, `.env`, `dev-dist`.

`packages/shared/package.json`:
```json
{
  "name": "@bitacora/shared", "version": "0.0.0", "private": true,
  "main": "src/index.ts", "types": "src/index.ts",
  "scripts": { "test": "vitest run" }
}
```
Run: `npm i -w packages/shared zod && npm i -D -w packages/shared vitest typescript`

- [ ] **Step 2: Write the failing test** `packages/shared/src/index.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { ConfirmBody, PageQuery, ERROR_STATUS } from './index';

describe('shared schemas', () => {
  it('ConfirmBody requires a non-blank topic', () => {
    expect(ConfirmBody.safeParse({ topic: '   ', approved: true }).success).toBe(false);
    expect(ConfirmBody.safeParse({ topic: 'Derivadas', approved: true }).success).toBe(true);
  });
  it('PageQuery coerces and defaults', () => {
    expect(PageQuery.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(PageQuery.parse({ page: '2', pageSize: '5' })).toEqual({ page: 2, pageSize: 5 });
  });
  it('maps error codes to the spec HTTP statuses', () => {
    expect(ERROR_STATUS).toMatchObject({
      INVALID_QR: 400, CUBICLE_NOT_FOUND: 404, NO_TEACHER_ASSIGNED: 409,
      SESSION_ALREADY_PENDING: 409, FORBIDDEN: 403, UNAUTHORIZED: 401,
    });
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm -w packages/shared test` — Expected: FAIL (`./index` has no exports).

- [ ] **Step 4: Implement `packages/shared/src/index.ts`**

```ts
import { z } from 'zod';

export const RoleSchema = z.enum(['STUDENT', 'TEACHER', 'ADMIN']);
export const SessionStatusSchema = z.enum(['PENDING', 'CONFIRMED', 'REJECTED']);
export const RegistrationMethodSchema = z.enum(['QR', 'MANUAL']);
export type Role = z.infer<typeof RoleSchema>;
export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export type RegistrationMethod = z.infer<typeof RegistrationMethodSchema>;

export const LoginBody = z.object({ email: z.string().email(), password: z.string().min(1) });
export const ScanBody = z.object({ cubicleCode: z.string().min(1), sig: z.string().min(1) });
export const ManualBody = z.object({ cubicleCode: z.string().min(1) });
export const ConfirmBody = z.object({
  topic: z.string().trim().min(1),
  approved: z.boolean(),
  observations: z.string().trim().optional(),
});
export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export const QrFormatQuery = z.object({ format: z.enum(['png', 'svg']).default('png') });

export const ERROR_STATUS = {
  INVALID_QR: 400,
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CUBICLE_NOT_FOUND: 404,
  SESSION_NOT_FOUND: 404,
  NO_TEACHER_ASSIGNED: 409,
  SESSION_ALREADY_PENDING: 409,
  INVALID_STATE: 409,
  INTERNAL: 500,
} as const;
export type ErrorCode = keyof typeof ERROR_STATUS;

export interface UserDto { id: string; role: Role; name: string; email: string; studentId: string | null }
export interface SessionDto {
  id: string; status: SessionStatus; method: RegistrationMethod;
  topic: string | null; observations: string | null;
  startedAt: string; endedAt: string | null; confirmedAt: string | null;
  durationMinutes: number | null;
  student: { id: string; name: string; email: string; studentId: string | null };
  teacher: { id: string; name: string };
  cubicle: { id: string; code: string };
}
export interface CubicleDto { id: string; code: string; teacher: { id: string; name: string } | null }
export interface Paginated<T> { items: T[]; total: number; page: number; pageSize: number }
export interface SessionEvent { type: 'session.created' | 'session.updated'; session: SessionDto }
```

- [ ] **Step 5: Run to verify pass**

Run: `npm -w packages/shared test` — Expected: 3 passed.

- [ ] **Step 6: Commit**
```bash
git add . && git commit -m "chore: monorepo scaffold and shared schemas"
```

---

### Task 2: API scaffold, Prisma schema, error handling, test harness

**Files:**
- Create: `apps/api/package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/lib/{env,prisma,errors}.ts`, `src/middleware/error.ts`, `src/app.ts`, `src/server.ts`
- Create: `apps/api/tests/{globalSetup.ts,helpers.ts,health.test.ts}`

**Interfaces:**
- Produces: `env` (`DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, APP_BASE_URL, CORS_ORIGIN, PORT`); `prisma: PrismaClient`; `class AppError(code: ErrorCode, message: string)` with `.status`; `createApp(): Express`; `asyncHandler(fn)` (exported from `lib/errors.ts`); test helper `resetDb()`.

- [ ] **Step 1: Package setup**

`apps/api/package.json`:
```json
{
  "name": "@bitacora/api", "version": "0.0.0", "private": true,
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts",
    "test": "vitest run",
    "db:push": "prisma db push",
    "seed": "tsx prisma/seed.ts"
  }
}
```
Run:
```bash
npm i -w apps/api express@4 cors zod jsonwebtoken bcryptjs qrcode dotenv @prisma/client @bitacora/shared
npm i -D -w apps/api prisma tsx typescript vitest supertest @types/express@4 @types/cors @types/jsonwebtoken @types/qrcode @types/supertest @types/node
```
(`bcryptjs` is used instead of native `bcrypt`: same API, no native build on Windows.)

`tsconfig.json`: `{ "extends": "../../tsconfig.base.json", "include": ["src", "tests", "prisma"] }`.

`.env.example`:
```
DATABASE_URL="file:./dev.db"
JWT_SECRET="change-me"
JWT_EXPIRES_IN="8h"
APP_BASE_URL="http://localhost:5173"
CORS_ORIGIN="http://localhost:5173"
PORT=3000
```
Copy to `.env`.

- [ ] **Step 2: `prisma/schema.prisma`** — the spec's model verbatim, with this header (SQLite for dev/test; switch `provider` to `postgresql` for production):

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "sqlite"; url = env("DATABASE_URL") }
```
followed by the three enums and the `User`, `Cubicle`, `AdvisingSession` models exactly as in spec §4.

- [ ] **Step 3: Write the failing test** `tests/health.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

describe('app', () => {
  it('GET /api/v1/health returns ok', async () => {
    const res = await request(createApp()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
  it('unknown route returns the error envelope', async () => {
    const res = await request(createApp()).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBeDefined();
  });
});
```
Test harness — `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globalSetup: ['./tests/globalSetup.ts'],
    fileParallelism: false, // one shared SQLite file
    env: {
      DATABASE_URL: 'file:./test.db', JWT_SECRET: 'test-secret', JWT_EXPIRES_IN: '8h',
      APP_BASE_URL: 'http://localhost:5173', CORS_ORIGIN: 'http://localhost:5173',
    },
  },
});
```
`tests/globalSetup.ts`:
```ts
import { execSync } from 'node:child_process';
export default function setup() {
  execSync('npx prisma db push --force-reset --skip-generate', {
    stdio: 'inherit', env: { ...process.env, DATABASE_URL: 'file:./test.db' },
  });
}
```
Run `npx prisma generate` once from `apps/api` before tests.

`tests/helpers.ts` (grown by later tasks) starts with:
```ts
import { prisma } from '../src/lib/prisma';
export async function resetDb() {
  await prisma.advisingSession.deleteMany();
  await prisma.cubicle.deleteMany();
  await prisma.user.deleteMany();
}
```

- [ ] **Step 4: Run to verify failure** — `npm -w apps/api test` → FAIL (modules missing).

- [ ] **Step 5: Implement**

`src/lib/env.ts`:
```ts
import 'dotenv/config';
const need = (k: string, dev?: string) => {
  const v = process.env[k] ?? (process.env.NODE_ENV === 'production' ? undefined : dev);
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
};
export const env = {
  DATABASE_URL: need('DATABASE_URL', 'file:./dev.db'),
  JWT_SECRET: need('JWT_SECRET', 'dev-secret'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '8h',
  APP_BASE_URL: need('APP_BASE_URL', 'http://localhost:5173'),
  CORS_ORIGIN: need('CORS_ORIGIN', 'http://localhost:5173'),
  PORT: Number(process.env.PORT ?? 3000),
};
```
`src/lib/prisma.ts`: `export const prisma = new PrismaClient();`

`src/lib/errors.ts`:
```ts
import { ERROR_STATUS, type ErrorCode } from '@bitacora/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export class AppError extends Error {
  status: number;
  constructor(public code: ErrorCode, message: string) {
    super(message);
    this.status = ERROR_STATUS[code];
  }
}
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };
```
`src/middleware/error.ts`: export `notFound` (throws/forwards `AppError('CUBICLE_NOT_FOUND'...)` is wrong — use a 404 envelope with code `SESSION_NOT_FOUND`? No: respond `404 { error: { code: 'NOT_FOUND', message } }` directly) and `errorHandler(err, req, res, next)`:
- `AppError` → `res.status(err.status).json({ error: { code: err.code, message: err.message } })`
- `ZodError` → 400 `VALIDATION_ERROR` with `err.issues` summarised in `message`
- otherwise `console.error` and 500 `INTERNAL`.

`src/app.ts`: `createApp()` → `express()`, `cors({ origin: env.CORS_ORIGIN })`, `express.json()`, `GET /api/v1/health → { ok: true }`, (routers mounted in later tasks), `notFound`, `errorHandler`.

`src/server.ts`: `createApp().listen(env.PORT, () => console.log(...))`.

- [ ] **Step 6: Run to verify pass** — `npm -w apps/api test` → 2 passed.

- [ ] **Step 7: Commit** — `git add . && git commit -m "feat(api): scaffold, prisma schema, error envelope"`

---

### Task 3: QR signing, per-key lock, event hub

**Files:**
- Create: `apps/api/src/lib/{qr,lock,events,jwt}.ts`
- Test: `apps/api/tests/{qr,lock,events}.test.ts`

**Interfaces:**
- Produces:
  - `signCubicle(code: string, secret: string): string` (16-char base64url)
  - `verifySig(code: string, secret: string, sig: string): boolean`
  - `buildScanUrl(code: string, secret: string): string`
  - `withLock<T>(key: string, fn: () => Promise<T>): Promise<T>` — serialises calls per key (single process)
  - `publish(userId: string, event: SessionEvent): void`, `subscribe(userId: string, fn: (e: SessionEvent) => void): () => void`
  - `signToken(u: { id: string; role: Role }): string`, `verifyToken(t: string): { sub: string; role: Role }`

- [ ] **Step 1: Write the failing tests**

`tests/qr.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { signCubicle, verifySig, buildScanUrl } from '../src/lib/qr';

describe('qr signing', () => {
  it('produces a deterministic 16-char base64url signature', () => {
    const s = signCubicle('C-12', 'secret');
    expect(s).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(signCubicle('C-12', 'secret')).toBe(s);
  });
  it('verifies the right sig and rejects other code / other secret', () => {
    const s = signCubicle('C-12', 'secret');
    expect(verifySig('C-12', 'secret', s)).toBe(true);
    expect(verifySig('C-13', 'secret', s)).toBe(false);
    expect(verifySig('C-12', 'rotated', s)).toBe(false);
  });
  it('returns false (does not throw) for a sig of the wrong length', () => {
    expect(verifySig('C-12', 'secret', 'abc')).toBe(false);
    expect(verifySig('C-12', 'secret', '')).toBe(false);
  });
  it('builds /scan?c=&sig= on APP_BASE_URL', () => {
    const u = new URL(buildScanUrl('C-12', 'secret'));
    expect(u.origin).toBe('http://localhost:5173');
    expect(u.pathname).toBe('/scan');
    expect(u.searchParams.get('c')).toBe('C-12');
    expect(u.searchParams.get('sig')).toBe(signCubicle('C-12', 'secret'));
  });
});
```
`tests/lock.test.ts`:
```ts
import { it, expect } from 'vitest';
import { withLock } from '../src/lib/lock';

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
`tests/events.test.ts`:
```ts
import { it, expect, vi } from 'vitest';
import { publish, subscribe } from '../src/lib/events';

it('delivers only to the subscribed user and stops after unsubscribe', () => {
  const fn = vi.fn(); const other = vi.fn();
  const off = subscribe('u1', fn); subscribe('u2', other);
  const ev = { type: 'session.created', session: {} } as any;
  publish('u1', ev);
  expect(fn).toHaveBeenCalledWith(ev); expect(other).not.toHaveBeenCalled();
  off(); publish('u1', ev);
  expect(fn).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run to verify failure** — `npm -w apps/api test -- qr lock events` → FAIL.

- [ ] **Step 3: Implement**

`src/lib/qr.ts`:
```ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env';

export const signCubicle = (code: string, secret: string) =>
  createHmac('sha256', secret).update(code).digest('base64url').slice(0, 16);

export function verifySig(code: string, secret: string, sig: string): boolean {
  const expected = Buffer.from(signCubicle(code, secret));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export function buildScanUrl(code: string, secret: string): string {
  const url = new URL('/scan', env.APP_BASE_URL);
  url.searchParams.set('c', code);
  url.searchParams.set('sig', signCubicle(code, secret));
  return url.toString();
}
```
`src/lib/lock.ts` — keep a `Map<string, Promise<unknown>>` of tails; each call chains `prev.catch(noop).then(fn)`, stores a never-rejecting tail, and deletes the map entry in `finally` if it is still the tail.

`src/lib/events.ts` — one `EventEmitter` (`setMaxListeners(0)`), `publish = (id, e) => bus.emit(id, e)`, `subscribe` does `bus.on(id, fn)` and returns `() => bus.off(id, fn)`.

`src/lib/jwt.ts` — `jsonwebtoken`: `signToken` uses `jwt.sign({ role }, env.JWT_SECRET, { subject: id, expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] })`; `verifyToken` returns `jwt.verify(...) as { sub: string; role: Role }`.

- [ ] **Step 4: Run to verify pass** — all three files pass.

- [ ] **Step 5: Commit** — `git commit -am "feat(api): qr signing, lock, event hub, jwt"` (after `git add .`)

---

### Task 4: Auth (login, me, middleware)

**Files:**
- Create: `apps/api/src/middleware/auth.ts`, `src/services/auth.service.ts`, `src/routes/auth.ts`, `src/types/express.d.ts`
- Modify: `src/app.ts` (mount `/api/v1/auth`), `tests/helpers.ts`
- Test: `tests/auth.test.ts`

**Interfaces:**
- Consumes: `signToken/verifyToken` (Task 3), `AppError`, `asyncHandler`, `LoginBody`.
- Produces: `authenticate: RequestHandler` (sets `req.user: { id: string; role: Role }`; accepts `Authorization: Bearer` or, only on path `/stream`, `?token=` since `EventSource` can't set headers); `requireRole(...roles: Role[]): RequestHandler` (→ `FORBIDDEN`); `toUserDto(u: User): UserDto`; test helpers `makeWorld()` returning `{ admin, teacher, teacher2, student, student2, cubicle, tokens: { admin, teacher, teacher2, student, student2 } }`.

- [ ] **Step 1: Extend `tests/helpers.ts`**

```ts
import bcrypt from 'bcryptjs';
import { signToken } from '../src/lib/jwt';

export const PASSWORD = 'Demo1234!';
export async function makeWorld() {
  await resetDb();
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const mk = (role: 'ADMIN' | 'TEACHER' | 'STUDENT', n: string, studentId?: string) =>
    prisma.user.create({ data: { role, name: n, email: `${n}@uabc.test`, studentId, passwordHash } });
  const [admin, teacher, teacher2, student, student2] = await Promise.all([
    mk('ADMIN', 'admin'), mk('TEACHER', 'teacher'), mk('TEACHER', 'teacher2'),
    mk('STUDENT', 'student', 'A0100001'), mk('STUDENT', 'student2', 'A0100002'),
  ]);
  const cubicle = await prisma.cubicle.create({ data: { code: 'C-01', teacherId: teacher.id, qrSecret: 'secret-c01' } });
  const t = (u: { id: string; role: any }) => signToken(u);
  return { admin, teacher, teacher2, student, student2, cubicle,
    tokens: { admin: t(admin), teacher: t(teacher), teacher2: t(teacher2), student: t(student), student2: t(student2) } };
}
export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
```

- [ ] **Step 2: Write the failing test** `tests/auth.test.ts`

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { makeWorld, bearer, PASSWORD } from './helpers';

const app = createApp();
let w: Awaited<ReturnType<typeof makeWorld>>;
beforeAll(async () => { w = await makeWorld(); });

describe('auth', () => {
  it('logs in and returns accessToken + user without passwordHash', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'student@uabc.test', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user).toMatchObject({ role: 'STUDENT', email: 'student@uabc.test', studentId: 'A0100001' });
    expect(res.body.user.passwordHash).toBeUndefined();
  });
  it('wrong password → 401 UNAUTHORIZED', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'student@uabc.test', password: 'bad' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
  it('GET /auth/me returns the current user; no token → 401', async () => {
    const ok = await request(app).get('/api/v1/auth/me').set(bearer(w.tokens.teacher));
    expect(ok.body.user.role).toBe('TEACHER');
    const no = await request(app).get('/api/v1/auth/me');
    expect(no.status).toBe(401);
    expect(no.body.error.code).toBe('UNAUTHORIZED');
  });
  it('garbage token → 401', async () => {
    const res = await request(app).get('/api/v1/auth/me').set(bearer('x.y.z'));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 3: Run to verify failure** — FAIL (404 on routes).

- [ ] **Step 4: Implement**

`src/types/express.d.ts`:
```ts
import type { Role } from '@bitacora/shared';
declare global { namespace Express { interface Request { user?: { id: string; role: Role } } } }
export {};
```
`src/middleware/auth.ts`:
```ts
export const authenticate: RequestHandler = (req, _res, next) => {
  const h = req.headers.authorization;
  const token = h?.startsWith('Bearer ') ? h.slice(7)
    : req.path === '/stream' ? (req.query.token as string | undefined) : undefined;
  if (!token) throw new AppError('UNAUTHORIZED', 'Missing token');
  try { const p = verifyToken(token); req.user = { id: p.sub, role: p.role }; }
  catch { throw new AppError('UNAUTHORIZED', 'Invalid or expired token'); }
  next();
};
export const requireRole = (...roles: Role[]): RequestHandler => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) throw new AppError('FORBIDDEN', 'Not allowed');
  next();
};
```
`auth.service.ts`: `login(email, password)` → find user by email, `bcrypt.compare`; on failure throw `AppError('UNAUTHORIZED', 'Invalid credentials')`; returns `{ accessToken, user: toUserDto(user) }`. `toUserDto` picks `id, role, name, email, studentId`.
`routes/auth.ts`: `POST /login` (parse `LoginBody`), `GET /me` (`authenticate`, load user, `{ user }`). Mount in `app.ts`.

- [ ] **Step 5: Run to verify pass** — `npm -w apps/api test -- auth` → 4 passed.

- [ ] **Step 6: Commit** — `git commit -m "feat(api): auth login/me and role middleware"`

---

### Task 5: Register sessions (scan + manual)

**Files:**
- Create: `apps/api/src/services/sessions.service.ts`, `src/routes/sessions.ts`
- Modify: `src/app.ts` (mount `/api/v1/sessions`)
- Test: `apps/api/tests/sessions.register.test.ts`

**Interfaces:**
- Consumes: `withLock`, `verifySig/signCubicle`, `publish`, `authenticate/requireRole`, `ScanBody/ManualBody`.
- Produces:
  - `sessionInclude = { student: true, teacher: true, cubicle: true } as const`
  - `toSessionDto(s: SessionWithRelations): SessionDto` (adds computed `durationMinutes = endedAt ? Math.round((endedAt - startedAt)/60000) : null`)
  - `registerSession(student: { id: string }, cubicleCode: string, method: 'QR' | 'MANUAL', sig?: string): Promise<{ session: SessionDto; created: boolean }>`
  - Routes: `POST /sessions/scan` and `POST /sessions/manual` (STUDENT) → `201 { session }` when created, `200 { session }` for the duplicate-within-2-min case.

Rules inside `registerSession` (run inside `withLock(student.id, …)`), in this order:
1. cubicle by `code` → else `CUBICLE_NOT_FOUND`
2. method `QR` and `!verifySig(...)` → `INVALID_QR`
3. no `teacherId` → `NO_TEACHER_ASSIGNED`
4. existing session for same student + cubicle with `startedAt >= now − 2 min` → return it, `created: false`
5. any other `PENDING` session for this student → `SESSION_ALREADY_PENDING`
6. create with `status PENDING`, `teacherId = cubicle.teacherId`, then `publish(teacherId, { type: 'session.created', session })`

- [ ] **Step 1: Write the failing tests** `tests/sessions.register.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { signCubicle } from '../src/lib/qr';
import { makeWorld, bearer } from './helpers';

const app = createApp();
let w: Awaited<ReturnType<typeof makeWorld>>;
beforeEach(async () => { w = await makeWorld(); });
const sig = () => signCubicle('C-01', 'secret-c01');
const scan = (token: string, body: object) =>
  request(app).post('/api/v1/sessions/scan').set(bearer(token)).send(body);

describe('POST /sessions/scan', () => {
  it('creates a PENDING QR session with student data from the user record', async () => {
    const res = await scan(w.tokens.student, { cubicleCode: 'C-01', sig: sig() });
    expect(res.status).toBe(201);
    expect(res.body.session).toMatchObject({
      status: 'PENDING', method: 'QR',
      student: { name: 'student', studentId: 'A0100001', email: 'student@uabc.test' },
      teacher: { id: w.teacher.id }, cubicle: { code: 'C-01' }, durationMinutes: null,
    });
  });
  it('tampered sig → 400 INVALID_QR; wrong-length sig → 400 INVALID_QR', async () => {
    for (const bad of ['AAAAAAAAAAAAAAAA', 'abc']) {
      const res = await scan(w.tokens.student, { cubicleCode: 'C-01', sig: bad });
      expect(res.status).toBe(400); expect(res.body.error.code).toBe('INVALID_QR');
    }
  });
  it('unknown cubicle → 404 CUBICLE_NOT_FOUND', async () => {
    const res = await scan(w.tokens.student, { cubicleCode: 'C-99', sig: 'x' });
    expect(res.status).toBe(404); expect(res.body.error.code).toBe('CUBICLE_NOT_FOUND');
  });
  it('cubicle without teacher → 409 NO_TEACHER_ASSIGNED', async () => {
    await prisma.cubicle.create({ data: { code: 'C-02', qrSecret: 's2' } });
    const res = await scan(w.tokens.student, { cubicleCode: 'C-02', sig: signCubicle('C-02', 's2') });
    expect(res.status).toBe(409); expect(res.body.error.code).toBe('NO_TEACHER_ASSIGNED');
  });
  it('duplicate scan within 2 min returns the same session (200)', async () => {
    const a = await scan(w.tokens.student, { cubicleCode: 'C-01', sig: sig() });
    const b = await scan(w.tokens.student, { cubicleCode: 'C-01', sig: sig() });
    expect(b.status).toBe(200); expect(b.body.session.id).toBe(a.body.session.id);
  });
  it('two simultaneous scans yield exactly one session', async () => {
    const [a, b] = await Promise.all([
      scan(w.tokens.student, { cubicleCode: 'C-01', sig: sig() }),
      scan(w.tokens.student, { cubicleCode: 'C-01', sig: sig() }),
    ]);
    expect(a.body.session.id).toBe(b.body.session.id);
    expect(await prisma.advisingSession.count()).toBe(1);
  });
  it('a pending session older than 2 min blocks a new one → 409 SESSION_ALREADY_PENDING', async () => {
    await prisma.advisingSession.create({ data: {
      studentId: w.student.id, teacherId: w.teacher.id, cubicleId: w.cubicle.id,
      method: 'QR', startedAt: new Date(Date.now() - 5 * 60_000) } });
    const res = await scan(w.tokens.student, { cubicleCode: 'C-01', sig: sig() });
    expect(res.status).toBe(409); expect(res.body.error.code).toBe('SESSION_ALREADY_PENDING');
  });
  it('REJECTED or old CONFIRMED sessions do not block a new scan', async () => {
    for (const status of ['REJECTED', 'CONFIRMED'] as const) {
      await prisma.advisingSession.create({ data: {
        studentId: w.student.id, teacherId: w.teacher.id, cubicleId: w.cubicle.id,
        method: 'QR', status, startedAt: new Date(Date.now() - 10 * 60_000) } });
    }
    const res = await scan(w.tokens.student, { cubicleCode: 'C-01', sig: sig() });
    expect(res.status).toBe(201);
  });
  it('teachers cannot scan → 403; anonymous → 401', async () => {
    expect((await scan(w.tokens.teacher, { cubicleCode: 'C-01', sig: sig() })).status).toBe(403);
    expect((await request(app).post('/api/v1/sessions/scan').send({})).status).toBe(401);
  });
});

describe('POST /sessions/manual', () => {
  it('creates a MANUAL pending session without a signature', async () => {
    const res = await request(app).post('/api/v1/sessions/manual').set(bearer(w.tokens.student)).send({ cubicleCode: 'C-01' });
    expect(res.status).toBe(201);
    expect(res.body.session).toMatchObject({ method: 'MANUAL', status: 'PENDING' });
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL (404 on routes).

- [ ] **Step 3: Implement** `sessions.service.ts` per the rules above (`toSessionDto` converts dates with `.toISOString()`), `routes/sessions.ts` with `Router()`; each handler is `asyncHandler`, parses its zod body, calls `registerSession(req.user!, …)`, responds `res.status(created ? 201 : 200).json({ session })`. Mount in `app.ts`.

Note for the implementer: the manual endpoint is intentionally unsigned (spec §5.3 fallback); it exists for when the camera fails.

- [ ] **Step 4: Run to verify pass** — `npm -w apps/api test -- register` → all pass.

- [ ] **Step 5: Commit** — `git commit -m "feat(api): register advising sessions via QR and manual"`

---

### Task 6: Teacher actions, detail, history

**Files:**
- Modify: `apps/api/src/services/sessions.service.ts`, `src/routes/sessions.ts`
- Test: `apps/api/tests/sessions.manage.test.ts`

**Interfaces:**
- Consumes: Task 5 (`toSessionDto`, `sessionInclude`), `ConfirmBody`, `PageQuery`.
- Produces (service):
  - `listPending(teacherId: string): Promise<SessionDto[]>` (oldest first)
  - `confirmSession(teacher: { id: string }, id: string, body: z.infer<typeof ConfirmBody>): Promise<SessionDto>` — publishes `session.updated` to the student and teacher
  - `endSession(teacher: { id: string }, id: string): Promise<SessionDto>`
  - `getSession(user: { id: string; role: Role }, id: string): Promise<SessionDto>`
  - `listMine(user: { id: string; role: Role }, page: number, pageSize: number): Promise<Paginated<SessionDto>>` (newest first)
- Routes (declare `/pending`, `/me`, `/stream` **before** `/:id`): `GET /pending` (TEACHER → `{ items }`), `PATCH /:id/confirm` (TEACHER → `{ session }`), `PATCH /:id/end` (TEACHER → `{ session }`), `GET /:id` (any authed → `{ session }`), `GET /me` (STUDENT|TEACHER → `Paginated`).

Rules: unknown id → `SESSION_NOT_FOUND`; confirm/end by a teacher who isn't `session.teacherId` → `FORBIDDEN`; confirm when status ≠ `PENDING` → `INVALID_STATE`; `approved: true` → `CONFIRMED` + `confirmedAt = now`, `false` → `REJECTED`; both store `topic`/`observations`; end requires `CONFIRMED` and `endedAt == null` else `INVALID_STATE`; `getSession` allowed for the session's student, its teacher, or ADMIN, else `FORBIDDEN`; `listMine` filters by `studentId` (STUDENT) or `teacherId` (TEACHER).

- [ ] **Step 1: Write the failing tests** `tests/sessions.manage.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { subscribe } from '../src/lib/events';
import { makeWorld, bearer } from './helpers';

const app = createApp();
let w: Awaited<ReturnType<typeof makeWorld>>;
let sid: string;
beforeEach(async () => {
  w = await makeWorld();
  const s = await prisma.advisingSession.create({ data: {
    studentId: w.student.id, teacherId: w.teacher.id, cubicleId: w.cubicle.id, method: 'QR' } });
  sid = s.id;
});
const confirm = (token: string, body: object, id = sid) =>
  request(app).patch(`/api/v1/sessions/${id}/confirm`).set(bearer(token)).send(body);

describe('teacher flow', () => {
  it('lists only my pending sessions', async () => {
    const mine = await request(app).get('/api/v1/sessions/pending').set(bearer(w.tokens.teacher));
    expect(mine.body.items.map((s: any) => s.id)).toEqual([sid]);
    const other = await request(app).get('/api/v1/sessions/pending').set(bearer(w.tokens.teacher2));
    expect(other.body.items).toEqual([]);
  });
  it('confirm sets CONFIRMED, topic, confirmedAt and notifies the student', async () => {
    const events: any[] = [];
    subscribe(w.student.id, e => events.push(e));
    const res = await confirm(w.tokens.teacher, { topic: 'Derivadas', approved: true, observations: 'ok' });
    expect(res.status).toBe(200);
    expect(res.body.session).toMatchObject({ status: 'CONFIRMED', topic: 'Derivadas', observations: 'ok' });
    expect(res.body.session.confirmedAt).toBeTruthy();
    expect(events[0].type).toBe('session.updated');
  });
  it('approved:false → REJECTED', async () => {
    const res = await confirm(w.tokens.teacher, { topic: 'No asistió', approved: false });
    expect(res.body.session.status).toBe('REJECTED');
  });
  it('blank topic → 400 VALIDATION_ERROR', async () => {
    const res = await confirm(w.tokens.teacher, { topic: ' ', approved: true });
    expect(res.status).toBe(400); expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
  it("another teacher cannot confirm → 403 FORBIDDEN; student cannot either", async () => {
    expect((await confirm(w.tokens.teacher2, { topic: 'x', approved: true })).body.error.code).toBe('FORBIDDEN');
    expect((await confirm(w.tokens.student, { topic: 'x', approved: true })).status).toBe(403);
  });
  it('confirming twice → 409 INVALID_STATE', async () => {
    await confirm(w.tokens.teacher, { topic: 'x', approved: true });
    const again = await confirm(w.tokens.teacher, { topic: 'y', approved: true });
    expect(again.status).toBe(409); expect(again.body.error.code).toBe('INVALID_STATE');
  });
  it('end sets endedAt and durationMinutes; only after confirm', async () => {
    const early = await request(app).patch(`/api/v1/sessions/${sid}/end`).set(bearer(w.tokens.teacher));
    expect(early.status).toBe(409);
    await confirm(w.tokens.teacher, { topic: 'x', approved: true });
    await prisma.advisingSession.update({ where: { id: sid }, data: { startedAt: new Date(Date.now() - 30 * 60_000) } });
    const res = await request(app).patch(`/api/v1/sessions/${sid}/end`).set(bearer(w.tokens.teacher));
    expect(res.body.session.endedAt).toBeTruthy();
    expect(res.body.session.durationMinutes).toBe(30);
  });
});

describe('detail and history', () => {
  it('owner student and assigned teacher can read; other student cannot', async () => {
    const get = (t: string) => request(app).get(`/api/v1/sessions/${sid}`).set(bearer(t));
    expect((await get(w.tokens.student)).status).toBe(200);
    expect((await get(w.tokens.teacher)).status).toBe(200);
    expect((await get(w.tokens.student2)).status).toBe(403);
    const missing = await request(app).get('/api/v1/sessions/nope').set(bearer(w.tokens.student));
    expect(missing.body.error.code).toBe('SESSION_NOT_FOUND');
  });
  it('/me is paginated, newest first, scoped to the user', async () => {
    for (let i = 0; i < 3; i++)
      await prisma.advisingSession.create({ data: {
        studentId: w.student.id, teacherId: w.teacher.id, cubicleId: w.cubicle.id, method: 'MANUAL',
        startedAt: new Date(Date.now() + (i + 1) * 1000) } });
    const res = await request(app).get('/api/v1/sessions/me?page=1&pageSize=2').set(bearer(w.tokens.student));
    expect(res.body).toMatchObject({ total: 4, page: 1, pageSize: 2 });
    expect(res.body.items).toHaveLength(2);
    expect(new Date(res.body.items[0].startedAt) > new Date(res.body.items[1].startedAt)).toBe(true);
    const other = await request(app).get('/api/v1/sessions/me').set(bearer(w.tokens.student2));
    expect(other.body.total).toBe(0);
    const t = await request(app).get('/api/v1/sessions/me').set(bearer(w.tokens.teacher));
    expect(t.body.total).toBe(4);
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.
- [ ] **Step 3: Implement** the five service functions and routes per the rules above.
- [ ] **Step 4: Run to verify pass** — `npm -w apps/api test -- manage` → all pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): confirm/reject/end sessions, detail, history"`

---

### Task 7: SSE stream

**Files:**
- Modify: `apps/api/src/routes/sessions.ts` (add `GET /stream` before `/:id`)
- Test: `apps/api/tests/stream.test.ts`

**Interfaces:**
- Consumes: `subscribe`, `authenticate` (query token on `/stream`), `requireRole('STUDENT','TEACHER')`.
- Produces: `GET /api/v1/sessions/stream[?token=]` → `text/event-stream`; each event is `event: <type>\ndata: <SessionDto JSON>\n\n`; a `: ping` comment every 25 s; cleanup on `close`.

- [ ] **Step 1: Write the failing test** `tests/stream.test.ts`

```ts
import { it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/app';
import { publish } from '../src/lib/events';
import { makeWorld } from './helpers';

let server: Server; let base: string; let w: Awaited<ReturnType<typeof makeWorld>>;
beforeAll(async () => {
  w = await makeWorld();
  await new Promise<void>(r => { server = createApp().listen(0, r); });
  base = `http://127.0.0.1:${(server.address() as any).port}/api/v1`;
});
afterAll(() => { server.closeAllConnections?.(); server.close(); });

it('rejects a stream without a token', async () => {
  expect((await fetch(`${base}/sessions/stream`)).status).toBe(401);
});

it('streams published events to the authenticated user (token in query)', async () => {
  const ctrl = new AbortController();
  const res = await fetch(`${base}/sessions/stream?token=${w.tokens.teacher}`, { signal: ctrl.signal });
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  publish(w.teacher.id, { type: 'session.created', session: { id: 's1' } as any });
  const reader = res.body!.getReader();
  let text = '';
  while (!text.includes('s1')) text += new TextDecoder().decode((await reader.read()).value);
  expect(text).toContain('event: session.created');
  expect(text).toContain('"id":"s1"');
  ctrl.abort();
});
```

- [ ] **Step 2: Run to verify failure** — FAIL (route resolves to `/:id` or 404).
- [ ] **Step 3: Implement**

```ts
router.get('/stream', authenticate, requireRole('STUDENT', 'TEACHER'), (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(': connected\n\n');
  const off = subscribe(req.user!.id, e => res.write(`event: ${e.type}\ndata: ${JSON.stringify(e.session)}\n\n`));
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => { clearInterval(ping); off(); });
});
```
Note: `publish` before the client subscribes is dropped; the test publishes after the response headers arrive, which means `subscribe` has already run.

- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(api): SSE session stream"`

---

### Task 8: Cubicles (list, QR image, rotate) + seed

**Files:**
- Create: `apps/api/src/services/cubicles.service.ts`, `src/routes/cubicles.ts`, `prisma/seedData.ts`, `prisma/seed.ts`
- Modify: `src/app.ts` (mount `/api/v1/cubicles`), root/api `package.json` (`"prisma": { "seed": "tsx prisma/seed.ts" }` in `apps/api/package.json`)
- Test: `apps/api/tests/cubicles.test.ts`, `apps/api/tests/seed.test.ts`

**Interfaces:**
- Produces: `listCubicles(): Promise<CubicleDto[]>`; `renderQr(id: string, format: 'png' | 'svg'): Promise<{ contentType: string; body: Buffer | string }>`; `rotateQr(id: string): Promise<CubicleDto>`; `seed(db: PrismaClient): Promise<void>` (in `prisma/seedData.ts`).
- Routes (ADMIN): `GET /cubicles → { items }`, `GET /cubicles/:id/qr?format=png|svg` (default `png`; `Content-Disposition: attachment; filename="<code>.<ext>"`), `POST /cubicles/:id/rotate-qr → { cubicle }`.
- The SVG must include the cubicle code as plain text under the QR (printable, spec §5.2). PNG is the QR only.

- [ ] **Step 1: Write the failing tests**

`tests/cubicles.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { signCubicle } from '../src/lib/qr';
import { makeWorld, bearer } from './helpers';

const app = createApp();
let w: Awaited<ReturnType<typeof makeWorld>>;
beforeEach(async () => { w = await makeWorld(); });

describe('cubicles', () => {
  it('lists cubicles with teacher and without the secret (admin only)', async () => {
    const res = await request(app).get('/api/v1/cubicles').set(bearer(w.tokens.admin));
    expect(res.body.items[0]).toEqual({ id: w.cubicle.id, code: 'C-01', teacher: { id: w.teacher.id, name: 'teacher' } });
    expect((await request(app).get('/api/v1/cubicles').set(bearer(w.tokens.student))).status).toBe(403);
  });
  it('PNG download has PNG magic bytes', async () => {
    const res = await request(app).get(`/api/v1/cubicles/${w.cubicle.id}/qr?format=png`).set(bearer(w.tokens.admin)).buffer().parse((r, cb) => {
      const chunks: Buffer[] = []; r.on('data', c => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.headers['content-type']).toContain('image/png');
    expect((res.body as Buffer).subarray(1, 4).toString()).toBe('PNG');
  });
  it('SVG embeds the cubicle code as text', async () => {
    const res = await request(app).get(`/api/v1/cubicles/${w.cubicle.id}/qr?format=svg`).set(bearer(w.tokens.admin));
    expect(res.headers['content-type']).toContain('image/svg+xml');
    expect(res.text).toContain('<svg');
    expect(res.text).toMatch(/<text[^>]*>C-01<\/text>/);
  });
  it('unknown cubicle → 404 CUBICLE_NOT_FOUND', async () => {
    const res = await request(app).get('/api/v1/cubicles/nope/qr').set(bearer(w.tokens.admin));
    expect(res.body.error.code).toBe('CUBICLE_NOT_FOUND');
  });
  it('rotate-qr invalidates previously printed signatures', async () => {
    const oldSig = signCubicle('C-01', 'secret-c01');
    const rot = await request(app).post(`/api/v1/cubicles/${w.cubicle.id}/rotate-qr`).set(bearer(w.tokens.admin));
    expect(rot.status).toBe(200);
    const scan = await request(app).post('/api/v1/sessions/scan').set(bearer(w.tokens.student)).send({ cubicleCode: 'C-01', sig: oldSig });
    expect(scan.body.error.code).toBe('INVALID_QR');
    const fresh = await prisma.cubicle.findUniqueOrThrow({ where: { id: w.cubicle.id } });
    expect(fresh.qrSecret).not.toBe('secret-c01');
  });
});
```
`tests/seed.test.ts`:
```ts
import { it, expect } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { resetDb } from './helpers';
import { seed } from '../prisma/seedData';

it('seeds 1 admin, 3 teachers, 10 students, 3 assigned cubicles and every session status', async () => {
  await resetDb(); await seed(prisma);
  const by = (role: any) => prisma.user.count({ where: { role } });
  expect([await by('ADMIN'), await by('TEACHER'), await by('STUDENT')]).toEqual([1, 3, 10]);
  expect(await prisma.cubicle.count({ where: { teacherId: { not: null } } })).toBe(3);
  const statuses = (await prisma.advisingSession.findMany({ select: { status: true } })).map(s => s.status);
  expect(new Set(statuses)).toEqual(new Set(['CONFIRMED', 'REJECTED', 'PENDING']));
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.
- [ ] **Step 3: Implement**

`cubicles.service.ts` — `renderQr` loads the cubicle (→ `CUBICLE_NOT_FOUND`), builds `url = buildScanUrl(code, qrSecret)`; PNG: `QRCode.toBuffer(url, { width: 600, margin: 2 })`; SVG: `labeledSvg(code, QRCode.toString(url, { type: 'svg', margin: 2 }))`. `rotateQr` sets `qrSecret = randomBytes(24).toString('base64url')`.

The one non-obvious piece, `labeledSvg`:
```ts
async function labeledSvg(code: string, svgPromise: Promise<string>) {
  const svg = await svgPromise;
  const n = Number(/viewBox="0 0 (\d+)/.exec(svg)![1]);
  const inner = svg.replace(/<\?xml[^>]*\?>|<svg[^>]*>|<\/svg>/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n + 6}"><rect width="${n}" height="${n + 6}" fill="#fff"/>` +
    `<g>${inner}</g><text x="${n / 2}" y="${n + 4}" font-size="3" text-anchor="middle" font-family="sans-serif">${code}</text></svg>`;
}
```
Route: `QrFormatQuery.parse(req.query)`; `res.type(contentType)`, set `Content-Disposition`, `res.send(body)`. All routes `authenticate, requireRole('ADMIN')`.

`prisma/seedData.ts` — `seed(db)`: passwords `Admin123!` (admin `admin@uabc.test`) and `Demo1234!` for others (`teacher1..3@uabc.test`, `student1..10@uabc.test`, studentIds `A0100001..A0100010`), hashed with `bcryptjs`; cubicles `C-01..C-03` with `qrSecret = randomBytes(18).toString('base64url')`; ~9 historical sessions across students 1–3 and all teachers (CONFIRMED with `topic`, `confirmedAt`, `endedAt`; REJECTED with a reason in `topic`) plus **one PENDING** session for student 10 (so the teacher panel is non-empty). `prisma/seed.ts`: `import { seed } from './seedData'; seed(new PrismaClient()).then(() => process.exit(0))`, logging the demo credentials. The seed must be idempotent-safe by running on an emptied DB only (`db push --force-reset` or `resetDb`).

- [ ] **Step 4: Run to verify pass** — `npm -w apps/api test` (whole suite) → all pass.
- [ ] **Step 5: Seed the dev DB** — `cd apps/api && npx prisma db push && npm run seed` → prints credentials.
- [ ] **Step 6: Commit** — `git commit -m "feat(api): cubicle QR download/rotate and seed data"`

---

### Task 9: Web scaffold — Vite, PWA, API layer, auth store, router guard, login

**Files:**
- Create: `apps/web/{package.json,tsconfig.json,index.html,vite.config.ts,env.d.ts}`, `src/{main.ts,App.vue,style.css}`
- Create: `src/lib/{token,errors}.ts`, `src/api/{http,auth}.ts`, `src/stores/auth.ts`, `src/router/{guard,index}.ts`, `src/composables/useAsync.ts`
- Create: `src/components/{AppShell,StatusBadge}.vue`, `src/pages/LoginPage.vue`, placeholder pages (`StudentHome`, `TeacherHome`, `AdminCubicles` as `<h1>` stubs; replaced in Tasks 11–13)
- Test: `src/router/guard.test.ts`, `src/lib/errors.test.ts`

**Interfaces:**
- Produces:
  - `homeFor(role: Role): string` → `/student | /teacher | /admin/cubicles`
  - `resolveGuard(user: { role: Role } | null, to: { fullPath: string; meta: { public?: boolean; roles?: Role[] } }): true | string`
  - `safeRedirect(raw: unknown): string | null` — only same-origin paths (`/x`, not `//x`, no `\`)
  - `errorMessage(code: ErrorCode | string): string` (friendly text per spec error code)
  - `getToken(): string | null`, `setToken(t: string | null): void` (try/catch around `localStorage`)
  - `ApiError(code, message, status)`; `http` (axios, `baseURL = import.meta.env.VITE_API_URL ?? '/api/v1'`); `setUnauthorizedHandler(fn: () => void)`
  - `api/auth.ts`: `login(email, password): Promise<{ accessToken: string; user: UserDto }>`, `me(): Promise<UserDto>`
  - `useAuth()` Pinia store: `{ user, token, ready, login(email,password), logout(), restore() }`
  - `useAsync<T>(fn: (...a: any[]) => Promise<T>): { run, loading: Ref<boolean>, error: Ref<string | null> }` — error is `errorMessage(code)` for `ApiError`

- [ ] **Step 1: Package setup**

Run:
```bash
npm create vite@latest apps/web -- --template vue-ts   # accept defaults, then delete boilerplate components
npm i -w apps/web vue vue-router pinia axios qr-scanner @bitacora/shared
npm i -D -w apps/web vite-plugin-pwa @vite-pwa/assets-generator vitest vue-tsc
```
`apps/web/package.json` scripts: `"dev": "vite --host"`, `"build": "vue-tsc --noEmit && vite build"`, `"test": "vitest run"`. Delete any generated `HelloWorld.vue`/assets.

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: { host: true, allowedHosts: true, proxy: { '/api': 'http://localhost:3000' } },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Bitácora de Asesorías', short_name: 'Bitácora',
        description: 'Registro automatizado de asesorías académicas UABC',
        theme_color: '#0b5ed7', background_color: '#ffffff', display: 'standalone', start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { navigateFallbackDenylist: [/^\/api/] },
    }),
  ],
});
```
The Vite proxy means a single HTTPS tunnel (cloudflared/ngrok → port 5173) serves both web and API during phone testing; set the API's `APP_BASE_URL`/`CORS_ORIGIN` to the tunnel URL.

- [ ] **Step 2: Write the failing tests**

`src/router/guard.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolveGuard, safeRedirect, homeFor } from './guard';

const to = (fullPath: string, meta: any = {}) => ({ fullPath, meta });

describe('resolveGuard', () => {
  it('anonymous on a protected route → /login with the full path (query kept) encoded in redirect', () => {
    const r = resolveGuard(null, to('/scan?c=C-01&sig=abc', { roles: ['STUDENT'] })) as string;
    expect(r.startsWith('/login?redirect=')).toBe(true);
    expect(decodeURIComponent(r.split('redirect=')[1])).toBe('/scan?c=C-01&sig=abc');
  });
  it('anonymous on a public route passes', () => {
    expect(resolveGuard(null, to('/login', { public: true }))).toBe(true);
  });
  it('wrong role is sent to its own home', () => {
    expect(resolveGuard({ role: 'STUDENT' }, to('/teacher', { roles: ['TEACHER'] }))).toBe('/student');
    expect(resolveGuard({ role: 'ADMIN' }, to('/student', { roles: ['STUDENT'] }))).toBe(homeFor('ADMIN'));
  });
  it('right role passes', () => {
    expect(resolveGuard({ role: 'TEACHER' }, to('/teacher', { roles: ['TEACHER'] }))).toBe(true);
  });
});

describe('safeRedirect', () => {
  it('accepts same-origin paths and rejects open redirects', () => {
    expect(safeRedirect('/scan?c=1&sig=2')).toBe('/scan?c=1&sig=2');
    for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', '', undefined, ['/a']])
      expect(safeRedirect(bad)).toBeNull();
  });
});
```
`src/lib/errors.test.ts`:
```ts
import { it, expect } from 'vitest';
import { errorMessage } from './errors';

it('has a distinct friendly message for every spec error code', () => {
  const codes = ['INVALID_QR','CUBICLE_NOT_FOUND','NO_TEACHER_ASSIGNED','SESSION_ALREADY_PENDING','FORBIDDEN','UNAUTHORIZED'];
  const msgs = codes.map(errorMessage);
  expect(new Set(msgs).size).toBe(codes.length);
  expect(errorMessage('SOMETHING_ELSE')).toMatch(/something went wrong/i);
});
```

- [ ] **Step 3: Run to verify failure** — `npm -w apps/web test` → FAIL.

- [ ] **Step 4: Implement**

`src/router/guard.ts`:
```ts
import type { Role } from '@bitacora/shared';
const HOME: Record<Role, string> = { STUDENT: '/student', TEACHER: '/teacher', ADMIN: '/admin/cubicles' };
export const homeFor = (role: Role) => HOME[role];

export function safeRedirect(raw: unknown): string | null {
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\') ? raw : null;
}
export function resolveGuard(
  user: { role: Role } | null,
  to: { fullPath: string; meta: { public?: boolean; roles?: Role[] } },
): true | string {
  if (!user) return to.meta.public ? true : `/login?redirect=${encodeURIComponent(to.fullPath)}`;
  if (to.meta.public) return true;
  if (to.meta.roles && !to.meta.roles.includes(user.role)) return homeFor(user.role);
  return true;
}
```
`src/lib/errors.ts` — `errorMessage(code)` with a `Record<string, string>`: `INVALID_QR` "This QR code is not valid. Scan the code posted at the teacher's cubicle."; `CUBICLE_NOT_FOUND` "We couldn't find that cubicle."; `NO_TEACHER_ASSIGNED` "This cubicle has no teacher assigned yet."; `SESSION_ALREADY_PENDING` "You already have a session waiting for confirmation."; `FORBIDDEN` "You don't have permission to do that."; `UNAUTHORIZED` "Your session expired. Please sign in again."; `VALIDATION_ERROR`, `INVALID_STATE`, `SESSION_NOT_FOUND` with their own text; default "Something went wrong. Please try again."

`src/lib/token.ts` — `getToken/setToken` with `try/catch` around `localStorage` key `bitacora.token` (null removes).

`src/api/http.ts`:
```ts
export class ApiError extends Error {
  constructor(public code: ErrorCode, message: string, public status: number) { super(message); }
}
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

export const http = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '/api/v1' });
http.interceptors.request.use(cfg => { const t = getToken(); if (t) cfg.headers.Authorization = `Bearer ${t}`; return cfg; });
http.interceptors.response.use(r => r, err => {
  const b = err.response?.data?.error;
  const e = new ApiError(b?.code ?? 'INTERNAL', b?.message ?? 'Network error', err.response?.status ?? 0);
  // a failed login is also 401 — don't treat it as an expired session
  if (e.code === 'UNAUTHORIZED' && !String(err.config?.url).includes('/auth/login')) onUnauthorized?.();
  return Promise.reject(e);
});
```
`src/stores/auth.ts` — Pinia setup store; `ready` is a `Promise<void>` created by `restore()` (calls `me()` when a token exists; on failure clears token). `login` stores token + user. `logout` clears both.

`src/router/index.ts` — routes (all lazy `() => import(...)`): `/login` (public), `/` (redirect fn: user ? `homeFor(role)` : `/login`), `/student` (STUDENT), `/scan` (STUDENT), `/scan/manual` (STUDENT), `/student/sessions/:id` (STUDENT), `/student/history` (STUDENT), `/teacher` (TEACHER), `/teacher/history` (TEACHER), `/admin/cubicles` (ADMIN), `/admin/reports` (ADMIN). Declare `RouteMeta` augmentation (`public?: boolean; roles?: Role[]`). `router.beforeEach(async to => { const a = useAuth(); await a.ready; return resolveGuard(a.user, to); })`.

`src/main.ts` — create app, pinia, router; `useAuth().restore()` before mount; `setUnauthorizedHandler(() => { auth.logout(); router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } }); })`; import `style.css`.

`LoginPage.vue` — form (email, password, `useAsync(auth.login)`), shows loading/error; after login navigate to `safeRedirect(route.query.redirect) ?? homeFor(user.role)`; lists demo credentials in a small "Demo accounts" box (seed values). `AppShell.vue` — header with app name, role-based nav links (student: Home/History; teacher: Pending/History; admin: Cubicles/Reports), user name + logout; slot for content; `App.vue` renders `<AppShell><RouterView/></AppShell>` when `auth.user`, else bare `<RouterView/>`. `StatusBadge.vue` — prop `status: SessionStatus`, class per status (PENDING/CONFIRMED/REJECTED). `style.css` — mobile-first: CSS variables, `.card`, `.btn`, `.btn-primary`, `.btn-danger`, `.badge-*`, `.banner-mock` (yellow), `.error`, `.spinner`; max-width 720 px centered.

PWA icons: add `public/logo.svg` (simple square logo), `pwa-assets.config.ts`:
```ts
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';
export default defineConfig({ preset: minimal2023Preset, images: ['public/logo.svg'] });
```
Run `npx pwa-assets-generator` in `apps/web` and commit the generated PNG/ICO files in `public/`.

- [ ] **Step 5: Run to verify pass** — `npm -w apps/web test` → pass; `npm -w apps/web run build` → succeeds.
- [ ] **Step 6: Manual check** — run API (`npm run dev:api`) and web (`npm run dev:web`); login as `student1@uabc.test` / `Demo1234!` lands on `/student`; wrong password shows the inline error; visiting `/teacher` as the student bounces to `/student`; `/login?redirect=//evil.com` logs in and goes to `/student`, not offsite.
- [ ] **Step 7: Commit** — `git commit -m "feat(web): scaffold, PWA, api layer, auth store, role guard, login"`

---

### Task 10: Session API layer + live-update composable

**Files:**
- Create: `apps/web/src/api/sessions.ts`, `src/composables/useSessionStream.ts`
- Test: `apps/web/src/api/sessions.test.ts`

**Interfaces:**
- Consumes: `http`, `ApiError`, shared DTOs, `getToken`.
- Produces (`api/sessions.ts`):
  - `scanSession(cubicleCode: string, sig: string): Promise<SessionDto>`
  - `manualSession(cubicleCode: string): Promise<SessionDto>`
  - `getPending(): Promise<SessionDto[]>`
  - `confirmSession(id: string, body: { topic: string; approved: boolean; observations?: string }): Promise<SessionDto>`
  - `endSession(id: string): Promise<SessionDto>`
  - `getSession(id: string): Promise<SessionDto>`
  - `getMySessions(page = 1, pageSize = 20): Promise<Paginated<SessionDto>>`
  - `sessionStreamUrl(token: string, base?: string): string` (pure; `${base}/sessions/stream?token=<encoded>`)
- Produces (`useSessionStream(onChange: () => void, pollMs = 5000): void`) — inside a component's setup: opens `EventSource(sessionStreamUrl(token))`, calls `onChange` on `session.created` / `session.updated`, **and** calls `onChange` every `pollMs` (safety net → the ≤ 5 s requirement even if SSE is blocked by a proxy). Cleans up (close + clearInterval) in `onBeforeUnmount`. Skips `EventSource` if `typeof EventSource === 'undefined'`.

- [ ] **Step 1: Write the failing test** `src/api/sessions.test.ts`

```ts
import { it, expect } from 'vitest';
import { sessionStreamUrl } from './sessions';

it('builds the SSE url with an encoded token (EventSource cannot send headers)', () => {
  expect(sessionStreamUrl('a b/c', '/api/v1')).toBe('/api/v1/sessions/stream?token=a%20b%2Fc');
});
```
(`sessions.ts` must not touch `import.meta.env` at import time in a way that breaks under vitest — `http.ts` reads it lazily via `??`, which is fine in Vite-powered vitest.)

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** — each function is a one-liner over `http` returning `data.session` / `data.items` / `data`. `sessionStreamUrl(token, base = import.meta.env.VITE_API_URL ?? '/api/v1')`.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(web): sessions api layer and live stream composable"`

---

### Task 11: Student flow — scanner, deep link, manual fallback, status, history

**Files:**
- Create: `src/lib/parseScanUrl.ts`, `src/composables/useQrScanner.ts`
- Create: `src/components/SessionList.vue`
- Create/replace: `src/pages/student/{StudentHome,ScanPage,ManualPage,SessionStatusPage,StudentHistory}.vue`
- Test: `src/lib/parseScanUrl.test.ts`, `src/composables/cameraError.test.ts`

**Interfaces:**
- Produces:
  - `parseScanUrl(text: string): { cubicleCode: string; sig: string } | null` — valid only for a URL whose pathname is `/scan` with non-empty `c` and `sig`
  - `cameraErrorMessage(e: unknown): string` (exported from `useQrScanner.ts`) — `NotAllowedError`/`PermissionDeniedError` → camera permission denied; `NotFoundError` or message containing "Camera not found" → no camera; `NotReadableError` → camera in use; else generic. All messages end by pointing to manual entry.
  - `useQrScanner(video: Ref<HTMLVideoElement | null>, onResult: (text: string) => void): { start(): Promise<void>; stop(): void; error: Ref<string | null>; active: Ref<boolean> }`
  - `SessionList.vue` props: `items: SessionDto[]`, `viewer: 'STUDENT' | 'TEACHER'`; emits `end(id)` (teacher history only, for CONFIRMED with no `endedAt`). Row shows date, `StatusBadge`, topic, teacher (student view) or student name + ID (teacher view), duration.

- [ ] **Step 1: Write the failing tests**

`src/lib/parseScanUrl.test.ts`:
```ts
import { it, expect } from 'vitest';
import { parseScanUrl } from './parseScanUrl';

it('extracts c and sig from a scan URL', () => {
  expect(parseScanUrl('https://app.uabc.mx/scan?c=C-12&sig=abcDEF123456_-xy'))
    .toEqual({ cubicleCode: 'C-12', sig: 'abcDEF123456_-xy' });
});
it('rejects anything else', () => {
  for (const bad of ['hello', 'https://x.com/other?c=C-1&sig=a', 'https://x.com/scan?c=C-1', 'https://x.com/scan?sig=a', 'https://x.com/scan?c=&sig=', ''])
    expect(parseScanUrl(bad)).toBeNull();
});
```
`src/composables/cameraError.test.ts`:
```ts
import { it, expect } from 'vitest';
import { cameraErrorMessage } from './useQrScanner';

const named = (name: string) => Object.assign(new Error('x'), { name });
it('maps camera failures to distinct friendly messages mentioning manual entry', () => {
  const msgs = [named('NotAllowedError'), named('NotFoundError'), named('NotReadableError'), new Error('Camera not found.'), 'weird']
    .map(cameraErrorMessage);
  expect(msgs[0]).toMatch(/permission/i);
  expect(msgs[1]).toMatch(/no camera/i);
  expect(msgs[3]).toBe(msgs[1]);
  expect(msgs[2]).toMatch(/in use|another app/i);
  msgs.forEach(m => expect(m).toMatch(/manual/i));
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement the pure pieces**

`parseScanUrl.ts`:
```ts
export function parseScanUrl(text: string) {
  try {
    const u = new URL(text);
    const cubicleCode = u.searchParams.get('c');
    const sig = u.searchParams.get('sig');
    return u.pathname === '/scan' && cubicleCode && sig ? { cubicleCode, sig } : null;
  } catch { return null; }
}
```
`useQrScanner.ts` — wraps `qr-scanner`:
```ts
export function useQrScanner(video: Ref<HTMLVideoElement | null>, onResult: (text: string) => void) {
  const error = ref<string | null>(null); const active = ref(false);
  let scanner: QrScanner | null = null;
  function stop() { scanner?.stop(); scanner?.destroy(); scanner = null; active.value = false; }
  async function start() {
    error.value = null;
    if (!video.value) return;
    try {
      scanner = new QrScanner(video.value, r => { stop(); onResult(r.data); },
        { preferredCamera: 'environment', returnDetailedScanResult: true, highlightScanRegion: true });
      await scanner.start(); active.value = true;
    } catch (e) { stop(); error.value = cameraErrorMessage(e); }
  }
  onBeforeUnmount(stop);
  return { start, stop, error, active };
}
```
plus the exported pure `cameraErrorMessage`.

- [ ] **Step 4: Run to verify pass** — both tests green.

- [ ] **Step 5: Implement the pages**

- `StudentHome.vue`: greeting with `auth.user.name`; big primary `RouterLink to="/scan"` button "Scan QR"; "Recent sessions" = `getMySessions(1, 5)` via `useAsync` (loading / error / empty states) rendered with `SessionList`; link to `/student/history`. Also `useSessionStream(reload)` is **not** needed here.
- `ScanPage.vue`:
  - `onMounted`: if `route.query.c` and `route.query.sig` are strings → `register(c, sig)` immediately (deep link from the native camera; no scanner). Else `scanner.start()`.
  - `<video ref="video" playsinline muted>` (iOS needs `playsinline`).
  - `onResult(text)`: `parseScanUrl(text)`; if null → set error "That QR isn't an advising-log code", restart scanner after 1.5 s; else `register`.
  - `register(c, sig)` = `useAsync(scanSession)`; on success `router.replace('/student/sessions/' + session.id)`; on error show `errorMessage(code)`, and for non-deep-link flows offer "Scan again" (restart scanner). Show a spinner while registering.
  - If `scanner.error` is set (camera denied/missing) show the message and a prominent "Enter manually" button → `/scan/manual`. Always show a "Can't scan?" link to `/scan/manual`.
  - Deep-link case: `UNAUTHORIZED` is handled globally (login → back to `/scan?c=&sig=` via `redirect`).
- `ManualPage.vue`: input for cubicle code (printed under the QR, e.g. `C-12`) + a confirmation checkbox "I'm physically at this cubicle"; submit disabled until both; `useAsync(manualSession)`; same success/error handling as above.
- `SessionStatusPage.vue`: loads `getSession(route.params.id)`; `useSessionStream(reload)` for live updates. PENDING → "Waiting for teacher to confirm…" with spinner, cubicle code and teacher name; CONFIRMED → "Session registered ✅" with topic/observations; REJECTED → "Session rejected" with the teacher's note; link back home. Error state with retry.
- `StudentHistory.vue`: paginated `getMySessions` with "Load more" appending pages, `SessionList viewer="STUDENT"`, each row linking to `/student/sessions/:id`.

- [ ] **Step 6: Verify** — `npm -w apps/web run build` passes. Manual (API + web running, seed loaded): as `student2@uabc.test` open `http://localhost:5173/scan?c=C-01&sig=<sig>` (get `<sig>` by downloading the cubicle SVG in Task 13 or from `node -e` using `signCubicle`) → redirected to the waiting page; a tampered `sig` shows the "not valid" message; deny camera on `/scan` → manual button appears and `/scan/manual` registers.
- [ ] **Step 7: Commit** — `git commit -m "feat(web): student QR scan, deep link, manual fallback, status and history"`

---

### Task 12: Teacher panel — live pending list, confirm modal, history

**Files:**
- Create: `src/components/ConfirmModal.vue`
- Create/replace: `src/pages/teacher/{TeacherHome,TeacherHistory}.vue`

**Interfaces:**
- Consumes: `getPending`, `confirmSession`, `endSession`, `getMySessions`, `useSessionStream`, `useAsync`, `SessionList`.
- Produces: `ConfirmModal.vue` — props `session: SessionDto`; emits `done(updated: SessionDto)` and `close`. Fields: topic (required, trimmed), observations (optional textarea); two buttons "Approve" (`approved: true`) and "Reject" (`approved: false`); both disabled while loading; inline error from `useAsync`; closes on backdrop/Escape.

- [ ] **Step 1: Implement `ConfirmModal.vue`** — shows student name, student ID, email and cubicle (read-only, pre-filled from the session), then the form; submit calls `confirmSession(session.id, { topic, approved, observations })`.
- [ ] **Step 2: Implement `TeacherHome.vue`** — `load = useAsync(getPending)`; `useSessionStream(() => load.run())` (SSE + 5 s polling) so new requests appear without refreshing; list cards (student name, ID, cubicle, time waiting) each with a "Confirm" button opening `ConfirmModal`; on `done` remove the card and show a brief success message; empty state "No pending sessions"; initial loading and error-with-retry states. Don't show the full spinner on background refreshes (only when the list is empty and loading).
- [ ] **Step 3: Implement `TeacherHistory.vue`** — paginated `getMySessions` via `SessionList viewer="TEACHER"`; handles `end(id)` by calling `endSession`, replacing the row in place, with per-row loading and an error banner.
- [ ] **Step 4: Verify** — `npm -w apps/web run build` passes. Manual with two browsers: teacher1 on `/teacher`, student scans C-01 → card appears within 5 s with no refresh; confirm with topic → student's waiting page flips to "Session registered"; both histories list it; teacher can press "End session" in history and the duration appears. Submitting an empty topic is blocked.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): teacher pending list, confirm modal, history"`

---

### Task 13: Admin — cubicles with QR download/rotate, mocked reports

**Files:**
- Create: `src/api/cubicles.ts`, `src/api/reports.ts`
- Create/replace: `src/pages/admin/{AdminCubicles,AdminReports}.vue`
- Test: `src/api/reports.test.ts`

**Interfaces:**
- Produces:
  - `listCubicles(): Promise<CubicleDto[]>`
  - `downloadQr(id: string, format: 'png' | 'svg'): Promise<Blob>` (`responseType: 'blob'`)
  - `rotateQr(id: string): Promise<CubicleDto>`
  - `getReportSummary(): Promise<ReportSummary>` with `interface ReportSummary { isMock: true; totalSessions: number; avgMinutes: number; byTopic: { topic: string; count: number }[]; byMonth: { month: string; count: number }[] }` — returns hard-coded sample data (the single swap point for the real API later).

- [ ] **Step 1: Write the failing test** `src/api/reports.test.ts`

```ts
import { it, expect } from 'vitest';
import { getReportSummary } from './reports';

it('report data is flagged as mock and internally consistent', async () => {
  const r = await getReportSummary();
  expect(r.isMock).toBe(true);
  expect(r.byTopic.reduce((a, t) => a + t.count, 0)).toBe(r.totalSessions);
  expect(r.byMonth.reduce((a, m) => a + m.count, 0)).toBe(r.totalSessions);
});
```
- [ ] **Step 2: Run to verify failure**, then implement `reports.ts` with sample numbers that satisfy the test (e.g. total 120).
- [ ] **Step 3: Implement `cubicles.ts`** (`http.get('/cubicles')`, `http.get(`/cubicles/${id}/qr`, { params: { format }, responseType: 'blob' })`, `http.post(`/cubicles/${id}/rotate-qr`)`).
- [ ] **Step 4: Implement `AdminCubicles.vue`** — table/cards: code, teacher name (or "Unassigned"), buttons "Download SVG (print)", "Download PNG", "Rotate QR". Download: `const url = URL.createObjectURL(blob)`; click a temporary `<a download="C-01.svg">`; `revokeObjectURL`. Rotate: `window.confirm('Printed QR codes for C-01 will stop working. Continue?')` then call; show success note "New secret generated — download and reprint the QR". Per-row loading/error states.
- [ ] **Step 5: Implement `AdminReports.vue`** — a prominent `.banner-mock` "Coming soon — sample data, not real figures"; stat tiles (total, average minutes) and simple CSS bar lists for topics/months, each section titled with "(sample)". No export buttons beyond disabled ones labelled "Coming soon".
- [ ] **Step 6: Verify** — `npm -w apps/web test` and `npm -w apps/web run build` pass. Manual: as `admin@uabc.test` / `Admin123!` download C-01 SVG, open it → QR with "C-01" text under it; scanning it with a phone opens `<APP_BASE_URL>/scan?c=C-01&sig=…`; rotate and confirm old SVG now yields "not valid".
- [ ] **Step 7: Commit** — `git commit -m "feat(web): admin cubicles QR download/rotate and mocked reports"`

---

### Task 14: README, phone testing, acceptance run

**Files:**
- Create: `README.md`
- Modify: none (fixes found here go in the owning files)

- [ ] **Step 1: Write `README.md`** — sections: Overview (one paragraph from spec §0), Setup (`npm install`, `cp apps/api/.env.example apps/api/.env`, `cd apps/api && npx prisma generate && npx prisma db push && npm run seed`), Run (`npm run dev:api`, `npm run dev:web`), Demo accounts (`admin@uabc.test / Admin123!`; `teacher1-3@uabc.test`, `student1-10@uabc.test` / `Demo1234!`), Phone testing (HTTPS required for camera: `cloudflared tunnel --url http://localhost:5173` or `ngrok http 5173`; the Vite proxy forwards `/api`, so set `APP_BASE_URL` and `CORS_ORIGIN` in `apps/api/.env` to the tunnel URL and restart the API; QRs downloaded **after** this embed the tunnel host), Switching to PostgreSQL (change `provider` and `DATABASE_URL`, re-run `db push`), Known limits (manual fallback is unsigned by design; SSE hub and the double-scan lock are in-process, so run a single API instance; reports are mock).
- [ ] **Step 2: Full automated run** — `npm test` from the root. Expected: shared 3 passed, api all passed, web all passed.
- [ ] **Step 3: Walk the acceptance checklist (spec §10)** against the tunnel URL and record the result of each line in the PR description:
  - [ ] Admin downloads a printable cubicle QR (SVG with code text)
  - [ ] Student on a phone scans the printed/on-screen QR → `PENDING` session with pre-filled data
  - [ ] Tampered QR (edit one char of `sig`) → "not valid" message
  - [ ] Teacher sees the new session without refreshing (≤ 5 s)
  - [ ] Teacher confirms with a topic → student screen shows "Session registered"
  - [ ] Session is in both histories
  - [ ] Deny camera permission → manual fallback works
  - [ ] PWA installs on Android Chrome (Lighthouse "Installable" passes in `npm -w apps/web run build && npx vite preview`)
  - [ ] Safari iOS: camera opens inline (no fullscreen takeover); native-camera deep link works after login
  - [ ] Mocked sections visibly labeled
- [ ] **Step 4: Commit** — `git commit -m "docs: README and acceptance walkthrough"`

---

## Self-Review

**Spec coverage:** §2 stack → Tasks 1, 2, 9; §3 structure → File Structure; §4 model/rules → Tasks 2, 5, 6 (2-min duplicate, one pending, owner-only confirm, computed duration); §5.1–5.2 signing/generation → Tasks 3, 8; §5.3 scanner/deep link/fallback → Task 11; §5.4 constraints → Task 9 (proxy/tunnel), 11 (`playsinline`), 14; §6 flow → Tasks 5–7, 11–12; §7 endpoints → Tasks 4–8 (all 15 covered; error table fully mapped via `ERROR_STATUS` and `errorMessage`); §8 pages → Tasks 9, 11–13; §9 seed → Task 8; §10 acceptance → Task 14; §11 env → Tasks 2, 9; §12 shared types/mocks behind `api/` → Tasks 1, 13. Optional `exp` time-window QR is deliberately excluded (spec marks it optional).

**Type consistency:** `registerSession`/`toSessionDto`/`sessionInclude` defined in Task 5 and reused in 6; `makeWorld`/`bearer` defined in Task 4 and used in 5–8; `useAsync`, `errorMessage`, `StatusBadge`, `SessionList` defined before use; frontend function names in Task 10 match their uses in 11–12.

**Deviations from spec worth flagging:** `bcryptjs` instead of `bcrypt` (same API, no native build); SQLite for dev/test; SSE token passed via query because `EventSource` can't send headers; PNG QR has no text label (the SVG does) — print from the SVG.
