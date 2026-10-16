# Milestone06: Instant Carpooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` for preserved native execution; use `superpowers:subagent-driven-development` only if the owner chooses delegated execution. Implement task-by-task with RED->GREEN, preserve prior passing suites and one final independent review. This plan needs owner review before implementation.

**Goal:** Deliver owned-vehicle carpools with instant seats and shared physical resource protection.

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

- Publish racing hire cannot reserve same vehicle/driver twice (Task1).
- Origin-local DST day search resolves exact UTC bounds (Task1).
- Final-seat race and replay cannot oversell/increment twice (Task2).
- Join racing start/cancel/suspension cannot leave count/history drift (Task2).
- Host roster is safe/read-only and public summary has no private data (Tasks1/3).

## File responsibilities

Each task lists its owned files before steps. service files own business transactions; routes own strict IO/auth/envelopes; contracts own safe schemas/DTO types; adapters own actual external IO; feature UI owns task interaction; integration/E2E tests own persisted behavior evidence. Small cohesive files may be split within a listed module without changing its interface.

### Task 1: Owned-vehicle drafting, publishing and search

**Files:** Create/modify `apps/api/src/modules/carpools/service.ts`, `apps/api/src/modules/carpools/routes.ts`, `packages/contracts/src/carpools.ts`, `apps/api/src/modules/carpools/publish.integration.test.ts`. Preserve existing files where named; create missing module files. Tests are the integration/E2E files listed here.

**Interfaces:** Consumes withResourceLocks, shared trip service and provider eligibility. Produces createCarpool(account,input:CarpoolInput):Promise<CarpoolDto>; publishCarpool(account,id,input:VersionInput):Promise<CarpoolDto>; searchCarpools(query:CarpoolSearch):Promise<Page<CarpoolDto>>. CarpoolSearch {originCityId:string,destinationCityId:string,date:string,seats:number,page:number,pageSize:number}. All named DTOs/inputs are generated or hand-mapped exactly to the active OpenAPI schemas in packages/contracts; Page<T> is {success:true,data:T[],meta:PageMeta} for list responses. Do not return Prisma rows directly.

- [ ] **Step1: Write failing behavioral regressions.** Named cases and assertions: foreign_vehicle404; APPROVAL_joinMode422; offered_excludes_driver; draft_no_holds_publish_two_holds; publish_vs_hire_one_commit; origin_date_DST_range_correct; published_fields_immutable; public_summary_has_no_registration_phone_documents_or_roster.
      **Assertion anchor:** Bind response to createCarpool HTTP input with joinMode APPROVAL, using otherwise valid qualified-host fixture. These assertions belong inside the named behavioral tests above; setup/fixtures must exercise the real implementation.

```ts
expect(response.status).toBe(422);
expect(
  (
    await runtimePool.query(
      'SELECT count(*)::int AS n FROM resource_reservations WHERE released_at IS NULL',
    )
  ).rows[0].n,
).toBe(0);
```

- [ ] **Step2: Run the focused command before implementation.** Run `npm run test:integration -- apps/api/src/modules/carpools/publish.integration.test.ts`. Expected: FAIL because the named behavior/schema/route does not exist or violates its assertion. An unavailable-suite exit2 is a prerequisite failure, not a meaningful RED test: install/wire the real runner in this task, rerun and observe an actual behavior assertion fail. No green claim from compilation/source inspection alone.
- [ ] **Step3: Implement the smallest complete behavior.** Instant-only domain enums, owned approved host vehicle, city/offset/time constraints and current qualification. PUBLISHED includes full rides; search excludes closed/started/unqualified rides. Embed hostDisplayName and safe vehicleSummary from active OpenAPI. Lock resource and parent writes together; no OWNER grant or listing requirement.
- [ ] **Step4: Run the focused command again.** Run `npm run test:integration -- apps/api/src/modules/carpools/publish.integration.test.ts`. Expected: PASS; every named regression and its persisted/visible assertions executed, no skipped/future-suite success. Also run `npm test`, `npm run typecheck`, `npm run lint`, `npm run docs:check`, `npm run format:check` and `npm run build`; include prior integration/E2E suites after their introduction. Expected: all implemented suites exit0. Observe each output, investigate failures, never count unavailable suites as passing.
- [ ] **Step5: Commit the deliverable and update this milestone's execution ledger.** Stage only task-owned changes and tests; commit as `feat: owned-vehicle drafting, publishing and search` (use `docs:`/`test:` when no product code changes). Record observed RED/GREEN and full-suite results. Do not merge/push as an incidental task step.

### Task 2: Atomic instant seats and terminal synchronization

**Files:** Create/modify `apps/api/src/modules/carpools/seats.ts`, `apps/api/src/modules/carpools/jobs.ts`, `apps/api/src/modules/admin/operations.ts`, `apps/api/src/modules/carpools/seats.integration.test.ts`, `apps/api/src/worker.ts`. Preserve existing files where named; create missing module files. Tests are the integration/E2E files listed here.

**Interfaces:** Consumes account locks, carpool row lock and existing idempotency helper. Produces joinCarpool(account,id,input:SeatInput,key:string):Promise<SeatRequestDto>; cancelSeat(account,id,input:VersionReasonInput):Promise<SeatRequestDto>; cancelCarpool(account,id,input:VersionReasonInput):Promise<CarpoolDto>. listSeatRequests is host/admin read only. All named DTOs/inputs are generated or hand-mapped exactly to the active OpenAPI schemas in packages/contracts; Page<T> is {success:true,data:T[],meta:PageMeta} for list responses. Do not return Prisma rows directly.

- [ ] **Step1: Write failing behavioral regressions.** Named cases and assertions: two_final_seat_joins_one_success; duplicate_idempotent_join_one_increment; same_user_second_live_join409; cancel_twice_one_decrement; join_vs_cancel_start_expiry_consistent; whole_cancel_rolls_back_on_child_failure; host_self_join403; suspended_host_vs_join_consistent; completed_participation_retained_but_not_bookable.
      **Assertion anchor:** Bind responses to synchronized final-seat joins by different passengers; bind carpool and acceptedRows from PostgreSQL after both requests finish. These assertions belong inside the named behavioral tests above; setup/fixtures must exercise the real implementation.

```ts
expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
expect(carpool.confirmed_seats).toBe(carpool.seats_offered);
expect(acceptedRows.reduce((n, row) => n + row.seats, 0)).toBe(carpool.confirmed_seats);
```

- [ ] **Step2: Run the focused command before implementation.** Run `npm run test:integration -- apps/api/src/modules/carpools/seats.integration.test.ts`. Expected: FAIL because the named behavior/schema/route does not exist or violates its assertion. An unavailable-suite exit2 is a prerequisite failure, not a meaningful RED test: install/wire the real runner in this task, rerun and observe an actual behavior assertion fail. No green claim from compilation/source inspection alone.
- [ ] **Step3: Implement the smallest complete behavior.** Join ACCEPTED immediately under guarded increment+child insert transaction. Enforce15min cutoff, current host qualification and unstarted parent. Cancellation/expiry synchronizes seats,parent,trip,history and exactly-once release. Extend suspension/qualification expiry/trip terminal handling and adminCarpools with real carpool branches. No pending approval, decideSeat, product event or fake delivery handler.
- [ ] **Step4: Run the focused command again.** Run `npm run test:integration -- apps/api/src/modules/carpools/seats.integration.test.ts`. Expected: PASS; every named regression and its persisted/visible assertions executed, no skipped/future-suite success. Also run `npm test`, `npm run typecheck`, `npm run lint`, `npm run docs:check`, `npm run format:check` and `npm run build`; include prior integration/E2E suites after their introduction. Expected: all implemented suites exit0. Observe each output, investigate failures, never count unavailable suites as passing.
- [ ] **Step5: Commit the deliverable and update this milestone's execution ledger.** Stage only task-owned changes and tests; commit as `feat: atomic instant seats and terminal synchronization` (use `docs:`/`test:` when no product code changes). Record observed RED/GREEN and full-suite results. Do not merge/push as an incidental task step.

### Task 3: Complete carpool interface

**Files:** Create/modify `apps/web/src/features/carpools/`, `apps/web/src/features/seats/`, `apps/web/src/features/admin/operations/`, `apps/web/src/App.tsx`, `tests/e2e/carpool.spec.ts`. Preserve existing files where named; create missing module files. Tests are the integration/E2E files listed here.

**Interfaces:** Consumes active CarpoolDto/SeatRequestDto and shared shells. Produces carpool-search/detail, carpool-create, hosted-carpools and passenger-carpool-history plus administrator ride tab. All named DTOs/inputs are generated or hand-mapped exactly to the active OpenAPI schemas in packages/contracts; Page<T> is {success:true,data:T[],meta:PageMeta} for list responses. Do not return Prisma rows directly.

- [ ] **Step1: Write failing behavioral regressions.** Named cases and assertions: host_publish_passenger_join_cancel_browser; final_seat_lost_recovers_without_false_confirmation; host_sees_safe_participants_without_approve_buttons; full_and_empty_search_states; own_vehicle_onboarding_link_when_missing; trip_manual_complete_updates_participation_history.
      **Assertion anchor:** Use the host browser view after a successful instant join. These assertions belong inside the named behavioral tests above; setup/fixtures must exercise the real implementation.

```ts
await expect(page.getByRole('button', { name: /approve request/i })).toHaveCount(0);
await expect(page.getByRole('button', { name: /reject request/i })).toHaveCount(0);
```

- [ ] **Step2: Run the focused command before implementation.** Run `npm run test:e2e -- tests/e2e/carpool.spec.ts`. Expected: FAIL because the named behavior/schema/route does not exist or violates its assertion. An unavailable-suite exit2 is a prerequisite failure, not a meaningful RED test: install/wire the real runner in this task, rerun and observe an actual behavior assertion fail. No green claim from compilation/source inspection alone.
- [ ] **Step3: Implement the smallest complete behavior.** City/day/seats URL filters, clear instant-join price estimate, server count refresh and visible cutoff/status. No approval option, GPS, notification bell or rental vehicle search. Resolve stale/full409 with reload and preserved passenger input; never decrement/increment optimistically as authority.
- [ ] **Step4: Run the focused command again.** Run `npm run test:e2e -- tests/e2e/carpool.spec.ts`. Expected: PASS; every named regression and its persisted/visible assertions executed, no skipped/future-suite success. Also run `npm test`, `npm run typecheck`, `npm run lint`, `npm run docs:check`, `npm run format:check` and `npm run build`; include prior integration/E2E suites after their introduction. Expected: all implemented suites exit0. Observe each output, investigate failures, never count unavailable suites as passing.
- [ ] **Step5: Commit the deliverable and update this milestone's execution ledger.** Stage only task-owned changes and tests; commit as `feat: complete carpool interface` (use `docs:`/`test:` when no product code changes). Record observed RED/GREEN and full-suite results. Do not merge/push as an incidental task step.

## Milestone completion

Run the full applicable suite, archive exact evidence in docs/quality/phase-handoffs/, and perform the one independent whole-branch review required by native execution. Re-grade findings, fix Important/Critical in one test-first pass with green suites; record rulings/deferred minors. Archive the ledger before deleting only this plan’s scratch folder. Use finishing-a-development-branch; no automatic main merge or production launch. Advance to the next milestone only after current deliverables actually work.
