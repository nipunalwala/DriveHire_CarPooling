# Phase 14 · Public-Website

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` if the owner chooses delegated execution, or `superpowers:executing-plans` for native execution. Before writing code read the approved spec, this prompt, `superpowers:using-superpowers`, `superpowers:brainstorming` and `superpowers:writing-plans`; select the already approved architectural path and do not repeat questions settled here. Use `superpowers:test-driven-development` and `superpowers:verification-before-completion` for each behavioral task. This document is a phase execution prompt, not authorization to start. Checkboxes track only verified work.

**Goal:** Build factual public pages and live vehicle/driver/carpool discovery on approved design system.

**Architecture:** Express modular monolith plus same-codebase worker, PostgreSQL/Prisma with reviewed custom SQL constraints, React/Vite TypeScript client, versioned `/api/v1` OpenAPI. Resource and seat invariants live on the server and in PostgreSQL.

**Tech Stack:** React, Vite, TypeScript, Tailwind, React Router, TanStack Query, RHF, Zod, Lucide, Motion; Node/Express/TypeScript; PostgreSQL/Prisma; Vitest/RTL/Supertest/Playwright.

**Spec:** `docs/specification/` (canonical); especially 00-project-overview.md, 03-user-roles-permissions.md, 08-api-specification.md, 09-authentication-security.md, 10-frontend-ui-ux-specification.md, 15-testing-strategy.md; `docs/api/openapi.json` and `docs/implementation-prompts/00-MASTER-EXECUTION-GUIDE.md`.

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
Act as Public website/search frontend engineer. Build factual public pages and live vehicle/driver/carpool discovery on approved design system. Build working code and tests after implementation approval. Keep this phase's boundary; update canonical documents and ADR when a real decision changes.

## B. Project context and specification references
The repository is a documentation-only reset of an older Knex/single-role app. Do not restore retired files or migrations. Read these canonical specs before modifying interfaces:
- [00 project-overview](../specification/00-project-overview.md)
- [03 user-roles-permissions](../specification/03-user-roles-permissions.md)
- [08 api-specification](../specification/08-api-specification.md)
- [09 authentication-security](../specification/09-authentication-security.md)
- [10 frontend-ui-ux-specification](../specification/10-frontend-ui-ux-specification.md)
- [15 testing-strategy](../specification/15-testing-strategy.md)
- [OpenAPI contract](../api/openapi.json)
- [Architecture decisions](../specification/20-architecture-decisions.md)

## C. Dependencies and prerequisite verification
Completed `13-FRONTEND-DESIGN-SYSTEM.md` handoff, committed code, passing scoped verification, and all earlier canonical contracts. Before starting, inspect `git status --short`, current branch, installed dependency/DB availability and prior handoff evidence. Run `npm ci`, `npm run typecheck`, `npm run lint`, and completed-phase tests/build after Phase01 establishes scripts; for Phase01 inspect the empty baseline and validate tools/config instead. Fix or document actual inherited failure before attributing a new one. Never apply new migrations to the retired database. If a listed dependency did not actually finish, stop dependent implementation and report the exact missing artifact; complete independent analysis only.

## D. Exact implementation scope and task sequence
Each task is a small independently reviewable deliverable. For each: name the observed behavior, write its focused test, run to see the expected failure, implement the minimal working behavior, rerun focused then relevant suite, refactor while green, commit. Write an exact test signature/interface/file brief in the phase's temporary execution ledger when a task spans several files; do not invent hidden shared APIs.
- [ ] **Task 1.** Implement landing service selector and real city/date search, eligibility comparison and provider CTAs; no fake testimonials,customers,availability counts or paid claims. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 2.** Vehicle/driver listing URL filters/pagination,current approved visibility,typed details/reviews,rate/hour and date/timezone context; back navigation restores filter state. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 3.** Carpool exact city/date/seats search and public route detail; distinguish full/approval/instant; no exposed passenger roster or fake map. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 4.** Use clean uploaded vehicle images through authorized content endpoint and meaningful fallback; no private doc endpoint URL passed into public image props. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 5.** Loading/empty/error/retry/offline/filter validation states for every section; abort superseded searches; announce result count without stealing focus. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 6.** Metadata,title,canonical route and404/error page; static About/Services factual only; auth-required CTA safe returnTo, not nonfunctional decorative button. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 7.** Follow the approved Impeccable direction to author an image brief for the landing/service explanation. Use the imagegen built-in tool to generate original raster variants, inspect desktop and mobile crops, select purposeful outputs, copy final files into `apps/web/public/images/generated/`, make responsive optimized variants, and commit the images with `docs/design/image-assets.md` prompt, provenance, dimensions and alt/decorative status. Test that the public pages load these local assets and have no third-party asset dependency. Keep actual listing photos exclusively from CLEAN owner uploads. Deliver a passing focused test and commit before handoff.

## E. File and folder expectations
apps/web/src/features/public,search,listing-details; shared URL filter hooks; public route loaders; image provenance records; RTL/Playwright public tests. Keep per-domain routers/controllers/services/repositories/schemas/tests together. Add only files with one clear responsibility; exact additional names follow these module boundaries. Update safe shared contract types whenever API DTOs change. Do not import server/Prisma code into browser. Generated image assets, when this phase uses them, must be physically under `apps/web/public/images/generated/`, with `docs/design/image-assets.md` recording source prompt, selected filename, dimensions, license/usage provenance and alt/decorative decision.

## F. Database requirements and transactions
Read-only public DTOs; no direct DB access or schema changes. Current availability advisory, never cached as a commitment. Use tables, types, FKs, unique/check/exclusion constraints, indexes and deletion policy from [database design](../specification/07-database-design.md). Any new schema change is a versioned Prisma migration with raw SQL when required, tested on fresh and incremental disposable DB. Never use `db push` in production or mutate an applied migration. Domain writes that affect status/holds/seats/history/audit/outbox commit together under canonical lock ordering. No external SMTP/scan call while row locks are held.

## G. API contracts and authorization
Implement or consume only the relevant contract operations below; for frontend phases, do not duplicate them server-side. The OpenAPI components define required/optional field types and exact success envelope. Strict unknown-key rejection, UUID/path/query validation, object authorization and current account/role check apply to every private operation. Missing auth401, role403, foreign private object404, state/version/capacity409, field422, throttle429, dependency503. Every write validates server prices, ownership and status; never trust client role/resource IDs or total. Do not add undocumented generic endpoints.

| Method and path | Operation | Access | Request schema | Success schema/status | Phase rule |
|---|---|---|---|---|---|
| `GET /api/v1/cities` | `listCities` | public | none | City; HTTP200 | Seeded reference data; no geocoding |
| `GET /api/v1/drivers` | `searchDrivers` | public | none | Driver; HTTP200 | Only active approved unexpired accepting drivers; times must be supplied together |
| `GET /api/v1/drivers/{id}` | `getDriver` | public | none | Driver; HTTP200 | Non-public or archived 404; omit license/contact documents |
| `GET /api/v1/vehicles` | `searchVehicles` | public | none | Vehicle; HTTP200 | Only active owner, approved unexpired documents, listed and unarchived; not a reservation |
| `GET /api/v1/vehicles/{id}` | `getVehicle` | public | none | Vehicle; HTTP200 | Public image delivery separately authorized by visibility; no plate or private docs |
| `GET /api/v1/documents/{id}/content` | `getDocument` | public or owner/admin | none | binary; HTTP200 | Public only CLEAN image of publicly visible approved vehicle; private docs owner or admin; attachment/nosniff; no executable content |
| `GET /api/v1/carpools` | `searchCarpools` | public | none | Carpool; HTTP200 | Exact city pair and departure date in origin timezone; no map/route matching |
| `GET /api/v1/carpools/{id}` | `getCarpool` | public/participant | none | Carpool; HTTP200 | DRAFT host/admin only; terminal details only host/participant/admin; omit passenger roster from public |
| `GET /api/v1/drivers/{id}/reviews` | `driverReviews` | public | none | Review; HTTP200 | Public approved driver; hidden excluded; count/mean derived visible reviews |
| `GET /api/v1/vehicles/{id}/reviews` | `vehicleReviews` | public | none | Review; HTTP200 | Public approved vehicle; hidden excluded |

## H. Frontend requirements
Landing/About/Services/Vehicles/Vehicle detail/Drivers/Driver detail/Carpool search/detail; auth actions defer to Phase15 with safe route continuation; image reads scoped. Follow [UI/UX specification](../specification/10-frontend-ui-ux-specification.md) for page-specific components, API dependencies, interactions, loading/empty/error/success, responsive and accessibility states. Use server data; no fabricated live metrics, avatar/vehicle imagery, confirmation, payment or location. Use generated original images only in appropriate explanatory/marketing placements and follow Impeccable's craft/QA process at UI implementation time.

## I. Business rules and edge cases
Relevant objective scenarios:
- `BOOKING-QUOTE` (FR-BOOKING-001): Changing client total cannot change persisted price; quote after10min rejected; own vehicle rental rejected
- `CARPOOL-SEARCH` (FR-CARPOOL-002): Day boundary search includes correct UTC intervals; roster/contact absent public response
Also apply [business rules](../specification/05-business-rules.md): active verification checked at mutation time; bookings require two physical resource holds; carpool pending seats consume zero; only accepted seats count; transition/state/version guards; cancellation cannot release active physical use; suspension denies current JWT. Keep manual route clearly simulated and estimated amounts uncollected. For this phase identify five highest-risk inputs from the review-focus list and bind a named negative/integration test to the owning task.

## J. Security requirements
Use [authentication/security](../specification/09-authentication-security.md): Argon2id, OTP/refresh rules, bounded shared rate limits, secure cookie/CORS/Origin/Helmet, strict Zod, object ownership, private scan-first uploads, redacted logs, auditable admin writes and secrets from environment. Implement only the controls relevant to this phase, preserving earlier controls; negative role/owner tests are mandatory. A UI guard is convenience, never permission.

## K. Testing requirements
Write targeted red-green-refactor unit tests for pure rules and UI behavior, real PostgreSQL integration tests for database invariants, Supertest API tests for contracts/authorization/error codes, RTL accessibility/form tests for frontend phases, and API-backed Playwright E2E for user journeys. Negative, concurrency and permission tests are not optional where specified below:
- RTL filters URL/page reset/date validation and all content states; public private field assertions.
- API-backed Playwright search and detail desktop/mobile; unverified resource never displayed; GET404 private draft.
- Keyboard filter drawer/result links and no layout jump; image failure fallback.
- Generated landing/service image files exist in the repository; desktop/mobile visual review confirms useful crops, sensible alt/decorative treatment, and image loading within the page performance budget. The asset manifest names the exact generation prompts and final filenames.
Do not call a mocked successful write an end-to-end pass. Record each failing test's expected failure before implementation and fresh full-suite result before completion.

## L. Acceptance criteria
- [ ] Every required public page and detail works against actual API.
- [ ] Search state survives share/back and accurately labels advisory availability.
- [ ] No fabricated evidence or excluded payment/maps behavior.
- [ ] Original generated explanatory imagery is integrated into at least the landing and service explanation surfaces, saved in the repository with prompt/provenance manifest; listing imagery remains real authorized uploads.
- `BOOKING-QUOTE` (FR-BOOKING-001): Changing client total cannot change persisted price; quote after10min rejected; own vehicle rental rejected
- `CARPOOL-SEARCH` (FR-CARPOOL-002): Day boundary search includes correct UTC intervals; roster/contact absent public response
Acceptance requires observable persisted output, relevant HTTP statuses and no regression in earlier phases. If an NFR target owned by this phase is not yet measurable, record dependency and owner rather than claiming pass.

## M. Definition of done
Every task checkbox has a focused red/green test and commit; listed acceptance/scenarios and current prior-phase suites pass; OpenAPI, specification, UI and ADR changes are synchronized; migration/invariant checks pass where relevant; no stub, TODO or synthetic data passed off as production behavior; handoff records evidence and known limits. Seek a fresh independent review for major feature/final branch work when workflow and available tools permit; fix critical/important findings before completion. Do not proceed into Phase15 automatically unless owner has separately authorized continuing implementation.

## N. Verification commands
From repo root after Phase01 defines scripts: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:unit`, `npm run test:integration`, `npm run test:contract`, `npm run test:e2e`, `npm run build`, `npm run docs:check`. For schema phases: `npm run db:validate`, `npm run db:migrate:deploy`, `npm run db:test:constraints` against explicitly named disposable DB only. Run focused test first, relevant suites after each task, full currently applicable suite before commit/handoff. Phase01 may add scripts only when their suites exist; a missing future suite is reported unavailable, not passed. Production build and CI commands must return exit0 with complete output inspected. A command's mere invocation is not evidence of a pass.

## O. Git workflow
Recommended branch `codex/phase-14-public-website` from completed prior phase commit, never force-push. Confirm clean status, use an isolated worktree when user/platform preference supports it; user specified same repository, not a new GitHub project. Commit test+implementation per independently verifiable task (`test: cover <behavior>` or `feat: <behavior>`; combine red/green after passing), then `docs: update phase 14 handoff` if docs changed. Verify diff contains no secret/generated cache/private document. Before push run applicable checks, inspect commit list, and do not merge main without authorized integration decision.

## P. Final handoff
Return completed tasks, exact files changed, new migrations/constraints, operation IDs/endpoints, UI screens/assets with provenance, tests/commands and exit results, known issues, ADR/spec changes, branch/commit, and precise next-phase dependencies. Distinguish targets from measured values and test skips from passes. Link the phase's prompt and evidence; stop at this phase boundary.
