# AGENTS.md — DriveHire & Carpool

The approved product schema, endpoint catalogue, role matrix, state machines, and release design live in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Keep it as the single source of truth and update `docs/DECISIONS.md` whenever an implementation choice deviates. UI implementation must follow [`docs/DESIGN.md`](docs/DESIGN.md) once Prompt 4.5 adds it.

## Stack (fixed)
- Frontend: React 18 + Vite + TypeScript, React Router, Axios, TanStack Query, React Hook Form + Zod, Tailwind CSS
- Backend: Node.js 20 + Express + TypeScript, layered `routes -> controllers -> services -> repositories`
- DB: PostgreSQL 15+ via Knex (`pg` driver), forward-only migrations
- Auth: JWT access 15m + rotating opaque refresh (httpOnly, SameSite=Strict, Secure=true prod / false local-dev only, Path=/api/v1/auth/refresh, SHA-256 hash in DB), bcrypt cost 12
- Libs: zod, helmet, cors, pino + pino-http, express-rate-limit, multer behind `StorageProvider` (local now, S3-ready), nodemailer (SMTP prod, console/Ethereal dev)
- Tests: Vitest + Supertest (real test Postgres), RTL, Playwright (3 critical E2E)
- Ops: Docker multi-stage, docker-compose (db, server, client via nginx), GitHub Actions CI, graceful shutdown, `/health` + `/ready`

## Repo layout
```
/client/src/{app,features,components,hooks,lib}  /client/tests  /client/e2e
/server/src/{config,routes,controllers,services,repositories,middleware,domain,storage,mail}
/server/migrations  /server/seeds (dev only)
/docs  /.github/workflows  /docker  /.env.example
```
Rules: no SQL outside `repositories`; no business logic in `controllers`; frontend features never cross-import except via `lib`.

## Run / Test / Lint (server + client split)
```bash
# infra
docker compose up --build            # db + server + client
# server (from /server)
npm run dev | npm run build | npm start
npm test                             # Vitest + Supertest (needs test PG)
npm run lint | npm run typecheck
npx knex migrate:latest | npx knex seed:run   # seeds dev only
# client (from /client)
npm run dev | npm run build | npm run preview
npm test | npm run lint | npm run typecheck
npx playwright test                  # 3 E2E flows only
```

## Coding conventions
- TypeScript strict, no `any` without justification; Zod schemas validate every input boundary (body/query/params).
- Backend errors via typed `AppError(code, status, message, details)`; never leak stack/PII to client.
- Money in integer cents; times ISO-8601 in, UTC `timestamptz` stored, ISO `Z` out.
- Soft-delete: `deleted_at`; default scope `WHERE deleted_at IS NULL`.
- Pagination: `?page&limit(<=100, default 20)&sort=field:asc|desc`; versioned `/api/v1`.
- Idempotency: `Idempotency-Key` header on `POST /bookings`, `POST /carpool-trips/:id/requests`.

## Response envelope (mandatory)
```json
{ "success": true, "data": {} }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {} } }
```
Codes: `VALIDATION_ERROR 400, UNAUTHENTICATED 401, FORBIDDEN 403, NOT_FOUND 404, CONFLICT 409, RATE_LIMITED 429, INTERNAL 500`.

## Security rules
- Single primary role per user (`passenger|driver|owner|admin`); no multi-role design. Role upgrades require admin approval.
- Passwords bcrypt(12); OTP 6-digit, 10-min expiry, 5 attempts max, 60s resend cooldown, hash-only storage, email only.
- Refresh: opaque, hashed, rotated, reuse revokes family. Access JWT in memory only (never localStorage).
- Uploads: 5MB max, allowlist `jpeg/png/webp/pdf` + magic-byte check, random `uuid.ext` key, stream via controller (no direct static serving of uploads).
- `helmet` + HSTS (prod); `cors({origin: allowlist, credentials:true})`, never `*`. Rate limits: auth 10/min/IP, refresh 30/min, writes 60/min/user, search 120/min, admin 300/min.
- Cancellation needs `reason`; `now < start_at` for non-admin; admin may cancel after start.

## Git / commits
- Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`, `ci:`.
- Migrations forward-only, never edit applied migration; seeds never run in prod.
- **Never break earlier phases; add regression tests when touching shared code.**
