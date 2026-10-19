# Milestone04 execution ledger (scratch; archived into 04-provider-onboarding-admin.md at completion)

## Owner-directed parallel execution — recorded 2026-10-18

The owner explicitly requested parallel work: backend tasks to OpenCode while Codex
implements the frontend. OpenCode executes the independent Phase04 backend tasks
(`04-PROVIDER-ONBOARDING-ADMIN.md` Task1 and Task2) while Phase03 Task3
frontend/review completes. This supersedes the historical "await phase review"
boundary for continued implementation; it does **not** authorize push/merge/deploy
and does **not** mark any milestone accepted.

Scope and ownership boundaries honoured in this ledger:

- OpenCode owns only `apps/api` backend files, backend integration tests, and
  task-owned shared contracts (`packages/contracts/src/providers.ts`).
- OpenCode does **not** touch `apps/web`, `tests/e2e`, `playwright.config.ts`,
  root `package.json`/`package-lock.json`, `DESIGN.md` or frontend docs. Codex
  owned those and had uncommitted Phase03 Task3 changes; they were left untouched.
- No `git add all`, stash, reset or revert of other agents' work.
- Backend work runs against the dedicated `drivehire_test` Compose target only
  (`compose.test.yml`, DB `127.0.0.1:55433`, Mailpit `11025`, ClamAV `13310`).
  Codex's separate e2e Compose target (`drivehire-e2e-*`, DB `55434`) was not
  disturbed. No development/retired data was reset and no volumes were deleted.
- Root dependency pins/lockfile were not changed while Codex's frontend runner
  installation was active. All new backend code is dependency-free.
- Commits occur only for verified backend files, under the configured owner
  identity Nipun Alwala <nipunalwala18@gmail.com>; no push/merge/deploy.

Baseline: Phase03 Task2 committed at `2864f65` (accounts ledger); Phase03 Task3
(authentication screens + first browser E2E) is being implemented by Codex and is
not counted here as complete. Phase04's integrated milestone acceptance is not
declared by this ledger.

## Environment preparation

- `node v24.22.0` / `npm 11.19.1` confirmed on the project-local runtime.
- `docker compose -f compose.test.yml up -d scanner-test` started only the real
  ClamAV scanner (`127.0.0.1:13310`) needed by the SEC-UPLOAD regressions; the
  test database and Mailpit were already healthy. The `drivehire-e2e-*` project
  used by Codex was left running and untouched.

## Task1 — provider qualification backend (verified)

Deliverable files: `apps/api/src/modules/providers/{service,routes,multipart,
evidence,registration-crypto,qualification.integration.test}.ts`,
`apps/api/src/adapters/{private-storage,clamav-scan}.ts`,
`packages/contracts/src/providers.ts` (+ `packages/contracts/src/index.ts` export),
`apps/api/src/{app,server,worker}.ts` wiring, and the benign test signature
`docker/clamav/drivehire-test.ndb` referenced from `compose.test.yml`.

Evidence (dedicated `drivehire_test` target only):

- `npm run test:integration -- apps/api/src/modules/providers/qualification.integration.test.ts`
  → 1 file, **10 tests passed** (~35 s), covering private-storage round-trip,
  encrypted registration ciphertext, magic-byte type validation, real ClamAV
  rejection of the test signature, driver verification submit/decision flow,
  self-approval rejection and audit immutability.
- Re-confirmed green together with Task2: 2 files, **19 tests passed** (~61 s).

## Task2 — minimal administrator APIs and driver availability (verified)

Deliverable files: `apps/api/src/modules/providers/availability.ts`,
`apps/api/src/modules/admin/{service,routes,admin.integration.test}.ts`,
`setDriverListing` on the provider service, `/drivers/me/availability[/{id}]` and
`/drivers/me/listing` routes, and the `AuditEntry` contract.

Admin surface implemented to `docs/api/openapi.json`: `/admin/users`,
`/admin/users/{id}`, `/admin/users/{id}/suspend|reactivate`, `/admin/verifications`,
`/admin/verifications/{id}`, `/admin/verifications/{id}/decision`, `/admin/audit-logs`.
Availability: max 180-day horizon, BLOCKED reserves a `resource_reservations`
row, live booking/carpool hold blocks AVAILABLE-window removal, last-active-admin
and self-suspend guarded.

Evidence:

- `npm run test:integration -- apps/api/src/modules/admin/admin.integration.test.ts`
  → 1 file, **9 tests passed** (~28 s): `foreign_role403`,
  `last_admin_suspend409`, `sensitive_read_appends_safe_audit`, `stale_revision409`,
  `self_approval403`, `runtime_audit_update_denied`, `suspended_sessions_immediately_invalid`,
  `driver_block_overlap23P01`, `remove_available_window_with_hold409`.
- `npm run build -w @drivehire/contracts`, `npm run typecheck -w @drivehire/api`,
  `npm run build -w @drivehire/api`, and `eslint`/`prettier --check` over the
  owned files: all clean.

Honest debugging record (no invented passes):

- The first run failed `driver_block_overlap23P01` with **500 instead of 409**:
  the GiST exclusion violation (`23P01`) arrives from `@prisma/adapter-pg` as a
  `P2010` code whose real SQLSTATE sits in `meta.code`/message. `sqlStateOf` in
  `availability.ts` was corrected to walk `meta.code → code → message → cause`
  against known SQLSTATEs, after which the test passed.
- The `suspend` guard was reordered so the last-active-admin check runs before
  the self-suspend check, so `last_admin_suspend409` genuinely exercises the
  last-admin path rather than short-circuiting on the self conflict.

## Open dependency — evidence image decode/re-encode (NOT satisfied)

`apps/api/src/modules/providers/evidence.ts` validates magic bytes and strips
container metadata (PNG text chunks, JPEG APPn/COM segments, WebP EXIF/XMP) only.
The spec's requirement to **decode and re-encode** image pixel data (defeating
polyglot/embedded payloads) is **not** implemented: it needs a real image codec
(e.g. `sharp`/libvips) added to the API runtime, which is a **root dependency
change owned by Codex/root**, outside this task's ownership boundary. This is
recorded as an unmet dependency, not a delivered control, and must be closed in
the frontend/dependency phase before the milestone claims SEC-UPLOAD parity.

## Ownership boundary confirmation

### 2026-10-18 codec verification update

OpenCode subsequently added Sharp0.35.5 and bounded async decode/re-encode for JPEG, PNG and WebP, preserving canonical type and orientation while dropping metadata/trailers. PDF remains scanner-controlled. Three new regressions first failed against the original implementation (corrupt image accepted, pixel bomb accepted, appended payload retained). After implementation, the provider/admin combined run passed21/22 with one database ECONNRESET. Codex reran the same dedicated integration command and observed **22/22 passing**, duration110.59s. No development data was reset.

OpenCode then rejected the current free model twice with “OpenCode's free tier can only be used from within OpenCode” despite the installed CLI. No paid substitution was used. Backend implementation and independent review remain constrained by that provider failure.

Frontend checkpoint: local commits29411d7 (production React resolution regression) and7fded5d (driver schedule journey). API client/Vite focused tests9/9; schedule browser tests2/2 desktop/mobile, repeated after spacing corrections, persisted through reload and removed through the real API. Frontend lint/typecheck/production build passed. Other provider/admin screens and final milestone review remain pending; these commits were not pushed.

City dependency clarification: the existing OpenAPI already defines `GET /api/v1/cities` with paginated City DTOs and seeded reference data. The gap is implementation/reference-data provisioning, not a missing contract. No city route, shared schema or curated seed implementation was found. Backend should implement the existing contract; frontend must not invent UUIDs or treat test cities as production catalogue data.

Files changed by other agents were left untouched and unstaged: `apps/web/*`,
`tests/e2e/*`, `scripts/vite-env.test.ts`. `docs/design/provider-interface-direction.md`
is an untracked frontend handoff draft and is intentionally not committed here.
Commits are limited to verified owned backend files under the owner identity
`Nipun Alwala <nipunalwala18@gmail.com>`; no push/merge/deploy.

### 2026-10-19 city catalogue backend (uncommitted; owner asked not to commit yet)

Scope: implement the existing public `GET /api/v1/cities` OpenAPI
operation (`listCities`), its shared contract schema, and curated idempotent
reference-data provisioning. Backend/contracts/seed/tests only; `apps/web` and
`tests/e2e` were not edited. The six pre-existing dirty files (Sharp security
fix and dependency-lock changes) were preserved; the only change to
`apps/api/package.json` is an additive `db:seed:cities` script, with the
`sharp: 0.35.5` pin intact.

Owned files added/changed:

- `packages/contracts/src/cities.ts` (new): `CitySchema` (`strictObject`:
  `id` uuid, `name` 1..80, `region` 1..80, `country` 1..2, `timezone` 1..60) and
  `CityDto`, hand-mapped to the active OpenAPI `City` schema.
- `packages/contracts/src/index.ts`: exports `./cities.js`.
- `apps/api/src/modules/cities/reference-data.ts` (new): `CURATED_CITIES` (25
  real Indian cities with ISO 3166-2 subdivision region and `Asia/Kolkata`) and
  `provisionCuratedCities(pool)`, an idempotent upsert keyed on
  `(country, region, name)` that updates `timezone`/`active`. No UUID is ever
  supplied by application code; identity comes from the DB `gen_random_uuid()`
  default and is stable across re-runs.
- `apps/api/src/modules/cities/service.ts` (new): `listCities` service — strict
  `page`/`pageSize` query (defaults 1/20, max 100), active-only filter,
  `ORDER BY name`, `{success:true,data:CityDto[],meta:PageMeta}`; every row is
  parsed through `CitySchema` before returning (never a raw Prisma row).
- `apps/api/src/modules/cities/routes.ts` (new): public `GET /cities` router.
- `apps/api/src/app.ts`: mounts `createCitiesRouter` under `/api/v1` whenever the
  real Prisma dependency is present (public, no auth).
- `apps/api/src/seed/cities.ts` (new): operator CLI that refuses anything but a
  migrator-identity URL (no query/fragment; mirrors `scripts/migrate.mjs`),
  supports `--target test`, and runs the idempotent provisioner.
- `apps/api/src/modules/cities/cities.integration.test.ts` (new): the four named
  regressions below.
- `apps/api/package.json`: `db:seed:cities` script.

Observed RED (dedicated `drivehire_test` target, `13310` scanner not needed):
`npm run test:integration -- apps/api/src/modules/cities/cities.integration.test.ts`
→ 3 failed / 1 passed. The three route cases failed on real behavior
(`expected 404 to be 200` because `/api/v1/cities` was not mounted); the
provisioning-idempotency case already passed. No unavailable-suite or
compile-only failure.

Observed GREEN (same command): 4/4 passed, ~20 s. Named regressions:
`city_catalogue_returns_persisted_curated_cities` (200 envelope, 25 total,
each row validates `CitySchema`, returned ids present in the persisted
`cities` rows), `provisioning_is_idempotent_and_keeps_persisted_identities`
(two runs, identical id set, `count(*) = 25`),
`inactive_city_is_excluded_from_catalogue` (active=false row omitted from data
and from `meta.total`), `catalogue_paginates_and_rejects_invalid_query`
(page 1/3 sizes, non-overlapping ids, `page=0` → 400, unknown query → 400).

Full-suite results on the dedicated test target:

- `npm run test:integration` → 11 files, 79 tests passed, exit 0 (prior
  Phase01–04 suites remain green).
- `npm test` → 12 unit files / 46 tests + 1 contract test passed, exit 0.
- `npm run typecheck`, `npm run build` (contracts/api/web) → exit 0.
- `npm run docs:check` → 21 specs, 8 milestones, 26 FRs, 70 API operations,
  26 screens; OpenAPI validates, exit 0.
- Eslint/Prettier over every owned file → exit 0;
  `node scripts/check-boundaries.mjs` → boundaries verified.
- Operator CLI exercised end-to-end twice:
  `npm run db:seed:cities -w @drivehire/api -- --target test` →
  "Provisioned 25 curated cities (idempotent)." both runs, exit 0.

Unavailable/blocked checks recorded honestly (not passes):

- Full `npm run lint` exits 1 solely on a concurrently-created, unowned
  frontend file: `apps/web/src/features/providers/DriverQualificationPage.tsx:53`
  (`'_hourlyRate' is assigned a value but never used`). This file appeared
  during this session as concurrent Codex work and is outside the backend
  ownership boundary; it was not edited.
- Full `npm run format:check` exits 1 solely on the concurrently-created
  `apps/web/src/features/providers/EvidencePanel.tsx` (Prettier style). All
  owned files pass `prettier --check`.
- No commit and no push were performed (owner instruction). Other agents'
  `apps/web/*` and `tests/e2e/*` changes remain untouched and unstaged.

Frontend handoff (Codex) — DTO and fixtures:

- Endpoint: `GET /api/v1/cities` (public). Query: optional `page` (int ≥ 1,
  default 1), `pageSize` (int 1..100, default 20); any other query key → 400.
  Response: `{ success: true, data: CityDto[], meta: { page, pageSize, total } }`
  where `CityDto = { id: uuid, name, region, country, timezone }`; only
  `active=true` cities are returned, ordered by `name`.
- The client must use the returned `id` (persisted DB identity) directly for
  `serviceCityId` / `originCityId` / `destinationCityId`; do not invent or
  hardcode UUIDs. Backend integration fixtures seed their own throwaway cities
  via the migration identity, so they never represent the production catalogue.
- Production/dev catalogue is provisioned with the idempotent operator command
  `npm run db:seed:cities -w @drivehire/api` against a migrator-identity URL
  (the runtime role has `SELECT` only on `cities`).

## 2026-10-19 Codex frontend integration checkpoint (not phase acceptance)

The checkout and tools are at D:/CODING/DriveHire; D:/DriveHire no longer exists.
Three npm workspace junctions still targeted the old path and were repaired without
source, lockfile or dependency replacement. Docker was started hidden and only
compose.test.yml and compose.e2e.yml services were started. No development data was
reset. Free access was verified in a fresh OpenCode1.19.3 invocation with both
model and small_model explicitly pinned to opencode/deepseek-v4.1-flash-free:
FREE_ACCESS_OK, reported cost0. Both settings are also persisted in the local
.tools/opencode-config/opencode/opencode.jsonc. Earlier provider rejection was not
reproduced; its original root cause remains unproven. No paid fallback was used.

Codex implemented the existing-contract frontend routes /vehicles,
/driver/qualification, /admin/verifications and /admin/users, with capability-aware
profile navigation and DRIVER-only provider navigation. Personal vehicles do not
require OWNER or DRIVER. Forms preserve drafts on errors; city choices come from
the persisted cities API and shared CitySchema. Shared evidence upload exposes
scan status separately from qualification, rejects unsupported/oversized files
accessibly, and submits current versions. Admin evidence downloads use bearer
requests and short-lived object URLs revoked on replacement/unmount. A 409 retains
the review and reason, disables another decision and requires an explicit reload.

Observed frontend RED: the real isolated passenger browser flow registered,
verified and signed in, then failed because /vehicles had no vehicle screen. The
prepared routes were connected only after that behavioral failure. Full provider
browser acceptance remains pending while OpenCode aligns helpers to the actual UI
and existing Verification DTO (which has no model/displayName field).

Independent Codex frontend review found one Important defect: an unsaved decision
and reason carried from pending request A to pending request B. Free-only OpenCode
wrote a two-case component regression. Codex observed cross-request reset fail
(APPROVE retained), added key={review.id} to the decision form, and observed both
cases pass: a different request clears fields, while same-request reload preserves
the draft. Final: fixed cross-request decision carryover — meaningful RED->GREEN.

The reviewer also noted passenger-visible driver navigation; the explicit owning
prompt's capability-guarded navigation requirement took precedence over treating
that as discretionary polish, and the links now use current DRIVER capability.

Final: minor (deferred): failed filtered/paged list requests can retain previous
rows beneath the new filter with an error; avoid relying on rows until reload.
Final: minor (deferred): an initial non-404 driver-profile read failure leaves a
blank form with no local retry until browser reload; server version checks still
reject accidental updates of an existing profile.

Observed verification at this checkpoint:

- npm test: 13 unit files /48 tests, plus1 contract test passed.
- npm run lint: passed; browser/shared-contract boundaries verified.
- npm run build: contracts/API/web all passed before the final identity-key edit;
  that edit is verified by the focused2/2 component regression and full unit run.
- npm run docs:check: passed,21 specs/8 milestones/26 FRs/70 operations/26 screens.
- Impeccable detector on provider/admin UI and CSS: [] (no findings).
- Full format check: pending concurrent browser-helper formatting; last run
  reported only tests/e2e/providers.spec.ts, owned by OpenCode.

Independent backend review, post-remediation integration/browser runs, desktop and
mobile screenshot inspection and final handoffs remain required. Nothing in this
checkpoint declares Phase03 or04 accepted. No push or production deployment.

### Independent backend review rulings (2026-10-19; fixes pending)

The free-only independent reviewer produced artifacts/phase04-backend-independent-review.md.
It independently passed API typecheck/scoped lint, performed no DB writes or test
runs, and found no Critical defect. Five Important findings enter the fix pass:
approval/material-edit race; historical insurance incorrectly expiring a current
vehicle; availability filtering after public search pagination; concurrent mutual
administrator suspensions; missing insurance-expiry recheck at approval.

Final: Ruling: reviewer M3 is Important — read-then-write version checks permit
lost updates and violate required version CAS; fix with observed two-writer
regression. Cost if left wrong: silently overwritten qualification details.
Final: Ruling: reviewer M4 is Important — a material edit strands a PENDING request
and blocks correction/resubmission; supersede safely with immutable history and
stale-decision rejection. Cost if left wrong: owner qualification remains blocked.
Final: Ruling: reviewer M6 is Important — an unhandled private-file stream error
can disrupt the API process; fail safely with actual missing/failed stream tests.
Cost if left wrong: evidence requests can affect unrelated active users.

Final: minor (deferred): admin audit requestId reads raw client header rather than
validated middleware correlation; malformed long IDs can fail audited requests.
Final: minor (deferred): concurrent duplicate qualification submissions can return
500 on a unique constraint rather than classified409 while invariants hold.
Final: minor (deferred): public driver filter validation ignores malformed city/rate
and may accept an invalid interval when no candidate rows exist.
Final: minor (deferred): rerunning the curated city provisioner reactivates curated
rows deliberately deactivated by an operator.
Final: minor (deferred): passenger-only vehicle registration lacks a separate
backend regression; the real browser acceptance case covers that capability.

Final: Ruling: private evidence remains authenticated even where historical
OpenAPI text mentions public vehicle images — current lean qualification files
must remain private; no public listing image behavior is claimed in04. Cost if
wrong: a future public-image feature needs a separately authorized safe design.
Final: Ruling: Sharp warning rejection remains fail-closed — rejecting a malformed
image is safer than accepting uncertain evidence. Cost if wrong: an owner must
export a clean supported image and retry.
Final: Ruling: catalogue timezones are fixed curated Asia/Kolkata values — no
arbitrary user-provided timezone is accepted by the city route/provisioner.
Cost if wrong: future catalogue expansion requires explicit IANA validation.

Free-only OpenCode owns the backend regression/fix pass; Codex preserves the
frontend ownership boundary. No repeated independent review or completion claim
is substituted for the required post-fix full verification.

Browser acceptance prerequisite still pending: secondary contexts created with
browser.newContext({baseURL}) do not inherit the mobile project's viewport/touch
options. Both providers.spec.ts and admin-users.spec.ts currently use this helper.
The free test owner must copy explicit supported device options from
test.info().project.use into those secondary contexts before mobile administrator
screenshots/results count as mobile evidence. Do not relabel default desktop
contexts as mobile merely from the parent test's project name.

### Integrated browser/visual checkpoint after device correction

The exclusive free test worker ran provider and admin-user specs together with
workers=1,18 executed across desktop/mobile: provider12/12 passed, admin-user4/6
passed. Suspension/reactivation fails on both projects: real authenticated
POST /admin/users/:id/suspend returns500 and the passenger remains ACTIVE.
The newly introduced advisory-lock region is a diagnostic lead, not yet a proven
cause (check Prisma raw-query handling of a PostgreSQL void return). This remains
an Important blocker for the backend fix owner; no false green acceptance.

Both secondary-context helpers now inherit explicit supported project device
options and assert viewport size. Captures labelled mobile use390CSSpx/DPR3,
1170px PNG width; earlier default-desktop secondary captures are superseded.
The per-run administrator credential handoff lives only in gitignored
.cache/e2e-fixtures.json, outside cleaned Playwright output; never print it.

Codex inspected desktop/mobile captures together for vehicles, driver
qualification, administrator review and user administration. One batched CSS fix
adds separation between fieldset fields/filter groups and uses a clipped hidden
skip link instead of transform-only hiding (which appeared as a ghost in full-page
captures). Final browser verification will provide the one confirmation round;
no open-ended visual polish loop is authorized or needed.

The backend worker's temporary stash was interrupted and restored by Codex after
verifying no intervening changes in the three scoped implementation paths. Original
Sharp async sanitization and all newer code are restored. The exact named stash
is retained as a recovery copy until final verification. No source/data reset.
No retrospectively unobserved RED is claimed; remaining regression evidence must
be observed honestly, using isolated probes rather than hiding shared work.

### Final remediation checkpoint (2026-10-19)

The latest owner instruction authorizes committing and pushing the changes, then
continuing every remaining phase through implementation, independent review,
verification and CI. Earlier pending/hold wording above is historical.

All five Important backend findings have implementation corrections and real
regressions: approval rechecks under subject locks; insurance expiry bound to the
current reviewed immutable snapshot; time-filter pagination before count/slice;
serialized administrator suspension; insurance expiry checked on decision.
Additional Important corrections cover update CAS, orphan pending revisions,
missing private stream404, and city-local expiry at Asia/Kolkata midnight with
the worker stopped. Current private rejection reasons are owner-only. The Sharp
fix decodes/re-encodes images and rejects corrupt/oversized/payload inputs.

Focused administrator integration verification passed13/13, including mutual
suspension and stale approval races. Typecheck, lint, production build,
documentation/OpenAPI and whole-repository formatting checks passed. Unit and
contract verification passed56+1. Provider/admin browser verification executed18:
17 passed; the mobile rejection case failed during concurrent build/HMR and then
passed in an unchanged standalone rerun. A clean full38-case browser run and full
integration suite are now running serially per database before final acceptance.
No failure is erased by this checkpoint. Final handoffs record their outcomes.

The earlier overlapping integration runners were stopped. A subsequent verbose
administrator suite passed and the full suite is progressing with real test
output. No diagnosis-only backend harness changes were introduced. The dedicated
integration55433 and browser55434 databases remain separate. No production
deployment, development reset, credential logging or paid OpenCode substitution.

Final local acceptance: full integration95/95 across12 files (441.93s), browser
38/38 acrossdesktop/mobile (5.2min), unit56+contract1, typecheck/lint/build,
whole-repository format and docs/OpenAPI checks passed. Both qualification
boundary regressions passed, proving reviewed-snapshot binding and home-city
midnight expiry. The clean browser run supersedes the concurrent-build failure.
Independent reviews and Important fix evidence are archived. Push/CI is next;
no production deployment or later-phase implementation claim.
