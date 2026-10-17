# Milestone05: Driver Hiring Implementation Plan

Current integration workflow: work directly on `main`; push to `origin/main` after the phase is implemented, independently reviewed and verified. This owner instruction supersedes older no-push/branch wording. Preserve unfinished parallel files, inspect CI results and do not deploy production.

Execution ownership: follow [persistent agent responsibilities](../planning/agent-responsibilities.md). OpenCode uses verified free models for backend/contracts/tests; GPT-6.1 Sol in Codex owns frontend/UI/UX with Impeccable. Record frontend handoffs in the milestone ledger. ImageGen assets and provenance belong to07. Continue authorized tasks without routine phase approval; never mark pending frontend work complete.

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` for preserved native execution; use `superpowers:subagent-driven-development` only if the owner chooses delegated execution. Implement task-by-task with RED->GREEN, preserve prior passing suites and one final independent review. This plan needs owner review before implementation.

**Goal:** Deliver driver hiring from search and quote through consent, cancellation and trip completion.

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

- Concurrent booking/block claims involving only one shared resource cannot both commit (Task1).
- Stale price/qualification cannot be accepted from a quote (Task1).
- Accept/cancel/expiry races have one legal persisted outcome (Task2).
- Overrun beyond an adjacent interval does not release physical use (Task2).
- Browser conflict/requote recovery never shows false confirmation (Task3).

## File responsibilities

Each task lists its owned files before steps. service files own business transactions; routes own strict IO/auth/envelopes; contracts own safe schemas/DTO types; adapters own actual external IO; feature UI owns task interaction; integration/E2E tests own persisted behavior evidence. Small cohesive files may be split within a listed module without changing its interface.

### Task 1: Resource locking and quote/create API

**Files:** Create/modify `apps/api/src/modules/resources/locks.ts`, `apps/api/src/modules/resources/idempotency.ts`, `apps/api/src/modules/bookings/service.ts`, `apps/api/src/modules/bookings/routes.ts`, `packages/contracts/src/bookings.ts`, `apps/api/src/modules/bookings/create.integration.test.ts`. Preserve existing files where named; create missing module files. Tests are the integration/E2E files listed here.

**Interfaces:** Consumes current account, approved providers and SQL constraints. Produces withResourceLocks<T>(tx:Prisma.TransactionClient,keys:ResourceKeys,run:()=>Promise<T>):Promise<T>; ResourceKeys {userIds:string[],driverIds:string[],vehicleIds:string[]}. quoteBooking(account,input:QuoteInput):Promise<QuoteDto>; createBooking(account,input:BookingInput,key:string):Promise<BookingDto>. All retries preserve canonical request hash/key. All named DTOs/inputs are generated or hand-mapped exactly to the active OpenAPI schemas in packages/contracts; Page<T> is {success:true,data:T[],meta:PageMeta} for list responses. Do not return Prisma rows directly.

- [ ] **Step1: Write failing behavioral regressions.** Named cases and assertions: foreign_vehicle404_self_hire403; service_modes_other_than_DRIVER_HIRE422; quote_stale_rate409; quote_expired409; overlapping_create_exactly_one_commit; adjacent_intervals_both_commit; same_key_same_body_same_id; same_key_different_body409; injected_child_failure_leaves_no_holds.
      **Assertion anchor:** Bind responses to two synchronized overlapping create HTTP requests on separate DB connections; bind heldRows to unreleased reservations for the winning aggregate. These assertions belong inside the named behavioral tests above; setup/fixtures must exercise the real implementation.

```ts
expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
expect(heldRows).toHaveLength(2);
```

- [ ] **Step2: Run the focused command before implementation.** Run `npm run test:integration -- apps/api/src/modules/bookings/create.integration.test.ts`. Expected: FAIL because the named behavior/schema/route does not exist or violates its assertion. An unavailable-suite exit2 is a prerequisite failure, not a meaningful RED test: install/wire the real runner in this task, rerun and observe an actual behavior assertion fail. No green claim from compilation/source inspection alone.
- [ ] **Step3: Implement the smallest complete behavior.** Stable user/driver/vehicle lock order, re-read versions/qualification, explicit availability and half-open reservations. Ten-minute own quote;30minute pending deadline capped15min before start; integer paise driver subtotal only and amount cap100000000. Persist booking, one DRIVER decision, trip, history and replay record atomically. No domain notification producer.
- [ ] **Step4: Run the focused command again.** Run `npm run test:integration -- apps/api/src/modules/bookings/create.integration.test.ts`. Expected: PASS; every named regression and its persisted/visible assertions executed, no skipped/future-suite success. Also run `npm test`, `npm run typecheck`, `npm run lint`, `npm run docs:check`, `npm run format:check` and `npm run build`; include prior integration/E2E suites after their introduction. Expected: all implemented suites exit0. Observe each output, investigate failures, never count unavailable suites as passing.
- [ ] **Step5: Commit the deliverable and update this milestone's execution ledger.** Stage only task-owned changes and tests; commit as `feat: resource locking and quote/create api` (use `docs:`/`test:` when no product code changes). Record observed RED/GREEN and full-suite results. Do not merge/push as an incidental task step.

### Task 2: Consent, lifecycle, expiry and administrator operations

**Files:** Create/modify `apps/api/src/modules/bookings/decisions.ts`, `apps/api/src/modules/trips/service.ts`, `apps/api/src/modules/bookings/jobs.ts`, `apps/api/src/modules/admin/operations.ts`, `apps/api/src/worker.ts`, `apps/api/src/modules/bookings/lifecycle.integration.test.ts`. Preserve existing files where named; create missing module files. Tests are the integration/E2E files listed here.

**Interfaces:** Consumes resource locks and appendAudit. Produces decideBooking(account,id,input:BookingDecisionInput):Promise<BookingDto>; cancelBooking(account,id,input:VersionReasonInput):Promise<BookingDto>; transitionTrip(account,id,input:TransitionInput):Promise<TripDto>; expireBookings(now:Date):Promise<number>. Shared trip service is reused by carpools in06. All named DTOs/inputs are generated or hand-mapped exactly to the active OpenAPI schemas in packages/contracts; Page<T> is {success:true,data:T[],meta:PageMeta} for list responses. Do not return Prisma rows directly.

- [ ] **Step1: Write failing behavioral regressions.** Named cases and assertions: driver_accept_confirms_single_consent; accept_vs_expire_only_legal_terminal_state; cancel_vs_accept_releases_once; foreign_decision_denied; active_overrun_blocks_adjacent_next_start; suspended_user_vs_create_consistent; started_trip_never_auto_expires; transition_updates_parent_history_resources_atomically.
      **Assertion anchor:** Bind confirmed to persisted booking after driver acceptance and decisions to its stored consent rows. These assertions belong inside the named behavioral tests above; setup/fixtures must exercise the real implementation.

```ts
expect(confirmed.status).toBe('CONFIRMED');
expect(decisions).toHaveLength(1);
expect(decisions[0]).toMatchObject({ kind: 'DRIVER', status: 'ACCEPTED' });
```

- [ ] **Step2: Run the focused command before implementation.** Run `npm run test:integration -- apps/api/src/modules/bookings/lifecycle.integration.test.ts`. Expected: FAIL because the named behavior/schema/route does not exist or violates its assertion. An unavailable-suite exit2 is a prerequisite failure, not a meaningful RED test: install/wire the real runner in this task, rerun and observe an actual behavior assertion fail. No green claim from compilation/source inspection alone.
- [ ] **Step3: Implement the smallest complete behavior.** Implement allowed state transitions/cutoffs/reasons from lifecycle spec with version CAS; system jobs use DB time for final decisions. Reconcile qualification expiry and suspension with bookings; keep active trips guarded and incident flagged. Mount adminBookings/adminTrips, authorized detail/history/cancel/transition; no replaceDriver. Worker lease/replay tests prove repeated expiry is harmless.
- [ ] **Step4: Run the focused command again.** Run `npm run test:integration -- apps/api/src/modules/bookings/lifecycle.integration.test.ts`. Expected: PASS; every named regression and its persisted/visible assertions executed, no skipped/future-suite success. Also run `npm test`, `npm run typecheck`, `npm run lint`, `npm run docs:check`, `npm run format:check` and `npm run build`; include prior integration/E2E suites after their introduction. Expected: all implemented suites exit0. Observe each output, investigate failures, never count unavailable suites as passing.
- [ ] **Step5: Commit the deliverable and update this milestone's execution ledger.** Stage only task-owned changes and tests; commit as `feat: consent, lifecycle, expiry and administrator operations` (use `docs:`/`test:` when no product code changes). Record observed RED/GREEN and full-suite results. Do not merge/push as an incidental task step.

### Task 3: Complete driver-hiring interface

**Files:** Create/modify `apps/web/src/features/drivers/`, `apps/web/src/features/bookings/`, `apps/web/src/features/trips/`, `apps/web/src/features/admin/operations/`, `apps/web/src/App.tsx`, `tests/e2e/driver-hire.spec.ts`. Preserve existing files where named; create missing module files. Tests are the integration/E2E files listed here.

**Interfaces:** Consumes ApiClient, active booking/trip DTOs and existing shells. Produces driver-listings/detail, booking-create, passenger-bookings/detail, driver-requests and active-trip plus booking/trip administrator tabs. All named DTOs/inputs are generated or hand-mapped exactly to the active OpenAPI schemas in packages/contracts; Page<T> is {success:true,data:T[],meta:PageMeta} for list responses. Do not return Prisma rows directly.

- [ ] **Step1: Write failing behavioral regressions.** Named cases and assertions: driver_hire_request_accept_start_complete_browser; passenger_cancel_before_start; stale_quote_prompts_requote; rejection_and_empty_availability_recovery; foreign_booking_direct_URL_denied; driver_changed_requires_cancel_new_quote; all_estimates_say_payment_not_collected.
      **Assertion anchor:** Use the actual passenger booking screen after the assigned driver accepts. These assertions belong inside the named behavioral tests above; setup/fixtures must exercise the real implementation.

```ts
await expect(page.getByText('CONFIRMED', { exact: true })).toBeVisible();
await expect(page.getByText('Payment not collected by DriveHire.')).toBeVisible();
```

- [ ] **Step2: Run the focused command before implementation.** Run `npm run test:e2e -- tests/e2e/driver-hire.spec.ts`. Expected: FAIL because the named behavior/schema/route does not exist or violates its assertion. An unavailable-suite exit2 is a prerequisite failure, not a meaningful RED test: install/wire the real runner in this task, rerun and observe an actual behavior assertion fail. No green claim from compilation/source inspection alone.
- [ ] **Step3: Implement the smallest complete behavior.** Real query filters, own vehicle selection, server-only estimate, explicit pending/confirmed statuses, visible history and manual trip actions. No owner consent/rental selector, replacement action, ratings or waypoint map. Distinguish planned elapsed time from actual completion;409 prompts safe refresh without optimistic false confirmation.
- [ ] **Step4: Run the focused command again.** Run `npm run test:e2e -- tests/e2e/driver-hire.spec.ts`. Expected: PASS; every named regression and its persisted/visible assertions executed, no skipped/future-suite success. Also run `npm test`, `npm run typecheck`, `npm run lint`, `npm run docs:check`, `npm run format:check` and `npm run build`; include prior integration/E2E suites after their introduction. Expected: all implemented suites exit0. Observe each output, investigate failures, never count unavailable suites as passing.
- [ ] **Step5: Commit the deliverable and update this milestone's execution ledger.** Stage only task-owned changes and tests; commit as `feat: complete driver-hiring interface` (use `docs:`/`test:` when no product code changes). Record observed RED/GREEN and full-suite results. Do not merge/push as an incidental task step.

## Milestone completion

Run the full applicable suite, archive exact evidence in docs/quality/phase-handoffs/, and perform the one independent whole-branch review required by native execution. Re-grade findings, fix Important/Critical in one test-first pass with green suites; record rulings/deferred minors. Archive the ledger before deleting only this plan’s scratch folder. Use finishing-a-development-branch; no automatic main merge or production launch. Advance to the next milestone only after current deliverables actually work.
