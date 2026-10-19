# Phase04 backend — independent final review

Reviewer: OpenCode (independent). Date: 2026-10-19.
Scope: backend only for Milestone04 (Tasks 1–2) plus the uncommitted backend
city-catalogue work. Read-only: **no code/test edits, no commits, no push, no
database runs, no `.env` reads.**
Target: `HEAD a465bd5` **plus** uncommitted backend working-tree changes.

## Repository state reviewed

Committed backend (HEAD): provider qualification service/routes/evidence/
multipart/registration-crypto/availability, admin service/routes, private
storage and ClamAV adapters, contracts, integration tests.
Uncommitted backend changes:

- `apps/api/src/modules/providers/evidence.ts`, `service.ts` — Sharp
  decode/re-encode security fix (+ `sharp 0.35.5` pin).
- `apps/api/src/modules/cities/*`, `apps/api/src/seed/cities.ts`, `app.ts`
  mount, `packages/contracts/src/{cities.ts,index.ts}` — `GET /api/v1/cities`.
- `apps/api/package.json` — additive `db:seed:cities` script.
  Concurrently modified by another worker (not mine, not Phase04 backend):
  `apps/api/src/modules/accounts/auth.integration.test.ts`, `apps/web/*`,
  `tests/e2e/*`, new `apps/api/src/test/fixtures/`. Left untouched.

## Independent evidence actually gathered (no DB)

- `npm run typecheck -w @drivehire/api` → **exit 0**.
  (A first run transiently failed on `auth.integration.test.ts:157` `Cannot
find name 'delay'` while that file was mid-edit by the concurrent worker; the
  second run, after that file stabilised, passed. Not a Phase04 defect.)
- Scoped `eslint` over all Phase04 backend-owned files → **exit 0**.
- Integration suites were **not executed**: the owning worker reports
  `test:integration` 79/79 and city tests 4/4, but per instruction I do not
  count another worker's unrun-by-me results as independent evidence. No
  database was started (browser harness 55434 belongs to another worker).

## Review Focus verdicts

1. **MIME spoof / private quarantine cannot become public — PASS.**
   `sanitizeEvidence` (`evidence.ts:101-112`) detects real magic and rejects a
   mismatched declared type; images are fully decoded/re-encoded via Sharp
   (`evidence.ts:72-88`, `limitInputPixels`, `failOn:'warning'`); uploads land
   in `quarantine/` and `authorizedRead` reads only `clean/`
   (`private-storage.ts:71-83`); `/documents/:id/content` requires
   `scanStatus === 'CLEAN'` and owner/admin (`service.ts:889-908`) and sets
   attachment/nosniff/no-store (`routes.ts:170-180`). Re-encoded size is
   re-bounded before storage (`service.ts:275-277`).
2. **Expiry blocks eligibility with the worker stopped — PASS for driver.**
   `searchDrivers`/`getDriver` filter `licenseExpiresOn >= today`
   (`service.ts:526,610`) and `setDriverListing` refuses expired
   (`service.ts:382-386`). Caveats for vehicles in Important #2/#5.
3. **Stale revision cannot approve newer evidence — PARTIAL.** Sequential CAS
   works (`service.ts:387-391`, atomic `updateMany` CAS `422-433`, plus
   `currentVerificationId` match `407-409,416-418`). A concurrency window
   remains: Important #1.
4. **Self/last-admin actions and foreign object URLs denied — PASS with one
   race.** `self_approval403` (`service.ts:384-386`), self-suspend blocked
   (`service.ts:241`), last-admin sequential guard (`service.ts:236-240`),
   foreign vehicle/document/availability all return 404 via ownership checks
   (`service.ts:229-234`, `889-902`, `911-925`; `availability.ts:160-163`).
   Last-admin guard is racy: Important #4.
5. **Passenger registers an owned vehicle without OWNER — PASS in code.**
   `POST /vehicles` and `/users/me/vehicles` require only authentication
   (`routes.ts:119-126`); no OWNER role/fleet field anywhere
   (`grep OWNER` finds only retired-role tests/comments). No _backend_ test
   exercises a passenger-only account here (Minor, test gap).

No **Critical** defect found: no private-evidence disclosure, no auth bypass,
no foreign-object read, no OWNER/fleet surface.

## Important

### I1 — Admin approval can overwrite a concurrent material subject edit (stale approval wins)

`apps/api/src/modules/providers/service.ts:402-419` performs the
`currentVerificationId === request.id` and license/expiry checks **outside** the
decision transaction; the transaction (`422-458`) CASes only the
`verification_request` row and then unconditionally updates the subject
(`438-442`) without re-checking `current_verification_id` or the subject
version. There is no DB guard (`driver_profiles_approved_fields_ck` only checks
non-null fields).
Reproduction: `POST /admin/verifications/{id}/decision` (APPROVE) for driver R
while the driver concurrently commits a material `PUT /drivers/me`
(`upsertDriver:351` clears `current_verification_id`, sets `DRAFT`); the
approval transaction still sets the profile `APPROVED`.
Effect: evidence invalidated by a material edit can be approved. Fix: re-check
`current_verification_id`/`version` inside the tx (conditional
`updateMany({where:{id, currentVerificationId: request.id}})` or `FOR UPDATE`).

### I2 — Vehicle expiry job expires a vehicle that still has a valid newer insurance

`service.ts:981-996` selects **every** `CLEAN` `INSURANCE` document with
`expires_on < today` (no `retired_at IS NULL`, no "is this the current/latest
insurance?" check) and sets those vehicles `EXPIRED`.
Reproduction: upload insurance A expiring yesterday (CLEAN, not retired), then a
valid insurance B; the latest-by-`created_at` used at submission is B, but the
job still marks the vehicle `EXPIRED`. Fix: only expire when the vehicle has no
later non-retired insurance valid at `today` (mirror the "latest document"
selection in `submitVehicleVerification:831-835`).

### I3 — Public driver search breaks pagination when a time filter is present

`service.ts:543-551` computes `total`/`skip`/`take` on base eligibility, then
`559-599` drops non-covering/blocked drivers **after** pagination and never
re-fetches. `meta.total` counts drivers who will be filtered out, and eligible
drivers on later pages are unreachable.
Reproduction: 25 approved drivers where only drivers on page 1 have a covering
`AVAILABLE` window; `GET /api/v1/drivers?startsAt=..&endsAt=..&pageSize=20`
returns fewer than 20 (possibly 0) and a `total` larger than the true match.
Fix: push availability/block filtering into the DB query (EXISTS/NOT EXISTS)
before count/skip/take.

### I4 — Last-active-admin guard is not race-safe

`admin/service.ts:238` calls `countActiveAdmins()` (global `prisma`, `171-175`)
**before** the transaction; the transaction only locks the target row
(`243-244`). Two admins suspending each other concurrently can each observe two
active admins and both commit.
Reproduction: admins A,B; simultaneous
`POST /admin/users/B/suspend` (as A) and `POST /admin/users/A/suspend` (as B) →
both 200, zero active admins. Fix: take a serializing lock (e.g. advisory lock
or `SELECT ... FOR UPDATE` over the admin set) and re-count inside the tx.

### I5 — Vehicle approval does not re-check insurance expiry (driver does)

Driver approval re-checks license expiry (`service.ts:410-412`); the vehicle
branch (`413-419`) checks only `currentVerificationId`. `submitVehicleVerification`
checks expiry at submit (`838-840`) but not at decision.
Reproduction: submit a vehicle verification while insurance is valid; wait until
it expires; `APPROVE` still succeeds and the vehicle becomes `APPROVED` even
with the worker stopped. (I2 partially masks this when the worker runs.)
Fix: re-check the submitted insurance document's `expiresOn` at decision.

## Minor

- **M1 — Audit `requestId` uses the raw, unvalidated client header.**
  `admin/routes.ts:18-22` reads `req.headers['x-request-id']` directly instead of
  the middleware-validated `res` value (`app.ts:59-64`). This permits audit
  correlation spoofing and, for a header >80 chars, a
  `varchar(80)` insert failure (`audit_logs.request_id`, migration
  `0003:235`) → 500 on audited admin actions.
- **M2 — Concurrent duplicate submit/decision can surface as 500, not 409.**
  `submitDriverVerification`/`submitVehicleVerification` compute
  `revision = last+1` and insert without catching the unique violations
  (`verification_requests_driver_revision_unique`,
  `verification_requests_driver_pending_unique`; `service.ts:470-499,846-877`).
  Invariant holds; response is a redacted 500.
- **M3 — Version CAS is read-then-write, not atomic.**
  `upsertDriver` (`337-353`), `setDriverListing` (`377-391`) and `updateVehicle`
  (`666-709`) compare a previously read version, then update unconditionally, so
  two concurrent same-version writes both succeed (lost update). Only
  `decideVerification` uses a real `where:{version}` CAS.
- **M4 — Material edit leaves an orphaned PENDING verification.**
  `upsertDriver:351` / `updateVehicle:704-708` clear `currentVerificationId` but
  leave the prior `PENDING` request; the partial unique pending index then blocks
  resubmission until an admin manually rejects the orphan. Recoverable, but the
  owner is stuck in the meantime.
- **M5 — Silent filter validation gaps in `searchDrivers`.** A malformed
  `cityId`/`maxHourlyRateMinor` is silently ignored (`service.ts:518-522`), and
  invalid `startsAt`/`endsAt` are validated only inside the row loop
  (`560-566`), so with zero candidates an invalid range returns 200.
- **M6 — No stream error handler on evidence content.** `service.ts:903-908`
  returns a file stream piped at `routes.ts:179`; a missing clean object emits an
  unhandled stream error rather than a 404. Low likelihood under normal
  operation.
- **M7 — City provisioner force-reactivates curated rows.**
  `reference-data.ts:42-52` always sets `active = true` on conflict, so an
  intentional deactivation of a curated city is undone on the next seed run.
- **M8 — No explicit backend regression for passenger-only vehicle
  registration.** The code allows it (`routes.ts:119`), but only the frontend
  spec asserts it.

## Declined to judge

- Frontend/admin-UI screens and browser journeys — owned by Codex.
- `GET /documents/{id}/content` is auth-only while OpenAPI declares a public
  branch for publicly visible vehicle images (`openapi.json:5776-5784`); no
  public vehicle listing exists yet. Defer to the milestone that adds public
  vehicle visibility.
- Sharp `failOn:'warning'` strictness (may reject marginally malformed but
  common photos) — deliberate fail-closed trade-off.
- City/timezone data correctness and `cities.timezone` IANA enforcement
  (noted as service-layer in migration `0001:5`) — no validation implemented;
  low risk for curated data.

## Limitations / independence statement

Static review plus an independent API typecheck (exit 0) and scoped eslint
(exit 0). I did **not** run integration/E2E tests or touch the database. The
worker-reported 79/79 and 4/4 remain the worker's evidence, not mine. Another
agent was actively editing account tests during this review; those changes were
preserved and not evaluated.
