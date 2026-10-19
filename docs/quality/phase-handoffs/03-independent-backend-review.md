# Phase03 accounts/authentication - independent backend review

Reviewer: OpenCode (free model). Date: 2026-10-19. Mode: static, read-only.

Scope: `apps/api` accounts/auth (`modules/accounts/**`), `adapters/smtp-mail.ts`,
`config/env.ts`, `app.ts`/`server.ts`/`worker.ts` auth wiring, `packages/contracts`
auth/cities exports, and the associated integration/unit tests. HEAD `a465bd5`
(Codex frontend race remediation). Backend/contracts/tests only; frontend/UI/E2E
excluded by instruction.

Method / evidence limitations (important):

- No tests were executed, no database or Compose stack was started, no migrations
  were deployed, no resets were performed. The GREEN claims in
  `docs/quality/phase-handoffs/03-accounts-ledger.md` and `03-review-remediation.md`
  are recorded, not independently reproduced here. Nothing in this review should
  be read as a passing test result.
- `.env` and auth/secret files were not read; no credentials were printed. No
  `docs/archive/**` content was scanned.
- The working tree contains concurrent Phase04 work. The accounts files
  (`modules/accounts/**`, `adapters/smtp-mail.ts`, `config/env.ts`, contracts
  `auth.ts`) are unmodified versus HEAD, so they are the reviewed artifacts.
  `app.ts` and `packages/contracts/src/index.ts` have uncommitted Phase04 edits
  (cities router/export). The auth wiring lines in `app.ts` are unchanged; the
  Phase04 `createCitiesRouter` addition was treated as out of scope.
- Conclusions are line-referenced but were not empirically executed; concurrency
  findings are reasoned from Postgres locking semantics, not observed.

## Verdict

No Critical backend defect found by static review. Ownership, role and session
authorization, token storage/hashing, and contract mapping are coherent with the
active OpenAPI and the auth security specification. Two Important issues remain:
one concurrency lock-ordering hazard and one unverified-but-required transport
path. Several minors and acceptance gaps follow.

## Important (graded by user effect)

### I1. Cross-route row-lock inversion can deadlock auth transactions -> 500

`modules/accounts/service.ts`.

Two auth flows acquire the same two rows in opposite order, so concurrent
requests for one account can deadlock (Postgres `40P01`) and surface as a 500 to
a legitimate user:

- `verifyEmail` locks the challenge first, then the user:
  - `SELECT ... FROM auth_challenges ... FOR UPDATE OF c` (service.ts:347-360),
  - `tx.user.update({ emailVerifiedAt })` (service.ts:387-390).
- `resendOtp` locks the user first, then the challenge:
  - `SELECT id FROM users WHERE email = ... FOR UPDATE` (service.ts:407-408),
  - `tx.authChallenge.update(...)` (service.ts:429-437).
- `forgotPassword` locks the user, then updates/creates RESET challenges:
  - user `FOR UPDATE` (service.ts:629-630), `authChallenge.updateMany` (service.ts:634-642).
- `resetPassword` locks the challenge, then the user:
  - `authChallenge.updateMany` (service.ts:700-703), user `FOR UPDATE` (service.ts:707).

User effect: verify-email racing resend-otp, or forgot-password racing
reset-password for the same account, can intermittently return an unhandled
deadlock error (500) instead of a wrapped HTTP envelope. No transaction rollback
corruption occurs, but the 500 is user-visible and the error is not a classified
`HttpError`. Existing concurrency tests (refresh replay, OTP single-use, reset
single-use, outbox-version races) do not exercise these cross-route orderings, so
the suites would not catch it. Recommended fix direction: use one consistent lock
order (e.g. always user-then-challenge) or avoid the second row lock entirely.

### I2. STARTTLS/implicit SMTP is required in secure environments but never exercised

`adapters/smtp-mail.ts`, `config/env.ts:54-68`, tests.

`parseEnv` rejects staging/production unless `SMTP_TLS` is `starttls` or
`implicit` and credentials are set (env.ts:59), i.e. the only transports allowed
in secure environments are exactly the paths with no test coverage. Every auth
email test uses `SMTP_TLS` unset (`none`) against Mailpit
(`email.integration.test.ts:34-43`, `test-services.ts`). The STARTTLS upgrade and
implicit-TLS socket paths (smtp-mail.ts:130-155, 195-201) are complex
(socket re-wrap, listener detach, no post-upgrade `authorized` assertion beyond
`rejectUnauthorized`) and unverified. User effect: verification/reset email can
silently fail in staging/production while the suite is green, since the
worker's only allowed transport is the untested one. This is acknowledged in the
Task2 handoff and is an acceptance gap, not a proven defect.

## Minor

- M1. OpenAPI `Set-Cookie` text says `SameSite=Strict` (openapi.json:214, 1031, 1195) while the code implements `SameSite=Lax` (routes.ts:34, 44), matching
  spec 09 and the owning plan. The canonical contract document is now internally
  inconsistent with the security spec; recommend correcting the OpenAPI
  description to `Lax` (or record the ruling in the final ledger). Behavioral
  choice is correct-per-spec.
- M2. `POST /users/me/roles` returns 403 for an unknown enum value such as
  `{ role: 'WIZARD' }` (routes.ts:230-232) rather than a 4xx validation error for
  a schema-invalid body; only the literal `DRIVER` passes the schema
  (auth.ts:46). `{ role: 'ADMIN'|'OWNER' }` -> 403 is deliberate and correct
  (tests assert it). The unknown-enum 403 is a defensible non-disclosure choice,
  but diverges from the stated "unknown/missing role 400" ledger wording.
- M3. Test hygiene: `sixth_bad_otp_cannot_verify`
  (auth.integration.test.ts:256-265) wraps each of the first five `expect(...).toBe(400)`
  assertions in `try { ... } catch { /* covered below */ }`, so a wrong status
  (e.g. 500) on those attempts is silently swallowed; only the 6th (409) and
  late-correct (400) assertions are enforced. The "exactly five wrong attempts
  are 400" guarantee is therefore not actually verified.
- M4. Timing side channel on generic acknowledgements: known addresses do DB work
  plus an outbox insert on `forgot-password`/`resend-otp`
  (service.ts:404-461, 625-677) while unknown addresses return immediately
  (service.ts:411, 632). Responses are byte-identical (tests assert this), but
  latency differs. Low practical risk; note only.
- M5. Registration discloses account existence with `409 Email already
registered` (service.ts:330). This is explicitly defined by the OpenAPI and is
  a common trade-off, but it is an email-enumeration vector and is the one place
  the "generic acknowledgements" rule is not applied. Note, not a defect against
  the active contract.
- M6. Rate-limit keys derive from `req.ip` with `TRUST_PROXY_HOPS` defaulting to
  0 (env.ts:21, routes.ts:85). If deployed behind a reverse proxy without setting
  the hop count, all clients share one bucket and hit global 429s. Configuration
  risk, not a code defect.
- M7. Dev/test fall back to a per-process random `AUTH_OUTBOX_KEY` when unset
  (env.ts:77-88, 121-128), so separate API and worker processes cannot decrypt
  each other's outbox rows without an explicit shared key. Correct and safe in
  secure environments (required there), but a foot-gun for local dev; already
  called out in the Task2 handoff.
- M8. `resetPassword` does not re-check account status and does not set
  `emailVerifiedAt` (service.ts:687-714). A suspended/unverified account can
  change its password, but cannot then log in (login enforces status +
  verification at service.ts:476-479), so impact is low.

## Acceptance gaps (not defects, but not covered)

- G1. `logout`, `logout-all`, `listSessions` pagination bounds, and the
  single-session revoke happy path have no direct assertions; `foreign_session404`
  covers only the cross-user 404.
- G2. No test asserts access-token 15-minute TTL, refresh-family 30-day absolute
  expiry, or that the refresh token is never returned in the JSON body (the
  envelope omits it at routes.ts:50-59, but this is unverified).
- G3. `emailVerified=false` login rejection (`403 Verify your email`) is not
  directly tested; unverified-account handling is only exercised indirectly.
- G4. STARTTLS/implicit SMTP (see I2).
- G5. Final `docs/quality/phase-handoffs/03-accounts.md` archive is still absent
  (only the ledger + remediation records exist).

## Positive confirmations (static)

- Contracts hand-map to the active OpenAPI `User`, `ProfileInput` (optional +
  `minProperties:1`), `RoleInput` (`DRIVER` only), `Session`, `TokenResult`,
  `RegisterInput`/`LoginInput`/`OtpInput`/`EmailInput`/`ResetInput`, `PageMeta`,
  `Ack` (auth.ts:7-79). `UserRoleSchema` is PASSENGER/DRIVER/ADMIN and no product
  route grants OWNER/ADMIN (index.ts:24; routes.ts:232; profile.ts:54-67).
- Refresh/reset/OTP secrets are HMAC-hashed before storage, not stored raw
  (service.ts:128-130, 173-175, 291, 647, 691); outbox secrets are AES-256-GCM
  with per-row AAD (outbox-crypto.ts:17-45); worker marks processed only after
  SMTP acceptance (email-jobs.ts:117-128) and backoff/dead-letters on failure.
- `requireAccount` re-checks account status, token version and session
  revocation/expiry per request (service.ts:244-271), so suspension, password
  reset and single-session revoke invalidate access immediately; refresh also
  revokes the family on replay (service.ts:502-551).
- Refresh rotation uses a conditional single-consume and revokes the family on a
  lost race (service.ts:519-529); role authorization is server-side and the
  profile surface is self-only (`account.userId`), so no IDOR was found.

## Declined to judge

- All frontend/UI/UX, AuthProvider, browser E2E and Playwright behavior
  (`apps/web/**`, `tests/e2e/**`), per scope.
- Concurrent Phase04 provider/admin/cities work (untracked `modules/cities/**`,
  `modules/admin/**`, `tests/e2e/providers.spec.ts`, working-tree edits to
  `app.ts`, `packages/contracts/src/index.ts`, `tests/e2e/server.ts`).
- Deployment/CI/runtime evidence, migration correctness, restore evidence and
  actual `npm test`/`typecheck`/`lint`/`build`/`docs:check`/`format:check`
  results; not reproducible under the no-DB/no-secret static constraint.
- Whether the documented concurrent `format:check` failures on
  `admin/service.ts` and `providers/availability.ts` gate Phase03.

## Explicit limitations

- This is static inspection only. No suite was run and no runtime, database,
  concurrency, browser or restore evidence was produced or validated.
- Severity is estimated by user effect and reasoned locking semantics; I1 is
  not reproduced against Postgres here.
