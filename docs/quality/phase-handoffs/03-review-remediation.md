# Milestone03 auth remediation review

Scope: Phase03 authentication remediation only. Owned surface is the accounts
module (`apps/api/src/modules/accounts/**`), `apps/api/src/adapters/smtp-mail.ts`,
`apps/api/src/test/test-services.ts` and this record. No provider/admin/app/
server/worker/contracts/frontend/root dependency was touched, and no push or
production action was performed.

## Environment

- Isolated regression target: database `127.0.0.1:55434/drivehire_test`
  (compose project `drivehire-e2e`), SMTP `11026`, Mailpit HTTP `18026`.
- `.env` was loaded privately into the child environment and only the test URLs
  were overridden (`TEST_DATABASE_URL`/`TEST_MIGRATION_DATABASE_URL` port
  `55433 -> 55434`, `TEST_SMTP_PORT=11026`,
  `TEST_MAILPIT_URL=http://127.0.0.1:18026`); no secret was printed.
- CI defaults are unchanged: `55433`, `11025`, `18025` remain the committed
  `compose.test.yml` values, and `test-services.ts` defaults to them.
- The provider agent's separate `55433` target was never reset or written by this
  work.

## Baseline observed before remediation

Command (isolated target):
`npm run test:integration -- apps/api/src/modules/accounts/auth.integration.test.ts`

- `Test Files 1 failed (1)`, `Tests 3 failed | 16 passed (19)`, ~56s.
- `concurrent_otp_verify_single_use` -> `expected [3] to have a length of 1 but
got 3` (a valid OTP verified three times concurrently).
- `concurrent_reset_token_single_use` -> `expected [] to have a length of 1 but
got +0` (both redemptions rejected; test passwords were below the 12-char
  policy, so both were 400s).
- `concurrent_resend_serializes_outbox_versions` -> `expected [1] to deeply
equal [1, 2]` (the fixture verified the address, consuming the challenge, so no
  resend was due).

Email baseline (same environment):
`npm run test:integration -- apps/api/src/modules/accounts/email.integration.test.ts`
-> `7 passed (7)`.

## Pre-written auth fixes reviewed (GREEN only; no RED claimed)

These were already implemented when this remediation session began. They were
reviewed and verified by the suites; this record does not claim a RED observation
for them.

- `service.ts`: login re-reads the account under `FOR UPDATE` and rejects a
  stale credential -> `login_is_serialized_against_concurrent_password_change`.
- `service.ts`: refresh rejects a suspended account and revokes the family ->
  `refresh_rejects_suspended_user`, `suspended_jwt_fails_next_request`.
- `rate-limit.ts` + `routes.ts`: durable per-IP/per-address fixed-window limiter
  with `429` + `Retry-After` -> `forgot_password_flood_is_rate_limited`,
  `login_is_route_rate_limited_with_retry_after`.
- `service.ts`: account-row lock serializes resends/forgot so outbox aggregate
  versions cannot collide -> `concurrent_forgot_serializes_outbox_versions`.
- `service.ts`: resend/forgot answer a generic acknowledgement inside cooldown ->
  `resend_cooldown_is_generic_for_known_and_unknown` (now a real known case).
- `routes.ts`: strict role schema returns `400` (not `500`) for extra properties,
  and only `DRIVER` is self-grantable -> `role_extra_property_is_validation_error`,
  `public_owner_admin_grant_rejected`.
- `smtp-mail.ts`: `QUIT` is best-effort after DATA acceptance, so a close failure
  cannot reclassify an accepted message as a delivery failure.

## Remediation changes

1. `service.ts` `verifyEmail` is now atomic and single-use: the live challenge
   row is locked (`FOR UPDATE OF c`) inside one interactive transaction, the
   attempt accounting and the conditional consume commit together, and exactly
   one concurrent redemption can set `email_verified_at`. Attempt semantics are
   preserved: five wrong attempts are `400`, the sixth is `409 CONFLICT`, and an
   exhausted challenge (including with the original code) is `400`.
2. `auth.integration.test.ts` corrections:
   - Reset-race passwords raised to `RaceHorse123!` / `RaceHorse456!` (>= 12).
   - `resend_cooldown_is_generic_for_known_and_unknown` now uses a real
     known-unverified account with a live challenge in cooldown and asserts that
     no second email job is emitted.
   - `generic_unknown_email_ack` now registers a real known-unverified account in
     the same test instead of referencing an account that does not exist in the
     isolated database.
   - `concurrent_resend_serializes_outbox_versions` now registers without
     verifying, so the resends extend a real live challenge from version 1 to 2.

## Post-remediation evidence

- Focused auth: `npm run test:integration --
apps/api/src/modules/accounts/auth.integration.test.ts` ->
  `Test Files 1 passed (1)`, `Tests 19 passed (19)`.
- Focused email: `... apps/api/src/modules/accounts/email.integration.test.ts` ->
  `7 passed (7)`.
- Combined focused run (both files) -> `Test Files 2 passed (2)`,
  `Tests 26 passed (26)`.
- `npm run typecheck` -> exit 0. `npm run lint` -> exit 0 (boundaries verified).
  `npm run build` -> contracts/api/web built, exit 0. `npm run docs:check` ->
  exit 0 (21 specs, 8 milestones, 26 FRs, 70 operations, 26 screens; OpenAPI
  validates).
- `prettier --check` on every owned file -> "All matched files use Prettier code
  style!". Repository `npm run format:check` still reports
  `apps/api/src/modules/admin/service.ts` and
  `apps/api/src/modules/providers/availability.ts`, which are concurrent
  provider/admin work outside this session's ownership and were left untouched.

## Commit

Delivered as `76e6ffb83436cfb0b787721c46f979b6dbfb4f0e`
(`fix: harden accounts authentication flows and regression coverage`), authored
by the configured owner identity Nipun Alwala <nipunalwala18@gmail.com>, staging
only the seven owned files. No push, merge or deploy was performed.

## Remaining limits

- SMTP `starttls`/`implicit` are still not integration-tested (only
  `SMTP_TLS=none` via Mailpit).
- Whole-branch Phase03 review, the Codex frontend E2E and the final
  `03-accounts.md` archive remain outstanding; this record makes no whole-phase
  or production claim.

## 2026-10-19 resumed frontend independent review

The independent Codex frontend reviewer found one Important issue: a delayed startup
refresh could clear a later successful login, overwrite it with an older account,
or resurrect a session after logout. Free-only OpenCode wrote three focused
AuthProvider regressions. Codex observed all three fail against the original
behavior, added auth-generation checks before accepting refresh results, and
observed all three pass. No credentials are persisted by this change.

Verification in the relocated checkout D:/CODING/DriveHire/DriveHire_CarPooling:

- Focused AuthProvider regression: 3/3 RED, then 3/3 GREEN.
- Complete npm test: 12 unit files / 46 tests and 1 contract test passed.
- Focused frontend ESLint passed. Frontend TypeScript passed after correcting
  draft Phase04 form payload types; those uncommitted screens are separate work.
- Existing authentication/schedule browser suite: 16/16 desktop/mobile passed
  after repairing npm workspace junctions left pointing to the old D:/DriveHire
  path. That browser run started before the auth-generation fix was finalized;
  it is baseline evidence, not post-fix browser acceptance.

Final: fixed stale startup refresh overwriting newer auth state — three controlled
response-order regressions RED->GREEN; unit suite 46/46 and contract 1/1.
Final: minor (deferred): clearing an existing phone omits it from PATCH because the
current contract does not support removal; the interface needs explicit guidance.
Final: minor (deferred): login lacks a direct verification/resend entry point for
someone who closed registration before verifying their email.

The review was static frontend-only; backend final review and post-fix browser
verification remain required before Phase03 acceptance. No push or phase completion
claim is made by this checkpoint.

## 2026-10-19 backend remediation of the independent review Important findings

Scope: `apps/api/src/modules/accounts/**`, `apps/api/src/adapters/smtp-mail.ts`,
`apps/api/src/config/env.ts`, `apps/api/src/test/**` and this record only. No
frontend, E2E, OpenAPI/spec, Phase04 file, dependency pin or lockfile was touched;
the concurrent Phase04 cities/Sharp/admin/provider changes in the working tree were
left exactly as found. No commit, push, merge or deploy was performed.

Isolation: the dedicated integration stack on `55433` (compose project
`drivehire-test`, SMTP `11025`, Mailpit HTTP `18025`) via the committed `.env`
`TEST_DATABASE_URL`/`TEST_MIGRATION_DATABASE_URL`. The Phase04 `55433` target was
never reset by hand; resets happen only through the reviewed `withTestDatabase`
fixture. No development/retired data or volume was touched.

### I1. Cross-route row-lock inversion -> deadlock/500 (fixed, RED -> GREEN)

Confirmed the reported inversion: `verifyEmail` locked the challenge then the
account, while `resendOtp`/`forgotPassword` locked the account then the challenge,
and `resetPassword` locked the challenge then the account. Two deterministic
regressions were added to `auth.integration.test.ts`, each holding the account row
from a separate transaction, queueing the account-first route and the
challenge-first route on that row, then releasing it so Postgres forms the cycle:

- `verify_and_resend_share_account_then_challenge_lock_order`
- `forgot_and_reset_share_account_then_challenge_lock_order`

Observed RED before the fix (same command, `-t challenge_lock_order`):

```
Tests  2 failed (2)
AssertionError: expected [ 202, 500 ] to not include 500   (both cases)
```

i.e. the account-first route returned `202` and the challenge-first route returned
an unhandled `500` from the Postgres `40P01` deadlock.

Fix in `service.ts`: every flow now takes the account lock before any challenge
lock. `verifyEmail` locks the account by email first, then the live challenge
`FOR UPDATE OF c`; `resetPassword` reads the token's account, locks the account,
then re-reads and revalidates the challenge `FOR UPDATE` under that lock before
consuming it. Single-use, attempt accounting, session revocation and the
transactional outbox semantics are unchanged.

Observed GREEN after the fix: the two regressions pass, and the combined accounts
suites pass (`auth.integration.test.ts` + `email.integration.test.ts` ->
`Test Files 2 passed`, `Tests 28 passed`). The pre-existing single-use, refresh
replay, suspended-account and login/reset serialization regressions stayed green.

### I2. STARTTLS/implicit SMTP coverage gap (fixtures added; GREEN, no defect found)

The secure transports required by `parseEnv` for staging/production had no test
coverage. A real local TLS SMTP fixture was added and the secure paths are now
exercised end to end:

- `apps/api/src/test/fixtures/tls/{ca.pem,server-cert.pem,server-key.pem}`:
  test-only root CA and a `localhost`/`127.0.0.1` server certificate.
- `apps/api/src/test/tls-smtp-server.ts`: minimal in-process SMTP server with
  STARTTLS upgrade and implicit-TLS listeners; records commands, delivered
  messages and TLS counters.
- `apps/api/src/adapters/smtp-mail.test.ts`:
  `starttls_upgrades_authenticates_and_delivers` (asserts the upgrade happened,
  a second EHLO over TLS, AUTH PLAIN only after STARTTLS, and delivery with the
  server requiring auth); `implicit_tls_authenticates_and_delivers`;
  `implicit_tls_rejects_untrusted_certificate_without_delivery`;
  `starttls_rejects_when_the_upgrade_handshake_fails`;
  `transport_connection_failure_is_reported_as_smtp_error`.

Supporting change: `SMTP_CA` is an optional PEM trust anchor threaded to the TLS
socket (`.env.example` documents it). `rejectUnauthorized` stays `true` in all
paths; the CA is an added anchor only, and an IP host is no longer passed as an
illegal SNI `servername` (it is verified through its IP SAN). The fixture CA is
supplied only by tests and is never loaded in production.

Result: the adapter's secure transports worked as implemented; this was an
acceptance gap, not a demonstrated defect, so this record claims GREEN coverage
only. The first harness run failed because the fixture returned numeric counters by
value; they were changed to getters, after which all five tests pass. No production
certificate validation was disabled and no paid/network SMTP was used.

### Verification observed

- `npm run test:integration -- apps/api/src/modules/accounts/auth.integration.test.ts apps/api/src/modules/accounts/email.integration.test.ts`
  -> `Test Files 2 passed (2)`, `Tests 28 passed (28)`.
- `npm run test:unit -- apps/api/src/adapters/smtp-mail.test.ts` -> `5 passed (5)`.
- `npm test` -> 14 unit files / 53 tests and 1 contract test passed, exit 0.
- `npm run typecheck` -> exit 0. `npm run lint` -> exit 0 (boundaries verified).
  `npm run build` -> contracts/api/web built, exit 0.
- `npx prettier --check` on every owned file -> "All matched files use Prettier
  code style!".

### Deferred (unchanged; not addressed by this remediation)

The review's Minors M1–M8 and acceptance gaps G1–G3/G5 remain deferred; G4
(STARTTLS/implicit) is now covered above. No unrelated change was made for any
minor. The `SameSite` OpenAPI wording (M1), unknown-enum `403` (M2), swallowed
attempt assertions (M3), timing/enumeration notes (M4/M5), proxy-hop config (M6),
per-process outbox key foot-gun (M7) and reset status re-check (M8) are recorded,
not fixed, per the instruction to fix Important findings only.

### Limitations

- `docs:check` was not run: `python` is absent from this shell's PATH and no
  OpenAPI/spec file was changed by this work.
- Whole-repository `npm run format:check` was not run (concurrent Phase04 files are
  dirty/unowned); only the owned files were checked and are Prettier-clean.
- This is backend-only evidence. Whole-phase acceptance, the Codex frontend E2E
  and the final `03-accounts.md` archive remain outstanding. No phase completion,
  push or production claim is made.
