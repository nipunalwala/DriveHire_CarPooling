# Phase 07 · Drivehire-Booking-Backend

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` if the owner chooses delegated execution, or `superpowers:executing-plans` for native execution. Before writing code read the approved spec, this prompt, `superpowers:using-superpowers`, `superpowers:brainstorming` and `superpowers:writing-plans`; select the already approved architectural path and do not repeat questions settled here. Use `superpowers:test-driven-development` and `superpowers:verification-before-completion` for each behavioral task. This document is a phase execution prompt, not authorization to start. Checkboxes track only verified work.

**Goal:** Build all three DriveHire services from authoritative quote through provider consent, safe holds and cancellation.

**Architecture:** Express modular monolith plus same-codebase worker, PostgreSQL/Prisma with reviewed custom SQL constraints, React/Vite TypeScript client, versioned `/api/v1` OpenAPI. Resource and seat invariants live on the server and in PostgreSQL.

**Tech Stack:** React, Vite, TypeScript, Tailwind, React Router, TanStack Query, RHF, Zod, Lucide, Motion; Node/Express/TypeScript; PostgreSQL/Prisma; Vitest/RTL/Supertest/Playwright.

**Spec:** `docs/specification/` (canonical); especially 01-functional-requirements.md, 03-user-roles-permissions.md, 05-business-rules.md, 07-database-design.md, 08-api-specification.md, 11-booking-lifecycle.md, 13-notifications.md, 15-testing-strategy.md; `docs/api/openapi.json` and `docs/implementation-prompts/00-MASTER-EXECUTION-GUIDE.md`.

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
Act as Transactional booking engineer. Build all three DriveHire services from authoritative quote through provider consent, safe holds and cancellation. Build working code and tests after implementation approval. Keep this phase's boundary; update canonical documents and ADR when a real decision changes.

## B. Project context and specification references
The repository is a documentation-only reset of an older Knex/single-role app. Do not restore retired files or migrations. Read these canonical specs before modifying interfaces:
- [01 functional-requirements](../specification/01-functional-requirements.md)
- [03 user-roles-permissions](../specification/03-user-roles-permissions.md)
- [05 business-rules](../specification/05-business-rules.md)
- [07 database-design](../specification/07-database-design.md)
- [08 api-specification](../specification/08-api-specification.md)
- [11 booking-lifecycle](../specification/11-booking-lifecycle.md)
- [13 notifications](../specification/13-notifications.md)
- [15 testing-strategy](../specification/15-testing-strategy.md)
- [OpenAPI contract](../api/openapi.json)
- [Architecture decisions](../specification/20-architecture-decisions.md)

## C. Dependencies and prerequisite verification
Completed `06-VEHICLE-MANAGEMENT.md` handoff, committed code, passing scoped verification, and all earlier canonical contracts. Before starting, inspect `git status --short`, current branch, installed dependency/DB availability and prior handoff evidence. Run `npm ci`, `npm run typecheck`, `npm run lint`, and completed-phase tests/build after Phase01 establishes scripts; for Phase01 inspect the empty baseline and validate tools/config instead. Fix or document actual inherited failure before attributing a new one. Never apply new migrations to the retired database. If a listed dependency did not actually finish, stop dependent implementation and report the exact missing artifact; complete independent analysis only.

## D. Exact implementation scope and task sequence
Each task is a small independently reviewable deliverable. For each: name the observed behavior, write its focused test, run to see the expected failure, implement the minimal working behavior, rerun focused then relevant suite, refactor while green, commit. Write an exact test signature/interface/file brief in the phase's temporary execution ledger when a task spans several files; do not invent hidden shared APIs.
- [ ] **Task 1.** Implement VEHICLE_RENTAL approved requester driver+external vehicle, DRIVER_HIRE own verified vehicle+external hired driver, COMBINED two external selected resources; capacity and city compatibility revalidated. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 2.** Price ceil elapsed hours in integer paise, line items per service,10min owned quote with resource version/rate snapshot; bounded duration/horizon/lead checks. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 3.** Booking create requires idempotency header; canonical request hash and replay; sorted user/resource locks; current approval/availability; create quote consumption,booking,trip,two reservations,required decision rows,history/events/key response in one commit. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 4.** Provider acceptance/rejection checks required role/ownership, expected version/deadline; both consents for combined, same provider account can satisfy its two rows explicitly; last accept confirms/assigns once. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 5.** Pending hired-driver replacement atomically swaps resource/decision with same rate and original deadline; never replace confirmed resource or fabricate consent. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 6.** Implement participant/admin-safe detail and history plus requester/provider cancellation, pending expiry and no-start expiry; release only correct holds; parent/trip history/event consistency. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 7.** Complete driver/insurance expiry integration and material edit/archive/availability conflict guards using populated bookings; suspension shared service hook available for Phase12. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 8.** Keep SMTP/scan/network outside transactions; map exclusion/unique/stale errors, bounded deadlock retry; no payment states. Deliver a passing focused test and commit for this task before beginning the next.

## E. File and folder expectations
modules/bookings, booking-quotes, provider-decisions; shared reservation/lock service; booking expiry job; trip initial lifecycle service; concurrency and API tests. Keep per-domain routers/controllers/services/repositories/schemas/tests together. Add only files with one clear responsibility; exact additional names follow these module boundaries. Update safe shared contract types whenever API DTOs change. Do not import server/Prisma code into browser. Generated image assets, when this phase uses them, must be physically under `apps/web/public/images/generated/`, with `docs/design/image-assets.md` recording source prompt, selected filename, dimensions, license/usage provenance and alt/decorative decision.

## F. Database requirements and transactions
booking_quotes,bookings,booking_decisions,trips,resource_reservations,trip_status_history,idempotency_keys,outbox_events. Atomic dual hold; source version+rate validation; quote single consumption; consent/parent/trip consistent. Add migrations only for documented missed invariants, never alter prior applied migration. Use tables, types, FKs, unique/check/exclusion constraints, indexes and deletion policy from [database design](../specification/07-database-design.md). Any new schema change is a versioned Prisma migration with raw SQL when required, tested on fresh and incremental disposable DB. Never use `db push` in production or mutate an applied migration. Domain writes that affect status/holds/seats/history/audit/outbox commit together under canonical lock ordering. No external SMTP/scan call while row locks are held.

## G. API contracts and authorization
Implement or consume only the relevant contract operations below; for frontend phases, do not duplicate them server-side. The OpenAPI components define required/optional field types and exact success envelope. Strict unknown-key rejection, UUID/path/query validation, object authorization and current account/role check apply to every private operation. Missing auth401, role403, foreign private object404, state/version/capacity409, field422, throttle429, dependency503. Every write validates server prices, ownership and status; never trust client role/resource IDs or total. Do not add undocumented generic endpoints.

| Method and path | Operation | Access | Request schema | Success schema/status | Phase rule |
|---|---|---|---|---|---|
| `GET /api/v1/drivers/me/bookings` | `listDriverBookings` | DRIVER | none | Booking; HTTP200 | Only proposed/assigned self |
| `GET /api/v1/owners/me/bookings` | `listOwnerBookings` | OWNER | none | Booking; HTTP200 | Own vehicle only |
| `POST /api/v1/booking-quotes` | `quoteBooking` | verified PASSENGER | QuoteInput | Quote; HTTP201 | Use server rates; service-specific ownership/driver checks; no inventory hold; expires 10min |
| `POST /api/v1/bookings` | `createBooking` | verified PASSENGER | BookingInput | Booking; HTTP201 | Mandatory Idempotency-Key; atomic dual resource hold; quote owner and freshness rechecked |
| `GET /api/v1/bookings` | `listBookings` | PASSENGER | none | Booking; HTTP200 | passenger_id=self; include pending/history |
| `GET /api/v1/bookings/{id}` | `getBooking` | participant/admin | none | Booking; HTTP200 | Passenger, resource driver, owning vehicle owner or admin only |
| `POST /api/v1/bookings/{id}/decisions` | `decideBooking` | provider | BookingDecisionInput | Booking; HTTP200 | Only required undecided provider; cannot decide for another party; reject needs reason; lock booking |
| `POST /api/v1/bookings/{id}/cancel` | `cancelBooking` | requester/provider/admin | VersionReasonInput | Booking; HTTP200 | Before start only for participant; requester cutoff 15min for confirmed, providers reason audited; admin incident after start uses FAILED |
| `POST /api/v1/bookings/{id}/driver-assignment` | `replaceDriver` | requester/admin | AssignmentInput | Booking; HTTP200 | Pending only; DRIVER_HIRE/COMBINED; atomic replace reservation, reset driver consent, retain original deadline; reject self/ineligible driver |

## H. Frontend requirements
No booking React UI yet; provide complete decisions and authoritative price DTOs for Phase16. Every successful booking says NOT_COLLECTED. Follow [UI/UX specification](../specification/10-frontend-ui-ux-specification.md) for page-specific components, API dependencies, interactions, loading/empty/error/success, responsive and accessibility states. Use server data; no fabricated live metrics, avatar/vehicle imagery, confirmation, payment or location. Use generated original images only in appropriate explanatory/marketing placements and follow Impeccable's craft/QA process at UI implementation time.

## I. Business rules and edge cases
Relevant objective scenarios:
- `BOOKING-QUOTE` (FR-BOOKING-001): Changing client total cannot change persisted price; quote after10min rejected; own vehicle rental rejected
- `BOOKING-CONCURRENCY` (FR-BOOKING-002): Concurrent overlapping booking/carpool/block commits at most one; injected failure rolls back all writes
- `BOOKING-CONSENT` (FR-BOOKING-003): Combined one approval stays PENDING; simultaneous final decisions produce one confirmation event
- `BOOKING-CANCEL-EXPIRE` (FR-BOOKING-004): Cancel twice cannot release unrelated holds; delayed worker cannot permit accept after deadline
Also apply [business rules](../specification/05-business-rules.md): active verification checked at mutation time; bookings require two physical resource holds; carpool pending seats consume zero; only accepted seats count; transition/state/version guards; cancellation cannot release active physical use; suspension denies current JWT. Keep manual route clearly simulated and estimated amounts uncollected. For this phase identify five highest-risk inputs from the review-focus list and bind a named negative/integration test to the owning task.

## J. Security requirements
Use [authentication/security](../specification/09-authentication-security.md): Argon2id, OTP/refresh rules, bounded shared rate limits, secure cookie/CORS/Origin/Helmet, strict Zod, object ownership, private scan-first uploads, redacted logs, auditable admin writes and secrets from environment. Implement only the controls relevant to this phase, preserving earlier controls; negative role/owner tests are mandatory. A UI guard is convenience, never permission.

## K. Testing requirements
Write targeted red-green-refactor unit tests for pure rules and UI behavior, real PostgreSQL integration tests for database invariants, Supertest API tests for contracts/authorization/error codes, RTL accessibility/form tests for frontend phases, and API-backed Playwright E2E for user journeys. Negative, concurrency and permission tests are not optional where specified below:
- BOOKING-QUOTE/CONSENT/CANCEL-EXPIRE mode-specific fixtures and partial-consent behavior; quote stale rate,client amount injection,wrong owner/self hire,expiry delayed worker.
- BOOKING-CONCURRENCY separate connections across driver/vehicle, booking vs carpool fixture vs block; at most one overlap winner; exact adjacency passes.
- Failure after first reservation or consent event insert rolls back all; same key replays once; mismatch409; accept vs cancel/expiry yields one legal terminal/confirmation.
- Material edit/expiry during pending/confirmed operation cannot bypass locks; history/outbox and audit outcomes match parent.
Do not call a mocked successful write an end-to-end pass. Record each failing test's expected failure before implementation and fresh full-suite result before completion.

## L. Acceptance criteria
- [ ] Three service flows pass positive and negative permission/eligibility tests.
- [ ] No overlapping committed resource occupancy or partial dual hold after fault injection.
- [ ] Pending deadline, cancellation, replacement and consent history work without frontend or running expiry worker.
- `BOOKING-QUOTE` (FR-BOOKING-001): Changing client total cannot change persisted price; quote after10min rejected; own vehicle rental rejected
- `BOOKING-CONCURRENCY` (FR-BOOKING-002): Concurrent overlapping booking/carpool/block commits at most one; injected failure rolls back all writes
- `BOOKING-CONSENT` (FR-BOOKING-003): Combined one approval stays PENDING; simultaneous final decisions produce one confirmation event
- `BOOKING-CANCEL-EXPIRE` (FR-BOOKING-004): Cancel twice cannot release unrelated holds; delayed worker cannot permit accept after deadline
Acceptance requires observable persisted output, relevant HTTP statuses and no regression in earlier phases. If an NFR target owned by this phase is not yet measurable, record dependency and owner rather than claiming pass.

## M. Definition of done
Every task checkbox has a focused red/green test and commit; listed acceptance/scenarios and current prior-phase suites pass; OpenAPI, specification, UI and ADR changes are synchronized; migration/invariant checks pass where relevant; no stub, TODO or synthetic data passed off as production behavior; handoff records evidence and known limits. Seek a fresh independent review for major feature/final branch work when workflow and available tools permit; fix critical/important findings before completion. Do not proceed into Phase08 automatically unless owner has separately authorized continuing implementation.

## N. Verification commands
From repo root after Phase01 defines scripts: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:unit`, `npm run test:integration`, `npm run test:contract`, `npm run test:e2e`, `npm run build`, `npm run docs:check`. For schema phases: `npm run db:validate`, `npm run db:migrate:deploy`, `npm run db:test:constraints` against explicitly named disposable DB only. Run focused test first, relevant suites after each task, full currently applicable suite before commit/handoff. Phase01 may add scripts only when their suites exist; a missing future suite is reported unavailable, not passed. Production build and CI commands must return exit0 with complete output inspected. A command's mere invocation is not evidence of a pass.

## O. Git workflow
Recommended branch `codex/phase-07-drivehire-booking-backend` from completed prior phase commit, never force-push. Confirm clean status, use an isolated worktree when user/platform preference supports it; user specified same repository, not a new GitHub project. Commit test+implementation per independently verifiable task (`test: cover <behavior>` or `feat: <behavior>`; combine red/green after passing), then `docs: update phase 07 handoff` if docs changed. Verify diff contains no secret/generated cache/private document. Before push run applicable checks, inspect commit list, and do not merge main without authorized integration decision.

## P. Final handoff
Return completed tasks, exact files changed, new migrations/constraints, operation IDs/endpoints, UI screens/assets with provenance, tests/commands and exit results, known issues, ADR/spec changes, branch/commit, and precise next-phase dependencies. Distinguish targets from measured values and test skips from passes. Link the phase's prompt and evidence; stop at this phase boundary.
