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

Files changed by other agents were left untouched and unstaged: `apps/web/*`,
`tests/e2e/*`, `scripts/vite-env.test.ts`. `docs/design/provider-interface-direction.md`
is an untracked frontend handoff draft and is intentionally not committed here.
Commits are limited to verified owned backend files under the owner identity
`Nipun Alwala <nipunalwala18@gmail.com>`; no push/merge/deploy.
