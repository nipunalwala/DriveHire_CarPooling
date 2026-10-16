# Milestone02 execution ledger (scratch; archived into 02-schema.md in Task 5)

## Task 1: database harness and identity schema — GREEN 2026-10-17

- RED: `npm run test:integration -- apps/api/src/runtime/migrations.integration.test.ts`
  failed to load (`Cannot find module '../test/database-fixture.js'`). Real
  runner, missing behavior. Prisma 7.10.1 pinned after verifying latest stable
  (8.0.0-rc.23 prerelease excluded); @prisma/client/@prisma/adapter-pg 7.10.1.
- GREEN: same command 3/3 pass (guard refusal, normalized unique email via
  CHECK+UNIQUE, runtime DDL denied 42501, Prisma adapter read-back).
- Full suite: unit 33/33, contract 1/1, typecheck (3 workspaces), lint +
  boundaries, docs:check (6 scope regressions, 21 specs/70 ops/26 screens),
  format:check, build — all exit 0.
- Fixes during GREEN: added `datasource db` + explicit client output under
  `src/generated` (rootDir rule); generated client gitignored, eslint/prettier
  ignored; `$queryRaw` used as template tag.
- Notes: cities.timezone IANA membership enforced at service layer once
  curated seeds exist (no invented seed rows). Old
  `database.integration.test.ts` missing-schema case now observes migrated
  schema; its isolation update is owned by Task 5. Test services started with
  `compose.test.yml` only; dev data untouched.

## Task 2: qualification and evidence schema — GREEN 2026-10-17

- RED: `npm run test:integration -- .../providers/schema.integration.test.ts`
  4 failed on missing tables (catalog check passed vacuously pre-schema).
- GREEN: 5/5 pass (owner immutability + value check, snapshot update/delete
  denial, cross-subject link rejection, seats 1/13 rejection, rental-column
  absence). Full integration 10/10 across 3 files on repeat runs.
- Full suite: unit 33/33, contract 1/1, typecheck, lint+boundaries,
  docs:check, format:check, build — all exit 0.
- Fixes during GREEN: schema.prisma needed opposite relation fields for the
  verification join; `--fileParallelism=false` added to `test:integration`
  (shared-DB TRUNCATE deadlocks when files run parallel); Phase01
  missing-schema test rewritten to drop/redeploy isolation via new fixture
  helpers `deployTestMigrations`/`dropTestSchema` (Task 5 will formalize).
- Incident: `admin_policy` missing from the truncate/drop list poisoned
  redeploy (42P07 -> P3009 failed mark). Recovered with
  `migrate resolve --rolled-back` + full reset; added the table and a
  sentinel redeploy guard in the fixture. Lesson recorded for Task 5
  fresh/incremental scripts: always resolve failed marks before deploy.
- Notes: verification status CHECK follows contract
  (DRAFT/PENDING/APPROVED/REJECTED/EXPIRED); document kinds
  LICENSE(drive-only)/REGISTRATION+INSURANCE(vehicle-only) enforced by
  trigger; driver rate CHECK 1..100000000 while contract allows 0 (service
  layer in 04 must reject 0 with 422).

## Task 3: booking, carpool and trip schema — GREEN 2026-10-17

- RED: `npm run test:integration -- .../resources/schema.integration.test.ts`
  6 failed on missing tables.
- GREEN: 6/6 pass (mode rejection, single DRIVER consent + anchor row check,
  live-seat uniqueness, trip parent XOR/uniqueness, price/capacity bounds,
  quote total=subtotal). Full integration 16/16 across 4 files.
- Full suite: unit 33/33, contract 1/1, typecheck, lint+boundaries,
  docs:check, format:check, build — all exit 0.
- Notes: GiST exclusions and deferred source/parent triggers intentionally
  deferred to Task 4; 0003 has basic CHECK/FK/index shape only. Carpool
  `join_mode` constrained to INSTANT; no approval-seat columns. Fixture
  truncate/grants and P3009 history lists extended to 0003.

## Task 4: SQL resource protections and runtime grants — GREEN 2026-10-17

- RED: constraints suite 6/6 failed pre-0004 (missing exclusions/triggers).
- GREEN: `npm run db:test:constraints` 6/6 via the new real PG runner
  (replaces exit-2 placeholder; fails closed without dedicated target or
  fixture). Overlap 23P01 + exact adjacency success, cross-driver vehicle
  conflict, deferred mismatch failing at COMMIT with zero holds left,
  XOR/reversed-interval 23514, capacity/sum guards, 42501 on immutable
  rewrites. Full integration 22/22 across 5 files.
- Full suite: unit 33/33, contract 1/1, typecheck, lint+boundaries,
  docs:check, format:check, build — all exit 0.
- Fixes during GREEN: per-side source matching (single-resource holds carry
  one side of a two-resource source); TG_TABLE_NAME branching in the seat-sum
  guard; fixture now explicitly REVOKEs append-only posture (self-healing
  against grant drift); Task 3 live-seat test updated to bump confirmed_seats
  in the same transaction (required by the new sum invariant).
- Incident: edited-but-applied migrations don't redeploy (expected Prisma
  behavior) — disposable test DB was fully reset to pick up fixed 0004 SQL.
  Task 5 validate-schema must detect file-vs-applied drift in CI.

## Task 5: migration reproducibility and real readiness — GREEN 2026-10-17

- RED: `npm run db:validate` exited 2 (unavailable-suite placeholder).
- GREEN: new `scripts/migrate.mjs` (migrator-identity guard, `--target
  test|dev`), `scripts/validate-schema.mjs` (`prisma validate` + file
  presence + sha256 file-vs-history drift check), `scripts/generate-client.mjs`
  (offline-safe). Chain `db:validate && db:migrate:deploy && db:test:constraints
  && test:integration` fully green against dedicated test services.
- Tests: `readiness.integration.test.ts` (worker lease transitions via the
  real worker heartbeat functions, deferred-catalog absence),
  `fresh_and_incremental_migrate_match` (drop → deploy → marker →
  redeploy keeps history identical and data intact). Full integration 26/26
  across 6 files, twice including once on a discarded-and-recreated tmpfs DB.
- CI: verify job generates the client pre-typecheck; infrastructure job runs
  generate → validate → test services → migrate deploy → integration →
  constraints → infra check. (Remote CI execution not claimed; Dockerfiles
  untouched.)
- Full suite: unit 33/33, contract 1/1, typecheck, lint+boundaries,
  docs:check, format:check, build — all exit 0.
- Fixes during GREEN: top-level `return` illegal in ESM scripts (main()
  wrapper); `--target test` spaceless-arg parsing; prisma.config needs
  MIGRATION_DATABASE_URL even for offline steps (dummy fallback in scripts
  only, never for deploy); serial file execution kept (26 tests, ~1 min).
- Incident: external test-container stop mid-milestone discarded tmpfs DB;
  suite self-healed via deploy-on-fixture. `02-schema.md` handoff written.
  Next: independent whole-branch review, then Milestone03.
