# Class QR Registration (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student page that lists preset classes; clicking a class shows a QR code; scanning that QR with a phone registers attendance for that class.

**Architecture:** npm-workspaces monorepo with `packages/shared` (class list, zod schema, DTO types), `apps/api` (tiny Express server: QR generation, signature check, registration saved to a JSON file) and `apps/web` (Vue 3 + Vite, two pages). No login, no roles, no database, no teacher/admin features.

**Tech Stack:** Node 20+, TypeScript, Express 4, zod, qrcode, vitest + supertest, Vue 3, Vite, Vue Router 4.

**Spec:** `bitacora-qr-spec.md` — **narrowed by the team**: only the QR generate → scan → register path is built. Everything in the spec about auth, roles, teachers, admin, history, SSE, PWA, Prisma and seed data is out of scope.

## Global Constraints

- Scope is exactly: preset class list page, QR shown on click, scan registers. No login, no other backend endpoints than the three below.
- Preset classes (exact labels, in this order): `OOP`, `IoT`, `Embedded Systems`, `Advanced Electronics`, `Software Engineering`, `AI`.
- QR payload is a URL: `<APP_BASE_URL>/scan?c=<classCode>&sig=<signature>`; `sig = HMAC-SHA256(key = QR_SECRET, message = classCode)`, base64url, truncated to 16 chars. Backend verifies it before registering.
- API endpoints (base `/api`): `GET /api/classes/:code/qr?format=svg|png` (default `svg`), `POST /api/registrations`, `GET /api/registrations`. Errors are `{ error: { code, message } }` with codes `INVALID_QR` 400, `CLASS_NOT_FOUND` 404, `VALIDATION_ERROR` 400, `NOT_FOUND` 404, `INTERNAL` 500.
- Registrations persist to a JSON file (`REGISTRATIONS_FILE`, default `data/registrations.json`), newest first. Each scan creates a registration (no identity exists to dedupe on).
- Env (api): `PORT` (3000), `QR_SECRET` (dev default `dev-secret`), `APP_BASE_URL` (default `http://localhost:5173`), `REGISTRATIONS_FILE`. Web calls relative `/api/...` (Vite proxies to the API).
- Mobile-first UI; every async action shows loading, success and error states.

## Review Focus

1. **Wrong-length / empty `sig`** must give `INVALID_QR`, never crash `timingSafeEqual` (Task 2).
2. **A valid signature for another class** must not register the requested class (Task 2).
3. **Missing/garbage body or `/scan` opened without `c`/`sig`** shows a clear error, not a blank page or a request with `undefined` (Tasks 2, 3).
4. **Malformed JSON body** returns the error envelope, not an HTML stack trace (Task 2).

---

### Task 1: Monorepo scaffold + shared package

**Files:**
- Create: `package.json`, `tsconfig.base.json`
- Modify: `.gitignore` (append `data/`)
- Create: `packages/shared/package.json`, `packages/shared/src/index.ts`, `packages/shared/src/index.test.ts`

**Interfaces:**
- Produces (`@bitacora/shared`): `CLASSES: readonly ClassInfo[]`, `findClass(code: string): ClassInfo | undefined`, `ScanBody` (zod: `{ classCode: string (min 1), sig: string (min 1) }`), types `ClassInfo = { code: string; name: string }`, `RegistrationDto = { id: string; classCode: string; className: string; registeredAt: string }`.

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
import { CLASSES, findClass, ScanBody } from './index';

describe('shared', () => {
  it('lists the six preset classes in order with unique codes', () => {
    expect(CLASSES.map(c => c.name)).toEqual([
      'OOP', 'IoT', 'Embedded Systems', 'Advanced Electronics', 'Software Engineering', 'AI',
    ]);
    expect(new Set(CLASSES.map(c => c.code)).size).toBe(6);
  });
  it('findClass resolves by code and returns undefined otherwise', () => {
    expect(findClass('oop')?.name).toBe('OOP');
    expect(findClass('nope')).toBeUndefined();
  });
  it('ScanBody requires non-empty classCode and sig', () => {
    expect(ScanBody.safeParse({ classCode: 'oop', sig: 'abc' }).success).toBe(true);
    expect(ScanBody.safeParse({ classCode: 'oop' }).success).toBe(false);
    expect(ScanBody.safeParse({ classCode: '', sig: 'x' }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify failure** — `npm -w packages/shared test` → FAIL (no exports).

- [ ] **Step 4: Implement `packages/shared/src/index.ts`**

```ts
import { z } from 'zod';

export interface ClassInfo { code: string; name: string }
export interface RegistrationDto { id: string; classCode: string; className: string; registeredAt: string }

export const CLASSES: readonly ClassInfo[] = [
  { code: 'oop', name: 'OOP' },
  { code: 'iot', name: 'IoT' },
  { code: 'embedded-systems', name: 'Embedded Systems' },
  { code: 'advanced-electronics', name: 'Advanced Electronics' },
  { code: 'software-engineering', name: 'Software Engineering' },
  { code: 'ai', name: 'AI' },
];
export const findClass = (code: string) => CLASSES.find(c => c.code === code);

export const ScanBody = z.object({ classCode: z.string().min(1), sig: z.string().min(1) });
```

- [ ] **Step 5: Run to verify pass** — `npm -w packages/shared test` → 3 passed.
- [ ] **Step 6: Commit** — `git add . && git commit -m "chore: monorepo scaffold and shared class list"`

---

### Task 2: API — QR generation, scan verification, registration

**Files:**
- Create: `apps/api/package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`
- Create: `apps/api/src/qr.ts`, `src/store.ts`, `src/app.ts`, `src/server.ts`
- Test: `apps/api/tests/qr.test.ts`, `apps/api/tests/app.test.ts`

**Interfaces:**
- Consumes: `CLASSES`, `findClass`, `ScanBody`, `ClassInfo`, `RegistrationDto` from `@bitacora/shared`.
- Produces: `signClass(code: string): string`; `verifySig(code: string, sig: string): boolean`; `buildScanUrl(code: string): string`; `addRegistration(cls: ClassInfo): RegistrationDto`; `listRegistrations(): RegistrationDto[]` (newest first); `resetStore(): void` (clears memory + file); `createApp(): Express`.

- [ ] **Step 1: Package setup**

`apps/api/package.json`:
```json
{
  "name": "@bitacora/api", "version": "0.0.0", "private": true,
  "scripts": { "dev": "tsx watch src/server.ts", "start": "tsx src/server.ts", "test": "vitest run" }
}
```
Run:
```bash
npm i -w apps/api express@4 cors qrcode dotenv @bitacora/shared
npm i -D -w apps/api tsx typescript vitest supertest @types/express@4 @types/cors @types/qrcode @types/supertest @types/node
```
`tsconfig.json`: `{ "extends": "../../tsconfig.base.json", "include": ["src", "tests"] }`.
`.env.example`:
```
PORT=3000
QR_SECRET=change-me
APP_BASE_URL=http://localhost:5173
```
`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    fileParallelism: false,
    env: { QR_SECRET: 'test-secret', APP_BASE_URL: 'http://localhost:5173', REGISTRATIONS_FILE: './data/test-registrations.json' },
  },
});
```

- [ ] **Step 2: Write the failing tests**

`tests/qr.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { signClass, verifySig, buildScanUrl } from '../src/qr';

describe('qr signing', () => {
  it('is a deterministic 16-char base64url signature', () => {
    const s = signClass('oop');
    expect(s).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(signClass('oop')).toBe(s);
  });
  it('verifies the right sig and rejects another class', () => {
    expect(verifySig('oop', signClass('oop'))).toBe(true);
    expect(verifySig('ai', signClass('oop'))).toBe(false);
  });
  it('returns false (does not throw) for wrong-length or empty sig', () => {
    expect(verifySig('oop', 'abc')).toBe(false);
    expect(verifySig('oop', '')).toBe(false);
  });
  it('builds <APP_BASE_URL>/scan?c=&sig=', () => {
    const u = new URL(buildScanUrl('oop'));
    expect(u.origin).toBe('http://localhost:5173');
    expect(u.pathname).toBe('/scan');
    expect(u.searchParams.get('c')).toBe('oop');
    expect(u.searchParams.get('sig')).toBe(signClass('oop'));
  });
});
```
`tests/app.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import request from 'supertest';
import { createApp } from '../src/app';
import { resetStore } from '../src/store';
import { signClass } from '../src/qr';

const app = createApp();
beforeEach(() => resetStore());
const register = (body: unknown) => request(app).post('/api/registrations').send(body as object);

describe('GET /api/classes/:code/qr', () => {
  it('returns an SVG by default', async () => {
    const res = await request(app).get('/api/classes/oop/qr');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/svg+xml');
    expect(res.text).toContain('<svg');
  });
  it('returns a PNG with format=png', async () => {
    const res = await request(app).get('/api/classes/oop/qr?format=png').buffer().parse((r, cb) => {
      const chunks: Buffer[] = []; r.on('data', c => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.headers['content-type']).toContain('image/png');
    expect((res.body as Buffer).subarray(1, 4).toString()).toBe('PNG');
  });
  it('unknown class → 404 CLASS_NOT_FOUND', async () => {
    const res = await request(app).get('/api/classes/nope/qr');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CLASS_NOT_FOUND');
  });
});

describe('POST /api/registrations', () => {
  it('registers with a valid signature and lists it newest first', async () => {
    const a = await register({ classCode: 'oop', sig: signClass('oop') });
    expect(a.status).toBe(201);
    expect(a.body.registration).toMatchObject({ classCode: 'oop', className: 'OOP' });
    expect(a.body.registration.id).toBeTruthy();
    await register({ classCode: 'ai', sig: signClass('ai') });
    const list = await request(app).get('/api/registrations');
    expect(list.body.items.map((r: any) => r.classCode)).toEqual(['ai', 'oop']);
  });
  it('persists to the JSON file', async () => {
    await register({ classCode: 'iot', sig: signClass('iot') });
    const saved = JSON.parse(fs.readFileSync(process.env.REGISTRATIONS_FILE!, 'utf8'));
    expect(saved[0].classCode).toBe('iot');
  });
  it('tampered, wrong-length and empty sigs → 400 INVALID_QR and nothing is saved', async () => {
    for (const sig of ['AAAAAAAAAAAAAAAA', 'abc']) {
      const res = await register({ classCode: 'oop', sig });
      expect(res.status).toBe(400); expect(res.body.error.code).toBe('INVALID_QR');
    }
    expect((await request(app).get('/api/registrations')).body.items).toEqual([]);
  });
  it("another class's valid sig does not register the requested class", async () => {
    const res = await register({ classCode: 'ai', sig: signClass('oop') });
    expect(res.body.error.code).toBe('INVALID_QR');
  });
  it('unknown class → 404 CLASS_NOT_FOUND', async () => {
    const res = await register({ classCode: 'nope', sig: 'x' });
    expect(res.status).toBe(404); expect(res.body.error.code).toBe('CLASS_NOT_FOUND');
  });
  it('missing fields or empty body → 400 VALIDATION_ERROR', async () => {
    expect((await register({})).body.error.code).toBe('VALIDATION_ERROR');
    expect((await register({ classCode: 'oop' })).body.error.code).toBe('VALIDATION_ERROR');
  });
  it('malformed JSON → 400 VALIDATION_ERROR envelope', async () => {
    const res = await request(app).post('/api/registrations').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400); expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('misc', () => {
  it('unknown route → 404 NOT_FOUND envelope', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404); expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
```

- [ ] **Step 3: Run to verify failure** — `npm -w apps/api test` → FAIL (modules missing).

- [ ] **Step 4: Implement**

`src/qr.ts`:
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
`src/store.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ClassInfo, RegistrationDto } from '@bitacora/shared';

const file = () => process.env.REGISTRATIONS_FILE ?? path.resolve('data/registrations.json');
let cache: RegistrationDto[] | null = null;

function load(): RegistrationDto[] {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { cache = []; }
  return cache!;
}
export function addRegistration(cls: ClassInfo): RegistrationDto {
  const reg: RegistrationDto = { id: randomUUID(), classCode: cls.code, className: cls.name, registeredAt: new Date().toISOString() };
  const all = load();
  all.unshift(reg);
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(all, null, 2));
  return reg;
}
export const listRegistrations = () => [...load()];
export function resetStore() { cache = []; fs.rmSync(file(), { force: true }); }
```
`src/app.ts` — `createApp()`:
- `class HttpError extends Error { constructor(public status: number, public code: string, message: string) }`
- `app.use(cors()); app.use(express.json());`
- `GET /api/classes/:code/qr`: `findClass` else `HttpError(404,'CLASS_NOT_FOUND',…)`; `url = buildScanUrl(cls.code)`; `format === 'png'` → `QRCode.toBuffer(url, { width: 512, margin: 2 })` with `res.type('png')`; else `QRCode.toString(url, { type: 'svg', margin: 2 })` with `res.type('image/svg+xml')`. Async: wrap in try/catch → `next(e)`.
- `POST /api/registrations`: `ScanBody.safeParse(req.body)` fail → `HttpError(400,'VALIDATION_ERROR','classCode and sig are required')`; unknown class → 404 `CLASS_NOT_FOUND`; `!verifySig` → `HttpError(400,'INVALID_QR','This QR code is not valid')`; else `res.status(201).json({ registration: addRegistration(cls) })`.
- `GET /api/registrations` → `{ items: listRegistrations() }`.
- fallthrough → `HttpError(404,'NOT_FOUND','Route not found')`.
- error handler `(err, _req, res, _next)`: `HttpError` → its status/code; `err.type === 'entity.parse.failed'` → 400 `VALIDATION_ERROR` "Invalid JSON"; else `console.error(err)` and 500 `INTERNAL`. Always `{ error: { code, message } }`.

`src/server.ts`: `import 'dotenv/config'; createApp().listen(Number(process.env.PORT ?? 3000), '0.0.0.0', () => console.log(...))`.

- [ ] **Step 5: Run to verify pass** — `npm -w apps/api test` → all pass.
- [ ] **Step 6: Commit** — append `data/` to `.gitignore`; `git add . && git commit -m "feat(api): class QR generation, scan verification, registration"`

---

### Task 3: Web — classes page, QR display, scan landing

**Files:**
- Create: `apps/web/{package.json,tsconfig.json,index.html,vite.config.ts,env.d.ts}`
- Create: `apps/web/src/{main.ts,App.vue,router.ts,api.ts,style.css}`
- Create: `apps/web/src/lib/scan.ts`, `src/lib/scan.test.ts`
- Create: `apps/web/src/pages/{ClassesPage,ScanPage}.vue`

**Interfaces:**
- Consumes: `CLASSES`, `ClassInfo`, `RegistrationDto` from `@bitacora/shared`.
- Produces:
  - `parseScanQuery(q: Record<string, unknown>): { classCode: string; sig: string } | null` — non-empty string `c` and `sig`, else `null`
  - `errorMessage(code: string): string` — distinct friendly text for `INVALID_QR`, `CLASS_NOT_FOUND`, `NETWORK`, `VALIDATION_ERROR`; generic "Something went wrong. Please try again." otherwise
  - `registerScan(classCode: string, sig: string): Promise<RegistrationDto>` (throws `ApiError(code, message)`; network failure → code `NETWORK`)
  - `qrUrl(code: string): string` → `/api/classes/<encoded code>/qr`

- [ ] **Step 1: Package setup**

Run:
```bash
npm i -w apps/web vue vue-router @bitacora/shared
npm i -D -w apps/web vite @vitejs/plugin-vue vue-tsc typescript vitest
```
`apps/web/package.json` scripts: `"dev": "vite"`, `"build": "vue-tsc --noEmit && vite build"`, `"test": "vitest run"`. `tsconfig.json`: extends base, `"jsx": "preserve"`, include `src/**/*.ts`, `src/**/*.vue`, `env.d.ts`. `env.d.ts`: `/// <reference types="vite/client" />` plus the usual `*.vue` module shim. `index.html`: standard Vite entry with `<meta name="viewport" content="width=device-width, initial-scale=1">` and title "Class Registration".

`vite.config.ts`:
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
import { parseScanQuery, errorMessage } from './scan';

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
    const known = ['INVALID_QR', 'CLASS_NOT_FOUND', 'NETWORK', 'VALIDATION_ERROR'].map(errorMessage);
    expect(new Set(known).size).toBe(4);
    expect(errorMessage('WHATEVER')).toMatch(/something went wrong/i);
  });
});
```
- [ ] **Step 3: Run to verify failure** — `npm -w apps/web test` → FAIL.
- [ ] **Step 4: Implement `src/lib/scan.ts` and `src/api.ts`** per the Interfaces block. `registerScan` does `fetch('/api/registrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ classCode, sig }) })`; non-OK → `ApiError(body.error.code ?? 'INTERNAL', body.error.message ?? 'Request failed')`; returns `body.registration`.
- [ ] **Step 5: Run to verify pass** — `npm -w apps/web test` → pass.

- [ ] **Step 6: Implement app shell and pages**

- `router.ts`: `createRouter({ history: createWebHistory(), routes: [{ path: '/', component: ClassesPage }, { path: '/scan', component: ScanPage }, { path: '/:pathMatch(.*)*', redirect: '/' }] })`. `main.ts` mounts `App.vue` (header "Class Registration" + `<RouterView/>`) with the router; imports `style.css`.
- `ClassesPage.vue`: heading "Choose your class"; a grid of buttons, one per `CLASSES` entry (`v-for`). Clicking sets `selected`. When `selected` is set, show a panel/modal with class name, `<img :src="qrUrl(selected.code)">` (alt "QR code for {name}"), text "Scan this QR with your phone camera to register", and a "Close" button. The image area shows a loading state until `@load`, and an error message with a "Retry" button (re-sets the src with a cache-busting `?t=`) on `@error`. Selecting another class replaces the QR; Escape/backdrop closes.
- `ScanPage.vue`: on mount, `parseScanQuery(route.query)`; `null` → error state "This link is missing its QR data. Scan a class QR code again." with a link to `/`. Otherwise state `loading` ("Registering…"), call `registerScan`, then `success` — "Registered ✅", the class name, and `registeredAt` formatted with `toLocaleString()` — or `error` with `errorMessage(code)` and a "Try again" button (re-runs the call). Link "Back to classes".
- `style.css`: mobile-first; CSS variables; centered `max-width: 640px`; `.grid` of two columns on ≥ 480 px and one on narrower; large tap targets (min-height 56 px) for class buttons; `.card`, `.btn`, `.error`, `.success`, `.spinner`; modal overlay; QR image `width: min(320px, 80vw)` on a white background.

- [ ] **Step 7: Verify** — `npm -w apps/web test` passes and `npm -w apps/web run build` succeeds. Manual: run `npm run dev:api` and `npm run dev:web`; open `http://localhost:5173`, click "OOP" → QR appears; open the URL encoded in it (or `curl localhost:3000/api/classes/oop/qr` and decode, or scan it with a phone on the same Wi-Fi after setting `APP_BASE_URL`, see Task 4) → "Registered ✅"; edit one char of `sig` in the URL → "not valid" message; open `/scan` with no query → missing-data message.
- [ ] **Step 8: Commit** — `git add . && git commit -m "feat(web): classes page, QR display and scan landing"`

---

### Task 4: README and phone walkthrough

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`** with: one-paragraph overview (what the MVP does and what is deliberately excluded); setup (`npm install`, `cp apps/api/.env.example apps/api/.env`); run (`npm run dev:api`, `npm run dev:web`); **phone testing** — phone and computer on the same Wi-Fi, find the computer's LAN IP, set `APP_BASE_URL=http://<LAN-IP>:5173` in `apps/api/.env` and restart the API, open `http://<LAN-IP>:5173` on the computer, click a class, scan the QR with the phone's native camera app (the phone opens `/scan?...` and registers; no in-page camera, so HTTPS is not needed); where registrations are stored (`apps/api/data/registrations.json`) and how to view them (`GET /api/registrations`); endpoints table; limitations (no identity: every scan is a new registration; QR is not time-limited; anyone with the QR image can register).
- [ ] **Step 2: Full run** — `npm test` from the root → shared, api and web suites all pass.
- [ ] **Step 3: Walk the flow on a real phone** and note the result in the commit message: class click → QR → phone scan → "Registered ✅" → entry visible at `/api/registrations`; tampered link shows the error.
- [ ] **Step 4: Commit** — `git add README.md && git commit -m "docs: README and phone walkthrough"`

---

## Self-Review

**Spec/requirement coverage:** class list with the six names → Task 1 (data) + Task 3 (page); click shows QR → Task 2 (`/qr` endpoint) + Task 3 (modal); scan registers → Task 2 (`POST /registrations`, signature check) + Task 3 (`/scan` page); anti-forgery signature from spec §5.1 retained; no login/other backend per the team's decision.

**Type consistency:** `ClassInfo`, `RegistrationDto`, `ScanBody`, `findClass`, `CLASSES` defined in Task 1 and used with the same names in Tasks 2–3; `signClass/verifySig/buildScanUrl` signatures match between tests and implementation.

**Rulings for the executor:** scans create one registration each (no identity to dedupe on); `GET /api/registrations` is included only so registrations can be verified; JSON file storage replaces Prisma/DB; PWA, in-page camera scanner and HTTPS are dropped because the phone's native camera opens the URL.
