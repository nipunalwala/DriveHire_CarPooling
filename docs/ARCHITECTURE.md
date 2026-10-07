# ARCHITECTURE — DriveHire & Carpool (single source of truth)

## 0. Locked product decisions
1. **Single role:** `users.role` is one of `passenger|driver|owner|admin`. No simultaneous driver+owner. Upgrades require admin approval.
2. **Self-drive:** `bookings.driver_profile_id` optional. `NULL` = self-drive. When set, driver must be `approved` + `available`.
3. **OTP:** email only, 6 digits, 10-min expiry, 5 attempts/OTP, 60s resend cooldown, hash-only storage.
4. **Cancellation:** passenger/owner/driver may cancel only before `start_at` with `reason`. After `start_at`, only admin may cancel. Enforced in service/domain + tests.
5. **Refresh cookie:** `httpOnly, SameSite=Strict, Secure=true prod (false local-dev only), Path=/api/v1/auth/refresh`. Opaque, hashed, rotated, reuse revokes family.

## 1. Schema (PostgreSQL 15+, extensions `pgcrypto`, `btree_gist`)
Conventions: `id UUID PK DEFAULT gen_random_uuid()`, `created_at/updated_at TIMESTAMPTZ`, `deleted_at NULL` (soft-delete). Money `*_cents INT`. Times `TIMESTAMPTZ` UTC.

Enums: `user_role(passenger,driver,owner,admin)`, `user_status(active,suspended,deleted)`, `verification_status(pending,approved,rejected,suspended)`, `availability_status(available,unavailable,on_trip,maintenance)`, `booking_status(pending,confirmed,cancelled,completed,rejected)`, `trip_status(open,full,cancelled,completed)`, `carpool_req_status(pending,approved,rejected,cancelled)`, `ride_status(scheduled,assigned,started,in_transit,completed,cancelled)`, `notif_type(booking,status,confirmation,cancellation,system)`, `complaint_status(open,in_review,resolved,dismissed)`, `fuel_type`, `transmission`.

- `users(id, name VARCHAR(100) CHECK len>=2, email CITEXT UNIQUE, phone VARCHAR(20) UNIQUE NULL, password_hash, role user_role DEFAULT 'passenger', status user_status DEFAULT 'active', email_verified_at NULL, last_login_at NULL, deleted_at, timestamps)` idx `(role,status)`, `(email)`.
- `refresh_tokens(id, user_id FK CASCADE, token_hash UNIQUE, expires_at, revoked_at NULL, rotated_from_id FK NULL, ip, user_agent, created_at)` idx `(user_id,revoked_at,expires_at)`.
- `email_verification_otps(id, user_id FK CASCADE, otp_hash, expires_at, attempts INT 0-5, consumed_at NULL, created_at)` idx `(user_id,consumed_at)`.
- `password_reset_tokens(id, user_id FK CASCADE, token_hash UNIQUE, expires_at, consumed_at NULL, created_at)`.
- `driver_profiles(id, user_id FK UNIQUE, license_number UNIQUE, license_expiry DATE, years_experience 0-60, verification_status DEFAULT 'pending', verification_notes NULL, verified_by FK NULL, verified_at NULL, availability_status DEFAULT 'unavailable', deleted_at, timestamps)` idx `(verification_status)`, `(availability_status)`.
- `driver_documents(id, driver_profile_id FK CASCADE, doc_type IN (license_front,license_back,id_proof,other), file_key, mime, size_bytes 1-5242880, verification_status, created_at)`.
- `vehicles(id, owner_id FK, make, model, year CHECK 1990-next_year, color, plate_number UNIQUE, vin UNIQUE NULL, seating_capacity 1-60, fuel_type, transmission, daily_rate_cents>0, per_km_rate_cents>0 NULL, verification_status DEFAULT 'pending', availability_status DEFAULT 'unavailable', deleted_at, timestamps)` idx `(owner_id)`, `(verification_status,availability_status)`.
- `vehicle_documents(id, vehicle_id FK CASCADE, doc_type IN (rc,insurance,pollution,fitness,other), file_key, mime, size_bytes, verification_status, created_at)`.
- `bookings(id, booking_number UNIQUE, passenger_id FK, vehicle_id FK, driver_profile_id FK NULL, start_at, end_at CHECK end>start, pickup_location, dropoff_location, status booking_status DEFAULT 'pending', total_amount_cents>=0, idempotency_key UNIQUE NULL, cancelled_by FK NULL, cancel_reason NULL, deleted_at, timestamps)` + exclusions: `EXCLUDE (vehicle_id WITH =, tstzrange(start_at,end_at) WITH &&) WHERE (status IN ('pending','confirmed'))`; same on `driver_profile_id` where NOT NULL. idx `(vehicle_id,status,start_at)`, `(passenger_id,status,start_at DESC)`.
- `carpool_trips(id, driver_profile_id FK, vehicle_id FK, origin, destination, waypoints JSONB DEFAULT '[]', departure_at, arrival_eta NULL, total_seats 1-60, available_seats 0-total, price_per_seat_cents>=0, status trip_status DEFAULT 'open', deleted_at, timestamps)` idx `(origin,destination,departure_at) WHERE open`.
- `carpool_requests(id, trip_id FK CASCADE, passenger_id FK, seats_requested 1-6, status DEFAULT 'pending', idempotency_key UNIQUE NULL, timestamps)` + partial `UNIQUE(trip_id,passenger_id) WHERE status='pending'`.
- `rides(id, booking_id FK UNIQUE NULL, carpool_trip_id FK NULL, current_status ride_status DEFAULT 'scheduled', started_at NULL, completed_at NULL, percent_complete 0-100 DEFAULT 0, current_waypoint_index>=0 DEFAULT 0, timestamps)` CHECK exactly one of `booking_id/carpool_trip_id` NOT NULL.
- `ride_waypoints(id, ride_id FK CASCADE, seq INT, label TEXT, UNIQUE(ride_id,seq))`.
- `ride_status_history(id, ride_id FK CASCADE, from_status, to_status, changed_by FK, reason NULL, created_at)` idx `(ride_id,created_at)`.
- `ratings_reviews(id, ride_id FK, rater_id FK, ratee_id FK CHECK rater<>ratee, rating 1-5, comment VARCHAR(1000) NULL, created_at, UNIQUE(ride_id,rater_id))` idx `(ratee_id,rating)`.
- `notifications(id, user_id FK CASCADE, type notif_type, title VARCHAR(200), body TEXT, data JSONB DEFAULT '{}', read_at NULL, created_at)` idx `(user_id,read_at,created_at DESC)`.
- `complaints(id, reporter_id FK, target_user_id FK NULL, booking_id FK NULL, ride_id FK NULL, subject VARCHAR(200), description TEXT, status DEFAULT 'open', assigned_to FK NULL, resolution_notes NULL, timestamps)` idx `(status,created_at)`.
- `audit_logs(id, actor_id FK NULL, action VARCHAR(100), entity_type VARCHAR(50), entity_id TEXT, metadata JSONB, created_at)` idx `(entity_type,entity_id)`.

ER: `users→refresh/otp/reset`; `users 1-1 driver_profiles 1-* docs`; `users 1-* vehicles 1-* docs`; `bookings→rides→waypoints/history/ratings`; `carpool_trips 1-* requests`, `1-1 rides`; `users 1-* notifications/complaints`.

## 2. API catalogue (`/api/v1`)
Envelope `{success,data}` / `{success:false,error:{code,message,details}}`. Pagination `?page&limit<=100(default20)&sort`. `Idempotency-Key` on booking + carpool-request create.

- Auth: `POST /auth/register(passenger|driver|owner)` 201; `POST /auth/login` strict-RL; `POST /auth/refresh` (cookie path only) rotate; `POST /auth/logout`; `POST /auth/verify-email{email,otp}`; `POST /auth/forgot-password` always 200; `POST /auth/reset-password`; `GET/PATCH /users/me` (auth).
- Drivers (driver): `POST /drivers/profile`, `GET/PATCH /drivers/me` (license change → re-pending), `POST /drivers/me/documents` multipart, `GET /drivers/requests`, `POST /drivers/requests/:id/accept|reject`, `PATCH /drivers/me/availability`. Admin: `GET /admin/drivers?verification_status`, `POST /admin/drivers/:id/approve|reject|suspend`.
- Vehicles (owner): `POST /vehicles`, `GET /vehicles?availability&minSeats&maxRate`, `GET /vehicles/:id`, `PATCH /vehicles/:id` (plate change → re-pending), `DELETE /vehicles/:id` soft, `POST /vehicles/:id/documents`. Admin approve/reject.
- Bookings (passenger): `GET /vehicles/available?from&to&seats`, `POST /bookings{vehicleId,driverProfileId?,startAt,endAt,pickup,dropoff}`, `GET /bookings?status&upcoming`, `GET /bookings/:id`, `POST /bookings/:id/confirm` (vehicle owner/admin), `POST /bookings/:id/cancel{reason}` (owner/participant pre-start; admin anytime). Confirm creates `rides` row.
- Carpool: `POST /carpool-trips` (driver/owner, approved vehicle), `GET /carpool-trips/search?origin&destination&date&seats`, `POST /carpool-trips/:id/requests{seats}`, `POST /carpool-requests/:id/approve|reject` (trip owner, row-locked), `POST /carpool-requests/:id/cancel`.
- Rides: `GET /rides/:id` (participant/admin), `POST /rides/:id/transition{toStatus,waypointIndex?}` validated, `GET /rides/:id/history`, `PATCH /rides/:id/progress{percentComplete,waypointIndex}` monotonic, driver-only.
- Ratings: `POST /rides/:id/ratings{rateeId,rating 1-5,comment}` completed-only + once; `GET /users/:id/ratings-summary`.
- Notifications: `GET /notifications?unread`, `POST /notifications/:id/read`, `POST /notifications/read-all`.
- Admin: `GET /admin/users?role&status&q`, `POST /admin/users/:id/suspend|reactivate`, `GET /admin/bookings|rides|complaints`, `POST /admin/complaints/:id/assign|resolve|dismiss`, `GET /admin/reports/summary?from&to`.
- Ops: `GET /health` (no auth), `GET /ready` (DB `SELECT 1`, 503 if down).

## 3. RBAC matrix
| Capability | passenger | driver | owner | admin |
|---|---|---|---|---|
| register/book/carpool-request/rate/read-own | Y | — | — | Y |
| driver profile/docs/availability/accept | — | Y (approved+available for jobs) | — | Y |
| publish carpool trip | — | Y | Y | Y |
| vehicle CRUD/docs | — | — | Y (own only) | Y |
| confirm booking | — | — | Y (own vehicle) | Y |
| ride transition (own ride) | — | Y | Y | Y (any) |
| suspend users / verify queues / reports / complaints | — | — | — | Y |
Unverified-email: `403 EMAIL_UNVERIFIED` except verify/resend/logout. Suspended: login blocked, all routes `403`.

## 4. State machine + flows
`scheduled→assigned→started→in_transit→completed`; `scheduled|assigned→cancelled`; `started→cancelled` admin-only. Enforced in `domain/rideTransitions.ts`; every change writes `ride_status_history`. `percent_complete` monotonic from `current_waypoint_index/total`; `completed` requires `in_transit`. Simulated route = stored `ride_waypoints` labels, no maps/GPS.

Token flow: login → access JWT 15m (`sub,role,jti`) + opaque refresh 30d cookie; refresh rotates (`rotated_from_id`), reuse of revoked token revokes family + audit + force logout.

Conflict logic: `BEGIN; SELECT vehicle FOR UPDATE; SELECT 1 FROM bookings WHERE vehicle_id=:v AND status IN ('pending','confirmed') AND start_at<:end AND end_at>:start` → 409 if hit; same for driver when `driver_profile_id NOT NULL`; past `start_at` and >30d duration rejected. Exclusion constraints are the backstop.
Seat locking: `BEGIN; SELECT trip FOR UPDATE;` assert `open && available>=requested`; decrement, request→approved, `available=0 → full`. Over-request 409.

Notifications (in-process `EventBus`, services emit, subscriber persists): `booking.created→owner/driver`, `booking.confirmed/cancelled→passenger+owner/driver`, `carpool.requested→trip owner`, `carpool.approved/rejected→passenger`, `ride.status_changed→all participants`, `verification.decided→applicant`.

## 5. Production readiness
Config Zod-validated at boot, fail-fast. `pino+pino-http`, `X-Request-Id` propagate. `helmet`+HSTS prod, CORS allowlist+credentials. RL: login/OTP 10/min/IP, refresh 30/min, writes 60/min/user, search 120/min, admin 300/min + `Retry-After`. Knex forward-only (`migrate:latest` as deploy job), nightly `pg_dump` + pre-migrate snapshot, seeds dev-only. Hot indexes in §1, `limit<=100`. Graceful shutdown (drain HTTP, 10s Knex destroy). Observability: `/health`, `/ready`, structured logs, `audit_logs` for admin/verify/suspend.
