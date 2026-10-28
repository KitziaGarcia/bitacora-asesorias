# Automated Advising Log — Technical Spec (Milestone: Frontend + QR Flow)

## 0. What this app is

**Automated Advising Log** ("Bitácora automatizada de asesorías académicas") is a Progressive Web App for a university (UABC) that replaces the paper/manual log teachers keep of the academic advising sessions ("asesorías") they give to students.

**The problem:** today, when a student goes to a teacher's cubicle for help, the session is recorded by hand (or not at all). Data is incomplete, hard to audit, and impossible to turn into reports about how much advising happens, on which topics, and for which students.

**The solution:** each teacher's cubicle has a printed QR code. When a student arrives for advising, they scan the QR with their phone's browser (no native app needed). The system automatically creates the session record with the student's data (name, student ID, email) pre-filled from their account. The teacher then receives the request on their panel, writes the topic covered, and approves or rejects it. Every confirmed session is stored in a chronological history that later feeds reports for coordination.

**Users and roles:**
- **Student** — logs in, scans the cubicle QR (or uses a manual fallback), waits for confirmation, and sees their own advising history.
- **Teacher (advisor)** — sees incoming sessions in real time, confirms them with a topic and optional observations, and sees their history.
- **Admin / Coordination** — manages cubicles, downloads/rotates their QR codes, and (in a future milestone) views reports and exports them to PDF/Excel.

**Key non-functional goals:**
- Mobile-first and installable as a PWA; scanning works from the browser camera.
- Hard to cheat: QR codes are signed so a student can't forge one for a cubicle they aren't in.
- Expected load: ~30 teachers and ~200 concurrent students.

This document covers the **current milestone**: the full frontend plus a working end-to-end QR registration flow, backed by a minimal API. Everything else is mocked.

## 1. Scope of this milestone

**In scope (must work end-to-end):**
- Complete frontend (Vue 3 + TypeScript PWA) for the three roles: Student, Teacher, Admin.
- QR flow: QR generation per cubicle/teacher → student scans with browser camera → advising session is registered → teacher confirms topic → session appears in history.
- Minimal backend (TypeScript) supporting **only** the endpoints the QR flow needs.
- Manual fallback registration (student ID entry) in case the QR can't be read.

**Out of scope (use mock data, clearly labeled in the UI/demo):**
- Reports and PDF/Excel export.
- Time-invested analytics.
- Full admin CRUD (users, cubicles) beyond what's needed to seed data.
- Production deployment on UABC infrastructure.

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Vue 3 (Composition API, `<script setup lang="ts">`) + Vite | |
| Routing / State | Vue Router 4, Pinia | Route guards by role |
| PWA | `vite-plugin-pwa` | Manifest + service worker, installable |
| QR scanning | `qr-scanner` (nimiq) or `vue-qrcode-reader` | Uses `getUserMedia`; **requires HTTPS or localhost** |
| QR generation | `qrcode` (npm) | Generated on backend or admin panel, exported as PNG/SVG for printing |
| HTTP client | `axios` or `fetch` wrapper | Single `api/` service layer |
| Backend | Node.js + TypeScript + Express (or Fastify) | |
| ORM / DB | Prisma + PostgreSQL (SQLite acceptable for dev) | |
| Validation | `zod` | Share schemas between front and back if possible |
| Auth | JWT (access token), bcrypt for passwords | Roles: `STUDENT`, `TEACHER`, `ADMIN` |
| Real-time notify | Server-Sent Events (SSE) or polling every 5s | Web Push is out of scope for now |

---

## 3. Suggested repository structure

```
/apps
  /web            # Vue 3 PWA
    /src
      /api        # service layer (one file per resource)
      /components
      /composables  # useQrScanner, useAuth, useSessionStream
      /pages
        /student
        /teacher
        /admin
      /router
      /stores
      /types      # or import from /packages/shared
  /api            # Express + TS
    /src
      /routes
      /controllers
      /services
      /middleware # auth, role guard, error handler
      /lib        # prisma client, jwt, qr signing
    /prisma
      schema.prisma
      seed.ts
/packages
  /shared         # zod schemas + TS types used by both apps
```

---

## 4. Data model (minimum)

```prisma
enum Role { STUDENT TEACHER ADMIN }
enum SessionStatus { PENDING CONFIRMED REJECTED }
enum RegistrationMethod { QR MANUAL }

model User {
  id           String   @id @default(uuid())
  role         Role
  name         String
  email        String   @unique
  studentId    String?  @unique   // "matrícula", only for students
  passwordHash String
  createdAt    DateTime @default(now())
  cubicle      Cubicle? @relation("TeacherCubicle")
  sessionsAsStudent AdvisingSession[] @relation("StudentSessions")
  sessionsAsTeacher AdvisingSession[] @relation("TeacherSessions")
}

model Cubicle {
  id        String  @id @default(uuid())
  code      String  @unique          // e.g. "C-12"
  teacherId String? @unique
  teacher   User?   @relation("TeacherCubicle", fields: [teacherId], references: [id])
  qrSecret  String                   // used to sign QR payloads; rotate to invalidate printed QRs
  sessions  AdvisingSession[]
}

model AdvisingSession {
  id          String             @id @default(uuid())
  studentId   String
  teacherId   String
  cubicleId   String
  topic       String?
  observations String?
  status      SessionStatus      @default(PENDING)
  method      RegistrationMethod
  startedAt   DateTime           @default(now())
  endedAt     DateTime?
  confirmedAt DateTime?
  student     User    @relation("StudentSessions", fields: [studentId], references: [id])
  teacher     User    @relation("TeacherSessions", fields: [teacherId], references: [id])
  cubicle     Cubicle @relation(fields: [cubicleId], references: [id])
}
```

**Business rules:**
- A student can't have two `PENDING` sessions at the same time.
- Only the teacher assigned to the session can confirm or reject it.
- `durationMinutes` = `endedAt - startedAt` (computed, not stored).
- Duplicate scan within 2 minutes for the same student + cubicle returns the existing session instead of creating a new one.

---

## 5. QR design

### 5.1 Payload
The QR encodes a URL so it also works when scanned with the phone's native camera:

```
https://<host>/scan?c=<cubicleCode>&sig=<signature>
```

- `sig = HMAC-SHA256(cubicleCode, cubicle.qrSecret)`, base64url, truncated to ~16 chars.
- The backend verifies the signature before creating a session. This prevents students from forging a QR for a cubicle they are not in.
- Rotating `qrSecret` invalidates all previously printed QRs for that cubicle.

> Optional (if time allows): add a time-window component (`exp`) and show the QR on a teacher's screen instead of printing it, to prevent students registering from home with a photo of the QR.

### 5.2 Generation
- Admin panel → "Cubicles" → "Download QR" button.
- Backend endpoint returns PNG/SVG generated with `qrcode`.
- Printed QR includes the cubicle code in plain text below it.

### 5.3 Scanning (frontend)
- Composable `useQrScanner()` wrapping the library:
  - Request camera permission; handle `NotAllowedError`, `NotFoundError`, `NotReadableError` with friendly messages.
  - Prefer rear camera (`facingMode: 'environment'`).
  - Stop the camera stream on unmount / after a successful read.
  - Parse the URL, extract `c` and `sig`, call the register endpoint.
- If the student opens `/scan?c=...&sig=...` directly (native camera), the page skips the scanner and registers immediately (after login if needed, preserving the query via `redirect`).
- **Fallback:** "Can't scan?" link → manual form (cubicle code + confirmation). Registered with `method: MANUAL`.

### 5.4 Constraints
- Camera access only works on **HTTPS** or `localhost`. For testing on phones during dev, use a tunnel (ngrok / cloudflared) or Vite with `--host` + self-signed cert.
- Test on at least: Chrome Android, Safari iOS (iOS requires `playsinline` on the video element).
- Test with low light and low-end cameras (risk R02).

---

## 6. End-to-end flow

```
Student                     Frontend (PWA)                Backend                  Teacher
  |-- scans QR ------------->|                              |                         |
  |                          |-- POST /sessions/scan ------>| verify sig, create      |
  |                          |   {cubicleCode, sig}         | PENDING session         |
  |                          |<-- 201 {session} ------------|-- SSE event ----------->|
  |<-- "Waiting for teacher" |                              |                         |
  |                          |                              |<-- PATCH /sessions/:id/confirm
  |                          |                              |    {topic, approved}    |
  |                          |<-- SSE / poll: CONFIRMED ----|                         |
  |<-- "Session registered"  |                              |                         |
```

Student data (name, student ID, email) is **pre-filled from the JWT/user record**, never typed manually in the QR flow.

---

## 7. API endpoints (minimum for this milestone)

Base path: `/api/v1`. All responses JSON. Errors: `{ error: { code, message } }`.

### Auth
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/auth/login` | public | `{ email, password }` → `{ accessToken, user }` |
| GET | `/auth/me` | any | Current user |

### Sessions (advising)
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/sessions/scan` | STUDENT | `{ cubicleCode, sig }` → creates `PENDING` session (QR) |
| POST | `/sessions/manual` | STUDENT | `{ cubicleCode }` → creates `PENDING` session (MANUAL) |
| GET | `/sessions/pending` | TEACHER | Pending sessions for the logged-in teacher |
| PATCH | `/sessions/:id/confirm` | TEACHER | `{ topic, approved: boolean, observations? }` → `CONFIRMED` / `REJECTED` |
| PATCH | `/sessions/:id/end` | TEACHER | Sets `endedAt` |
| GET | `/sessions/:id` | owner/teacher | Session detail (used for polling) |
| GET | `/sessions/me` | STUDENT, TEACHER | Own history, newest first, paginated |
| GET | `/sessions/stream` | STUDENT, TEACHER | SSE stream of session events for the current user |

### Cubicles
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/cubicles` | ADMIN | List cubicles |
| GET | `/cubicles/:id/qr?format=png\|svg` | ADMIN | Download QR image |
| POST | `/cubicles/:id/rotate-qr` | ADMIN | Regenerate `qrSecret` |

### Error codes to handle in the frontend
| Code | HTTP | Meaning |
|---|---|---|
| `INVALID_QR` | 400 | Signature doesn't match |
| `CUBICLE_NOT_FOUND` | 404 | |
| `NO_TEACHER_ASSIGNED` | 409 | Cubicle has no teacher |
| `SESSION_ALREADY_PENDING` | 409 | Student already has a pending session |
| `FORBIDDEN` | 403 | Role or ownership mismatch |
| `UNAUTHORIZED` | 401 | Missing/expired token → redirect to login |

---

## 8. Frontend pages

### Student
- `/login`
- `/student` — home: big "Scan QR" button + last sessions.
- `/scan` — camera view; also handles deep link with `?c=&sig=`.
- `/scan/manual` — fallback form.
- `/student/sessions/:id` — waiting / confirmed / rejected state (live via SSE or polling).
- `/student/history` — list of own sessions.

### Teacher
- `/teacher` — pending sessions list (live), each with "Confirm" action.
- Confirm modal: topic (required), observations (optional), approve / reject.
- `/teacher/history`

### Admin
- `/admin/cubicles` — list + download QR + rotate QR.
- `/admin/reports` — **mock data**, labeled "Coming soon / sample data".

### General UI requirements
- Mobile-first (students use phones). Teacher/admin also usable on desktop.
- Every async action shows loading, success and error states.
- Role-based route guards; unauthenticated users redirected to `/login?redirect=...`.
- Installable PWA (manifest with name, icons 192/512, `display: standalone`, theme color).

---

## 9. Seed data

`prisma/seed.ts` should create:
- 1 admin, 3 teachers, 10 students (known passwords for demo).
- 3 cubicles, each assigned to a teacher.
- A few historical sessions in each status for the history views.

---

## 10. Acceptance criteria (demo checklist)

- [ ] Admin downloads the QR for a cubicle and it's printable.
- [ ] Student logs in on a phone, scans the printed QR, and a `PENDING` session is created with their data pre-filled.
- [ ] Scanning a tampered/fake QR shows an "Invalid QR" error.
- [ ] Teacher sees the new pending session without refreshing (≤ 5 s).
- [ ] Teacher confirms with a topic; the student's screen updates to "Confirmed".
- [ ] The session appears in both student and teacher history.
- [ ] Manual fallback works when the camera is denied.
- [ ] The PWA installs on Android Chrome.
- [ ] Mocked sections are clearly labeled as mock in the UI.

---

## 11. Environment variables

```
# api
DATABASE_URL=postgresql://...
JWT_SECRET=...
JWT_EXPIRES_IN=8h
APP_BASE_URL=https://<frontend-host>   # used to build QR URLs
CORS_ORIGIN=https://<frontend-host>

# web
VITE_API_URL=https://<api-host>/api/v1
```

---

## 12. Notes for the team

- Shared types live in `/packages/shared`; don't duplicate request/response types by hand.
- AI-generated code is fine, but every member must be able to explain the module they own during the review.
- Keep mock data behind the same `api/` service functions so swapping mock → real is a one-line change.
