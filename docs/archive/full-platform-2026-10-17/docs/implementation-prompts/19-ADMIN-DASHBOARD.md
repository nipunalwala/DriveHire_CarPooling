# Phase 19 · Admin-Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` if the owner chooses delegated execution, or `superpowers:executing-plans` for native execution. Before writing code read the approved spec, this prompt, `superpowers:using-superpowers`, `superpowers:brainstorming` and `superpowers:writing-plans`; select the already approved architectural path and do not repeat questions settled here. Use `superpowers:test-driven-development` and `superpowers:verification-before-completion` for each behavioral task. This document is a phase execution prompt, not authorization to start. Checkboxes track only verified work.

**Goal:** Deliver operational queues,verification,account incidents,complaints,reports and immutable audit views.

**Architecture:** Express modular monolith plus same-codebase worker, PostgreSQL/Prisma with reviewed custom SQL constraints, React/Vite TypeScript client, versioned `/api/v1` OpenAPI. Resource and seat invariants live on the server and in PostgreSQL.

**Tech Stack:** React, Vite, TypeScript, Tailwind, React Router, TanStack Query, RHF, Zod, Lucide, Motion; Node/Express/TypeScript; PostgreSQL/Prisma; Vitest/RTL/Supertest/Playwright.

**Spec:** `docs/specification/` (canonical); especially 01-functional-requirements.md, 03-user-roles-permissions.md, 05-business-rules.md, 08-api-specification.md, 09-authentication-security.md, 10-frontend-ui-ux-specification.md, 14-admin-workflows.md, 15-testing-strategy.md; `docs/api/openapi.json` and `docs/implementation-prompts/00-MASTER-EXECUTION-GUIDE.md`.

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
Act as Administrative frontend engineer. Deliver operational queues,verification,account incidents,complaints,reports and immutable audit views. Build working code and tests after implementation approval. Keep this phase's boundary; update canonical documents and ADR when a real decision changes.

## B. Project context and specification references
The repository is a documentation-only reset of an older Knex/single-role app. Do not restore retired files or migrations. Read these canonical specs before modifying interfaces:
- [01 functional-requirements](../specification/01-functional-requirements.md)
- [03 user-roles-permissions](../specification/03-user-roles-permissions.md)
- [05 business-rules](../specification/05-business-rules.md)
- [08 api-specification](../specification/08-api-specification.md)
- [09 authentication-security](../specification/09-authentication-security.md)
- [10 frontend-ui-ux-specification](../specification/10-frontend-ui-ux-specification.md)
- [14 admin-workflows](../specification/14-admin-workflows.md)
- [15 testing-strategy](../specification/15-testing-strategy.md)
- [OpenAPI contract](../api/openapi.json)
- [Architecture decisions](../specification/20-architecture-decisions.md)

## C. Dependencies and prerequisite verification
Completed `18-VEHICLE-OWNER-DASHBOARD.md` handoff, committed code, passing scoped verification, and all earlier canonical contracts. Before starting, inspect `git status --short`, current branch, installed dependency/DB availability and prior handoff evidence. Run `npm ci`, `npm run typecheck`, `npm run lint`, and completed-phase tests/build after Phase01 establishes scripts; for Phase01 inspect the empty baseline and validate tools/config instead. Fix or document actual inherited failure before attributing a new one. Never apply new migrations to the retired database. If a listed dependency did not actually finish, stop dependent implementation and report the exact missing artifact; complete independent analysis only.

## D. Exact implementation scope and task sequence
Each task is a small independently reviewable deliverable. For each: name the observed behavior, write its focused test, run to see the expected failure, implement the minimal working behavior, rerun focused then relevant suite, refactor while green, commit. Write an exact test signature/interface/file brief in the phase's temporary execution ledger when a task spans several files; do not invent hidden shared APIs.
- [ ] **Task 1.** Overview pending verification/complaint/overrun queues and7/30/90day report selection; estimate not revenue; task-first links to filtered queue. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 2.** User search/detail,suspend/reactivate confirmation and reasons,visible future cancellation/active incident consequence; self/last-admin conflict surfaced. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 3.** Driver and vehicle verification queue/current revision detail/private clean document preview,expiry,self-approval denial,mandatory reason,CAS stale reload. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 4.** Booking/carpool/trip queues scoped by date/status/overrun; parent cancellation, pending driver replacement,active incident failure through same APIs; no generic status editor. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 5.** Complaint OPEN/IN_REVIEW/terminal resolution with case/history; review hide action with reason and refreshed public aggregate. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 6.** Reports exact metric definitions/range in copy; audit filters and safe before/after read-only detail,requestId linkable in operator logs; no edit/delete audit UI. Deliver a passing focused test and commit for this task before beginning the next.

## E. File and folder expectations
features/admin/{overview,users,verification,bookings,carpools,complaints,reports,audit}; scoped route guards; admin E2E. Keep per-domain routers/controllers/services/repositories/schemas/tests together. Add only files with one clear responsibility; exact additional names follow these module boundaries. Update safe shared contract types whenever API DTOs change. Do not import server/Prisma code into browser. Generated image assets, when this phase uses them, must be physically under `apps/web/public/images/generated/`, with `docs/design/image-assets.md` recording source prompt, selected filename, dimensions, license/usage provenance and alt/decorative decision.

## F. Database requirements and transactions
No schema. Strict backend ADMIN and object authorization; no arbitrary direct-table/state edits; queue data not cached across role/account loss. Use tables, types, FKs, unique/check/exclusion constraints, indexes and deletion policy from [database design](../specification/07-database-design.md). Any new schema change is a versioned Prisma migration with raw SQL when required, tested on fresh and incremental disposable DB. Never use `db push` in production or mutate an applied migration. Domain writes that affect status/holds/seats/history/audit/outbox commit together under canonical lock ordering. No external SMTP/scan call while row locks are held.

## G. API contracts and authorization
Implement or consume only the relevant contract operations below; for frontend phases, do not duplicate them server-side. The OpenAPI components define required/optional field types and exact success envelope. Strict unknown-key rejection, UUID/path/query validation, object authorization and current account/role check apply to every private operation. Missing auth401, role403, foreign private object404, state/version/capacity409, field422, throttle429, dependency503. Every write validates server prices, ownership and status; never trust client role/resource IDs or total. Do not add undocumented generic endpoints.

| Method and path | Operation | Access | Request schema | Success schema/status | Phase rule |
|---|---|---|---|---|---|
| `GET /api/v1/documents/{id}/content` | `getDocument` | public or owner/admin | none | binary; HTTP200 | Public only CLEAN image of publicly visible approved vehicle; private docs owner or admin; attachment/nosniff; no executable content |
| `GET /api/v1/bookings/{id}` | `getBooking` | participant/admin | none | Booking; HTTP200 | Passenger, resource driver, owning vehicle owner or admin only |
| `POST /api/v1/bookings/{id}/cancel` | `cancelBooking` | requester/provider/admin | VersionReasonInput | Booking; HTTP200 | Before start only for participant; requester cutoff 15min for confirmed, providers reason audited; admin incident after start uses FAILED |
| `POST /api/v1/bookings/{id}/driver-assignment` | `replaceDriver` | requester/admin | AssignmentInput | Booking; HTTP200 | Pending only; DRIVER_HIRE/COMBINED; atomic replace reservation, reset driver consent, retain original deadline; reject self/ineligible driver |
| `GET /api/v1/carpools/{id}` | `getCarpool` | public/participant | none | Carpool; HTTP200 | DRAFT host/admin only; terminal details only host/participant/admin; omit passenger roster from public |
| `POST /api/v1/carpools/{id}/cancel` | `cancelCarpool` | host/admin | VersionReasonInput | Carpool; HTTP200 | Before STARTED; cancel live requests, zero confirmedSeats, release both reservations; admin after start uses FAILED |
| `POST /api/v1/trips/{id}/transitions` | `transitionTrip` | assigned driver/admin | TransitionInput | Trip; HTTP200 | CAS version; assigned -> started -> in_transit -> completed; FAILED needs reason; no skip/backward |
| `GET /api/v1/admin/users` | `adminUsers` | ADMIN | none | User; HTTP200 | Server admin role and active check |
| `GET /api/v1/admin/users/{id}` | `adminUser` | ADMIN | none | User; HTTP200 | Audit sensitive read; no secrets |
| `POST /api/v1/admin/users/{id}/suspend` | `suspendUser` | ADMIN | ReasonInput | User; HTTP200 | Prevent self/last-admin suspension; revoke sessions immediately; atomic unstarted cancellations; active trips incident flagged for admin resolution |
| `POST /api/v1/admin/users/{id}/reactivate` | `reactivateUser` | ADMIN | ReasonInput | User; HTTP200 | No automatic verification renewal, bookings or sessions restored |
| `GET /api/v1/admin/verifications` | `adminVerifications` | ADMIN | none | Verification; HTTP200 | Newest pending revisions; filter type/status |
| `GET /api/v1/admin/verifications/{id}` | `adminVerification` | ADMIN | none | Verification; HTTP200 | Record sensitive read audit; download via protected content endpoint |
| `POST /api/v1/admin/verifications/{id}/decision` | `decideVerification` | ADMIN | VerificationDecisionInput | Verification; HTTP200 | No own submission approval; CAS current pending revision; CLEAN docs unexpired; mandatory reason |
| `GET /api/v1/admin/bookings` | `adminBookings` | ADMIN | none | Booking; HTTP200 | Date/status filters; paginated |
| `GET /api/v1/admin/carpools` | `adminCarpools` | ADMIN | none | Carpool; HTTP200 | Date/status filters; paginated |
| `GET /api/v1/admin/trips` | `adminTrips` | ADMIN | none | Trip; HTTP200 | Filter status and overdue; participant details via authorized resources |
| `GET /api/v1/admin/complaints` | `adminComplaints` | ADMIN | none | Complaint; HTTP200 | Filter state; paginated |
| `POST /api/v1/admin/complaints/{id}/decision` | `decideComplaint` | ADMIN | ComplaintDecisionInput | Complaint; HTTP200 | OPEN->IN_REVIEW->RESOLVED or DISMISSED; no silent deletes; reason mandatory |
| `POST /api/v1/admin/reviews/{id}/hide` | `hideReview` | ADMIN | ReasonInput | Review; HTTP200 | Idempotent; aggregation excludes hidden reviews immediately |
| `GET /api/v1/admin/audit-logs` | `adminAudit` | ADMIN | none | AuditEntry; HTTP200 | Allowlisted action/actor/date filters; cannot mutate audit |
| `GET /api/v1/admin/reports/summary` | `adminReport` | ADMIN | none | Report; HTTP200 | Required from/to dates max90d; UTC half-open boundaries; totals not collected revenue |

## H. Frontend requirements
All nine admin surface groups listed in UI specification,protected private previews and explicit reason/version actions. Follow [UI/UX specification](../specification/10-frontend-ui-ux-specification.md) for page-specific components, API dependencies, interactions, loading/empty/error/success, responsive and accessibility states. Use server data; no fabricated live metrics, avatar/vehicle imagery, confirmation, payment or location. Use generated original images only in appropriate explanatory/marketing placements and follow Impeccable's craft/QA process at UI implementation time.

## I. Business rules and edge cases
Relevant objective scenarios:
- `DRIVER-VERIFY` (FR-DRIVER-002): Outdated approval request cannot approve replacement license; expired driver blocked even if expiry job paused
- `VEHICLE-VERIFY` (FR-VEHICLE-002): Approved but expired insurance cannot create quote/booking; rejected reason visible owner only
- `RIDE-STATE-MACHINE` (FR-RIDE-001): SCHEDULED cannot start; two same-version transitions commit once; completion releases reservations and updates parent
- `RIDE-OVERRUN` (FR-RIDE-002): Overrunning earlier ride blocks next ride start even after scheduled interval ends; marker accessible text
- `NOTIFY-REPLAY` (FR-NOTIFY-001): Crash after one recipient insert and retry yields exactly one notification per recipient within60s healthy worker
- `ADMIN-SUSPEND` (FR-ADMIN-001): Already issued JWT blocked next request; active driver incident visible for admin resolution; reactivation needs fresh login
- `ADMIN-OPERATIONS` (FR-ADMIN-002): Admin cancellation shares rollback behavior; every intervention includes reason and requestId
- `ADMIN-COMPLAINT` (FR-ADMIN-003): Nonadmin cannot decide; resolution/notification/audit commit atomically
- `ADMIN-REPORTS` (FR-ADMIN-004): Report counts match seeded database; hidden review excluded rating; app DB role cannot UPDATE/DELETE audit rows
Also apply [business rules](../specification/05-business-rules.md): active verification checked at mutation time; bookings require two physical resource holds; carpool pending seats consume zero; only accepted seats count; transition/state/version guards; cancellation cannot release active physical use; suspension denies current JWT. Keep manual route clearly simulated and estimated amounts uncollected. For this phase identify five highest-risk inputs from the review-focus list and bind a named negative/integration test to the owning task.

## J. Security requirements
Use [authentication/security](../specification/09-authentication-security.md): Argon2id, OTP/refresh rules, bounded shared rate limits, secure cookie/CORS/Origin/Helmet, strict Zod, object ownership, private scan-first uploads, redacted logs, auditable admin writes and secrets from environment. Implement only the controls relevant to this phase, preserving earlier controls; negative role/owner tests are mandatory. A UI guard is convenience, never permission.

## K. Testing requirements
Write targeted red-green-refactor unit tests for pure rules and UI behavior, real PostgreSQL integration tests for database invariants, Supertest API tests for contracts/authorization/error codes, RTL accessibility/form tests for frontend phases, and API-backed Playwright E2E for user journeys. Negative, concurrency and permission tests are not optional where specified below:
- Nonadmin direct navigation and forged API403; account role revoked clears cached private admin data.
- Admin verification stale/self case,suspend active trip incident,last-admin guard and reason preservation on error.
- Complaint review/resolve,report fixture exact values,audit entry after each mutation.
- Keyboard/private preview/focus management,responsive queues and long resolution text.
Do not call a mocked successful write an end-to-end pass. Record each failing test's expected failure before implementation and fresh full-suite result before completion.

## L. Acceptance criteria
- [ ] Every admin page/action specified works against actual guarded API.
- [ ] Audit and reports safe,truthful and read-only where required.
- [ ] No critical operation bypasses domain invariants or provider consent.
- `DRIVER-VERIFY` (FR-DRIVER-002): Outdated approval request cannot approve replacement license; expired driver blocked even if expiry job paused
- `VEHICLE-VERIFY` (FR-VEHICLE-002): Approved but expired insurance cannot create quote/booking; rejected reason visible owner only
- `RIDE-STATE-MACHINE` (FR-RIDE-001): SCHEDULED cannot start; two same-version transitions commit once; completion releases reservations and updates parent
- `RIDE-OVERRUN` (FR-RIDE-002): Overrunning earlier ride blocks next ride start even after scheduled interval ends; marker accessible text
- `NOTIFY-REPLAY` (FR-NOTIFY-001): Crash after one recipient insert and retry yields exactly one notification per recipient within60s healthy worker
- `ADMIN-SUSPEND` (FR-ADMIN-001): Already issued JWT blocked next request; active driver incident visible for admin resolution; reactivation needs fresh login
- `ADMIN-OPERATIONS` (FR-ADMIN-002): Admin cancellation shares rollback behavior; every intervention includes reason and requestId
- `ADMIN-COMPLAINT` (FR-ADMIN-003): Nonadmin cannot decide; resolution/notification/audit commit atomically
- `ADMIN-REPORTS` (FR-ADMIN-004): Report counts match seeded database; hidden review excluded rating; app DB role cannot UPDATE/DELETE audit rows
Acceptance requires observable persisted output, relevant HTTP statuses and no regression in earlier phases. If an NFR target owned by this phase is not yet measurable, record dependency and owner rather than claiming pass.

## M. Definition of done
Every task checkbox has a focused red/green test and commit; listed acceptance/scenarios and current prior-phase suites pass; OpenAPI, specification, UI and ADR changes are synchronized; migration/invariant checks pass where relevant; no stub, TODO or synthetic data passed off as production behavior; handoff records evidence and known limits. Seek a fresh independent review for major feature/final branch work when workflow and available tools permit; fix critical/important findings before completion. Do not proceed into Phase20 automatically unless owner has separately authorized continuing implementation.

## N. Verification commands
From repo root after Phase01 defines scripts: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:unit`, `npm run test:integration`, `npm run test:contract`, `npm run test:e2e`, `npm run build`, `npm run docs:check`. For schema phases: `npm run db:validate`, `npm run db:migrate:deploy`, `npm run db:test:constraints` against explicitly named disposable DB only. Run focused test first, relevant suites after each task, full currently applicable suite before commit/handoff. Phase01 may add scripts only when their suites exist; a missing future suite is reported unavailable, not passed. Production build and CI commands must return exit0 with complete output inspected. A command's mere invocation is not evidence of a pass.

## O. Git workflow
Recommended branch `codex/phase-19-admin-dashboard` from completed prior phase commit, never force-push. Confirm clean status, use an isolated worktree when user/platform preference supports it; user specified same repository, not a new GitHub project. Commit test+implementation per independently verifiable task (`test: cover <behavior>` or `feat: <behavior>`; combine red/green after passing), then `docs: update phase 19 handoff` if docs changed. Verify diff contains no secret/generated cache/private document. Before push run applicable checks, inspect commit list, and do not merge main without authorized integration decision.

## P. Final handoff
Return completed tasks, exact files changed, new migrations/constraints, operation IDs/endpoints, UI screens/assets with provenance, tests/commands and exit results, known issues, ADR/spec changes, branch/commit, and precise next-phase dependencies. Distinguish targets from measured values and test skips from passes. Link the phase's prompt and evidence; stop at this phase boundary.
