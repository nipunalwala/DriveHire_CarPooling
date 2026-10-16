# Milestone02: Database Schema Migrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` for preserved native execution; use `superpowers:subagent-driven-development` only if the owner chooses delegated execution. Implement task-by-task with RED->GREEN, preserve prior passing suites and one final independent review. This plan needs owner review before implementation.

**Goal:** Create only the26 active tables, forward migrations, real SQL protections and verified readiness.

**Architecture:** Existing Express API/worker and React client share browser-safe contracts; PostgreSQL owns current state and invariants. Deliver a usable vertical journey within this subsystem; never claim unimplemented future behavior.

**Tech Stack:** Existing React/Vite/TypeScript/Tailwind, Express/Prisma/PostgreSQL, Vitest/RTL/Supertest, Docker and real browser E2E when introduced in03.

**Spec:** `docs/superpowers/specs/2026-10-17-lean-first-release-design.md`, current `docs/specification/`, `docs/api/openapi.json`, `docs/planning-model.json` and `docs/planning/screens.json`.

## Global Constraints

- Same existing repository; preserve completed Phase01. No main merge, push or production launch without the chosen integration action.
- Node24.22.0/npm11.19.1 baseline; strict TypeScript, exact lockfile and browser-safe contracts. Use project-local Windows runtime when system Node is older.
- Only DRIVER_HIRE, INSTANT seats and PASSENGER/DRIVER/ADMIN. Ownership is users.id, with no owner profile/dashboard. Deferred inventory is excluded from implementation/acceptance.
- INR integer paise; maximum stored amount100000000. “Payment not collected by DriveHire.” No payments/maps/GPS/navigation.
- Preserve server/object authorization, private evidence, immutable audit/history, resource exclusions, seat limits, version CAS and idempotency. No fake adapters, endpoints or passing placeholder suites.
- Test services are dedicated drivehire_test; never dev/retired database. No external IO while holding domain locks. Preserve all prior passing tests.
- Use Superpowers test-first native execution and one independent whole-branch review. Use Impeccable for frontend work and imagegen for committed original project raster assets in07.

## Review Focus

- Encoded/query-overridden test database targets must fail before connection (Task1).
- Deferred resource checks must also hold at transaction commit, not only direct insert (Task4).
- Exact interval adjacency must work while one-resource overlap fails (Task4).
- Runtime identity must be unable to rewrite owners, quotes/history/audit (Tasks2/4).
- Migrated database with stale/missing worker lease must remain unready (Task5).

## File responsibilities

Each task lists its owned files before steps. service files own business transactions; routes own strict IO/auth/envelopes; contracts own safe schemas/DTO types; adapters own actual external IO; feature UI owns task interaction; integration/E2E tests own persisted behavior evidence. Small cohesive files may be split within a listed module without changing its interface.

### Task 1: Database harness and identity schema

**Files:** Create/modify `apps/api/prisma/schema.prisma`, `apps/api/prisma.config.ts`, `apps/api/prisma/migrations/0001_identity/migration.sql`, `apps/api/src/runtime/prisma.ts`, `apps/api/src/test/database-fixture.ts`, `apps/api/src/runtime/migrations.integration.test.ts`, `package.json`, `package-lock.json`. Preserve existing files where named; create missing module files. Tests are the integration/E2E files listed here.

**Interfaces:** Consumes requireTestDatabaseUrl(value:string|undefined):string. Produces createPrisma(databaseUrl:string):PrismaClient and withTestDatabase<T>(run:(fixture:DatabaseFixture)=>Promise<T>):Promise<T>; DatabaseFixture exposes migrationPool:pg.Pool, runtimePool:pg.Pool and reset():Promise<void>. reset verifies dedicated target and migration identity, owns no development resources. All named DTOs/inputs are generated or hand-mapped exactly to the active OpenAPI schemas in packages/contracts; Page<T> is {success:true,data:T[],meta:PageMeta} for list responses. Do not return Prisma rows directly.

- [ ] **Step1: Write failing behavioral regressions.** Named cases and assertions: migration_guard_refuses_dev_and_query_host_override: expect rejected connection before IO; identity_schema_has_normalized_unique_email: duplicate normalized email rejected; runtime_cannot_create_table: SQLSTATE42501. Verify quoted mixed-case email normalization and local dedicated connection guard.
      **Assertion anchor:** Use the dedicated fixture runtimePool and migration role setup from this task. These assertions belong inside the named behavioral tests above; setup/fixtures must exercise the real implementation.

```ts
expect(() =>
  requireTestDatabaseUrl('postgresql://u:p@127.0.0.1:55433/drivehire_test?host=outside.example'),
).toThrow();
await expect(runtimePool.query('CREATE TABLE forbidden_runtime_ddl(id int)')).rejects.toMatchObject(
  { code: '42501' },
);
```

- [ ] **Step2: Run the focused command before implementation.** Run `npm run test:integration -- apps/api/src/runtime/migrations.integration.test.ts`. Expected: FAIL because the named behavior/schema/route does not exist or violates its assertion. An unavailable-suite exit2 is a prerequisite failure, not a meaningful RED test: install/wire the real runner in this task, rerun and observe an actual behavior assertion fail. No green claim from compilation/source inspection alone.
- [ ] **Step3: Implement the smallest complete behavior.** Verify stable compatible Prisma/client/pg-adapter versions against Node24/TS5.9 before exact pinning; do not blindly install a latest prerelease. Configure migration URL separately from runtime URL. First migration defines cities, users, user_roles, sessions/tokens/challenges, auth-only outbox, rate limits, admin_policy and job_leases per dictionary. No data reset outside disposable dedicated test database. Preserve guard and readiness names.
- [ ] **Step4: Run the focused command again.** Run `npm run test:integration -- apps/api/src/runtime/migrations.integration.test.ts`. Expected: PASS; every named regression and its persisted/visible assertions executed, no skipped/future-suite success. Also run `npm test`, `npm run typecheck`, `npm run lint`, `npm run docs:check`, `npm run format:check` and `npm run build`; include prior integration/E2E suites after their introduction. Expected: all implemented suites exit0. Observe each output, investigate failures, never count unavailable suites as passing.
- [ ] **Step5: Commit the deliverable and update this milestone's execution ledger.** Stage only task-owned changes and tests; commit as `feat: database harness and identity schema` (use `docs:`/`test:` when no product code changes). Record observed RED/GREEN and full-suite results. Do not merge/push as an incidental task step.

### Task 2: Qualification and evidence schema

**Files:** Create/modify `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/0002_qualification/migration.sql`, `apps/api/src/modules/providers/schema.integration.test.ts`. Preserve existing files where named; create missing module files. Tests are the integration/E2E files listed here.

**Interfaces:** Consumes DatabaseFixture and identity FKs. Produces driver_profiles, vehicles, documents, verification_requests and verification_documents with DTO-mapped names and current-revision references; current revision FKs are added after both tables exist. All named DTOs/inputs are generated or hand-mapped exactly to the active OpenAPI schemas in packages/contracts; Page<T> is {success:true,data:T[],meta:PageMeta} for list responses. Do not return Prisma rows directly.

- [ ] **Step1: Write failing behavioral regressions.** Named cases and assertions: vehicle_owner_is_immutable: update owner rejected; revision_snapshot_is_immutable: snapshot update/delete denied; foreign_document_subject_rejected: mixed-subject submission fails; invalid_capacity_rejected: seats1 or13 rejected; personal_vehicle_has_no_rental_columns: schema catalog lacks listed/hourly_rate_minor/owner_profiles.
      **Assertion anchor:** Seed two users and one personal vehicle using the dictionary; bind ownerId, foreignOwnerId and vehicleId. These assertions belong inside the named behavioral tests above; setup/fixtures must exercise the real implementation.

```ts
await expect(
  runtimePool.query('UPDATE vehicles SET owner_id=$1 WHERE id=$2', [foreignOwnerId, vehicleId]),
).rejects.toBeDefined();
expect(
  (await runtimePool.query('SELECT owner_id FROM vehicles WHERE id=$1', [vehicleId])).rows[0]
    .owner_id,
).toBe(ownerId);
```

- [ ] **Step2: Run the focused command before implementation.** Run `npm run test:integration -- apps/api/src/modules/providers/schema.integration.test.ts`. Expected: FAIL because the named behavior/schema/route does not exist or violates its assertion. An unavailable-suite exit2 is a prerequisite failure, not a meaningful RED test: install/wire the real runner in this task, rerun and observe an actual behavior assertion fail. No green claim from compilation/source inspection alone.
- [ ] **Step3: Implement the smallest complete behavior.** Use typed DRIVER/VEHICLE subjects, immutable owner and document snapshots, registration/license digests and encrypted identity fields. Add owner/current-revision indexes and RESTRICT FKs. DRIVER role is separate qualification. Do not add OWNER profile/role or rental schema.
- [ ] **Step4: Run the focused command again.** Run `npm run test:integration -- apps/api/src/modules/providers/schema.integration.test.ts`. Expected: PASS; every named regression and its persisted/visible assertions executed, no skipped/future-suite success. Also run `npm test`, `npm run typecheck`, `npm run lint`, `npm run docs:check`, `npm run format:check` and `npm run build`; include prior integration/E2E suites after their introduction. Expected: all implemented suites exit0. Observe each output, investigate failures, never count unavailable suites as passing.
- [ ] **Step5: Commit the deliverable and update this milestone's execution ledger.** Stage only task-owned changes and tests; commit as `feat: qualification and evidence schema` (use `docs:`/`test:` when no product code changes). Record observed RED/GREEN and full-suite results. Do not merge/push as an incidental task step.

### Task 3: Booking, carpool and trip schema

**Files:** Create/modify `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/0003_journeys/migration.sql`, `apps/api/src/modules/resources/schema.integration.test.ts`. Preserve existing files where named; create missing module files. Tests are the integration/E2E files listed here.

**Interfaces:** Consumes qualified driver/vehicle identities. Produces availability_windows, booking_quotes, bookings, booking_decisions, carpools, seat_requests, trips, resource_reservations, trip_status_history, idempotency_keys and audit_logs. Exactly one DRIVER decision per booking; one typed parent per trip. All named DTOs/inputs are generated or hand-mapped exactly to the active OpenAPI schemas in packages/contracts; Page<T> is {success:true,data:T[],meta:PageMeta} for list responses. Do not return Prisma rows directly.

- [ ] **Step1: Write failing behavioral regressions.** Named cases and assertions: unsupported_modes_rejected: DRIVER_HIRE/INSTANT only; duplicate_driver_consent_rejected: second decision fails; duplicate_live_seat_rejected: second ACCEPTED same passenger/ride fails; trip_parent_xor_and_uniqueness: missing/both/duplicate parent rejected; bound_prices_and_capacity: negative/overflow rejected; quote_total_equals_driver_subtotal: other total rejected.
      **Assertion anchor:** After seeding a valid quote/booking, bind rows from booking_decisions for that booking. These assertions belong inside the named behavioral tests above; setup/fixtures must exercise the real implementation.

```ts
expect(rows).toHaveLength(1);
expect(rows[0]).toMatchObject({ kind: 'DRIVER', status: 'PENDING' });
```

- [ ] **Step2: Run the focused command before implementation.** Run `npm run test:integration -- apps/api/src/modules/resources/schema.integration.test.ts`. Expected: FAIL because the named behavior/schema/route does not exist or violates its assertion. An unavailable-suite exit2 is a prerequisite failure, not a meaningful RED test: install/wire the real runner in this task, rerun and observe an actual behavior assertion fail. No green claim from compilation/source inspection alone.
- [ ] **Step3: Implement the smallest complete behavior.** Define active dictionary columns, constraints and indexes. Do not create pending approval-seat or removed module columns. Immutable quotes carry driver rate/subtotal only. Histories record actual state changes; audit has no report aggregate tables. Generate Prisma client from reviewed SQL mapping, never substitute ORM uniqueness for cross-resource constraints.
- [ ] **Step4: Run the focused command again.** Run `npm run test:integration -- apps/api/src/modules/resources/schema.integration.test.ts`. Expected: PASS; every named regression and its persisted/visible assertions executed, no skipped/future-suite success. Also run `npm test`, `npm run typecheck`, `npm run lint`, `npm run docs:check`, `npm run format:check` and `npm run build`; include prior integration/E2E suites after their introduction. Expected: all implemented suites exit0. Observe each output, investigate failures, never count unavailable suites as passing.
- [ ] **Step5: Commit the deliverable and update this milestone's execution ledger.** Stage only task-owned changes and tests; commit as `feat: booking, carpool and trip schema` (use `docs:`/`test:` when no product code changes). Record observed RED/GREEN and full-suite results. Do not merge/push as an incidental task step.

### Task 4: SQL resource protections and runtime grants

**Files:** Create/modify `apps/api/prisma/migrations/0004_invariants/migration.sql`, `apps/api/src/modules/resources/constraints.integration.test.ts`, `scripts/test-constraints.mjs`, `package.json`. Preserve existing files where named; create missing module files. Tests are the integration/E2E files listed here.

**Interfaces:** Consumes all typed source tables. Produces separate partial GiST driver/vehicle exclusions for unreleased half-open intervals, typed-source/parent consistency triggers, capacity checks and append-only runtime grants. All named DTOs/inputs are generated or hand-mapped exactly to the active OpenAPI schemas in packages/contracts; Page<T> is {success:true,data:T[],meta:PageMeta} for list responses. Do not return Prisma rows directly.

- [ ] **Step1: Write failing behavioral regressions.** Named cases and assertions: same_driver_overlap_rejected_and_adjacency_allowed: overlap23P01, adjacent success; same_vehicle_overlap_rejected: different driver still fails; wrong_source_resource_pair_rejected: deferred constraint fails at commit; resource_source_xor_rejected: zero/two source refs fail; seat_sum_and_capacity_guarded: corrupted totals fail transaction; audit_history_quote_update_denied: runtime cannot rewrite immutable records. Include reversed intervals and source rollback leaving no holds.
      **Assertion anchor:** Bind conflictingInsert to the second overlapping-driver insert transaction; bind adjacentInsert to the exact-touching interval transaction. These assertions belong inside the named behavioral tests above; setup/fixtures must exercise the real implementation.

```ts
await expect(conflictingInsert).rejects.toMatchObject({ code: '23P01' });
await expect(adjacentInsert).resolves.toBeDefined();
```

- [ ] **Step2: Run the focused command before implementation.** Run `npm run db:test:constraints`. Expected: FAIL because the named behavior/schema/route does not exist or violates its assertion. An unavailable-suite exit2 is a prerequisite failure, not a meaningful RED test: install/wire the real runner in this task, rerun and observe an actual behavior assertion fail. No green claim from compilation/source inspection alone.
- [ ] **Step3: Implement the smallest complete behavior.** Enable btree_gist under migration identity. Check exact resource/source shape and source-parent ownership with deferred triggers; validate public availability at service layer later. Add FK indexes and minimal grants per runtime role, including SELECT-only immutable records and permitted append operations. Replace constraint exit2 placeholder with real PG suite; script must fail if target/fixture absent.
- [ ] **Step4: Run the focused command again.** Run `npm run db:test:constraints`. Expected: PASS; every named regression and its persisted/visible assertions executed, no skipped/future-suite success. Also run `npm test`, `npm run typecheck`, `npm run lint`, `npm run docs:check`, `npm run format:check` and `npm run build`; include prior integration/E2E suites after their introduction. Expected: all implemented suites exit0. Observe each output, investigate failures, never count unavailable suites as passing.
- [ ] **Step5: Commit the deliverable and update this milestone's execution ledger.** Stage only task-owned changes and tests; commit as `feat: sql resource protections and runtime grants` (use `docs:`/`test:` when no product code changes). Record observed RED/GREEN and full-suite results. Do not merge/push as an incidental task step.

### Task 5: Migration reproducibility and real readiness

**Files:** Create/modify `scripts/migrate.mjs`, `scripts/validate-schema.mjs`, `apps/api/src/runtime/database.integration.test.ts`, `apps/api/src/runtime/readiness.integration.test.ts`, `.github/workflows/ci.yml`, `docs/quality/phase-handoffs/02-schema.md`. Preserve existing files where named; create missing module files. Tests are the integration/E2E files listed here.

**Interfaces:** Consumes reviewed migrations and foundation probeReadiness(pool:pg.Pool):Promise<ReadinessState>, updateHeartbeat(pool,owner):Promise<boolean>. Produces working db:validate/db:migrate:deploy commands and schema-aware integration fixtures; no fake heartbeat job. All named DTOs/inputs are generated or hand-mapped exactly to the active OpenAPI schemas in packages/contracts; Page<T> is {success:true,data:T[],meta:PageMeta} for list responses. Do not return Prisma rows directly.

- [ ] **Step1: Write failing behavioral regressions.** Named cases and assertions: fresh_and_incremental_migrate_match: deploy to disposable empty DB then deploy again with no drift/data loss; before_schema_ready503: isolated pre-migration fixture; migrated_without_worker_ready503: stale/absent lease; running_worker_ready200_then_stale503: actual worker updates expected columns; no_deferred_entities: table catalog excludes deferred inventory.
      **Assertion anchor:** Use the migrated fixture pool and the existing actual worker heartbeat write, then deliberately age only the test lease. These assertions belong inside the named behavioral tests above; setup/fixtures must exercise the real implementation.

```ts
expect(await probeReadiness(runtimePool)).toEqual({ database: true, schema: true, worker: false });
await updateHeartbeat(runtimePool, 'integration-worker');
expect(await probeReadiness(runtimePool)).toEqual({ database: true, schema: true, worker: true });
```

- [ ] **Step2: Run the focused command before implementation.** Run `npm run db:validate && npm run db:migrate:deploy && npm run db:test:constraints && npm run test:integration`. Expected: FAIL because the named behavior/schema/route does not exist or violates its assertion. An unavailable-suite exit2 is a prerequisite failure, not a meaningful RED test: install/wire the real runner in this task, rerun and observe an actual behavior assertion fail. No green claim from compilation/source inspection alone.
- [ ] **Step3: Implement the smallest complete behavior.** Wire explicit migration target; default runtime startup never applies DDL. Update old integration test that assumes permanently absent schema to isolate missing-schema case. Test real worker, then stop/wait or use controlled stale timestamp to prove readiness loss. Preserve no-schema failure behavior. CI starts dedicated services, deploys schema and runs constraints; record fresh/incremental results and least-privilege evidence.
- [ ] **Step4: Run the focused command again.** Run `npm run db:validate && npm run db:migrate:deploy && npm run db:test:constraints && npm run test:integration`. Expected: PASS; every named regression and its persisted/visible assertions executed, no skipped/future-suite success. Also run `npm test`, `npm run typecheck`, `npm run lint`, `npm run docs:check`, `npm run format:check` and `npm run build`; include prior integration/E2E suites after their introduction. Expected: all implemented suites exit0. Observe each output, investigate failures, never count unavailable suites as passing.
- [ ] **Step5: Commit the deliverable and update this milestone's execution ledger.** Stage only task-owned changes and tests; commit as `feat: migration reproducibility and real readiness` (use `docs:`/`test:` when no product code changes). Record observed RED/GREEN and full-suite results. Do not merge/push as an incidental task step.

## Milestone completion

Run the full applicable suite, archive exact evidence in docs/quality/phase-handoffs/, and perform the one independent whole-branch review required by native execution. Re-grade findings, fix Important/Critical in one test-first pass with green suites; record rulings/deferred minors. Archive the ledger before deleting only this plan’s scratch folder. Use finishing-a-development-branch; no automatic main merge or production launch. Advance to the next milestone only after current deliverables actually work.
