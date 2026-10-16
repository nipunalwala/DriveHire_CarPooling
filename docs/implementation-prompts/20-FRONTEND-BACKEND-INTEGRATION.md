# Phase 20 · Frontend-Backend-Integration

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` if the owner chooses delegated execution, or `superpowers:executing-plans` for native execution. Before writing code read the approved spec, this prompt, `superpowers:using-superpowers`, `superpowers:brainstorming` and `superpowers:writing-plans`; select the already approved architectural path and do not repeat questions settled here. Use `superpowers:test-driven-development` and `superpowers:verification-before-completion` for each behavioral task. This document is a phase execution prompt, not authorization to start. Checkboxes track only verified work.

**Goal:** Verify frontend,REST and PostgreSQL agree across every route,DTO,permission and persisted workflow.

**Architecture:** Express modular monolith plus same-codebase worker, PostgreSQL/Prisma with reviewed custom SQL constraints, React/Vite TypeScript client, versioned `/api/v1` OpenAPI. Resource and seat invariants live on the server and in PostgreSQL.

**Tech Stack:** React, Vite, TypeScript, Tailwind, React Router, TanStack Query, RHF, Zod, Lucide, Motion; Node/Express/TypeScript; PostgreSQL/Prisma; Vitest/RTL/Supertest/Playwright.

**Spec:** `docs/specification/` (canonical); especially 00-project-overview.md, 01-functional-requirements.md, 02-non-functional-requirements.md, 03-user-roles-permissions.md, 04-use-cases-user-stories.md, 05-business-rules.md, 06-system-architecture.md, 07-database-design.md, 08-api-specification.md, 09-authentication-security.md, 10-frontend-ui-ux-specification.md, 11-booking-lifecycle.md, 12-carpooling-lifecycle.md, 13-notifications.md, 14-admin-workflows.md, 15-testing-strategy.md, 16-deployment-environments.md, 17-risk-analysis.md, 18-acceptance-criteria.md, 19-requirements-traceability.md; `docs/api/openapi.json` and `docs/implementation-prompts/00-MASTER-EXECUTION-GUIDE.md`.

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
Act as Integration/contract engineer. Verify frontend,REST and PostgreSQL agree across every route,DTO,permission and persisted workflow. Build working code and tests after implementation approval. Keep this phase's boundary; update canonical documents and ADR when a real decision changes.

## B. Project context and specification references
The repository is a documentation-only reset of an older Knex/single-role app. Do not restore retired files or migrations. Read these canonical specs before modifying interfaces:
- [00 project-overview](../specification/00-project-overview.md)
- [01 functional-requirements](../specification/01-functional-requirements.md)
- [02 non-functional-requirements](../specification/02-non-functional-requirements.md)
- [03 user-roles-permissions](../specification/03-user-roles-permissions.md)
- [04 use-cases-user-stories](../specification/04-use-cases-user-stories.md)
- [05 business-rules](../specification/05-business-rules.md)
- [06 system-architecture](../specification/06-system-architecture.md)
- [07 database-design](../specification/07-database-design.md)
- [08 api-specification](../specification/08-api-specification.md)
- [09 authentication-security](../specification/09-authentication-security.md)
- [10 frontend-ui-ux-specification](../specification/10-frontend-ui-ux-specification.md)
- [11 booking-lifecycle](../specification/11-booking-lifecycle.md)
- [12 carpooling-lifecycle](../specification/12-carpooling-lifecycle.md)
- [13 notifications](../specification/13-notifications.md)
- [14 admin-workflows](../specification/14-admin-workflows.md)
- [15 testing-strategy](../specification/15-testing-strategy.md)
- [16 deployment-environments](../specification/16-deployment-environments.md)
- [17 risk-analysis](../specification/17-risk-analysis.md)
- [18 acceptance-criteria](../specification/18-acceptance-criteria.md)
- [19 requirements-traceability](../specification/19-requirements-traceability.md)
- [OpenAPI contract](../api/openapi.json)
- [Architecture decisions](../specification/20-architecture-decisions.md)

## C. Dependencies and prerequisite verification
Completed `19-ADMIN-DASHBOARD.md` handoff, committed code, passing scoped verification, and all earlier canonical contracts. Before starting, inspect `git status --short`, current branch, installed dependency/DB availability and prior handoff evidence. Run `npm ci`, `npm run typecheck`, `npm run lint`, and completed-phase tests/build after Phase01 establishes scripts; for Phase01 inspect the empty baseline and validate tools/config instead. Fix or document actual inherited failure before attributing a new one. Never apply new migrations to the retired database. If a listed dependency did not actually finish, stop dependent implementation and report the exact missing artifact; complete independent analysis only.

## D. Exact implementation scope and task sequence
Each task is a small independently reviewable deliverable. For each: name the observed behavior, write its focused test, run to see the expected failure, implement the minimal working behavior, rerun focused then relevant suite, refactor while green, commit. Write an exact test signature/interface/file brief in the phase's temporary execution ledger when a task spans several files; do not invent hidden shared APIs.
- [ ] **Task 1.** Compare registered Express methods/paths to OpenAPI operation IDs and frontend dependencies; remove drift by updating canonical contract and both consumers together. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 2.** Walk every UI surface with real API response types,including private vs public DTO,null draft values,document binary authorization,pagination and report boundaries. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 3.** Execute fresh-user and three-provider journeys from browser through DB: all service modes,provider consent,join modes,manual lifecycle,reviews,complaints,admin incidents and notification replay. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 4.** Audit query invalidation after every mutation,visible-tab polling,logout/role loss cleanup and browser back behavior; no stale accepted/full/verified status after server409. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 5.** Test UTC/offset/date origin-zone conversion,decimal paise parsing,quote expiry and ambiguous transport retry with original key. Deliver a passing focused test and commit for this task before beginning the next.
- [ ] **Task 6.** Check each FR trace entry has implemented operations/entities/screens and named test evidence; fix missing functionality within approved scope before security/final audits. Deliver a passing focused test and commit for this task before beginning the next.

## E. File and folder expectations
Contract integration suite; API client DTOs; query key/invalidation maps; route/operation inventory; cross-role Playwright journeys; integration defects only. Keep per-domain routers/controllers/services/repositories/schemas/tests together. Add only files with one clear responsibility; exact additional names follow these module boundaries. Update safe shared contract types whenever API DTOs change. Do not import server/Prisma code into browser. Generated image assets, when this phase uses them, must be physically under `apps/web/public/images/generated/`, with `docs/design/image-assets.md` recording source prompt, selected filename, dimensions, license/usage provenance and alt/decorative decision.

## F. Database requirements and transactions
No unsolicited redesign. Any missing persistence invariant requires explicit forward migration and schema/spec update. Inspect actual rows/reservations/counters/outbox after browser flows. Use tables, types, FKs, unique/check/exclusion constraints, indexes and deletion policy from [database design](../specification/07-database-design.md). Any new schema change is a versioned Prisma migration with raw SQL when required, tested on fresh and incremental disposable DB. Never use `db push` in production or mutate an applied migration. Domain writes that affect status/holds/seats/history/audit/outbox commit together under canonical lock ordering. No external SMTP/scan call while row locks are held.

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
| `GET /api/v1/users/me` | `getMe` | active user | none | User; HTTP200 | No password/token/license fields |
| `PATCH /api/v1/users/me` | `updateMe` | active user | ProfileInput | User; HTTP200 | At least one supplied property; email changes excluded from v1 |
| `POST /api/v1/users/me/roles` | `addRole` | verified user | RoleInput | User; HTTP200 | Idempotent grant; no ADMIN input; approval separately controls operational eligibility |
| `GET /api/v1/owners/me` | `getOwner` | OWNER | none | Owner; HTTP200 | Own profile only |
| `PUT /api/v1/owners/me` | `updateOwner` | OWNER | OwnerInput | Owner; HTTP200 | Own user_id derived from token |
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
| `GET /api/v1/vehicles` | `searchVehicles` | public | none | Vehicle; HTTP200 | Only active owner, approved unexpired documents, listed and unarchived; not a reservation |
| `GET /api/v1/vehicles/{id}` | `getVehicle` | public | none | Vehicle; HTTP200 | Public image delivery separately authorized by visibility; no plate or private docs |
| `GET /api/v1/owners/me/vehicles` | `listMyVehicles` | OWNER | none | VehiclePrivate; HTTP200 | Own unarchived; include status |
| `POST /api/v1/vehicles` | `createVehicle` | OWNER | VehicleInput | VehiclePrivate; HTTP201 | Require complete owner profile; normalized registration unique; server derives owner |
| `PUT /api/v1/vehicles/{id}` | `updateVehicle` | OWNER | VehicleInput | VehiclePrivate; HTTP200 | Own only; material identity/capacity edits invalidate approval; forbidden with future commitments until resolved; version mandatory when updating existing profile/resource, omitted only on first creation |
| `DELETE /api/v1/vehicles/{id}` | `archiveVehicle` | OWNER | none | Ack; HTTP200 | 409 if pending/confirmed/active bookings or published future carpools; retain history |
| `POST /api/v1/vehicles/{id}/documents` | `uploadVehicleDoc` | OWNER | DocumentInput | Document; HTTP201 | Owned; only REGISTRATION/INSURANCE/VEHICLE_IMAGE; expiry required for insurance |
| `GET /api/v1/vehicles/{id}/documents` | `listVehicleDocs` | OWNER | none | Document; HTTP200 | Owned only; admin uses verification detail |
| `POST /api/v1/vehicles/{id}/verification` | `submitVehicle` | OWNER | VersionInput | Verification; HTTP201 | Clean registration, unexpired insurance and at least one clean image; immutable revision |
| `PATCH /api/v1/vehicles/{id}/listing` | `setVehicleListing` | OWNER | ListingInput | VehiclePrivate; HTTP200 | Owned; enabling requires valid approval; unlisting keeps commitments |
| `GET /api/v1/vehicles/{id}/availability` | `listVehicleAvailability` | OWNER | none | Availability; HTTP200 | Owned only |
| `POST /api/v1/vehicles/{id}/availability` | `createVehicleAvailability` | OWNER | AvailabilityInput | Availability; HTTP201 | Owned; BLOCKED shares conflict constraint with bookings/carpools |
| `DELETE /api/v1/vehicles/{vehicleId}/availability/{id}` | `deleteVehicleAvailability` | OWNER | none | Ack; HTTP200 | Ownership through vehicleId; id must belong to vehicle; cannot uncover committed hire |
| `GET /api/v1/owners/me/bookings` | `listOwnerBookings` | OWNER | none | Booking; HTTP200 | Own vehicle only |
| `GET /api/v1/documents/{id}/content` | `getDocument` | public or owner/admin | none | binary; HTTP200 | Public only CLEAN image of publicly visible approved vehicle; private docs owner or admin; attachment/nosniff; no executable content |
| `DELETE /api/v1/documents/{id}` | `deleteDocument` | active owner | none | Ack; HTTP200 | 409 if in current approved/pending revision or needed by future commitments; safe file cleanup job |
| `POST /api/v1/booking-quotes` | `quoteBooking` | verified PASSENGER | QuoteInput | Quote; HTTP201 | Use server rates; service-specific ownership/driver checks; no inventory hold; expires 10min |
| `POST /api/v1/bookings` | `createBooking` | verified PASSENGER | BookingInput | Booking; HTTP201 | Mandatory Idempotency-Key; atomic dual resource hold; quote owner and freshness rechecked |
| `GET /api/v1/bookings` | `listBookings` | PASSENGER | none | Booking; HTTP200 | passenger_id=self; include pending/history |
| `GET /api/v1/bookings/{id}` | `getBooking` | participant/admin | none | Booking; HTTP200 | Passenger, resource driver, owning vehicle owner or admin only |
| `POST /api/v1/bookings/{id}/decisions` | `decideBooking` | provider | BookingDecisionInput | Booking; HTTP200 | Only required undecided provider; cannot decide for another party; reject needs reason; lock booking |
| `POST /api/v1/bookings/{id}/cancel` | `cancelBooking` | requester/provider/admin | VersionReasonInput | Booking; HTTP200 | Before start only for participant; requester cutoff 15min for confirmed, providers reason audited; admin incident after start uses FAILED |
| `POST /api/v1/bookings/{id}/driver-assignment` | `replaceDriver` | requester/admin | AssignmentInput | Booking; HTTP200 | Pending only; DRIVER_HIRE/COMBINED; atomic replace reservation, reset driver consent, retain original deadline; reject self/ineligible driver |
| `POST /api/v1/carpools` | `createCarpool` | verified DRIVER+OWNER | CarpoolInput | Carpool; HTTP201 | Host must own verified vehicle and be approved driver; no reservations until publication |
| `PUT /api/v1/carpools/{id}` | `updateCarpool` | host | CarpoolInput | Carpool; HTTP200 | DRAFT only; published changes require cancellation/new ride; version mandatory when updating existing profile/resource, omitted only on first creation |
| `POST /api/v1/carpools/{id}/publish` | `publishCarpool` | host | VersionInput | Carpool; HTTP200 | Atomic shared resource reservation; lead >=60min; host verified; seats <= vehicle.seats-1 |
| `GET /api/v1/carpools` | `searchCarpools` | public | none | Carpool; HTTP200 | Exact city pair and departure date in origin timezone; no map/route matching |
| `GET /api/v1/carpools/{id}` | `getCarpool` | public/participant | none | Carpool; HTTP200 | DRAFT host/admin only; terminal details only host/participant/admin; omit passenger roster from public |
| `GET /api/v1/users/me/carpools` | `listMyCarpools` | active user | none | Carpool; HTTP200 | host_id=self |
| `POST /api/v1/carpools/{id}/seat-requests` | `requestSeat` | verified PASSENGER | SeatInput | SeatRequest; HTTP201 | Idempotency-Key required; lock carpool; own ride forbidden; one live request/user; instant consumes seats, approval does not |
| `GET /api/v1/carpools/{id}/seat-requests` | `listSeatRequests` | host/admin | none | SeatRequest; HTTP200 | Host ownership; hide unnecessary passenger PII |
| `POST /api/v1/seat-requests/{id}/decision` | `decideSeat` | host | DecisionInput | SeatRequest; HTTP200 | Lock carpool then request; conditional seat increment only on ACCEPT; cutoff 15min; no host overbooking |
| `POST /api/v1/seat-requests/{id}/cancel` | `cancelSeat` | requester/admin | VersionReasonInput | SeatRequest; HTTP200 | Before start; accepted cutoff 15min for requester; decrement only accepted->cancelled once |
| `GET /api/v1/users/me/seat-requests` | `listMySeats` | PASSENGER | none | SeatRequest; HTTP200 | passenger_id=self |
| `POST /api/v1/carpools/{id}/cancel` | `cancelCarpool` | host/admin | VersionReasonInput | Carpool; HTTP200 | Before STARTED; cancel live requests, zero confirmedSeats, release both reservations; admin after start uses FAILED |
| `GET /api/v1/trips` | `listTrips` | participant/admin | none | Trip; HTTP200 | Requester/assigned driver/vehicle owner/accepted passenger/host; scope server-side |
| `GET /api/v1/trips/{id}` | `getTrip` | participant/admin | none | Trip; HTTP200 | Participant object authorization; waypoints are simulated labels |
| `POST /api/v1/trips/{id}/transitions` | `transitionTrip` | assigned driver/admin | TransitionInput | Trip; HTTP200 | CAS version; assigned -> started -> in_transit -> completed; FAILED needs reason; no skip/backward |
| `POST /api/v1/trips/{id}/waypoint` | `advanceWaypoint` | assigned driver | VersionInput | Trip; HTTP200 | Only IN_TRANSIT; monotone index <= count; no fabricated GPS/ETA |
| `GET /api/v1/trips/{id}/history` | `tripHistory` | participant/admin | none | HistoryEntry; HTTP200 | Same object access as trip |
| `POST /api/v1/reviews` | `createReview` | verified participant | ReviewInput | Review; HTTP201 | Completed eligible trip; target bound to actual resource; not self/own vehicle; unique author/trip/target |
| `GET /api/v1/reviews/mine` | `myReviews` | active user | none | Review; HTTP200 | Author=self; includes own hidden marker |
| `GET /api/v1/drivers/{id}/reviews` | `driverReviews` | public | none | Review; HTTP200 | Public approved driver; hidden excluded; count/mean derived visible reviews |
| `GET /api/v1/vehicles/{id}/reviews` | `vehicleReviews` | public | none | Review; HTTP200 | Public approved vehicle; hidden excluded |
| `GET /api/v1/notifications` | `listNotifications` | active user | none | Notification; HTTP200 | recipient_id=self |
| `GET /api/v1/notifications/unread-count` | `unreadCount` | active user | none | UnreadCount; HTTP200 | Indexed recipient/read_at predicate |
| `POST /api/v1/notifications/{id}/read` | `readNotification` | active user | none | Notification; HTTP200 | Own only, idempotent; foreign recipient 404 |
| `POST /api/v1/notifications/read-all` | `readAllNotifications` | active user | none | Ack; HTTP200 | Capture server cutoff timestamp at request start; later arrivals remain unread |
| `POST /api/v1/complaints` | `createComplaint` | participant | ComplaintInput | Complaint; HTTP201 | Verified participant; max 3 open complaints/user/trip; reason plain text |
| `GET /api/v1/complaints/mine` | `myComplaints` | active user | none | Complaint; HTTP200 | reporter=self |
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
| `GET /api/v1/health` | `health` | public | none | Health; HTTP200 | No database dependency |
| `GET /api/v1/ready` | `ready` | public | none | Health; HTTP200 | 503 on database/schema/worker stale; return no connection details |

## H. Frontend requirements
All public/passenger/driver/owner/admin screens; no placeholder handlers,no stubbed persistent operations; account-scoped query caches and normalized error recovery. Follow [UI/UX specification](../specification/10-frontend-ui-ux-specification.md) for page-specific components, API dependencies, interactions, loading/empty/error/success, responsive and accessibility states. Use server data; no fabricated live metrics, avatar/vehicle imagery, confirmation, payment or location. Use generated original images only in appropriate explanatory/marketing placements and follow Impeccable's craft/QA process at UI implementation time.

## I. Business rules and edge cases
Relevant objective scenarios:
- Phase-specific infrastructure/contract evidence below; no functional requirement is falsely claimed complete in this phase.
Also apply [business rules](../specification/05-business-rules.md): active verification checked at mutation time; bookings require two physical resource holds; carpool pending seats consume zero; only accepted seats count; transition/state/version guards; cancellation cannot release active physical use; suspension denies current JWT. Keep manual route clearly simulated and estimated amounts uncollected. For this phase identify five highest-risk inputs from the review-focus list and bind a named negative/integration test to the owning task.

## J. Security requirements
Use [authentication/security](../specification/09-authentication-security.md): Argon2id, OTP/refresh rules, bounded shared rate limits, secure cookie/CORS/Origin/Helmet, strict Zod, object ownership, private scan-first uploads, redacted logs, auditable admin writes and secrets from environment. Implement only the controls relevant to this phase, preserving earlier controls; negative role/owner tests are mandatory. A UI guard is convenience, never permission.

## K. Testing requirements
Write targeted red-green-refactor unit tests for pure rules and UI behavior, real PostgreSQL integration tests for database invariants, Supertest API tests for contracts/authorization/error codes, RTL accessibility/form tests for frontend phases, and API-backed Playwright E2E for user journeys. Negative, concurrency and permission tests are not optional where specified below:
- test:contract validates every route/success/error DTO and live handler method/path coverage.
- Real PostgreSQL cross-role E2E with no intercepted successful mutation responses.
- DB reconciliation after completion/cancellation/expiry/suspension and concurrent browser last-seat scenario.
- Account switch/logout/role loss prevents prior user data in UI/cache/download.
Do not call a mocked successful write an end-to-end pass. Record each failing test's expected failure before implementation and fresh full-suite result before completion.

## L. Acceptance criteria
- [ ] All operations and page API references resolve to implemented working behavior.
- [ ] Every FR has live integration evidence,not solely mocked/unit tests.
- [ ] No known contract/persistence mismatch or placeholder remains.
- Phase-specific infrastructure/contract evidence below; no functional requirement is falsely claimed complete in this phase.
Acceptance requires observable persisted output, relevant HTTP statuses and no regression in earlier phases. If an NFR target owned by this phase is not yet measurable, record dependency and owner rather than claiming pass.

## M. Definition of done
Every task checkbox has a focused red/green test and commit; listed acceptance/scenarios and current prior-phase suites pass; OpenAPI, specification, UI and ADR changes are synchronized; migration/invariant checks pass where relevant; no stub, TODO or synthetic data passed off as production behavior; handoff records evidence and known limits. Seek a fresh independent review for major feature/final branch work when workflow and available tools permit; fix critical/important findings before completion. Do not proceed into Phase21 automatically unless owner has separately authorized continuing implementation.

## N. Verification commands
From repo root after Phase01 defines scripts: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:unit`, `npm run test:integration`, `npm run test:contract`, `npm run test:e2e`, `npm run build`, `npm run docs:check`. For schema phases: `npm run db:validate`, `npm run db:migrate:deploy`, `npm run db:test:constraints` against explicitly named disposable DB only. Run focused test first, relevant suites after each task, full currently applicable suite before commit/handoff. Phase01 may add scripts only when their suites exist; a missing future suite is reported unavailable, not passed. Production build and CI commands must return exit0 with complete output inspected. A command's mere invocation is not evidence of a pass.

## O. Git workflow
Recommended branch `codex/phase-20-frontend-backend-integration` from completed prior phase commit, never force-push. Confirm clean status, use an isolated worktree when user/platform preference supports it; user specified same repository, not a new GitHub project. Commit test+implementation per independently verifiable task (`test: cover <behavior>` or `feat: <behavior>`; combine red/green after passing), then `docs: update phase 20 handoff` if docs changed. Verify diff contains no secret/generated cache/private document. Before push run applicable checks, inspect commit list, and do not merge main without authorized integration decision.

## P. Final handoff
Return completed tasks, exact files changed, new migrations/constraints, operation IDs/endpoints, UI screens/assets with provenance, tests/commands and exit results, known issues, ADR/spec changes, branch/commit, and precise next-phase dependencies. Distinguish targets from measured values and test skips from passes. Link the phase's prompt and evidence; stop at this phase boundary.
