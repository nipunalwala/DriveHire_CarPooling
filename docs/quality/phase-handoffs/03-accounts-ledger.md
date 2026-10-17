# Milestone03 execution ledger (scratch; archived into 03-accounts.md at completion)

## Task3 frontend implementation — 2026-10-18

Codex implemented the authentication/profile interface under the owner's authorization to continue all tasks and own UI/UX. OpenCode independently proceeds with Phase04 backend work; its files are excluded from the frontend commit. See `docs/design/auth-interface-direction.md`, `DESIGN.md` and `docs/operations/browser-tests.md`.

- Added same-origin envelope API client with in-memory bearer and bounded authenticated retry; five focused client tests pass.
- Added AuthProvider, per-tab single-flight and cross-tab Web Locks refresh, sign-out BroadcastChannel and protected destination recovery. No tokens are persisted in localStorage.
- Added register, verify-email, login, forgot/reset-password and profile pages, reusable controls/feedback and responsive public shell. Shared role enablement clearly distinguishes capability from qualification approval.
- Observed a meaningful component RED: `/login` lacked the Welcome back heading/form. After implementation the component/client suite passes seven tests.
- Added exact-pinned Playwright1.64.1, executable `npm run test:e2e`, dedicated `compose.e2e.yml` and a real API/web/email fixture. Browser test data is separate from backend integration data. Added a guard regression that failed before accepting only the explicit additional test port55434; wrong database and port55435 remain refused.
- Desktop and mobile:10 real authentication scenarios passed, including registration/OTP/login/profile persistence/logout, protected redirect, invalid-field keyboard/error focus, one failed refresh and actual Mailpit password reset revoking the old session. Initial reset scenario failed on an ambiguous label locator; exact input locator fixed it, without changing application behavior.
- Two additional desktop/mobile layout captures pass overflow checks and were visually inspected together. No layout defects found in that inspection. Browser credentials stay in memory/HttpOnly cookies. QA captures are ignored artifacts, not generated product images.
- Frontend production build passes; frontend lint and the existing dependency-boundary checker pass. Focused frontend/database guard/boundary tests:17 passed. Full milestone review and final integrated verification are still required; no full Phase03 completion claim is made here.
- Narrow lint correction: browser imports of its own `src/api/client.ts` are permitted; server packages remain restricted, and the AST boundary checker still rejects relative imports outside the browser/shared-contract roots.

## Owner approval — recorded 2026-10-17

The owner said "Continue the work" after Milestone02 completion and presented the
reduced lean implementation plan, directing a resume of Milestone03 (Accounts and
Profiles) in the existing OpenCode session. This is recorded as the owner's
approval to execute the reviewed `docs/implementation-prompts/03-ACCOUNTS-PROFILES.md`
plan via native Superpowers task-by-task RED->GREEN. Codex monitors read-only;
working tree verified clean at `c2e073e` on branch
`codex/phase-01-project-foundation` (3 commits ahead of origin, unpushed:
`c2e073e`, `54730f8`, `0ed7835`).

Scope agreement: Milestone03 only — account contracts, current authentication,
real authentication email + own profiles, auth/profile screens + first browser
E2E. Completed 01/02 is preserved; no merge, push or deploy; permission controls
stayed enabled. Stop at end of Milestone03.

## Owner-requested stop and WIP checkpoint — 2026-10-17

The owner explicitly requested: “stop the seession and push any unfinished work.”
Codex interrupted the exact OpenCode session using `session.interrupt`; the API
confirmed `interrupted:true`. The five-minute progress automation is paused.
This request authorizes pushing this unfinished checkpoint before phase completion.

Task1 is incomplete. Current changes include Argon2/JWT dependencies, authentication
contracts, removal of OWNER from shared roles, an initial account service and auth
regressions, error helpers and auth configuration. Account route wiring, durable
authentication email/profile work, frontend/E2E, final verification and independent
phase review remain unfinished. The service draft needs review before further use.

The last observed new auth suite had seven expected failures because the routes
were absent. Implementation was written afterward but has not been demonstrated
passing. No passing Phase03, build, security or release claim is made for this
checkpoint. The last completed and verified baseline remains `c2e073e` (Phase02).
No feature fixes or additional tests were run after the stop request; the snapshot
is preserved for later continuation. Private local environment files are excluded.

## Human authorization to resume Task1 — recorded 2026-10-18

The human explicitly authorized: “Resume from Phase3 Task1. Execute only
Milestone03 Task1 on branch `opencode/accounts-auth`.” This new instruction
supersedes the historical stop for Task1 and is the owner's approval to complete
Task1 in this session. Scope: Task1 only — account contracts, current
authentication service/routes, requireAccount, and the named auth regressions
(`refresh_same_token_race_revokes_family`, `suspended_jwt_fails_next_request`,
`sixth_bad_otp_cannot_verify`, `reset_token_one_use_revokes_sessions`,
`public_owner_admin_grant_rejected`, `generic_unknown_email_ack`,
`foreign_session404`). Completed Milestones01/02 are preserved and not redone.

Constraints recorded from the human instruction: use only the dedicated
`drivehire_test` Compose target; never reset development/retired data or delete
volumes; Docker executable
`C:/Users/nipun/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe`;
do not read/expose `.env`, credentials or private evidence; use only the selected
verified free model (no paid fallback); commit with the configured Nipun Alwala
GitHub identity; no push, merge or deploy. Stop after Task1 and report commit,
changed files, tests and blockers.

## Task1 implementation and evidence — 2026-10-18

Branch `opencode/accounts-auth` (inherited the `wip:` Task1 checkpoint `e70c10b`).
Prisma client regenerated with `npm run db:generate` (Prisma 7.10.1, offline-safe).
Dedicated test services only: `docker compose -f compose.test.yml up -d
database-test` using the documented Docker executable; the container reached
`healthy`; no development/retired data was touched and no volumes were deleted.

### Delivered

- `packages/contracts/src/auth.ts`: owned auth DTO schemas hand-mapped to the
  active OpenAPI; `RoleInputSchema` is `{ role: 'DRIVER' }` (ADMIN operator-granted,
  retired OWNER excluded); `ProfileInputSchema` now matches OpenAPI optional
  `displayName`/`phone` with `minProperties: 1`. `packages/contracts/src/index.ts`
  still exports the shared `UserRoleSchema` without `OWNER`.
- `apps/api/src/modules/accounts/service.ts`: fixed the runtime `zod` and
  `OtpInputSchema` imports (the WIP file imported `z` type-only and omitted
  `OtpInputSchema`), replaced the invalid `z.coerce.object` page schema, and made
  `revokeFamily`/`revokeAllSessions` accept an interactive-transaction client and
  mark every family token both revoked and consumed so a replay cannot leave a
  live successor. Refresh/logout/reset now run those helpers inside one
  transaction (no nested `$transaction`). Removed the dead array-spread update in
  `resetPassword`. `requireAccount(req,res,next)` uses Express types and stores
  `CurrentAccount` on the request.
- `apps/api/src/modules/accounts/routes.ts` (new): strict IO/envelope routes for
  register, verify-email, resend-otp, login, refresh, logout, logout-all,
  sessions list/revoke, forgot-password, reset-password and `POST
/users/me/roles`. HttpOnly `drivehire_refresh` cookie (SameSite=Lax per
  docs/specification/09-authentication-security.md; Secure outside local, path
  `/api/v1/auth`). Reconciliation note: the owning plan, the auth specification
  and that specification's "HttpOnly SameSite=Lax" rule all specify Lax; the
  OpenAPI `Set-Cookie` description text says "SameSite=Strict". The two higher
  authorities (plan + specification) agree on Lax, so Lax is implemented; the
  OpenAPI descriptive text is left unchanged for the milestone review to decide.
  Non-DRIVER self-grant returns 403; unknown/missing role 400.
- `apps/api/src/app.ts`: single shared `HttpError` import from `errors.ts`
  (consistent classification), plus an optional real `accounts` dependency that
  mounts the router only when supplied, so foundation tests keep working without
  constructing unused business clients.

### Observed RED (before implementation)

`npm run test:integration -- apps/api/src/modules/accounts/auth.integration.test.ts`
→ 7/7 failed on real HTTP behavior (auth routes unmounted returned 404 where 202
was asserted; `refresh_...` timed out on the unconfigured path). Failure was a
real behavior assertion, not an unavailable suite.

### Observed GREEN (after implementation)

- Focused: same command → 7/7 passed (all named regressions executed).
- Full integration: `npm run test:integration` → 7 files, 34 tests passed, exit 0
  (prior Milestone01/02 suites remain green).
- `npm test` → 10 unit files / 34 tests + 1 contract test passed, exit 0.
- `npm run typecheck` → exit 0; `npm run lint` → exit 0 (boundaries verified);
  `npm run build` → contracts/api/web built, exit 0.
- `npm run docs:check` → exit 0 using the project-local Python 3.14.8
  (`%LOCALAPPDATA%\Programs\Python314`); 21 specs, 8 milestones, 26 FRs, 70 API
  operations, 26 screens resolved; OpenAPI validates.

### Infrastructure-blocked check

- `npm run format:check` exits 1 on this Windows checkout: Prettier reports
  "Code style issues found in 114 files", including untouched baseline files
  (`.prettierrc.json`, `AGENTS.md`, `README.md`, all specs). Cause is the local
  `core.autocrlf=true` (CRLF working tree) versus Prettier's default `lf`; the
  repository index stores LF and CI (Linux) is unaffected. `npx prettier --check
--end-of-line auto .` reports "All matched files use Prettier code style!",
  so no content formatting defect exists, including in every Task1-owned file.
  Task-owned files were additionally normalised with `prettier --write` for the
  three that had true content issues (service, auth test, contracts/auth).
  This is recorded as environment-blocked, not a passing result.

### Recorded commit

Task1 landed as `2c618ae` (`feat: account contracts and current authentication`),
authored by the configured Nipun Alwala <nipunalwala18@gmail.com> identity. It is
the only Task1 commit; the earlier `wip:` checkpoint `e70c10b` remains in history.

### Scope confirmation

Only Milestone03 Task1 files changed. No push, merge or deploy was performed.
Task2 (real auth email + own profiles), Task3 (screens/E2E), the whole-branch
review and the final `03-accounts.md` archive remain outstanding.

## Task2 implementation and evidence — 2026-10-18

Scope: the owning plan step "real authentication email + own profiles" — a real
SMTP transport, a durable encrypted outbox drained by the worker, and
self-service profile + DRIVER self-enable routes. Milestones01/02/03-Task1
preserved and not redone. Landed as `c0efd12` (`feat: durable authentication email
and own profiles`) on branch `opencode/accounts-auth`, authored by the configured
Nipun Alwala <nipunalwala18@gmail.com> identity.

### Delivered

- `apps/api/src/modules/accounts/outbox-crypto.ts` (new): AES-256-GCM
  `encryptOutboxSecret`/`decryptOutboxSecret` with `authEmailAad` binding a job to
  its recipient/type so ciphertext cannot be replayed across rows.
- `apps/api/src/adapters/smtp-mail.ts` (new): dependency-free SMTP client over
  `node:net`/`node:tls` (no new package; pins/lockfile untouched). Supports
  `SMTP_TLS=none|starttls|implicit`, AUTH PLAIN, dot-stuffing and bounded
  timeouts; `SmtpError` surfaces a non-secret code/path.
- `apps/api/src/modules/accounts/email-jobs.ts` (new): real durable delivery
  worker. `deliverAuthEmails` claims pending rows with
  `FOR UPDATE SKIP LOCKED`, decrypts outside the claim transaction, sends over
  SMTP and only marks `processed_at` after the transport accepts. Bounded
  exponential backoff (`MAX_ATTEMPTS=5`) plus dead-letter; at-least-once
  semantics; logs never include the raw code/token.
- `apps/api/src/modules/accounts/profile.ts` (new): `getProfile`/`updateProfile`/
  `enableDriver` (DRIVER self-grant only).
- `apps/api/src/modules/accounts/service.ts`: auth emails now write an encrypted
  outbox row atomically with the challenge/session mutation (`challengeId` inside
  the AEAD payload); direct `mail.send` calls removed so the worker is the single
  delivery path. `resetPassword` consumes the token and revokes sessions in one
  transaction. Refresh uses a conditional consume and, on a concurrent replay,
  revokes the whole family (revoked+consumed).
- `apps/api/src/modules/accounts/routes.ts`: added `GET /users/me`,
  `PATCH /users/me`, `POST /users/me/roles` (DRIVER only; ADMIN/OWNER rejected);
  dependencies reduced to `{ prisma }`.
- `apps/api/src/app.ts`, `server.ts`, `worker.ts`: composition wired —
  `AccountsDependencies = { prisma }`; the server constructs Prisma and
  disconnects it on shutdown; the worker composes `createSmtpMail` +
  `createAuthEmailDelivery` and drains on each heartbeat tick.
- `apps/api/src/config/env.ts`, `.env.example`: added `SMTP_TLS` and
  `AUTH_OUTBOX_KEY` (required in staging/production; ephemeral in test).

### Observed RED -> GREEN

- `apps/api/src/modules/accounts/email.integration.test.ts` (new) failed 6/7
  before this work (real behavior: no Mailpit message, jobs not drained, delivery
  row drained by the removed direct send). After implementation the focused suite
  is 7/7 passed. Named regressions now covered: `challenge_and_email_job_rollback_together`,
  `smtp_failure_not_marked_delivered`, `lease_retry_after_crash`,
  `mailpit_contains_working_expiring_one_use_link`, `raw_secret_not_in_payload_or_logs`,
  `profile_foreign404`, `no_OWNER_or_ADMIN_self_grant`.
- `auth.integration.test.ts`: added `concurrent_refresh_replay_revokes_family`
  (replays the same refresh cookie concurrently; at most one successor is minted
  and the family is revoked) and switched Task1 OTP reads to drain the real
  outbox. Suite is 8/8 passed.
- Full integration: `npm run test:integration` → 8 files, 42 tests passed, exit 0.
- `npm test` → 10 unit files / 34 tests + 1 contract test passed, exit 0.
- `npm run typecheck`, `npm run lint` (boundaries verified), `npm run build`
  (contracts/api/web), `npm run docs:check` (21 specs, 8 milestones, 26 FRs, 70
  API operations, 26 screens; OpenAPI validates) → all exit 0.

### format:check resolution

Added `"endOfLine": "auto"` to `.prettierrc.json` (repository index stays LF; the
Windows CRLF working tree no longer false-fails). `npm run format:check` now
reports "All matched files use Prettier code style!" — the previously
environment-blocked check now passes without any mass rewrite. Only the three
Task2-owned files with true content issues were normalised with `prettier --write`.

### Frontend handoff to Codex (Task3)

Backend/contracts are ready for the screens + first browser E2E. Codex owns all
Task3 UI/UX on the frontend; OpenCode will not implement or redesign screens.
Handoff facts:

- Profile routes: `GET /users/me` (200 self `UserDto`), `PATCH /users/me`
  (optional `displayName`/`phone`, `minProperties: 1`), `POST /users/me/roles`
  accepting `{ role: 'DRIVER' }` only (ADMIN/OWNER → 403; unknown/missing → 400).
- Verification uses the 6-digit OTP; the Mailpit message body contains a working
  expiring one-use link/text. Local Mailpit UI: `http://127.0.0.1:18025`.
- Dev cross-process runs need a shared `AUTH_OUTBOX_KEY` so the API writer and
  worker decrypt the same outbox rows.
- Uncovered transport modes: only `SMTP_TLS=none` is exercised by Mailpit;
  `starttls`/`implicit` are implemented but not yet integration-tested.

### Scope confirmation

Only Milestone03 Task2 files changed. No push, merge or deploy was performed.
Task3 (screens/E2E), the whole-branch review and the final `03-accounts.md`
archive remain outstanding; this milestone is not declared complete until the
Codex frontend and independent review land.
