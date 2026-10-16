# Phase 05 · Driver-Management

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` if the owner chooses delegated execution, or `superpowers:executing-plans` for native execution. Before writing code read the approved spec, this prompt, `superpowers:using-superpowers`, `superpowers:brainstorming` and `superpowers:writing-plans`; select the already approved architectural path and do not repeat questions settled here. Use `superpowers:test-driven-development` and `superpowers:verification-before-completion` for each behavioral task. This document is a phase execution prompt, not authorization to start. Checkboxes track only verified work.

**Goal:** Implement complete driver qualification, scanned uploads, approval, availability and scoped history.

**Architecture:** Express modular monolith plus same-codebase worker, PostgreSQL/Prisma with reviewed custom SQL constraints, React/Vite TypeScript client, versioned `/api/v1` OpenAPI. Resource and seat invariants live on the server and in PostgreSQL.

**Tech Stack:** React, Vite, TypeScript, Tailwind, React Router, TanStack Query, RHF, Zod, Lucide, Motion; Node/Express/TypeScript; PostgreSQL/Prisma; Vitest/RTL/Supertest/Playwright.

**Spec:** `docs/specification/` (canonical); especially 01-functional-requirements.md, 03-user-roles-permissions.md, 05-business-rules.md, 07-database-design.md, 08-api-specification.md, 09-authentication-security.md, 13-notifications.md, 14-admin-workflows.md; `docs/api/openapi.json` and `docs/implementation-prompts/00-MASTER-EXECUTION-GUIDE.md`.

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
Act as Driver-domain and document-security engineer. Implement complete driver qualification, scanned uploads, approval, availability and scoped history. Build working code and tests after implementation approval. Keep this phase's boundary; update canonical documents and ADR when a real decision changes.

## B. Project context and specification references
The repository is a documentation-only reset of an older Knex/single-role app. Do not restore retired files or migrations. Read these canonical specs before modifying interfaces:
- [01 functional-requirements](../specification/01-functional-requirements.md)
- [03 user-roles-permissions](../specification/03-user-roles-permissions.md)
- [05 business-rules](../specification/05-business-rules.md)
- [07 database-design](../specification/07-database-design.md)
- [08 api-specification](../specification/08-api-specification.md)
- [09 authentication-security](../specification/09-authentication-security.md)
- [13 notifications](../specification/13-notifications.md)
- [14 admin-workflows](../specification/14-admin-workflows.md)
- [OpenAPI contract](../api/openapi.json)
- [Architecture decisions](../specification/20-architecture-decisions.md)

## C. Dependencies and prerequisite verification
Completed `04-USER-PROFILES-ROLES.md` handoff, committed code, passing scoped verification, and all earlier canonical contracts. Before starting, inspect `git status --short`, current branch, installed dependency/DB availability and prior handoff evidence. Run `npm ci`, `npm run typecheck`, `npm run lint`, and completed-phase tests/build after Phase01 establishes scripts; for Phase01 inspect the empty baseline and validate tools/config instead. Fix or document actual inherited failure before attributing a new one. Never apply new migrations to the retired database. If a listed dependency did not actually finish, stop dependent implementation and report the exact missing artifact; complete independent analysis only.

## D. Exact implementation scope and task sequence
Each task is a small independently reviewable deliverable. For each: name the observed behavior, write its focused test, run to see the expected failure, implement the minimal working behavior, rerun focused then relevant suite, refactor while green, commit. Write an exact test signature/interface/file brief in the phase's temporary execution ledger when a task spans several files; do not invent hidden shared APIs.
- [ ] **Task 1.** Implement own driver input including encrypted license identity+uniqueness digest and expiry, city/rate/bio; preserve DRAFT reads with nullable fields. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 2.** Implement StorageAdapter private disk and production adapter interface, real scanner path,5MiB/magic byte/reencoded image rules; license PDF/image CLEAN required before submission; authenticated streaming and unused document retirement. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 3.** Submit immutable clean-license revision; admin queue/detail/decision endpoints support DRIVER now with self-approval prohibition, CAS, reason and audit; Phase06 extends same dispatcher to vehicles. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 4.** Enable public listing only approved unexpired accepting profile and active user; public detail hides identity docs/contact; public search accepts city/time/rate/rating with indexed pagination. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 5.** Implement explicit availability windows/BLOCKED reservations and safe removal; return scoped empty booking history through actual repository query now (Phase07 populates it). Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 6.** Material license edits with future/live commitments fail409; otherwise invalidate approval; worker expiry invalidates new work and records future-cancellation/active-incident workflow using shared lifecycle services as they become available, with integration completed Phase07/09. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 7.** Notification producers write real outbox events; no fake delivered notification before Phase11 registers IN_APP handler. Deliver a passing focused test and commit for this task before beginning the next.

## E. File and folder expectations
modules/drivers, documents, availability, verifications; storage/scan adapters; driver expiry worker; driver/admin verification API tests. Keep per-domain routers/controllers/services/repositories/schemas/tests together. Add only files with one clear responsibility; exact additional names follow these module boundaries. Update safe shared contract types whenever API DTOs change. Do not import server/Prisma code into browser. Generated image assets, when this phase uses them, must be physically under `apps/web/public/images/generated/`, with `docs/design/image-assets.md` recording source prompt, selected filename, dimensions, license/usage provenance and alt/decorative decision.

## F. Database requirements and transactions
driver_profiles,documents,verification_requests,verification_documents,availability_windows,resource_reservations,audit_logs,outbox_events. Verification locks subject and immutable snapshot; BLOCKED interval produces driver reservation; public query filters approval+date every time. Use tables, types, FKs, unique/check/exclusion constraints, indexes and deletion policy from [database design](../specification/07-database-design.md). Any new schema change is a versioned Prisma migration with raw SQL when required, tested on fresh and incremental disposable DB. Never use `db push` in production or mutate an applied migration. Domain writes that affect status/holds/seats/history/audit/outbox commit together under canonical lock ordering. No external SMTP/scan call while row locks are held.

## G. API contracts and authorization
Implement or consume only the relevant contract operations below; for frontend phases, do not duplicate them server-side. The OpenAPI components define required/optional field types and exact success envelope. Strict unknown-key rejection, UUID/path/query validation, object authorization and current account/role check apply to every private operation. Missing auth401, role403, foreign private object404, state/version/capacity409, field422, throttle429, dependency503. Every write validates server prices, ownership and status; never trust client role/resource IDs or total. Do not add undocumented generic endpoints.

| Method and path | Operation | Access | Request schema | Success schema/status | Phase rule |
|---|---|---|---|---|---|
| `GET /api/v1/cities` | `listCities` | public | none | City; HTTP200 | Seeded reference data; no geocoding |
| `GET /api/v1/drivers` | `searchDrivers` | public | none | Driver; HTTP200 | Only active approved unexpired accepting drivers; times must be supplied together |
| `GET /api/v1/drivers/{id}` | `getDriver` | public | none | Driver; HTTP200 | Non-public or archived 404; omit license/contact documents |
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
| `GET /api/v1/documents/{id}/content` | `getDocument` | public or owner/admin | none | binary; HTTP200 | Public only CLEAN image of publicly visible approved vehicle; private docs owner or admin; attachment/nosniff; no executable content |
| `DELETE /api/v1/documents/{id}` | `deleteDocument` | active owner | none | Ack; HTTP200 | 409 if in current approved/pending revision or needed by future commitments; safe file cleanup job |
| `GET /api/v1/admin/verifications` | `adminVerifications` | ADMIN | none | Verification; HTTP200 | Newest pending revisions; filter type/status |
| `GET /api/v1/admin/verifications/{id}` | `adminVerification` | ADMIN | none | Verification; HTTP200 | Record sensitive read audit; download via protected content endpoint |
| `POST /api/v1/admin/verifications/{id}/decision` | `decideVerification` | ADMIN | VerificationDecisionInput | Verification; HTTP200 | No own submission approval; CAS current pending revision; CLEAN docs unexpired; mandatory reason |

## H. Frontend requirements
No driver dashboard yet; expose own/private and public driver DTOs distinctly. Define scanning/pending/rejected states consumed by Phase17. Follow [UI/UX specification](../specification/10-frontend-ui-ux-specification.md) for page-specific components, API dependencies, interactions, loading/empty/error/success, responsive and accessibility states. Use server data; no fabricated live metrics, avatar/vehicle imagery, confirmation, payment or location. Use generated original images only in appropriate explanatory/marketing placements and follow Impeccable's craft/QA process at UI implementation time.

## I. Business rules and edge cases
Relevant objective scenarios:
- `DRIVER-ONBOARD` (FR-DRIVER-001): Unverified driver absent public search and cannot accept/host; two simultaneous submissions yield one pending
- `DRIVER-VERIFY` (FR-DRIVER-002): Outdated approval request cannot approve replacement license; expired driver blocked even if expiry job paused
- `DRIVER-AVAILABILITY` (FR-DRIVER-003): Booking against driver BLOCKED interval fails; touching [start,end) intervals succeed
- `SEC-UPLOAD` (FR-SEC-001): SVG/HTML spoof rejected; public image cannot expose license; referenced approved doc cannot be removed
Also apply [business rules](../specification/05-business-rules.md): active verification checked at mutation time; bookings require two physical resource holds; carpool pending seats consume zero; only accepted seats count; transition/state/version guards; cancellation cannot release active physical use; suspension denies current JWT. Keep manual route clearly simulated and estimated amounts uncollected. For this phase identify five highest-risk inputs from the review-focus list and bind a named negative/integration test to the owning task.

## J. Security requirements
Use [authentication/security](../specification/09-authentication-security.md): Argon2id, OTP/refresh rules, bounded shared rate limits, secure cookie/CORS/Origin/Helmet, strict Zod, object ownership, private scan-first uploads, redacted logs, auditable admin writes and secrets from environment. Implement only the controls relevant to this phase, preserving earlier controls; negative role/owner tests are mandatory. A UI guard is convenience, never permission.

## K. Testing requirements
Write targeted red-green-refactor unit tests for pure rules and UI behavior, real PostgreSQL integration tests for database invariants, Supertest API tests for contracts/authorization/error codes, RTL accessibility/form tests for frontend phases, and API-backed Playwright E2E for user journeys. Negative, concurrency and permission tests are not optional where specified below:
- DRIVER-ONBOARD/VERIFY/AVAILABILITY, stale snapshot and own admin verification rejection; unknown vehicle kind in license upload rejected.
- SEC-UPLOAD real scan benign/malware fixture, fail closed scanner outage, private download cross-user404, fake MIME/oversize and retired protected doc409.
- Driver block conflicting with test reservation fails; exact adjacency succeeds; expired approval hidden even before worker; material edit race eligibility under locks.
Do not call a mocked successful write an end-to-end pass. Record each failing test's expected failure before implementation and fresh full-suite result before completion.

## L. Acceptance criteria
- [ ] Only approved unexpired drivers publicly searchable and eligible; own nullable profile contract correct.
- [ ] License scan and immutable admin revision decision work with audit/event in transaction.
- [ ] Availability and protected document operations pass ownership and DB constraints.
- `DRIVER-ONBOARD` (FR-DRIVER-001): Unverified driver absent public search and cannot accept/host; two simultaneous submissions yield one pending
- `DRIVER-VERIFY` (FR-DRIVER-002): Outdated approval request cannot approve replacement license; expired driver blocked even if expiry job paused
- `DRIVER-AVAILABILITY` (FR-DRIVER-003): Booking against driver BLOCKED interval fails; touching [start,end) intervals succeed
- `SEC-UPLOAD` (FR-SEC-001): SVG/HTML spoof rejected; public image cannot expose license; referenced approved doc cannot be removed
Acceptance requires observable persisted output, relevant HTTP statuses and no regression in earlier phases. If an NFR target owned by this phase is not yet measurable, record dependency and owner rather than claiming pass.

## M. Definition of done
Every task checkbox has a focused red/green test and commit; listed acceptance/scenarios and current prior-phase suites pass; OpenAPI, specification, UI and ADR changes are synchronized; migration/invariant checks pass where relevant; no stub, TODO or synthetic data passed off as production behavior; handoff records evidence and known limits. Seek a fresh independent review for major feature/final branch work when workflow and available tools permit; fix critical/important findings before completion. Do not proceed into Phase06 automatically unless owner has separately authorized continuing implementation.

## N. Verification commands
From repo root after Phase01 defines scripts: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:unit`, `npm run test:integration`, `npm run test:contract`, `npm run test:e2e`, `npm run build`, `npm run docs:check`. For schema phases: `npm run db:validate`, `npm run db:migrate:deploy`, `npm run db:test:constraints` against explicitly named disposable DB only. Run focused test first, relevant suites after each task, full currently applicable suite before commit/handoff. Phase01 may add scripts only when their suites exist; a missing future suite is reported unavailable, not passed. Production build and CI commands must return exit0 with complete output inspected. A command's mere invocation is not evidence of a pass.

## O. Git workflow
Recommended branch `codex/phase-05-driver-management` from completed prior phase commit, never force-push. Confirm clean status, use an isolated worktree when user/platform preference supports it; user specified same repository, not a new GitHub project. Commit test+implementation per independently verifiable task (`test: cover <behavior>` or `feat: <behavior>`; combine red/green after passing), then `docs: update phase 05 handoff` if docs changed. Verify diff contains no secret/generated cache/private document. Before push run applicable checks, inspect commit list, and do not merge main without authorized integration decision.

## P. Final handoff
Return completed tasks, exact files changed, new migrations/constraints, operation IDs/endpoints, UI screens/assets with provenance, tests/commands and exit results, known issues, ADR/spec changes, branch/commit, and precise next-phase dependencies. Distinguish targets from measured values and test skips from passes. Link the phase's prompt and evidence; stop at this phase boundary.
