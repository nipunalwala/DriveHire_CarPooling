# Phase 03 · Authentication-Authorization

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` if the owner chooses delegated execution, or `superpowers:executing-plans` for native execution. Before writing code read the approved spec, this prompt, `superpowers:using-superpowers`, `superpowers:brainstorming` and `superpowers:writing-plans`; select the already approved architectural path and do not repeat questions settled here. Use `superpowers:test-driven-development` and `superpowers:verification-before-completion` for each behavioral task. This document is a phase execution prompt, not authorization to start. Checkboxes track only verified work.

**Goal:** Build real verified-email login, reset, rotating sessions and immediate revocation with SMTP/Mailpit delivery.

**Architecture:** Express modular monolith plus same-codebase worker, PostgreSQL/Prisma with reviewed custom SQL constraints, React/Vite TypeScript client, versioned `/api/v1` OpenAPI. Resource and seat invariants live on the server and in PostgreSQL.

**Tech Stack:** React, Vite, TypeScript, Tailwind, React Router, TanStack Query, RHF, Zod, Lucide, Motion; Node/Express/TypeScript; PostgreSQL/Prisma; Vitest/RTL/Supertest/Playwright.

**Spec:** `docs/specification/` (canonical); especially 01-functional-requirements.md, 03-user-roles-permissions.md, 05-business-rules.md, 07-database-design.md, 08-api-specification.md, 09-authentication-security.md, 13-notifications.md, 15-testing-strategy.md; `docs/api/openapi.json` and `docs/implementation-prompts/00-MASTER-EXECUTION-GUIDE.md`.

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
Act as Authentication/security engineer. Build real verified-email login, reset, rotating sessions and immediate revocation with SMTP/Mailpit delivery. Build working code and tests after implementation approval. Keep this phase's boundary; update canonical documents and ADR when a real decision changes.

## B. Project context and specification references
The repository is a documentation-only reset of an older Knex/single-role app. Do not restore retired files or migrations. Read these canonical specs before modifying interfaces:
- [01 functional-requirements](../specification/01-functional-requirements.md)
- [03 user-roles-permissions](../specification/03-user-roles-permissions.md)
- [05 business-rules](../specification/05-business-rules.md)
- [07 database-design](../specification/07-database-design.md)
- [08 api-specification](../specification/08-api-specification.md)
- [09 authentication-security](../specification/09-authentication-security.md)
- [13 notifications](../specification/13-notifications.md)
- [15 testing-strategy](../specification/15-testing-strategy.md)
- [OpenAPI contract](../api/openapi.json)
- [Architecture decisions](../specification/20-architecture-decisions.md)

## C. Dependencies and prerequisite verification
Completed `02-DATABASE-SCHEMA-MIGRATIONS.md` handoff, committed code, passing scoped verification, and all earlier canonical contracts. Before starting, inspect `git status --short`, current branch, installed dependency/DB availability and prior handoff evidence. Run `npm ci`, `npm run typecheck`, `npm run lint`, and completed-phase tests/build after Phase01 establishes scripts; for Phase01 inspect the empty baseline and validate tools/config instead. Fix or document actual inherited failure before attributing a new one. Never apply new migrations to the retired database. If a listed dependency did not actually finish, stop dependent implementation and report the exact missing artifact; complete independent analysis only.

## D. Exact implementation scope and task sequence
Each task is a small independently reviewable deliverable. For each: name the observed behavior, write its focused test, run to see the expected failure, implement the minimal working behavior, rerun focused then relevant suite, refactor while green, commit. Write an exact test signature/interface/file brief in the phase's temporary execution ledger when a task spans several files; do not invent hidden shared APIs.
- [ ] **Task 1.** Implement Argon2id hashing/calibration, email normalization and unique register with PASSENGER only; generic registration/resend/reset request acknowledgements. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 2.** OTP random6digit,HMAC,10min/5attempts/resend60s+quotas; reset256bit,15min,hash,single use; invalidate older challenges; consume under lock. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 3.** Issue RS25615min JWT with verified claims; create opaque refresh family30day absolute, token<=7day rolling; lock rotation and revoke entire family on replay; no grace introduced. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 4.** Implement logout/current/all sessions and own list/revoke; exact cookie Path=/api/v1/auth clearing; DB family/account/tokenVersion checks immediately invalidate access. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 5.** Implement shared DB-backed auth rate budgets, trusted proxy config, Origin/content-type cookie mutation checks, no wildcard CORS; uniform redacted failures. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 6.** Register actual SMTP/Mailpit email handler through encrypted sensitive outbox payload; scrub after send; real email verification/reset tests consume Mailpit message rather than console token. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 7.** Provision initial admin via operator command with interactive password/environment email, no web admin grant; audit actor OPERATOR and last-admin policy available for later administration. Deliver a passing focused test and commit for this task before beginning the next.

## E. File and folder expectations
apps/api/src/modules/auth; auth repositories/middleware; mail adapter; worker auth-email handler; shared auth schemas; auth API/DB tests; docs/operations/auth.md. Keep per-domain routers/controllers/services/repositories/schemas/tests together. Add only files with one clear responsibility; exact additional names follow these module boundaries. Update safe shared contract types whenever API DTOs change. Do not import server/Prisma code into browser. Generated image assets, when this phase uses them, must be physically under `apps/web/public/images/generated/`, with `docs/design/image-assets.md` recording source prompt, selected filename, dimensions, license/usage provenance and alt/decorative decision.

## F. Database requirements and transactions
users,user_roles,auth_challenges,refresh_sessions,refresh_tokens,rate_limit_buckets,outbox_events,outbox_deliveries; lock challenge/family; failed OTP attempts must commit; tokenVersion/session status checked every request. Use tables, types, FKs, unique/check/exclusion constraints, indexes and deletion policy from [database design](../specification/07-database-design.md). Any new schema change is a versioned Prisma migration with raw SQL when required, tested on fresh and incremental disposable DB. Never use `db push` in production or mutate an applied migration. Domain writes that affect status/holds/seats/history/audit/outbox commit together under canonical lock ordering. No external SMTP/scan call while row locks are held.

## G. API contracts and authorization
Implement or consume only the relevant contract operations below; for frontend phases, do not duplicate them server-side. The OpenAPI components define required/optional field types and exact success envelope. Strict unknown-key rejection, UUID/path/query validation, object authorization and current account/role check apply to every private operation. Missing auth401, role403, foreign private object404, state/version/capacity409, field422, throttle429, dependency503. Every write validates server prices, ownership and status; never trust client role/resource IDs or total. Do not add undocumented generic endpoints.

| Method and path | Operation | Access | Request schema | Success schema/status | Phase rule |
|---|---|---|---|---|---|
| `POST /api/v1/auth/register` | `register` | public | RegisterInput | Ack; HTTP202 | Normalize email; unique identity; never accept roles; generic acknowledgement for existing address |
| `POST /api/v1/auth/login` | `login` | public | LoginInput | TokenResult; HTTP200 | Verify hash, active account and verified email; generic invalid credentials; secure cookie |
| `POST /api/v1/auth/verify-email` | `verifyEmail` | public | OtpInput | Ack; HTTP200 | Lock challenge, compare keyed hash, enforce attempts/expiry, consume once |
| `POST /api/v1/auth/resend-otp` | `resendOtp` | public | EmailInput | Ack; HTTP202 | 60s cooldown; 5/hour/address; generic existence response |
| `POST /api/v1/auth/forgot-password` | `forgotPassword` | public | EmailInput | Ack; HTTP202 | Generic response; random 256-bit reset token; never log token |
| `POST /api/v1/auth/reset-password` | `resetPassword` | public | ResetInput | Ack; HTTP200 | 15 minute single-use token; increment token_version and revoke every session |
| `POST /api/v1/auth/refresh` | `refresh` | refresh cookie | none | TokenResult; HTTP200 | Origin/CSRF check; lock token; reuse revokes family; no bearer required |
| `POST /api/v1/auth/logout` | `logout` | refresh cookie | none | Ack; HTTP200 | Idempotent even with missing/expired cookie; Origin/CSRF required |
| `POST /api/v1/auth/logout-all` | `logoutAll` | active user | none | Ack; HTTP200 | Increment token_version and revoke families; current access invalid immediately |
| `GET /api/v1/auth/sessions` | `listSessions` | active user | none | Session; HTTP200 | Own only; no token values |
| `DELETE /api/v1/auth/sessions/{id}` | `revokeSession` | active user | none | Ack; HTTP200 | Own only; unknown/non-owned 404; current-session revocation logs out |

## H. Frontend requirements
No auth pages until Phase15. Publish exact safe auth DTO/errors; prepare browser integration requirements for memory token and cross-tab refresh. Follow [UI/UX specification](../specification/10-frontend-ui-ux-specification.md) for page-specific components, API dependencies, interactions, loading/empty/error/success, responsive and accessibility states. Use server data; no fabricated live metrics, avatar/vehicle imagery, confirmation, payment or location. Use generated original images only in appropriate explanatory/marketing placements and follow Impeccable's craft/QA process at UI implementation time.

## I. Business rules and edge cases
Relevant objective scenarios:
- `AUTH-REGISTER` (FR-AUTH-001): A correct OTP works once; sixth wrong attempt cannot verify; no ADMIN input accepted
- `AUTH-LOGIN` (FR-AUTH-002): Cookie HttpOnly/Secure in staging/prod; token never localStorage; logout token fails next API request
- `AUTH-REFRESH-RACE` (FR-AUTH-003): Two refreshes with same token cannot both succeed; replay invalidates successor; family age never exceeds30d
- `AUTH-RESET` (FR-AUTH-004): One reset token succeeds once; login with old password fails; secrets absent logs
Also apply [business rules](../specification/05-business-rules.md): active verification checked at mutation time; bookings require two physical resource holds; carpool pending seats consume zero; only accepted seats count; transition/state/version guards; cancellation cannot release active physical use; suspension denies current JWT. Keep manual route clearly simulated and estimated amounts uncollected. For this phase identify five highest-risk inputs from the review-focus list and bind a named negative/integration test to the owning task.

## J. Security requirements
Use [authentication/security](../specification/09-authentication-security.md): Argon2id, OTP/refresh rules, bounded shared rate limits, secure cookie/CORS/Origin/Helmet, strict Zod, object ownership, private scan-first uploads, redacted logs, auditable admin writes and secrets from environment. Implement only the controls relevant to this phase, preserving earlier controls; negative role/owner tests are mandatory. A UI guard is convenience, never permission.

## K. Testing requirements
Write targeted red-green-refactor unit tests for pure rules and UI behavior, real PostgreSQL integration tests for database invariants, Supertest API tests for contracts/authorization/error codes, RTL accessibility/form tests for frontend phases, and API-backed Playwright E2E for user journeys. Negative, concurrency and permission tests are not optional where specified below:
- AUTH-REGISTER/AUTH-LOGIN/AUTH-RESET negative cases, account existence timing policy, unknown-body roles injection; OTP failed attempts survive rollback-prone error paths.
- AUTH-REFRESH-RACE separate connections: one child, replay family revoked, successor access rejected; logout and reset oldJWT rejected next call.
- Mailpit contains valid OTP/reset with no source/log leak; encrypted event plaintext scrubbed after delivery; SMTP failure retries without undoing account.
- Origin mismatch403, token wrong aud/iss/alg/expiry401, cookie HttpOnly/Secure/Strict/path and complete shared budgets429.
Do not call a mocked successful write an end-to-end pass. Record each failing test's expected failure before implementation and fresh full-suite result before completion.

## L. Acceptance criteria
- [ ] All auth OpenAPI operations return documented schemas and codes with no raw token/hash in profile/logs.
- [ ] Replay/reset/logout/suspension status hook invalidate already issued access on next request.
- [ ] Real Mailpit registration and password recovery work end-to-end via API.
- `AUTH-REGISTER` (FR-AUTH-001): A correct OTP works once; sixth wrong attempt cannot verify; no ADMIN input accepted
- `AUTH-LOGIN` (FR-AUTH-002): Cookie HttpOnly/Secure in staging/prod; token never localStorage; logout token fails next API request
- `AUTH-REFRESH-RACE` (FR-AUTH-003): Two refreshes with same token cannot both succeed; replay invalidates successor; family age never exceeds30d
- `AUTH-RESET` (FR-AUTH-004): One reset token succeeds once; login with old password fails; secrets absent logs
Acceptance requires observable persisted output, relevant HTTP statuses and no regression in earlier phases. If an NFR target owned by this phase is not yet measurable, record dependency and owner rather than claiming pass.

## M. Definition of done
Every task checkbox has a focused red/green test and commit; listed acceptance/scenarios and current prior-phase suites pass; OpenAPI, specification, UI and ADR changes are synchronized; migration/invariant checks pass where relevant; no stub, TODO or synthetic data passed off as production behavior; handoff records evidence and known limits. Seek a fresh independent review for major feature/final branch work when workflow and available tools permit; fix critical/important findings before completion. Do not proceed into Phase04 automatically unless owner has separately authorized continuing implementation.

## N. Verification commands
From repo root after Phase01 defines scripts: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:unit`, `npm run test:integration`, `npm run test:contract`, `npm run test:e2e`, `npm run build`, `npm run docs:check`. For schema phases: `npm run db:validate`, `npm run db:migrate:deploy`, `npm run db:test:constraints` against explicitly named disposable DB only. Run focused test first, relevant suites after each task, full currently applicable suite before commit/handoff. Phase01 may add scripts only when their suites exist; a missing future suite is reported unavailable, not passed. Production build and CI commands must return exit0 with complete output inspected. A command's mere invocation is not evidence of a pass.

## O. Git workflow
Recommended branch `codex/phase-03-authentication-authorization` from completed prior phase commit, never force-push. Confirm clean status, use an isolated worktree when user/platform preference supports it; user specified same repository, not a new GitHub project. Commit test+implementation per independently verifiable task (`test: cover <behavior>` or `feat: <behavior>`; combine red/green after passing), then `docs: update phase 03 handoff` if docs changed. Verify diff contains no secret/generated cache/private document. Before push run applicable checks, inspect commit list, and do not merge main without authorized integration decision.

## P. Final handoff
Return completed tasks, exact files changed, new migrations/constraints, operation IDs/endpoints, UI screens/assets with provenance, tests/commands and exit results, known issues, ADR/spec changes, branch/commit, and precise next-phase dependencies. Distinguish targets from measured values and test skips from passes. Link the phase's prompt and evidence; stop at this phase boundary.
