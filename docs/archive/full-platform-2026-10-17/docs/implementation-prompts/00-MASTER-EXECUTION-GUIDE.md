# 00 · Master Execution Guide

> **For agentic workers:** REQUIRED SUB-SKILL: after the owner approves implementation, choose `superpowers:subagent-driven-development` or `superpowers:executing-plans` as approved. Use `superpowers:using-superpowers` to route relevant skills; read each phase prompt and its canonical specs. This guide and phase prompts are implementation plans, not current approval to implement.

**Goal:** Build and verify DriveHire & CarPooling Platform phase by phase from this documentation-only repository state.

**Architecture:** Modular monolith API+worker, PostgreSQL/Prisma resource/seat transaction source of truth, React/Vite role-specific client, transactional outbox. API in OpenAPI, details in specification.

**Tech Stack:** React/Vite/TypeScript/Tailwind/React Router/TanStack Query/RHF/Zod/Lucide/Motion; Express/TypeScript/JWT/Zod; PostgreSQL/Prisma; Vitest/RTL/Supertest/Playwright; Docker Compose.

**Spec:** `docs/specification/00-project-overview.md` through `20-architecture-decisions.md`; machine-readable `docs/api/openapi.json` and `docs/planning-model.json`.

## Global constraints
No application code starts until owner approves the written blueprint. Same existing GitHub repository, no new project/license or force-push. Additive roles; provider eligibility is separate verified state; server owns prices, status, resources and seats. No payment processing/maps/GPS; estimated amounts NOT_COLLECTED, manual routes clearly simulated. Raw PostgreSQL constraints retained in Prisma migration SQL. No test pass without fresh output. Original project imagery is generated and committed with provenance in Phase14.

## Review focus
Concurrent last-seat and overlapping resources; expired approvals at each write; replayed refresh/token; cancellation versus active trip; worker crash/outbox replay; foreign document access; truthful UI states and mobile keyboard use.

---

## A. Role and objective
Act as principal engineer coordinating a sequential, independently testable implementation. Each phase prompt is supplied to a fresh Codex session with the current repository checkout, approved blueprint and previous handoff.

## B. Project context and canonical references
Read [overview](../specification/00-project-overview.md), [rules](../specification/05-business-rules.md), [architecture](../specification/06-system-architecture.md), [data](../specification/07-database-design.md), [API](../specification/08-api-specification.md), [security](../specification/09-authentication-security.md), [UI](../specification/10-frontend-ui-ux-specification.md), [acceptance](../specification/18-acceptance-criteria.md), [traceability](../specification/19-requirements-traceability.md) and [decisions](../specification/20-architecture-decisions.md). The old Knex app and historical single-role instructions are retired.

## C. Dependencies and correct execution order
Phases01–24 follow the [roadmap](../planning/roadmap.md). Default each phase requires the immediate prior phase and all its accepted contracts. Backend through12, design system13, public14, auth15, passenger16, driver17, owner18, admin19, integration20, hardening21, QA22, deployment23, final audit24. No phase may claim incomplete prior functionality through a stub. UI phases may work in parallel only after their API/design dependencies pass, with isolated branches and a single contract/migration owner. Before any phase inspect branch/status, read prior commit/handoff, run current applicable tests. A missing prerequisite is a blocker to dependent work, not permission to invent it.

## D. Exact implementation scope
Each named prompt below is a full standalone packet. For every task in a phase: inspect source/spec, write a focused failing test, observe expected red, add minimal real code, observe green, run relevant regression, commit. Use small reviewable file/interface boundaries and an execution ledger with task/base SHA, command outputs, deviations and reason. Do not install dependencies/launch production during planning. Implement no pseudo-code/TODO business branch. Complete full requirement-to-phase coverage in matrix below.
- [01 PROJECT-FOUNDATION](01-PROJECT-FOUNDATION.md): Establish a reproducible TypeScript monorepo, runtime contracts and operational skeleton after explicit implementation approval.
- [02 DATABASE-SCHEMA-MIGRATIONS](02-DATABASE-SCHEMA-MIGRATIONS.md): Implement normalized schema, immutable history, resource exclusion and reproducible forward migrations.
- [03 AUTHENTICATION-AUTHORIZATION](03-AUTHENTICATION-AUTHORIZATION.md): Build real verified-email login, reset, rotating sessions and immediate revocation with SMTP/Mailpit delivery.
- [04 USER-PROFILES-ROLES](04-USER-PROFILES-ROLES.md): Implement additive role onboarding and own personal/owner profiles without conflating role with qualification.
- [05 DRIVER-MANAGEMENT](05-DRIVER-MANAGEMENT.md): Implement complete driver qualification, scanned uploads, approval, availability and scoped history.
- [06 VEHICLE-MANAGEMENT](06-VEHICLE-MANAGEMENT.md): Implement owned verified vehicles, private evidence, availability and safe archival.
- [07 DRIVEHIRE-BOOKING-BACKEND](07-DRIVEHIRE-BOOKING-BACKEND.md): Build all three DriveHire services from authoritative quote through provider consent, safe holds and cancellation.
- [08 CARPOOLING-BACKEND](08-CARPOOLING-BACKEND.md): Build qualified hosted rides and race-safe instant/approval seat flows sharing DriveHire resource inventory.
- [09 RIDE-LIFECYCLE](09-RIDE-LIFECYCLE.md): Complete authorized trip operation, manual route progress and safe handling of active-resource overruns.
- [10 RATINGS-REVIEWS](10-RATINGS-REVIEWS.md): Implement eligible completed-trip ratings, visible aggregates and moderation-safe history.
- [11 NOTIFICATIONS](11-NOTIFICATIONS.md): Turn committed domain events into reliable own-recipient notification feeds and retry-safe channel deliveries.
- [12 ADMIN-BACKEND](12-ADMIN-BACKEND.md): Complete backend operations, suspension consequences, complaints, moderation, reports and immutable administrative audit.
- [13 FRONTEND-DESIGN-SYSTEM](13-FRONTEND-DESIGN-SYSTEM.md): Implement approved accessible visual tokens, reusable controls and public/auth/app/admin shells.
- [14 PUBLIC-WEBSITE](14-PUBLIC-WEBSITE.md): Build factual public pages and live vehicle/driver/carpool discovery on approved design system.
- [15 AUTHENTICATION-FRONTEND](15-AUTHENTICATION-FRONTEND.md): Connect registration, OTP, login, recovery, sessions and multi-role navigation with safe refresh coordination.
- [16 PASSENGER-DASHBOARD](16-PASSENGER-DASHBOARD.md): Deliver real booking, seat requests, history, reviews, complaints and shared notification workflows.
- [17 DRIVER-DASHBOARD](17-DRIVER-DASHBOARD.md): Deliver onboarding, availability, provider decisions, actual trip operation and qualified carpool hosting.
- [18 VEHICLE-OWNER-DASHBOARD](18-VEHICLE-OWNER-DASHBOARD.md): Deliver complete fleet onboarding,verification,availability,provider consent,history and owner profile.
- [19 ADMIN-DASHBOARD](19-ADMIN-DASHBOARD.md): Deliver operational queues,verification,account incidents,complaints,reports and immutable audit views.
- [20 FRONTEND-BACKEND-INTEGRATION](20-FRONTEND-BACKEND-INTEGRATION.md): Verify frontend,REST and PostgreSQL agree across every route,DTO,permission and persisted workflow.
- [21 SECURITY-HARDENING](21-SECURITY-HARDENING.md): Harden the integrated application against concrete auth,authorization,upload,injection and deployment threats.
- [22 TESTING-QUALITY-ASSURANCE](22-TESTING-QUALITY-ASSURANCE.md): Close full requirements,NFR,concurrency,accessibility and cross-browser acceptance with reproducible evidence.
- [23 DEPLOYMENT-OPERATIONS](23-DEPLOYMENT-OPERATIONS.md): Prepare and verify deployment,backup/restore,leases,alerts and rollback without unauthorized production launch.
- [24 FINAL-INTEGRATION-AUDIT](24-FINAL-INTEGRATION-AUDIT.md): Audit completed implementation against every approved requirement and present evidence-based release readiness.

## E. File and folder expectations
Implementation code lives `apps/api`, `apps/web`, `packages/contracts` with domain modules. Prisma migrations and custom SQL live under API migration tree. Tests close to modules plus integration/e2e suites. `docs/specification` and OpenAPI are canonical; phase handoffs under `docs/quality/phase-handoffs/`; ADR updates in20. Original generated public images under `apps/web/public/images/generated/` with `docs/design/image-assets.md` prompt/provenance, dimensions, alt/decorative status. No generated fake listing photo, identity, license or testimonial.

## F. Database and migration strategy
Phase02 establishes all entities and raw GiST exclusion/partial unique/check constraints; later phases add forward migrations only for justified new fields/indexes, never edit applied migration. Use migration job with DDL role, runtime role without DDL/audit mutation. Develop/test on separate named PG volumes; `db:migrate:deploy` only after target verification. Fresh and incremental migration tests introspect constraints. Domain writes reserve physical resources and seats atomically, write histories/audit/outbox before commit. Reconciliation reports drift; repairs are audited and operator-approved within domain policy.

## G. API contracts
OpenAPI JSON is authoritative for method/path/request/response/auth. Each phase prompt names owned operation IDs. Keep generated types, backend Zod and client consumption aligned; Phase20 fails route/schema drift. Strict request parsing and typed error envelope are universal. Authorization is current backend user/role/object; a role menu does not grant access. A versioned API change updates contract, traceability, affected pages, tests and ADR when decision material.

## H. Frontend and generated image requirements
Impeccable guides design: read its skill at Phase13, use public Persuade/dashboard Operate modes, durable tokens and bounded desktop/mobile review. At Phase14 use imagegen skill's built-in tool to generate original raster hero/editorial explanatory images based on approved visual direction, inspect variants, select purposeful images, copy them from generated cache into project, optimize responsive dimensions/WebP/AVIF as appropriate and commit originals/derived assets. Maintain exact generation prompt, selection rationale, provenance and alt/decorative decision in image manifest. Make no real product/driver/vehicle identity claim from generated images. User-uploaded clean vehicle images are the only listing photos. Phase17–19 may add generated explanatory imagery sparingly where it improves task comprehension. SVG/icons/diagrams stay repo-native code when more appropriate. Verify images at320–1440px, accessible text alternatives and performance budget; no off-repo hotlinks.

## I. Business rules and edge cases
Shared driver+vehicle reservations protect all hire modes/carpools/blocks; partial GiST exclusion rejects overlaps. Pending booking holds expire30min, provider consents required per mode. Host DRIVER+OWNER qualified and owns verified vehicle; approval requests hold zero seats; instant/accepted seats count transactionally. Never release active physical use because planned end passed. Suspension invalidates JWT now and cancels unstarted commitments; active incidents need admin resolution. Reviews only completed real participants. All dates/amounts/rates server validated. No online payments or false GPS.

## J. Security requirements
Follow09 exactly: Argon2id, OTP/rate budget, rotating opaque refresh/replay, current account/session check, object authorization, CSP/CSRF/CORS, scan-first private uploads, encryption/redaction, immutable admin audits. Run negative role/object cases in owning phase, full matrix Phase21/22. No hardcoded credentials, no production seed, no public private docs. Secrets supplied through deployment vault/env, never documentation examples with live values.

## K. Testing and verification strategy
Each phase names focused unit/integration/API/RTL/Playwright cases. TDD red-green-refactor per behavioral task; real PG barrier tests for capacity and holds. Run focused suite after code, current full suite before phase handoff. Do not report skipped/absent suites passed. Phase22 measures p95, accessibility and full cross-browser journeys; Phase23 backup restore; Phase24 final evidence audit. Verification commands: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:unit`, `npm run test:integration`, `npm run test:contract`, `npm run test:e2e`, `npm run build`, `npm run docs:check`, plus `npm run db:validate`, `npm run db:migrate:deploy`, `npm run db:test:constraints` on safe disposable DB. Phase01 creates script contract; later phases only claim scripts that exist and pass.

## L. Acceptance criteria and traceability matrix
Each row maps an FR to implementation phases, API operation IDs, database entities, UI screens and a named verification scenario. Read IDs in01/18/19 and assert test evidence before closing. No major requirement may remain unassigned.

| Requirement | Phases | API operation IDs | DB entities | UI surfaces | Test scenario |
|---|---|---|---|---|---|
| FR-AUTH-001 | 03,15 | `register`, `verifyEmail`, `resendOtp` | users,user_roles,auth_challenges,outbox_events | register,verify-email | `AUTH-REGISTER` |
| FR-AUTH-002 | 03,15 | `login`, `logout`, `logoutAll` | users,refresh_sessions,refresh_tokens | login | `AUTH-LOGIN` |
| FR-AUTH-003 | 03,15 | `refresh`, `listSessions`, `revokeSession` | refresh_sessions,refresh_tokens | profile | `AUTH-REFRESH-RACE` |
| FR-AUTH-004 | 03,15 | `forgotPassword`, `resetPassword` | users,auth_challenges,refresh_sessions | forgot-password,reset-password | `AUTH-RESET` |
| FR-USER-001 | 04,15 | `getMe`, `updateMe`, `addRole`, `getOwner`, `updateOwner` | users,user_roles,driver_profiles,owner_profiles | profile,driver-profile,owner-profile | `USER-MULTIROLE` |
| FR-DRIVER-001 | 05 | `getMyDriver`, `updateDriver`, `uploadDriverDoc`, `listDriverDocs`, `submitDriver` | driver_profiles,documents,verification_requests | driver-verification,driver-profile | `DRIVER-ONBOARD` |
| FR-DRIVER-002 | 05,12,19 | `adminVerifications`, `adminVerification`, `decideVerification` | verification_requests,driver_profiles,audit_logs | admin-driver-verification,driver-verification | `DRIVER-VERIFY` |
| FR-DRIVER-003 | 05,17 | `setDriverListing`, `listDriverAvailability`, `createDriverAvailability`, `deleteDriverAvailability`, `listDriverBookings` | availability_windows,resource_reservations,bookings | driver-availability,driver-requests,driver-history | `DRIVER-AVAILABILITY` |
| FR-VEHICLE-001 | 06,18 | `getOwner`, `updateOwner`, `createVehicle`, `updateVehicle`, `uploadVehicleDoc`, `listVehicleDocs`, `submitVehicle` | owner_profiles,vehicles,documents,verification_requests | owner-add-vehicle,owner-documents | `VEHICLE-REGISTER` |
| FR-VEHICLE-002 | 06,12,19 | `adminVerifications`, `adminVerification`, `decideVerification` | vehicles,documents,verification_requests,audit_logs | admin-vehicle-verification,owner-documents | `VEHICLE-VERIFY` |
| FR-VEHICLE-003 | 06,18 | `setVehicleListing`, `listMyVehicles`, `listVehicleAvailability`, `createVehicleAvailability`, `deleteVehicleAvailability`, `archiveVehicle`, `listOwnerBookings` | vehicles,availability_windows,resource_reservations | owner-vehicles,owner-availability,owner-history | `VEHICLE-ARCHIVE` |
| FR-BOOKING-001 | 07,14,16 | `listCities`, `searchVehicles`, `getVehicle`, `searchDrivers`, `getDriver`, `quoteBooking` | booking_quotes,vehicles,driver_profiles | vehicle-listings,driver-listings,booking-create | `BOOKING-QUOTE` |
| FR-BOOKING-002 | 07 | `createBooking` | bookings,booking_decisions,trips,resource_reservations,idempotency_keys | booking-create,passenger-booking-detail | `BOOKING-CONCURRENCY` |
| FR-BOOKING-003 | 07,17,18 | `decideBooking`, `replaceDriver`, `getBooking` | booking_decisions,bookings,trips,resource_reservations | driver-requests,owner-bookings,passenger-booking-detail | `BOOKING-CONSENT` |
| FR-BOOKING-004 | 07,09 | `cancelBooking`, `decideBooking` | bookings,trips,resource_reservations,trip_status_history,outbox_events | passenger-bookings,owner-bookings,driver-requests | `BOOKING-CANCEL-EXPIRE` |
| FR-CARPOOL-001 | 08,17,18 | `createCarpool`, `updateCarpool`, `publishCarpool`, `listMyCarpools` | carpools,trips,resource_reservations | carpool-create,hosted-carpools | `CARPOOL-PUBLISH` |
| FR-CARPOOL-002 | 08,14,16 | `searchCarpools`, `getCarpool` | carpools,vehicles,driver_profiles | carpool-search,carpool-detail | `CARPOOL-SEARCH` |
| FR-CARPOOL-003 | 08,16 | `requestSeat`, `listMySeats` | carpools,seat_requests,idempotency_keys,outbox_events | carpool-detail,passenger-carpool-history | `CARPOOL-LAST-SEAT` |
| FR-CARPOOL-004 | 08,17 | `listSeatRequests`, `decideSeat` | carpools,seat_requests,outbox_events | host-seat-requests | `CARPOOL-APPROVAL` |
| FR-CARPOOL-005 | 08,09 | `cancelSeat`, `cancelCarpool`, `listMySeats` | carpools,seat_requests,trips,resource_reservations | passenger-carpool-history,hosted-carpools | `CARPOOL-CANCEL-RACE` |
| FR-RIDE-001 | 09,16,17,19 | `listTrips`, `getTrip`, `transitionTrip`, `tripHistory` | trips,trip_status_history,bookings,carpools | active-trip,passenger-rides,driver-active-rides | `RIDE-STATE-MACHINE` |
| FR-RIDE-002 | 09,17,19 | `advanceWaypoint`, `getTrip`, `adminTrips` | trips,trip_status_history | active-trip,admin-carpools | `RIDE-OVERRUN` |
| FR-REVIEW-001 | 10,16 | `createReview`, `myReviews`, `driverReviews`, `vehicleReviews` | reviews,trips,bookings,seat_requests | reviews,vehicle-detail,driver-detail | `REVIEW-ELIGIBILITY` |
| FR-NOTIFY-001 | 11,16,17,18,19 | `listNotifications`, `unreadCount`, `readNotification`, `readAllNotifications` | outbox_events,outbox_deliveries,notifications | notifications | `NOTIFY-REPLAY` |
| FR-ADMIN-001 | 12,19 | `adminUsers`, `adminUser`, `suspendUser`, `reactivateUser` | users,refresh_sessions,bookings,carpools,trips,audit_logs | admin-users | `ADMIN-SUSPEND` |
| FR-ADMIN-002 | 12,19 | `adminBookings`, `adminCarpools`, `adminTrips`, `cancelBooking`, `cancelCarpool`, `replaceDriver`, `transitionTrip` | bookings,carpools,trips,audit_logs | admin-bookings,admin-carpools | `ADMIN-OPERATIONS` |
| FR-ADMIN-003 | 12,16,19 | `createComplaint`, `myComplaints`, `adminComplaints`, `decideComplaint`, `hideReview` | complaints,audit_logs,reviews,outbox_events | complaints,admin-complaints | `ADMIN-COMPLAINT` |
| FR-ADMIN-004 | 12,19 | `adminReport`, `adminAudit` | audit_logs,bookings,carpools,complaints | admin-overview,admin-reports,admin-audit | `ADMIN-REPORTS` |
| FR-SEC-001 | 05,06,21 | `getDocument`, `deleteDocument`, `uploadDriverDoc`, `uploadVehicleDoc` | documents,verification_requests | driver-verification,owner-documents | `SEC-UPLOAD` |
| FR-OPS-001 | 01,02,23 | `health`, `ready` | database,outbox_events | operations-runbook | `OPS-RESTORE` |

## M. Definition of done and handoff
Phase is done only after every named task/acceptance is implemented with real code and checked output, tests pass, docs/contract aligned, security/permission checks pass, migrations fresh/incremental as relevant, no TODO business path remains, and one factual handoff records files, migrations, endpoints, screens/assets, commands/results, risks and next dependencies. Whole platform done only after Phase24 audit and owner release decision.

## N. Verification commands and recovery
Use commands in K plus focused test; inspect full output/exit code. On failed phase: leave a named branch and ledger, reproduce first failing command, classify product bug vs infra, write failing regression before fix, restore DB from test fixture only, never reset unknown database, then rerun focused and relevant suites. If architecture changed, write ADR and update all dependent contracts before new work. Failed migration: stop rollout, inspect journal/backup, forward repair with reviewed SQL; never edit applied migration. Drift control: CI checks docs links/trace IDs/OpenAPI route list, reviewer checks schema/API/UI contracts at each boundary.

## O. Git workflow
After blueprint approval, Phase01 starts from reviewed docs branch integration point chosen by owner; recommended `codex/phase-01-project-foundation`. Each phase uses branch `codex/phase-NN-name`, one commit per testable task and final docs/handoff commit, no force-push. Branch base SHA recorded in ledger. Before each commit rerun focused/relevant tests; before PR/merge fresh full applicable checks and review. A PR or merge is created only under current authorized repository workflow; publishing implementation requires owner approval gate. Preserve main history, do not resurrect retired app. Recovery keeps commits/ledger and avoids rewriting shared history.

## P. Final handoff and approval gate
Report exact files/commits/branch, migration IDs, endpoint IDs, page/asset manifest, test names/commands/exits, remaining issues and next prompt. Before Phase01 the owner reviews this complete blueprint and separately says to begin implementation. The plan's acceptance is not a request to launch production. The first prompt is [01 PROJECT FOUNDATION](01-PROJECT-FOUNDATION.md).
