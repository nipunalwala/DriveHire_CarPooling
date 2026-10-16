# Phase 16 · Passenger-Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` if the owner chooses delegated execution, or `superpowers:executing-plans` for native execution. Before writing code read the approved spec, this prompt, `superpowers:using-superpowers`, `superpowers:brainstorming` and `superpowers:writing-plans`; select the already approved architectural path and do not repeat questions settled here. Use `superpowers:test-driven-development` and `superpowers:verification-before-completion` for each behavioral task. This document is a phase execution prompt, not authorization to start. Checkboxes track only verified work.

**Goal:** Deliver real booking, seat requests, history, reviews, complaints and shared notification workflows.

**Architecture:** Express modular monolith plus same-codebase worker, PostgreSQL/Prisma with reviewed custom SQL constraints, React/Vite TypeScript client, versioned `/api/v1` OpenAPI. Resource and seat invariants live on the server and in PostgreSQL.

**Tech Stack:** React, Vite, TypeScript, Tailwind, React Router, TanStack Query, RHF, Zod, Lucide, Motion; Node/Express/TypeScript; PostgreSQL/Prisma; Vitest/RTL/Supertest/Playwright.

**Spec:** `docs/specification/` (canonical); especially 01-functional-requirements.md, 03-user-roles-permissions.md, 05-business-rules.md, 08-api-specification.md, 10-frontend-ui-ux-specification.md, 11-booking-lifecycle.md, 12-carpooling-lifecycle.md, 13-notifications.md, 15-testing-strategy.md; `docs/api/openapi.json` and `docs/implementation-prompts/00-MASTER-EXECUTION-GUIDE.md`.

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
Act as Passenger workflow frontend engineer. Deliver real booking, seat requests, history, reviews, complaints and shared notification workflows. Build working code and tests after implementation approval. Keep this phase's boundary; update canonical documents and ADR when a real decision changes.

## B. Project context and specification references
The repository is a documentation-only reset of an older Knex/single-role app. Do not restore retired files or migrations. Read these canonical specs before modifying interfaces:
- [01 functional-requirements](../specification/01-functional-requirements.md)
- [03 user-roles-permissions](../specification/03-user-roles-permissions.md)
- [05 business-rules](../specification/05-business-rules.md)
- [08 api-specification](../specification/08-api-specification.md)
- [10 frontend-ui-ux-specification](../specification/10-frontend-ui-ux-specification.md)
- [11 booking-lifecycle](../specification/11-booking-lifecycle.md)
- [12 carpooling-lifecycle](../specification/12-carpooling-lifecycle.md)
- [13 notifications](../specification/13-notifications.md)
- [15 testing-strategy](../specification/15-testing-strategy.md)
- [OpenAPI contract](../api/openapi.json)
- [Architecture decisions](../specification/20-architecture-decisions.md)

## C. Dependencies and prerequisite verification
Completed `15-AUTHENTICATION-FRONTEND.md` handoff, committed code, passing scoped verification, and all earlier canonical contracts. Before starting, inspect `git status --short`, current branch, installed dependency/DB availability and prior handoff evidence. Run `npm ci`, `npm run typecheck`, `npm run lint`, and completed-phase tests/build after Phase01 establishes scripts; for Phase01 inspect the empty baseline and validate tools/config instead. Fix or document actual inherited failure before attributing a new one. Never apply new migrations to the retired database. If a listed dependency did not actually finish, stop dependent implementation and report the exact missing artifact; complete independent analysis only.

## D. Exact implementation scope and task sequence
Each task is a small independently reviewable deliverable. For each: name the observed behavior, write its focused test, run to see the expected failure, implement the minimal working behavior, rerun focused then relevant suite, refactor while green, commit. Write an exact test signature/interface/file brief in the phase's temporary execution ledger when a task spans several files; do not invent hidden shared APIs.
- [ ] **Task 1.** Dashboard prioritizes next booking/accepted carpool/pending requests and unread; shared authenticated vehicle/driver/carpool search preserves URL context. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 2.** Three-service booking form selects compatible own/external resources,dates/passengers; server quote review displays line items,expiry and NOT_COLLECTED; edit invalidates quote. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 3.** Create with stable key across timeout retry; PENDING detail shows both consent rows/expiry; pending replacement same-rate policy; cancellation reason/version/cutoff accurate. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 4.** Instant/approval seat join outcomes differentiated; own history/cancel; final-seat409 refreshes availability; no optimistic seat acquisition. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 5.** Trip/timeline view poll visible active status only; progress labelled simulation; review forms derive eligible actual targets,duplicate409 and30day rule; own review history. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 6.** Complaint form linked to own trip and real case list/resolution; shared notifications own feed/unread/read/read-all with cutoff/polling and safe links. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 7.** Clear private data on logout/role loss; invalidate affected booking/seat/trip/notification queries after mutation; unknown transport outcome reconciles current server state. Deliver a passing focused test and commit for this task before beginning the next.

## E. File and folder expectations
features/passenger,bookings,carpools,seats,trips,reviews,complaints,notifications; query invalidation maps; API-backed E2E. Keep per-domain routers/controllers/services/repositories/schemas/tests together. Add only files with one clear responsibility; exact additional names follow these module boundaries. Update safe shared contract types whenever API DTOs change. Do not import server/Prisma code into browser. Generated image assets, when this phase uses them, must be physically under `apps/web/public/images/generated/`, with `docs/design/image-assets.md` recording source prompt, selected filename, dimensions, license/usage provenance and alt/decorative decision.

## F. Database requirements and transactions
No new domain schema. Consume atomic APIs; quote/idempotency/versions handled correctly, no browser availability or price authority. Use tables, types, FKs, unique/check/exclusion constraints, indexes and deletion policy from [database design](../specification/07-database-design.md). Any new schema change is a versioned Prisma migration with raw SQL when required, tested on fresh and incremental disposable DB. Never use `db push` in production or mutate an applied migration. Domain writes that affect status/holds/seats/history/audit/outbox commit together under canonical lock ordering. No external SMTP/scan call while row locks are held.

## G. API contracts and authorization
Implement or consume only the relevant contract operations below; for frontend phases, do not duplicate them server-side. The OpenAPI components define required/optional field types and exact success envelope. Strict unknown-key rejection, UUID/path/query validation, object authorization and current account/role check apply to every private operation. Missing auth401, role403, foreign private object404, state/version/capacity409, field422, throttle429, dependency503. Every write validates server prices, ownership and status; never trust client role/resource IDs or total. Do not add undocumented generic endpoints.

| Method and path | Operation | Access | Request schema | Success schema/status | Phase rule |
|---|---|---|---|---|---|
| `GET /api/v1/drivers` | `searchDrivers` | public | none | Driver; HTTP200 | Only active approved unexpired accepting drivers; times must be supplied together |
| `GET /api/v1/vehicles` | `searchVehicles` | public | none | Vehicle; HTTP200 | Only active owner, approved unexpired documents, listed and unarchived; not a reservation |
| `GET /api/v1/owners/me/vehicles` | `listMyVehicles` | OWNER | none | VehiclePrivate; HTTP200 | Own unarchived; include status |
| `POST /api/v1/booking-quotes` | `quoteBooking` | verified PASSENGER | QuoteInput | Quote; HTTP201 | Use server rates; service-specific ownership/driver checks; no inventory hold; expires 10min |
| `POST /api/v1/bookings` | `createBooking` | verified PASSENGER | BookingInput | Booking; HTTP201 | Mandatory Idempotency-Key; atomic dual resource hold; quote owner and freshness rechecked |
| `GET /api/v1/bookings` | `listBookings` | PASSENGER | none | Booking; HTTP200 | passenger_id=self; include pending/history |
| `GET /api/v1/bookings/{id}` | `getBooking` | participant/admin | none | Booking; HTTP200 | Passenger, resource driver, owning vehicle owner or admin only |
| `POST /api/v1/bookings/{id}/cancel` | `cancelBooking` | requester/provider/admin | VersionReasonInput | Booking; HTTP200 | Before start only for participant; requester cutoff 15min for confirmed, providers reason audited; admin incident after start uses FAILED |
| `POST /api/v1/bookings/{id}/driver-assignment` | `replaceDriver` | requester/admin | AssignmentInput | Booking; HTTP200 | Pending only; DRIVER_HIRE/COMBINED; atomic replace reservation, reset driver consent, retain original deadline; reject self/ineligible driver |
| `GET /api/v1/carpools` | `searchCarpools` | public | none | Carpool; HTTP200 | Exact city pair and departure date in origin timezone; no map/route matching |
| `GET /api/v1/carpools/{id}` | `getCarpool` | public/participant | none | Carpool; HTTP200 | DRAFT host/admin only; terminal details only host/participant/admin; omit passenger roster from public |
| `POST /api/v1/carpools/{id}/seat-requests` | `requestSeat` | verified PASSENGER | SeatInput | SeatRequest; HTTP201 | Idempotency-Key required; lock carpool; own ride forbidden; one live request/user; instant consumes seats, approval does not |
| `POST /api/v1/seat-requests/{id}/cancel` | `cancelSeat` | requester/admin | VersionReasonInput | SeatRequest; HTTP200 | Before start; accepted cutoff 15min for requester; decrement only accepted->cancelled once |
| `GET /api/v1/users/me/seat-requests` | `listMySeats` | PASSENGER | none | SeatRequest; HTTP200 | passenger_id=self |
| `GET /api/v1/trips` | `listTrips` | participant/admin | none | Trip; HTTP200 | Requester/assigned driver/vehicle owner/accepted passenger/host; scope server-side |
| `GET /api/v1/trips/{id}` | `getTrip` | participant/admin | none | Trip; HTTP200 | Participant object authorization; waypoints are simulated labels |
| `GET /api/v1/trips/{id}/history` | `tripHistory` | participant/admin | none | HistoryEntry; HTTP200 | Same object access as trip |
| `POST /api/v1/reviews` | `createReview` | verified participant | ReviewInput | Review; HTTP201 | Completed eligible trip; target bound to actual resource; not self/own vehicle; unique author/trip/target |
| `GET /api/v1/reviews/mine` | `myReviews` | active user | none | Review; HTTP200 | Author=self; includes own hidden marker |
| `GET /api/v1/notifications` | `listNotifications` | active user | none | Notification; HTTP200 | recipient_id=self |
| `GET /api/v1/notifications/unread-count` | `unreadCount` | active user | none | UnreadCount; HTTP200 | Indexed recipient/read_at predicate |
| `POST /api/v1/notifications/{id}/read` | `readNotification` | active user | none | Notification; HTTP200 | Own only, idempotent; foreign recipient 404 |
| `POST /api/v1/notifications/read-all` | `readAllNotifications` | active user | none | Ack; HTTP200 | Capture server cutoff timestamp at request start; later arrivals remain unread |
| `POST /api/v1/complaints` | `createComplaint` | participant | ComplaintInput | Complaint; HTTP201 | Verified participant; max 3 open complaints/user/trip; reason plain text |
| `GET /api/v1/complaints/mine` | `myComplaints` | active user | none | Complaint; HTTP200 | reporter=self |

## H. Frontend requirements
All Passenger pages plus shared notifications/reviews/profile/trip view per UI spec; real actions,loading/empty/error/success and role eligibility. Follow [UI/UX specification](../specification/10-frontend-ui-ux-specification.md) for page-specific components, API dependencies, interactions, loading/empty/error/success, responsive and accessibility states. Use server data; no fabricated live metrics, avatar/vehicle imagery, confirmation, payment or location. Use generated original images only in appropriate explanatory/marketing placements and follow Impeccable's craft/QA process at UI implementation time.

## I. Business rules and edge cases
Relevant objective scenarios:
- `BOOKING-QUOTE` (FR-BOOKING-001): Changing client total cannot change persisted price; quote after10min rejected; own vehicle rental rejected
- `CARPOOL-SEARCH` (FR-CARPOOL-002): Day boundary search includes correct UTC intervals; roster/contact absent public response
- `CARPOOL-LAST-SEAT` (FR-CARPOOL-003): Many concurrent joins for final seat yield one ACCEPTED; idempotent retry consumes seats once
- `RIDE-STATE-MACHINE` (FR-RIDE-001): SCHEDULED cannot start; two same-version transitions commit once; completion releases reservations and updates parent
- `REVIEW-ELIGIBILITY` (FR-REVIEW-001): Parallel duplicate submissions create one review; hidden review removed from count/mean immediately
- `NOTIFY-REPLAY` (FR-NOTIFY-001): Crash after one recipient insert and retry yields exactly one notification per recipient within60s healthy worker
- `ADMIN-COMPLAINT` (FR-ADMIN-003): Nonadmin cannot decide; resolution/notification/audit commit atomically
Also apply [business rules](../specification/05-business-rules.md): active verification checked at mutation time; bookings require two physical resource holds; carpool pending seats consume zero; only accepted seats count; transition/state/version guards; cancellation cannot release active physical use; suspension denies current JWT. Keep manual route clearly simulated and estimated amounts uncollected. For this phase identify five highest-risk inputs from the review-focus list and bind a named negative/integration test to the owning task.

## J. Security requirements
Use [authentication/security](../specification/09-authentication-security.md): Argon2id, OTP/refresh rules, bounded shared rate limits, secure cookie/CORS/Origin/Helmet, strict Zod, object ownership, private scan-first uploads, redacted logs, auditable admin writes and secrets from environment. Implement only the controls relevant to this phase, preserving earlier controls; negative role/owner tests are mandatory. A UI guard is convenience, never permission.

## K. Testing requirements
Write targeted red-green-refactor unit tests for pure rules and UI behavior, real PostgreSQL integration tests for database invariants, Supertest API tests for contracts/authorization/error codes, RTL accessibility/form tests for frontend phases, and API-backed Playwright E2E for user journeys. Negative, concurrency and permission tests are not optional where specified below:
- API-backed three booking modes incl owner+driver consent using distinct users; quote stale/resource conflict/cancel cutoff/replacement.
- Two browser passengers last-seat race; pending-vs-accepted labels,seat cancellation and history.
- Completed review eligible targets+duplicate,complaint submission,own notifications/read-all; keyboard/mobile flow.
- Network drop after create then same key retry yields one booking/request with accurate UI,not duplicate.
Do not call a mocked successful write an end-to-end pass. Record each failing test's expected failure before implementation and fresh full-suite result before completion.

## L. Acceptance criteria
- [ ] All passenger/shared pages meet UI spec with real persistence.
- [ ] No paid/confirmed/accepted UI before corresponding server status.
- [ ] Critical booking/seat timeout/conflict/permission journeys pass desktop/mobile E2E.
- `BOOKING-QUOTE` (FR-BOOKING-001): Changing client total cannot change persisted price; quote after10min rejected; own vehicle rental rejected
- `CARPOOL-SEARCH` (FR-CARPOOL-002): Day boundary search includes correct UTC intervals; roster/contact absent public response
- `CARPOOL-LAST-SEAT` (FR-CARPOOL-003): Many concurrent joins for final seat yield one ACCEPTED; idempotent retry consumes seats once
- `RIDE-STATE-MACHINE` (FR-RIDE-001): SCHEDULED cannot start; two same-version transitions commit once; completion releases reservations and updates parent
- `REVIEW-ELIGIBILITY` (FR-REVIEW-001): Parallel duplicate submissions create one review; hidden review removed from count/mean immediately
- `NOTIFY-REPLAY` (FR-NOTIFY-001): Crash after one recipient insert and retry yields exactly one notification per recipient within60s healthy worker
- `ADMIN-COMPLAINT` (FR-ADMIN-003): Nonadmin cannot decide; resolution/notification/audit commit atomically
Acceptance requires observable persisted output, relevant HTTP statuses and no regression in earlier phases. If an NFR target owned by this phase is not yet measurable, record dependency and owner rather than claiming pass.

## M. Definition of done
Every task checkbox has a focused red/green test and commit; listed acceptance/scenarios and current prior-phase suites pass; OpenAPI, specification, UI and ADR changes are synchronized; migration/invariant checks pass where relevant; no stub, TODO or synthetic data passed off as production behavior; handoff records evidence and known limits. Seek a fresh independent review for major feature/final branch work when workflow and available tools permit; fix critical/important findings before completion. Do not proceed into Phase17 automatically unless owner has separately authorized continuing implementation.

## N. Verification commands
From repo root after Phase01 defines scripts: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:unit`, `npm run test:integration`, `npm run test:contract`, `npm run test:e2e`, `npm run build`, `npm run docs:check`. For schema phases: `npm run db:validate`, `npm run db:migrate:deploy`, `npm run db:test:constraints` against explicitly named disposable DB only. Run focused test first, relevant suites after each task, full currently applicable suite before commit/handoff. Phase01 may add scripts only when their suites exist; a missing future suite is reported unavailable, not passed. Production build and CI commands must return exit0 with complete output inspected. A command's mere invocation is not evidence of a pass.

## O. Git workflow
Recommended branch `codex/phase-16-passenger-dashboard` from completed prior phase commit, never force-push. Confirm clean status, use an isolated worktree when user/platform preference supports it; user specified same repository, not a new GitHub project. Commit test+implementation per independently verifiable task (`test: cover <behavior>` or `feat: <behavior>`; combine red/green after passing), then `docs: update phase 16 handoff` if docs changed. Verify diff contains no secret/generated cache/private document. Before push run applicable checks, inspect commit list, and do not merge main without authorized integration decision.

## P. Final handoff
Return completed tasks, exact files changed, new migrations/constraints, operation IDs/endpoints, UI screens/assets with provenance, tests/commands and exit results, known issues, ADR/spec changes, branch/commit, and precise next-phase dependencies. Distinguish targets from measured values and test skips from passes. Link the phase's prompt and evidence; stop at this phase boundary.
