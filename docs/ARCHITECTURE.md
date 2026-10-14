# DriveHire & Carpool Architecture

Single source of truth for the product schema, API, security model, and implementation roadmap. PostgreSQL stores UTC `timestamptz`; API timestamps are ISO-8601 with `Z`. Monetary amounts are integer minor units unless a field is explicitly display-only.

## Product decisions and assumptions

- A user has exactly one primary role: `passenger`, `driver`, `owner`, or `admin`. Role changes are an audited admin action; no multi-role identities.
- Self-drive bookings have no assigned driver. A driver-assisted booking requires an approved, available driver.
- Email is the only OTP channel. OTPs are six digits, expire after ten minutes, allow five attempts, and have a 60-second resend cooldown. Store only a keyed hash.
- Passwords use bcrypt cost 12. Access JWTs last 15 minutes and live in client memory. Refresh credentials are opaque, rotated, stored as SHA-256 hashes, and delivered in an HttpOnly, SameSite=Strict cookie at `/api/v1/auth/refresh`; Secure is always true outside local development.
- Cancellations require a reason. Passengers, owners, and assigned drivers may cancel only before `start_at`; admins may cancel at any time.
- Payments, maps APIs, GPS, SMS, and push notifications are out of scope. Prices are estimates, not charges. Routes use stored labels and deterministic simulated progress.
- The existing fixed stack in `AGENTS.md` is authoritative: React/Vite/TypeScript, Express/TypeScript, PostgreSQL/Knex, Zod, Vitest/Supertest, RTL, and Playwright.

## Monorepo layout

```text
/client/src/{app,features,components,hooks,lib}
/client/tests /client/e2e
/server/src/{config,routes,controllers,services,repositories,middleware,domain,events,storage,mail,jobs}
/server/migrations /server/seeds
/docs /.github/workflows /docker
```

Routes validate and dispatch. Controllers translate HTTP to service calls. Services own business rules and transactions. Repositories own SQL. Frontend features communicate through `lib`, never by importing another feature.

## PostgreSQL schema

All primary keys are UUIDs from `gen_random_uuid()`. Mutable entities have `created_at`, `updated_at`, and where applicable `deleted_at`. Foreign keys use restrictive deletion unless the child is purely dependent. Add `pgcrypto`, `citext`, and `btree_gist`; a shared trigger updates `updated_at`.

### Enums

`user_role(passenger,driver,owner,admin)`, `user_status(pending,active,suspended)`, `otp_purpose(verify_email,reset_password)`, `verification_status(unverified,pending,verified,rejected)`, `booking_status(pending,confirmed,cancelled,rejected,completed,expired)`, `carpool_status(open,full,started,completed,cancelled)`, `carpool_request_status(pending,approved,rejected,cancelled)`, `ride_status(scheduled,assigned,started,in_transit,completed,cancelled)`, `reviewee_type(driver,vehicle,host)`, `complaint_status(open,in_review,resolved,dismissed)`.

### Tables and constraints

- `users(id, email CITEXT UNIQUE, phone UNIQUE NULL, password_hash, full_name, role, status, email_verified_at NULL, avatar_key NULL, timestamps, deleted_at NULL)`. Index `(role,status)`; soft-delete by default.
- `otp_codes(id, user_id FK, purpose, code_hash, expires_at, attempts CHECK 0..5, consumed_at NULL, created_at)`. Index `(user_id,purpose,consumed_at)`.
- `refresh_tokens(id, user_id FK, family_id, token_hash UNIQUE, expires_at, revoked_at NULL, rotated_from_id FK NULL, user_agent NULL, ip inet NULL, created_at)`. Index `(user_id,revoked_at,expires_at)` and `(family_id,revoked_at)`.
- `password_resets(id, user_id FK, token_hash UNIQUE, expires_at, consumed_at NULL, created_at)`.
- `driver_profiles(id, user_id UNIQUE FK, license_number UNIQUE, license_expiry date, experience_years CHECK 0..60, bio, city, hourly_rate_minor BIGINT CHECK >=0, verification_status, rejection_reason NULL, verified_by FK NULL, verified_at NULL, is_available DEFAULT false, rating_avg numeric(3,2) DEFAULT 0, rating_count int DEFAULT 0, timestamps, deleted_at)`. Index `(city,is_available,verification_status)`.
- `driver_documents(id, driver_id FK, type, file_key UNIQUE, mime, size_bytes CHECK 1..5242880, status, created_at)`.
- `vehicles(id, owner_id FK, type, make, model, year CHECK 1990..current year + 1, registration_number UNIQUE, color, seats CHECK 1..60, fuel_type, transmission, ac, hourly_rate_minor BIGINT CHECK >=0, daily_rate_minor BIGINT CHECK >=0, city, description, verification_status, rejection_reason NULL, verified_by FK NULL, verified_at NULL, is_available DEFAULT false, rating_avg numeric(3,2) DEFAULT 0, rating_count int DEFAULT 0, timestamps, deleted_at)`. Index `(city,type,is_available,verification_status)` and `(owner_id,deleted_at)`.
- `vehicle_documents(id, vehicle_id FK, type, file_key UNIQUE, mime, size_bytes CHECK 1..5242880, expiry_date NULL, created_at)`.
- `vehicle_unavailability(id, vehicle_id FK, start_at, end_at CHECK end_at>start_at, reason, created_at)` plus GiST exclusion on `(vehicle_id WITH =, tstzrange(start_at,end_at) WITH &&)`.
- `bookings(id, passenger_id FK, vehicle_id FK, driver_id FK NULL, pickup_text, dropoff_text, start_at, end_at CHECK end_at>start_at, passengers_count CHECK >0, status, price_estimate_minor BIGINT CHECK >=0, notes NULL, idempotency_key UNIQUE NULL, cancelled_by FK NULL, cancel_reason NULL, timestamps, deleted_at)`. GiST exclusions for overlapping `tstzrange` per vehicle and per non-null driver while status is `pending|confirmed`; B-tree indexes `(passenger_id,status,start_at DESC)`, `(vehicle_id,status,start_at)`, `(driver_id,status,start_at)`.
- `driver_requests(id, driver_id FK, booking_id FK NULL, status, responded_at NULL, created_at, UNIQUE(booking_id,driver_id))`. Index `(driver_id,status,created_at)`.
- `carpool_rides(id, host_id FK, vehicle_id FK NULL, origin_text, destination_text, origin_city, destination_city, departure_at, seats_total CHECK >0, seats_available CHECK 0<=seats_available AND seats_available<=seats_total, price_per_seat_minor BIGINT CHECK >=0, rules, status, timestamps, deleted_at)`. Indexes `(origin_city,destination_city,departure_at,status)` and `(host_id,departure_at)`.
- `carpool_requests(id, ride_id FK, passenger_id FK, seats_requested CHECK >0, status, message NULL, idempotency_key UNIQUE NULL, created_at, updated_at)`. Partial unique active request `(ride_id,passenger_id) WHERE status IN ('pending','approved')`; index `(passenger_id,status,created_at)`.
- `rides(id, source_type, source_id, driver_id FK NULL, status, progress_percent CHECK 0..100 DEFAULT 0, started_at NULL, completed_at NULL, created_at, updated_at, UNIQUE(source_type,source_id))`. Index `(driver_id,status)`.
- `ride_status_history(id, ride_id FK, from_status NULL, to_status, changed_by FK, note NULL, created_at)`, index `(ride_id,created_at)`.
- `ride_waypoints(id, ride_id FK, sequence CHECK >=0, label, planned_offset_minutes CHECK >=0, reached_at NULL, UNIQUE(ride_id,sequence))`.
- `reviews(id, ride_id FK, reviewer_id FK, reviewee_type, reviewee_id, rating SMALLINT CHECK 1..5, comment VARCHAR(1000), hidden DEFAULT false, created_at, UNIQUE(ride_id,reviewer_id,reviewee_type))`. Index `(reviewee_type,reviewee_id,created_at DESC)`.
- `notifications(id, user_id FK, type, title, body, data JSONB DEFAULT '{}', read_at NULL, created_at)`. Index `(user_id,read_at,created_at DESC)`.
- `complaints(id, filed_by FK, against_user_id FK NULL, ride_id FK NULL, booking_id FK NULL, category, description, status, resolution_note NULL, resolved_by FK NULL, resolved_at NULL, timestamps)`. Index `(status,created_at)` and `(filed_by,created_at DESC)`.
- `audit_logs(id, actor_id FK NULL, action, entity_type, entity_id, before JSONB NULL, after JSONB NULL, ip inet NULL, created_at)`. Index `(entity_type,entity_id,created_at DESC)` and `(actor_id,created_at DESC)`.
- `contact_messages(id, name, email, message, created_at)`; rate limited and only returns an acknowledgement.

### Relationship summary

`users` own profiles, vehicles, bookings, carpools, reviews, notifications, and audit actions. Bookings and carpools each create at most one `rides` row. A ride owns waypoints, status history, and reviews. Document rows reference exactly one driver or vehicle parent. Carpool rides own requests.

## API conventions

Base path `/api/v1`. JSON envelope is `{success:true,data:...}` or `{success:false,error:{code,message,details}}`. List responses use `{items,page,limit,total}`. `page>=1`, `limit=20` by default and at most 100. Sort is allowlisted `field:asc|desc`. IDs are UUIDs. Mutating endpoints validate Zod schemas. `Idempotency-Key` is supported on booking create and carpool request create.

### Auth and user

| Method/path                             | Access                    | Request / result                                                              |
| --------------------------------------- | ------------------------- | ----------------------------------------------------------------------------- |
| `POST /auth/register`                   | Public                    | `{email,password,fullName,role}` (role excludes admin); 201 user-safe profile |
| `POST /auth/verify-otp`                 | Public                    | `{email,code}`; 200 verified                                                  |
| `POST /auth/resend-otp`                 | Public                    | `{email}`; always generic acknowledgement; cooldown enforced                  |
| `POST /auth/login`                      | Public, strict rate limit | `{email,password}`; access token and safe user data, refresh cookie           |
| `POST /auth/refresh`                    | Refresh cookie            | Rotates family token; access token                                            |
| `POST /auth/logout`, `/auth/logout-all` | Authenticated             | Revokes current token or all user sessions                                    |
| `POST /auth/forgot-password`            | Public                    | `{email}`; always 200 generic acknowledgement                                 |
| `POST /auth/reset-password`             | Public                    | `{token,newPassword}`; consumes token, revokes sessions                       |
| `GET /users/me`, `PATCH /users/me`      | Authenticated             | Safe profile read/update                                                      |
| `POST /users/me/change-password`        | Authenticated             | `{currentPassword,newPassword}`                                               |
| `POST /users/me/avatar`                 | Authenticated             | Multipart image; safe key only                                                |

Auth errors include `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `RATE_LIMITED`, `EMAIL_UNVERIFIED`, `ACCOUNT_SUSPENDED`, `INVALID_CREDENTIALS`, `OTP_EXPIRED`, `OTP_ATTEMPTS_EXCEEDED`, `TOKEN_REUSED`.

### Drivers and vehicles

| Method/path                                                                                                | Access                                                                            | Request / result                                                 |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `POST /drivers/me`, `GET /drivers/me`, `PATCH /drivers/me`                                                 | Driver                                                                            | Profile; license edits reset verification                        |
| `POST /drivers/me/submit`, `PATCH /drivers/me/availability`                                                | Driver                                                                            | Submit complete, valid profile; availability boolean             |
| `POST /drivers/me/documents`, `GET                                                                         | DELETE /drivers/me/documents/:id`, `GET /drivers/me/documents/:id/file`           | Driver owner                                                     | Multipart allowlist; private authorized streaming |
| `GET /drivers/me/requests`, `POST /drivers/me/requests/:id/accept                                          | reject`                                                                           | Driver                                                           | Filtered requests; response transition            |
| `GET /drivers/:id`                                                                                         | Public                                                                            | Verified, PII-safe profile                                       |
| `GET /admin/drivers`, `GET /admin/drivers/:id`, `POST /admin/drivers/:id/verify                            | reject`                                                                           | Admin                                                            | Queue/detail; rejection requires reason; audited  |
| `POST /vehicles`, `GET /vehicles/mine`, `GET /vehicles/:id`, `PATCH /vehicles/:id`, `DELETE /vehicles/:id` | Owner                                                                             | CRUD; deletion is soft and blocked for future confirmed bookings |
| `POST /vehicles/:id/submit`, `PATCH /vehicles/:id/availability`                                            | Owner                                                                             | Verification and availability actions                            |
| `POST /vehicles/:id/documents`, `GET                                                                       | DELETE /vehicles/:id/documents/:docId`, `GET /vehicles/:id/documents/:docId/file` | Owner                                                            | Secure uploads and private streaming              |
| `GET /admin/vehicles`, `POST /admin/vehicles/:id/verify                                                    | reject`                                                                           | Admin                                                            | Queue and decision; rejection requires reason     |

### Search and bookings

| Method/path                          | Access            | Request / result                                                                                                                 |
| ------------------------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `GET /search/vehicles`               | Public            | city/type/seats/ac/rate/availability/rating/sort/page filters; verified available matches                                        |
| `GET /search/drivers`                | Public            | city/availability/window/rate/rating/sort/page filters; verified, unexpired matches                                              |
| `POST /bookings`                     | Passenger         | `{vehicleId,driverId?,pickupText,dropoffText,startAt,endAt,passengersCount,notes?}`; 201 pending booking + server price estimate |
| `GET /bookings`, `GET /bookings/:id` | Participant/admin | Own list or authorized detail                                                                                                    |
| `GET /owner/bookings`                | Owner             | Bookings for own vehicles                                                                                                        |
| `POST /bookings/:id/confirm          | reject`           | Vehicle owner/admin                                                                                                              | State transition |
| `POST /bookings/:id/cancel`          | Participant/admin | `{reason}`; pre-start rule for non-admin                                                                                         |

Booking errors include `BOOKING_CONFLICT`, `INVALID_TRANSITION`, `BOOKING_TOO_SOON`, `BOOKING_TOO_LONG`, `CAPACITY_EXCEEDED`, `NOT_FOUND`, `FORBIDDEN`.

### Carpool, rides, and reviews

| Method/path                                                                                | Access                     | Request / result                                                                                                                  |
| ------------------------------------------------------------------------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `POST /carpools`                                                                           | Driver/owner               | Publish ride `{vehicleId?,originText,destinationText,originCity,destinationCity,departureAt,seatsTotal,pricePerSeatMinor,rules?}` |
| `GET /carpools/search`, `GET /carpools/:id`                                                | Public                     | City/date/seats/price/sort/page filters; open rides only                                                                          |
| `PATCH /carpools/:id`, `POST /carpools/:id/cancel`                                         | Host                       | Limited edits; cancellation reason and request fanout                                                                             |
| `POST /carpools/:id/requests`                                                              | Passenger                  | `{seatsRequested,message?}` with idempotency key                                                                                  |
| `GET /carpools/:id/requests`, `POST /carpools/requests/:id/approve                         | reject`                    | Host                                                                                                                              | Lock ride row; approval decrements seats |
| `POST /carpools/requests/:id/cancel`                                                       | Request passenger          | Cancel once and restore seats transactionally                                                                                     |
| `GET /carpools/mine`, `GET /carpools/my-requests`                                          | Authenticated              | Paginated host/request history                                                                                                    |
| `GET /rides`, `GET /rides/:id`                                                             | Participant/admin          | Filtered list/detail                                                                                                              |
| `POST /rides/:id/assign`                                                                   | Owner/admin                | Verified available driver, no conflict, accepted request                                                                          |
| `POST /rides/:id/transition`                                                               | Assigned driver/admin      | `{toStatus,note?}`; transition and history transaction                                                                            |
| `POST /rides/:id/reach-next-waypoint`                                                      | Assigned driver            | Monotonic simulated progress                                                                                                      |
| `GET /rides/:id/tracking`                                                                  | Participant/admin          | Progress, waypoint ETA and timeline                                                                                               |
| `POST /reviews`                                                                            | Completed ride participant | `{rideId,revieweeType,revieweeId,rating,comment?}` once per type                                                                  |
| `GET /drivers/:id/reviews`, `/vehicles/:id/reviews`, `/users/:id/reviews`, `/reviews/mine` | Public/auth                | Paginated public reviews or own history                                                                                           |
| `POST /admin/reviews/:id/hide`                                                             | Admin                      | Hide and recompute aggregate                                                                                                      |

### Notifications, admin, public and operations

| Method/path                                                                                             | Access                                        | Request / result                                                        |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------- |
| `GET /notifications`, `GET /notifications/unread-count`                                                 | Authenticated                                 | Paginated; optional unread filter/count                                 |
| `POST /notifications/:id/read`, `POST /notifications/read-all`, `DELETE /notifications/:id`             | Owner                                         | Read/delete own notification only                                       |
| `POST /contact`                                                                                         | Public, strict rate limit                     | `{name,email,message}`; Zod validated, stored, then 201 acknowledgement |
| `POST /complaints`, `GET /complaints/mine`                                                              | Authenticated                                 | File and view own complaints                                            |
| `/admin/users` GET, `/admin/users/:id` GET, `/admin/users/:id/suspend                                   | reactivate`POST,`/admin/users/:id/role` PATCH | Admin                                                                   | Search/filter/page; reasoned audited changes; preserve last active admin |
| `GET /admin/verifications`, `/admin/bookings`, `/admin/rides`, `/admin/complaints`, `/admin/audit-logs` | Admin                                         | Filtered paginated queue/list                                           |
| `POST /admin/bookings/:id/cancel`, `/admin/rides/:id/cancel`, `/admin/complaints/:id/resolve`           | Admin                                         | Reason/note; audited and emits events                                   |
| `GET /admin/reports/summary`, `/admin/reports/trends`, `/admin/reports/top-rated`                       | Admin                                         | Indexed aggregates; trend range 7d/30d/90d                              |
| `GET /api/v1/health`                                                                                    | Public                                        | Process health                                                          |
| `GET /api/v1/ready`                                                                                     | Public                                        | Database readiness, 503 if unavailable                                  |

Common errors: `VALIDATION_ERROR` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409, `RATE_LIMITED` 429, `INTERNAL` 500. Never expose stack traces, password hashes, refresh tokens, private document keys, or another user's sensitive IDs.

## Frontend route map

- Public layout: `/`, `/about`, `/how-it-works`, `/contact`, `/faq`, `/terms`, `/privacy`, `/search/vehicles`, `/search/drivers`, `/carpools/search`, public verified `/drivers/:id` and `/vehicles/:id`.
- Auth layout: `/login`, `/register`, `/verify-otp`, `/forgot-password`, `/reset-password`.
- Passenger dashboard: `/passenger`, `/passenger/bookings`, `/passenger/bookings/:id`, `/passenger/carpools`, `/passenger/rides`, `/passenger/notifications`, `/passenger/profile`, `/passenger/complaints`.
- Driver dashboard: `/driver`, `/driver/onboarding`, `/driver/requests`, `/driver/rides`, `/driver/documents`, `/driver/availability`, `/driver/profile`.
- Owner dashboard: `/owner`, `/owner/vehicles`, `/owner/vehicles/new`, `/owner/bookings`, `/owner/carpools`, `/owner/profile`.
- Admin dashboard: `/admin`, `/admin/users`, `/admin/verifications/drivers`, `/admin/verifications/vehicles`, `/admin/bookings`, `/admin/rides`, `/admin/complaints`, `/admin/reports`, `/admin/audit-logs`.
- `PublicRoute`, `AuthenticatedRoute`, and `RoleRoute` protect layouts. Auth state uses in-memory access token and refresh-on-401 through Axios; TanStack Query owns server state; RHF/Zod owns forms. No access token in localStorage.

## Cross-cutting behavior

### Booking overlap and idempotency

Validate future start, minimum lead time, maximum duration, end-after-start, and vehicle capacity. In a transaction lock the vehicle row, query active overlap with `existing.start_at < requested.end_at AND existing.end_at > requested.start_at`, validate driver overlap if assigned, create booking/driver request, and persist idempotency response. GiST exclusion constraints are the race-condition backstop. Map exclusion violation `23P01` to 409 `BOOKING_CONFLICT`.

### Carpool seat concurrency

Approval/cancel transaction locks the ride row `FOR UPDATE`, locks request, checks its state and available seats, updates request and seat count exactly once, and changes `open` to `full` at zero. Constraints enforce `0 <= available <= total`. Never perform a check-then-update outside the transaction.

### State machines

- Booking: `pending -> confirmed|rejected|cancelled|expired`; `confirmed -> completed|cancelled`; terminal states have no outgoing edges.
- Carpool request: `pending -> approved|rejected|cancelled`; `approved -> cancelled` (restore reserved seats once).
- Ride: `scheduled -> assigned -> started -> in_transit -> completed`; cancellation is allowed before completion. Only assigned driver/admin advances; each transition writes history in the same transaction.
- Verification: `unverified -> pending -> verified|rejected`; material license/vehicle edits reset verified state to pending.

### Tokens, uploads, events

Refresh detects reuse and revokes its entire family. Cookie is HttpOnly, SameSite=Strict, Path `/api/v1/auth/refresh`, Secure in every non-local environment. CSRF defenses are strict SameSite plus Origin/Referer allowlist checks on cookie-authenticated mutations. Uploads are <=5 MiB, allowlisted MIME and magic-byte checked, randomized UUID keys, private storage, and authorized streaming only. Typed in-process events dispatch after commit; notification/mail subscriber failures are logged and cannot roll back domain writes.

### RBAC matrix

| Capability                                             |   Passenger |      Driver |      Owner | Admin |
| ------------------------------------------------------ | ----------: | ----------: | ---------: | ----: |
| Register, book, request carpool, review completed ride |         Yes |           — |          — |   Yes |
| Driver profile/docs/availability/request response      |           — |         Own |          — |   Yes |
| Vehicle CRUD/docs/availability                         |           — |           — |        Own |   Yes |
| Publish/host carpool                                   |           — |         Yes |        Yes |   Yes |
| Confirm booking for owned vehicle                      |           — |           — |        Own |   Yes |
| Ride transition                                        |           — |    Assigned |          — |   Yes |
| Admin users, verification, complaints, reports         |           — |           — |          — |   Yes |
| Read private booking/carpool/ride                      | Participant | Participant | Owner/host |   Yes |

## Production readiness

Fail fast on Zod-validated environment. `pino-http` adds request IDs and redacts credentials/PII. Helmet, HSTS in production, strict CORS allowlist with credentials, JSON size cap, gzip, and class-specific rate limits: auth/OTP 10/min/IP, refresh 30/min, writes 60/min/user, search 120/min, uploads 20/min/user, admin 300/min/user. Use graceful HTTP drain and Knex pool shutdown. `/ready` executes `SELECT 1`. Run forward migrations as a deployment job; seeds are disabled in production. Back up with encrypted nightly `pg_dump`, retain 30 days, test restore quarterly, and snapshot before migrations. CI runs lint, typecheck, unit/API/integration tests against PostgreSQL, client build, E2E, and container builds. Paginate every list, cap limit at 100, and use the listed hot-path indexes.

## Roadmap

| Prompt | Scope                                                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| 4      | Foundation: workspace/tooling, server/client shells, config/security, migrations, events, storage/mail interfaces, Docker/CI, tests |
| 4.5    | Design system, responsive public marketing pages, layouts, accessibility, design tests and screenshots                              |
| 5      | Auth, OTP/reset, refresh rotation, profiles, RBAC and client auth flows                                                             |
| 6      | Driver onboarding/documents/verification/availability/requests                                                                      |
| 7      | Vehicle CRUD/documents/verification/availability                                                                                    |
| 8      | Vehicle/driver search, transactional bookings, idempotency, expiry job                                                              |
| 9      | Carpool publish/search/request/approval/cancellation and seat locking                                                               |
| 10     | Ride assignment, state machine, history, deterministic simulated tracking                                                           |
| 11     | Reviews/aggregates and event-driven in-app notifications                                                                            |
| 12     | Admin users, verification, complaints, reports and audit UI/API                                                                     |
| 13     | Security/UX/performance audit, retention jobs, demo seed, E2E, CI, runbook, release                                                 |

## Risks

- Search location is text/city based; without a maps/geocoding provider it cannot promise geographic route precision.
- Estimates are not payments and are not a financial ledger.
- SMTP delivery and local file persistence require production deployment configuration and durable storage.
- Concurrent booking and carpool correctness depends on using the real PostgreSQL integration suite in CI; mocks alone do not prove locking behavior.
- This architecture resolves the prompt pack's open choices: use text/city search, SQL exclusions plus row locks, strict SameSite and Origin checks for CSRF, soft-delete users/vehicles, and admin suspension leaves history intact while preventing new actions.
