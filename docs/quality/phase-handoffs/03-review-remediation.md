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
