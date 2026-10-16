# Phase 02 schema handoff

Branch `codex/phase-01-project-foundation`. Milestone02 (prompts 02 Tasks 1–5)
delivers the 26 active tables as four forward-only Prisma migrations with real
PostgreSQL invariants and verified readiness. No feature modules from later
milestones. Merge/push/production remain separate owner decisions.

## Migrations (apps/api/prisma/migrations)

- `0001_identity`: pgcrypto, `set_updated_at()`, cities, users (normalized
  unique email CHECK), user_roles, refresh_sessions/tokens (rotation chain),
  auth_challenges (5 attempts, single-live trigger), auth-only outbox
  (AUTH_VERIFY_EMAIL/AUTH_RESET_PASSWORD), rate_limit_buckets, admin_policy
  singleton, job_leases. Minimal runtime grants.
- `0002_qualification`: driver_profiles (immutable owner, approved-fields
  CHECK, license digest uniqueness), vehicles (seats 2–12, contract enums,
  immutable owner), documents (single subject, LICENSE-driver-only kind
  trigger), verification_requests (single subject, pending uniqueness,
  snapshot-immutable trigger), current-revision FKs added after both sides,
  same-subject link trigger.
- `0003_journeys`: availability_windows, booking_quotes (DRIVER_HIRE only,
  total=subtotal, INR ≤100000000), bookings (unique quote), booking_decisions
  (one DRIVER row), carpools (INSTANT only, confirmed≤offered), seat_requests
  (live uniqueness), trips (single parent, unique per parent),
  resource_reservations (single resource/source shape, half-open range),
  trip_status_history (per-trip version uniqueness), idempotency_keys,
  audit_logs. No exclusions yet.
- `0004_invariants`: btree_gist, partial GiST driver/vehicle exclusions on
  unreleased half-open ranges, deferred source/parent consistency triggers
  (validated at COMMIT), carpool capacity (offered ≤ seats−1) and seat-sum
  equality triggers, FK indexes, append-only REVOKEs (quotes, histories,
  audit, verification links).

Prisma 7.10.1 pinned (latest stable; 8.0.0-rc prerelease excluded).
`prisma.config.ts` uses the migration identity only; runtime connects via
pg.Pool/adapter with least-privilege grants and cannot run DDL (42501).

## Commands (all exit 0 locally)

- `npm run db:generate` — Prisma client (offline-safe).
- `npm run db:validate -- --target test` — schema valid, 4 on disk, history
  matches, nothing pending. Checksum drift (sha256 file vs history) fails.
- `npm run db:migrate:deploy -- --target test` — 4 found, nothing pending.
- `npm run db:test:constraints` — 6/6 (real PG suite; fails closed).
- `npm run test:integration` — 26/26 across 6 files on a fresh test DB.
- `npm test` (33 unit + 1 contract), typecheck, lint, docs:check,
  format:check, build — green.

CI (`.github/workflows/ci.yml` infrastructure job): generate → validate →
compose.test up → migrate deploy → integration → constraints → infra check.
Verify job generates the client before typecheck.

## Readiness

`probeReadiness` unchanged in shape: users + job_leases +
_prisma_migrations present, worker-heartbeat lease fresh (2 min). Proven:
pre-schema {true,false,false}, migrated-no-worker {true,true,false},
heartbeat {true,true,true}, aged lease back to {true,true,false}.
Deferred catalog (owner_profiles, rentals, reviews, notifications, reports,
complaints) asserted absent.

## Boundaries and follow-ups

- No business endpoints, no seeds of provider/customer rows, no city seed
  rows (IANA validation deferred to service layer with curated seeds).
- cities.timezone has length CHECK only (ledger).
- Test DB is tmpfs; external container stop discards it — suite redeploys
  from scratch (observed during this milestone).
- Failed-migration marks require `migrate resolve --rolled-back` before
  redeploy (observed once via an incomplete drop list; drop helper fixed).
- Independent whole-branch review required before advancing to Milestone03.
