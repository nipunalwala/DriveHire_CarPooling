# Phase 17 · Driver-Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` if the owner chooses delegated execution, or `superpowers:executing-plans` for native execution. Before writing code read the approved spec, this prompt, `superpowers:using-superpowers`, `superpowers:brainstorming` and `superpowers:writing-plans`; select the already approved architectural path and do not repeat questions settled here. Use `superpowers:test-driven-development` and `superpowers:verification-before-completion` for each behavioral task. This document is a phase execution prompt, not authorization to start. Checkboxes track only verified work.

**Goal:** Deliver onboarding, availability, provider decisions, actual trip operation and qualified carpool hosting.

**Architecture:** Express modular monolith plus same-codebase worker, PostgreSQL/Prisma with reviewed custom SQL constraints, React/Vite TypeScript client, versioned `/api/v1` OpenAPI. Resource and seat invariants live on the server and in PostgreSQL.

**Tech Stack:** React, Vite, TypeScript, Tailwind, React Router, TanStack Query, RHF, Zod, Lucide, Motion; Node/Express/TypeScript; PostgreSQL/Prisma; Vitest/RTL/Supertest/Playwright.

**Spec:** `docs/specification/` (canonical); especially 01-functional-requirements.md, 03-user-roles-permissions.md, 05-business-rules.md, 08-api-specification.md, 10-frontend-ui-ux-specification.md, 11-booking-lifecycle.md, 12-carpooling-lifecycle.md, 15-testing-strategy.md; `docs/api/openapi.json` and `docs/implementation-prompts/00-MASTER-EXECUTION-GUIDE.md`.

## Global constraints
Roles are additive, current backend DB auth/qualification is authoritative. Quotes and estimates are INR integer paise and `NOT_COLLECTED`; no online payments, maps, GPS or external navigation. Times UTC, half-open resource intervals, origin-zone date search. No unverified driver/vehicle bookings; no overbooking/overlap; private documents never publicly exposed. No fake endpoint/page/test, placeholder implementation or guessed success status. Preserve all previously passing phase suites; migrations forward-only. Generated raster project assets use the imagegen skill, are committed under the project with a prompt/provenance manifest, and must never masquerade as real listings, identities or evidence. Impeccable guides visual pages; test actual usability. Superpowers workflow requires design/spec review, small red-green-refactor tasks, verification and final review; the user approval of this blueprint gates Phase01, not each routine implementation choice.

## Review focus
- Parallel request with same ID/key: exactly one resource/seat/decision effect; test it in the owning service phase.
- Expired, suspended or changed provider between display and write: server rejects/reloads without partial state.
- Foreign private IDs and role-only navigation: backend returns safe404/403 and no data leak.
- Lost network response after a committed mutation: safe same-key retry or state reconciliation; never duplicate.
- Mobile/keyboard and error paths: all actions remain discoverable and truthful, including no-payment and simulated-route labels.

---

## A. Role and objective
Act as Driver/host workspace frontend engineer. Deliver onboarding, availability, provider decisions, actual trip operation and qualified carpool hosting. Build working code and tests after implementation approval. Keep this phase's boundary; update canonical documents and ADR when a real decision changes.

## B. Project context and specification references
The repository is a documentation-only reset of an older Knex/single-role app. Do not restore retired files or migrations. Read these canonical specs before modifying interfaces:
- [01 functional-requirements](../specification/01-functional-requirements.md)
- [03 user-roles-permissions](../specification/03-user-roles-permissions.md)
- [05 business-rules](../specification/05-business-rules.md)
- [08 api-specification](../specification/08-api-specification.md)
- [10 frontend-ui-ux-specification](../specification/10-frontend-ui-ux-specification.md)
- [11 booking-lifecycle](../specification/11-booking-lifecycle.md)
- [12 carpooling-lifecycle](../specification/12-carpooling-lifecycle.md)
- [15 testing-strategy](../specification/15-testing-strategy.md)
- [OpenAPI contract](../api/openapi.json)
- [Architecture decisions](../specification/20-architecture-decisions.md)

## C. Dependencies and prerequisite verification
Completed `16-PASSENGER-DASHBOARD.md` handoff, committed code, passing scoped verification, and all earlier canonical contracts. Before starting, inspect `git status --short`, current branch, installed dependency/DB availability and prior handoff evidence. Run `npm ci`, `npm run typecheck`, `npm run lint`, and completed-phase tests/build after Phase01 establishes scripts; for Phase01 inspect the empty baseline and validate tools/config instead. Fix or document actual inherited failure before attributing a new one. Never apply new migrations to the retired database. If a listed dependency did not actually finish, stop dependent implementation and report the exact missing artifact; complete independent analysis only.

## D. Exact implementation scope and task sequence
Each task is a small independently reviewable deliverable. For each: name the observed behavior, write its focused test, run to see the expected failure, implement the minimal working behavior, rerun focused then relevant suite, refactor while green, commit. Write an exact test signature/interface/file brief in the phase's temporary execution ledger when a task spans several files; do not invent hidden shared APIs.
- [ ] **Task 1.** Draft onboarding form encrypted identity never shown in public; real upload progress,scan pending/rejected state; submit only current clean evidence,display decision reason/expiry. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 2.** Service city/rate/bio editor vs material license revision warning;409 commitments surfaced; listing enabled only qualified; explicit AVAILABLE/BLOCKED windows no drag-only calendar. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 3.** Provider request queue accepts/rejects own driver consent with reason/version; combined may still await owner; no generic instant-confirm UI. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 4.** Active trip correct next status,manual waypoint,simulation label,incident failure reason; overrun/start conflict explained without fake route/ETA. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 5.** Qualified DRIVER+OWNER host chooses owned verified vehicle,city/time/seats/price/join mode,save draft then publish; published fields immutable; cancellation not edit hack. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 6.** Host seat queue shows current capacity/accepted roster minimally; accept/reject versioned,cutoff/capacity409 reload; host cancellation shows affected seats; own history links shared trip. Deliver a passing focused test and commit for this task before beginning the next.

## E. File and folder expectations
features/driver,verification,availability,hosted-carpools; document upload/query hooks; driver/host E2E. Keep per-domain routers/controllers/services/repositories/schemas/tests together. Add only files with one clear responsibility; exact additional names follow these module boundaries. Update safe shared contract types whenever API DTOs change. Do not import server/Prisma code into browser. Generated image assets, when this phase uses them, must be physically under `apps/web/public/images/generated/`, with `docs/design/image-assets.md` recording source prompt, selected filename, dimensions, license/usage provenance and alt/decorative decision.

## F. Database requirements and transactions
No new schema. DriverPrivate draft fields nullable; doc CLEAN/PENDING/revision and CAS respected; backend still controls all eligibility/capacity. Use tables, types, FKs, unique/check/exclusion constraints, indexes and deletion policy from [database design](../specification/07-database-design.md). Any new schema change is a versioned Prisma migration with raw SQL when required, tested on fresh and incremental disposable DB. Never use `db push` in production or mutate an applied migration. Domain writes that affect status/holds/seats/history/audit/outbox commit together under canonical lock ordering. No external SMTP/scan call while row locks are held.

## G. API contracts and authorization
Implement or consume only the relevant contract operations below; for frontend phases, do not duplicate them server-side. The OpenAPI components define required/optional field types and exact success envelope. Strict unknown-key rejection, UUID/path/query validation, object authorization and current account/role check apply to every private operation. Missing auth401, role403, foreign private object404, state/version/capacity409, field422, throttle429, dependency503. Every write validates server prices, ownership and status; never trust client role/resource IDs or total. Do not add undocumented generic endpoints.

| Method and path | Operation | Access | Request schema | Success schema/status | Phase rule |
|---|---|---|---|---|---|
| `GET /api/v1/drivers/me` | `getMyDriver` | DRIVER | none | DriverPrivate; HTTP200 | Explicit /me route registered before /{id}; no approval required |
| `PUT /api/v1/drivers/me` | `updateDriver` | DRIVER | DriverInput | DriverPrivate; HTTP200 | License identity/date edits invalidate approval; shared resource lock; reject if future commitments require identity change resolution; version mandatory when updating existing profile/resource, omitted only on first creation |
| `POST /api/v1/drivers/me/documents` | `uploadDriverDoc` | DRIVER | DocumentInput | Document; HTTP201 | Only LICENSE; require expiresOn matching license; quarantine until clean |
| `GET /api/v1/drivers/me/documents` | `listDriverDocs` | DRIVER | none | Document; HTTP200 | No public object keys |
| `POST /api/v1/drivers/me/verification` | `submitDriver` | DRIVER | VersionInput | Verification; HTTP201 | Clean current license required; at most one pending revision; immutable document snapshot |
| `PATCH /api/v1/drivers/me/listing` | `setDriverListing` | DRIVER | ListingInput | DriverPrivate; HTTP200 | Enabling requires approval and valid license; disabling affects new requests only |
| `GET /api/v1/drivers/me/availability` | `listDriverAvailability` | DRIVER | none | Availability; HTTP200 | Own only |
| `POST /api/v1/drivers/me/availability` | `createDriverAvailability` | DRIVER | AvailabilityInput | Availability; HTTP201 | BLOCKED acquires resource reservation; no conflict with commitments; max horizon 180 days |
| `DELETE /api/v1/drivers/me/availability/{id}` | `deleteDriverAvailability` | DRIVER | none | Ack; HTTP200 | Removing AVAILABLE forbidden if would uncover pending/confirmed hired bookings; release block exactly once |
| `GET /api/v1/drivers/me/bookings` | `listDriverBookings` | DRIVER | none | Booking; HTTP200 | Only proposed/assigned self |
| `GET /api/v1/owners/me/vehicles` | `listMyVehicles` | OWNER | none | VehiclePrivate; HTTP200 | Own unarchived; include status |
| `POST /api/v1/bookings/{id}/decisions` | `decideBooking` | provider | BookingDecisionInput | Booking; HTTP200 | Only required undecided provider; cannot decide for another party; reject needs reason; lock booking |
| `POST /api/v1/carpools` | `createCarpool` | verified DRIVER+OWNER | CarpoolInput | Carpool; HTTP201 | Host must own verified vehicle and be approved driver; no reservations until publication |
| `PUT /api/v1/carpools/{id}` | `updateCarpool` | host | CarpoolInput | Carpool; HTTP200 | DRAFT only; published changes require cancellation/new ride; version mandatory when updating existing profile/resource, omitted only on first creation |
| `POST /api/v1/carpools/{id}/publish` | `publishCarpool` | host | VersionInput | Carpool; HTTP200 | Atomic shared resource reservation; lead >=60min; host verified; seats <= vehicle.seats-1 |
| `GET /api/v1/users/me/carpools` | `listMyCarpools` | active user | none | Carpool; HTTP200 | host_id=self |
| `GET /api/v1/carpools/{id}/seat-requests` | `listSeatRequests` | host/admin | none | SeatRequest; HTTP200 | Host ownership; hide unnecessary passenger PII |
| `POST /api/v1/seat-requests/{id}/decision` | `decideSeat` | host | DecisionInput | SeatRequest; HTTP200 | Lock carpool then request; conditional seat increment only on ACCEPT; cutoff 15min; no host overbooking |
| `POST /api/v1/carpools/{id}/cancel` | `cancelCarpool` | host/admin | VersionReasonInput | Carpool; HTTP200 | Before STARTED; cancel live requests, zero confirmedSeats, release both reservations; admin after start uses FAILED |
| `GET /api/v1/trips` | `listTrips` | participant/admin | none | Trip; HTTP200 | Requester/assigned driver/vehicle owner/accepted passenger/host; scope server-side |
| `GET /api/v1/trips/{id}` | `getTrip` | participant/admin | none | Trip; HTTP200 | Participant object authorization; waypoints are simulated labels |
| `POST /api/v1/trips/{id}/transitions` | `transitionTrip` | assigned driver/admin | TransitionInput | Trip; HTTP200 | CAS version; assigned -> started -> in_transit -> completed; FAILED needs reason; no skip/backward |
| `POST /api/v1/trips/{id}/waypoint` | `advanceWaypoint` | assigned driver | VersionInput | Trip; HTTP200 | Only IN_TRANSIT; monotone index <= count; no fabricated GPS/ETA |
| `GET /api/v1/trips/{id}/history` | `tripHistory` | participant/admin | none | HistoryEntry; HTTP200 | Same object access as trip |

## H. Frontend requirements
Driver overview/verification/availability/requests/active rides/history/profile,host carpool create/list/request queue and shared profile/notifications. Follow [UI/UX specification](../specification/10-frontend-ui-ux-specification.md) for page-specific components, API dependencies, interactions, loading/empty/error/success, responsive and accessibility states. Use server data; no fabricated live metrics, avatar/vehicle imagery, confirmation, payment or location. Use generated original images only in appropriate explanatory/marketing placements and follow Impeccable's craft/QA process at UI implementation time.

## I. Business rules and edge cases
Relevant objective scenarios:
- `DRIVER-AVAILABILITY` (FR-DRIVER-003): Booking against driver BLOCKED interval fails; touching [start,end) intervals succeed
- `BOOKING-CONSENT` (FR-BOOKING-003): Combined one approval stays PENDING; simultaneous final decisions produce one confirmation event
- `CARPOOL-PUBLISH` (FR-CARPOOL-001): Driver-only role cannot host without owned verified vehicle; published ride conflicts with hire reservation
- `CARPOOL-APPROVAL` (FR-CARPOOL-004): Two accepts for final seat cannot both succeed; accepted request cannot be accepted again
- `RIDE-STATE-MACHINE` (FR-RIDE-001): SCHEDULED cannot start; two same-version transitions commit once; completion releases reservations and updates parent
- `RIDE-OVERRUN` (FR-RIDE-002): Overrunning earlier ride blocks next ride start even after scheduled interval ends; marker accessible text
- `NOTIFY-REPLAY` (FR-NOTIFY-001): Crash after one recipient insert and retry yields exactly one notification per recipient within60s healthy worker
Also apply [business rules](../specification/05-business-rules.md): active verification checked at mutation time; bookings require two physical resource holds; carpool pending seats consume zero; only accepted seats count; transition/state/version guards; cancellation cannot release active physical use; suspension denies current JWT. Keep manual route clearly simulated and estimated amounts uncollected. For this phase identify five highest-risk inputs from the review-focus list and bind a named negative/integration test to the owning task.

## J. Security requirements
Use [authentication/security](../specification/09-authentication-security.md): Argon2id, OTP/refresh rules, bounded shared rate limits, secure cookie/CORS/Origin/Helmet, strict Zod, object ownership, private scan-first uploads, redacted logs, auditable admin writes and secrets from environment. Implement only the controls relevant to this phase, preserving earlier controls; negative role/owner tests are mandatory. A UI guard is convenience, never permission.

## K. Testing requirements
Write targeted red-green-refactor unit tests for pure rules and UI behavior, real PostgreSQL integration tests for database invariants, Supertest API tests for contracts/authorization/error codes, RTL accessibility/form tests for frontend phases, and API-backed Playwright E2E for user journeys. Negative, concurrency and permission tests are not optional where specified below:
- Driver onboarding->scanner->admin approval,expired/rejected correction and role-only denied states.
- DRIVER-AVAILABILITY/BOOKING-CONSENT/RIDE state E2E; stale action and prior-overrun start denied.
- CARPOOL-PUBLISH/APPROVAL/CANCEL browser host journey with passenger contexts; owner-only/driver-only without qualifications cannot publish.
- Keyboard date/window controls,upload validation,live scan announcements,mobile action layout.
Do not call a mocked successful write an end-to-end pass. Record each failing test's expected failure before implementation and fresh full-suite result before completion.

## L. Acceptance criteria
- [ ] All driver and host pages/actions work from real APIs.
- [ ] Unverified profile visibly blocked from operational actions; no frontend-only status.
- [ ] State/seat/version conflicts recover safely and do not lose submitted reason.
- `DRIVER-AVAILABILITY` (FR-DRIVER-003): Booking against driver BLOCKED interval fails; touching [start,end) intervals succeed
- `BOOKING-CONSENT` (FR-BOOKING-003): Combined one approval stays PENDING; simultaneous final decisions produce one confirmation event
- `CARPOOL-PUBLISH` (FR-CARPOOL-001): Driver-only role cannot host without owned verified vehicle; published ride conflicts with hire reservation
- `CARPOOL-APPROVAL` (FR-CARPOOL-004): Two accepts for final seat cannot both succeed; accepted request cannot be accepted again
- `RIDE-STATE-MACHINE` (FR-RIDE-001): SCHEDULED cannot start; two same-version transitions commit once; completion releases reservations and updates parent
- `RIDE-OVERRUN` (FR-RIDE-002): Overrunning earlier ride blocks next ride start even after scheduled interval ends; marker accessible text
- `NOTIFY-REPLAY` (FR-NOTIFY-001): Crash after one recipient insert and retry yields exactly one notification per recipient within60s healthy worker
Acceptance requires observable persisted output, relevant HTTP statuses and no regression in earlier phases. If an NFR target owned by this phase is not yet measurable, record dependency and owner rather than claiming pass.

## M. Definition of done
Every task checkbox has a focused red/green test and commit; listed acceptance/scenarios and current prior-phase suites pass; OpenAPI, specification, UI and ADR changes are synchronized; migration/invariant checks pass where relevant; no stub, TODO or synthetic data passed off as production behavior; handoff records evidence and known limits. Seek a fresh independent review for major feature/final branch work when workflow and available tools permit; fix critical/important findings before completion. Do not proceed into Phase18 automatically unless owner has separately authorized continuing implementation.

## N. Verification commands
From repo root after Phase01 defines scripts: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:unit`, `npm run test:integration`, `npm run test:contract`, `npm run test:e2e`, `npm run build`, `npm run docs:check`. For schema phases: `npm run db:validate`, `npm run db:migrate:deploy`, `npm run db:test:constraints` against explicitly named disposable DB only. Run focused test first, relevant suites after each task, full currently applicable suite before commit/handoff. Phase01 may add scripts only when their suites exist; a missing future suite is reported unavailable, not passed. Production build and CI commands must return exit0 with complete output inspected. A command's mere invocation is not evidence of a pass.

## O. Git workflow
Recommended branch `codex/phase-17-driver-dashboard` from completed prior phase commit, never force-push. Confirm clean status, use an isolated worktree when user/platform preference supports it; user specified same repository, not a new GitHub project. Commit test+implementation per independently verifiable task (`test: cover <behavior>` or `feat: <behavior>`; combine red/green after passing), then `docs: update phase 17 handoff` if docs changed. Verify diff contains no secret/generated cache/private document. Before push run applicable checks, inspect commit list, and do not merge main without authorized integration decision.

## P. Final handoff
Return completed tasks, exact files changed, new migrations/constraints, operation IDs/endpoints, UI screens/assets with provenance, tests/commands and exit results, known issues, ADR/spec changes, branch/commit, and precise next-phase dependencies. Distinguish targets from measured values and test skips from passes. Link the phase's prompt and evidence; stop at this phase boundary.
