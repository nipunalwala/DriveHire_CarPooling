# Milestone03: Accounts Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` for preserved native execution; use `superpowers:subagent-driven-development` only if the owner chooses delegated execution. Implement task-by-task with RED->GREEN, preserve prior passing suites and one final independent review. This plan needs owner review before implementation.

**Goal:** Deliver working accounts, current permissions and profile/authentication screens.

**Architecture:** Existing Express API/worker and React client share browser-safe contracts; PostgreSQL owns current state and invariants. Deliver a usable vertical journey within this subsystem; never claim unimplemented future behavior.

**Tech Stack:** Existing React/Vite/TypeScript/Tailwind, Express/Prisma/PostgreSQL, Vitest/RTL/Supertest, Docker and real browser E2E when introduced in03.

**Spec:** `docs/superpowers/specs/2026-10-17-lean-first-release-design.md`, current `docs/specification/`, `docs/api/openapi.json`, `docs/planning-model.json` and `docs/planning/screens.json`.

## Global Constraints

- Same existing repository; preserve completed Phase01. No main merge, push or production launch without the chosen integration action.
- Node24.22.0/npm11.19.1 baseline; strict TypeScript, exact lockfile and browser-safe contracts. Use project-local Windows runtime when system Node is older.
- Only DRIVER_HIRE, INSTANT seats and PASSENGER/DRIVER/ADMIN. Ownership is users.id, with no owner profile/dashboard. Deferred inventory is excluded from implementation/acceptance.
- INR integer paise; maximum stored amount100000000. “Payment not collected by DriveHire.” No payments/maps/GPS/navigation.
- Preserve server/object authorization, private evidence, immutable audit/history, resource exclusions, seat limits, version CAS and idempotency. No fake adapters, endpoints or passing placeholder suites.
- Test services are dedicated drivehire_test; never dev/retired database. No external IO while holding domain locks. Preserve all prior passing tests.
- Use Superpowers test-first native execution and one independent whole-branch review. Use Impeccable for frontend work and imagegen for committed original project raster assets in07.

## Review Focus

- Concurrent refresh/replay must not leave a valid successor after family revocation (Task1).
- Suspended or reset account cannot reuse an earlier JWT (Task1).
- SMTP acceptance failure/crash must not silently complete auth mail (Task2).
- Expired session and invalid input preserve safe navigation/focus (Task3).
- Shared backend NODE_ENV cannot produce development React in production build (Task3).

## File responsibilities

Each task lists its owned files before steps. service files own business transactions; routes own strict IO/auth/envelopes; contracts own safe schemas/DTO types; adapters own actual external IO; feature UI owns task interaction; integration/E2E tests own persisted behavior evidence. Small cohesive files may be split within a listed module without changing its interface.

### Task 1: Account contracts and current authentication

**Files:** Create/modify `packages/contracts/src/auth.ts`, `packages/contracts/src/index.ts`, `apps/api/src/modules/accounts/service.ts`, `apps/api/src/modules/accounts/routes.ts`, `apps/api/src/modules/accounts/auth.integration.test.ts`, `apps/api/src/app.ts`. Preserve existing files where named; create missing module files. Tests are the integration/E2E files listed here.

**Interfaces:** Consumes Prisma client and active OpenAPI. Produces requireAccount(req,res,next):void with CurrentAccount {userId:string,roles:UserRole[],sessionId:string}; UserRole=PASSENGER|DRIVER|ADMIN. register, verifyEmail, login, refresh, logout, logoutAll, listSessions, revokeSession, forgotPassword/resetPassword contracts match OpenAPI. All named DTOs/inputs are generated or hand-mapped exactly to the active OpenAPI schemas in packages/contracts; Page<T> is {success:true,data:T[],meta:PageMeta} for list responses. Do not return Prisma rows directly.

- [ ] **Step1: Write failing behavioral regressions.** Named cases and assertions: refresh_same_token_race_revokes_family; suspended_jwt_fails_next_request; sixth_bad_otp_cannot_verify; reset_token_one_use_revokes_sessions; public_owner_admin_grant_rejected; generic_unknown_email_ack; foreign_session404. Assert statuses/envelopes and persisted token-family state; no raw token in logs.
      **Assertion anchor:** Bind replay to the actual second HTTP refresh with the consumed cookie, and successorUse to the subsequent protected HTTP request. These assertions belong inside the named behavioral tests above; setup/fixtures must exercise the real implementation.

```ts
expect(replay.status).toBe(401);
expect(successorUse.status).toBe(401);
```

- [ ] **Step2: Run the focused command before implementation.** Run `npm run test:integration -- apps/api/src/modules/accounts/auth.integration.test.ts`. Expected: FAIL because the named behavior/schema/route does not exist or violates its assertion. An unavailable-suite exit2 is a prerequisite failure, not a meaningful RED test: install/wire the real runner in this task, rerun and observe an actual behavior assertion fail. No green claim from compilation/source inspection alone.
- [ ] **Step3: Implement the smallest complete behavior.** Remove retired OWNER from implemented shared role schema with RED regression. Argon2id,15minute access,30day fixed refresh family, HttpOnly Lax cookie/Secure outside local, Origin check, hashed refresh/reset tokens, OTP10minutes/5attempts/60second resend. Mount routes via optional real dependencies in createApp; retain foundation tests without constructing unused business clients.
- [ ] **Step4: Run the focused command again.** Run `npm run test:integration -- apps/api/src/modules/accounts/auth.integration.test.ts`. Expected: PASS; every named regression and its persisted/visible assertions executed, no skipped/future-suite success. Also run `npm test`, `npm run typecheck`, `npm run lint`, `npm run docs:check`, `npm run format:check` and `npm run build`; include prior integration/E2E suites after their introduction. Expected: all implemented suites exit0. Observe each output, investigate failures, never count unavailable suites as passing.
- [ ] **Step5: Commit the deliverable and update this milestone's execution ledger.** Stage only task-owned changes and tests; commit as `feat: account contracts and current authentication` (use `docs:`/`test:` when no product code changes). Record observed RED/GREEN and full-suite results. Do not merge/push as an incidental task step.

### Task 2: Real authentication email and own profiles

**Files:** Create/modify `apps/api/src/modules/accounts/email-jobs.ts`, `apps/api/src/adapters/smtp-mail.ts`, `apps/api/src/modules/accounts/profile.ts`, `apps/api/src/worker.ts`, `apps/api/src/config/env.ts`, `.env.example`, `apps/api/src/modules/accounts/email.integration.test.ts`. Preserve existing files where named; create missing module files. Tests are the integration/E2E files listed here.

**Interfaces:** Consumes MailAdapter.send from existing ports and Prisma transactions. Produces deliverAuthEmails(signal:AbortSignal):Promise<void> worker task; updateProfile(account:CurrentAccount,input:ProfileInput):Promise<UserDto>; enableDriver(account):Promise<UserDto>. Auth email types only AUTH_VERIFY_EMAIL/AUTH_RESET_PASSWORD. All named DTOs/inputs are generated or hand-mapped exactly to the active OpenAPI schemas in packages/contracts; Page<T> is {success:true,data:T[],meta:PageMeta} for list responses. Do not return Prisma rows directly.

- [ ] **Step1: Write failing behavioral regressions.** Named cases and assertions: challenge_and_email_job_rollback_together; smtp_failure_not_marked_delivered; lease_retry_after_crash; mailpit_contains_working_expiring_one_use_link; raw_secret_not_in_safe_payload_or_logs; profile_foreign404; no_OWNER_or_ADMIN_self_grant. Inspect actual Mailpit message, not a mocked send success.
      **Assertion anchor:** After real SMTP failure bind outboxRow from PostgreSQL and logs from the safe logger destination. These assertions belong inside the named behavioral tests above; setup/fixtures must exercise the real implementation.

```ts
expect(outboxRow.processed_at).toBeNull();
expect(logs).not.toContain(resetToken);
```

- [ ] **Step2: Run the focused command before implementation.** Run `npm run test:integration -- apps/api/src/modules/accounts/email.integration.test.ts`. Expected: FAIL because the named behavior/schema/route does not exist or violates its assertion. An unavailable-suite exit2 is a prerequisite failure, not a meaningful RED test: install/wire the real runner in this task, rerun and observe an actual behavior assertion fail. No green claim from compilation/source inspection alone.
- [ ] **Step3: Implement the smallest complete behavior.** Encrypted outbox secret with configured private AEAD key; durable lease and bounded exponential retry; SMTP IO outside locks, mark processed only after acceptance. No recipient/channel subsystem. Own profile/session APIs and DRIVER capability only. Register concrete handler in worker and ensure drain/reclaim behavior.
- [ ] **Step4: Run the focused command again.** Run `npm run test:integration -- apps/api/src/modules/accounts/email.integration.test.ts`. Expected: PASS; every named regression and its persisted/visible assertions executed, no skipped/future-suite success. Also run `npm test`, `npm run typecheck`, `npm run lint`, `npm run docs:check`, `npm run format:check` and `npm run build`; include prior integration/E2E suites after their introduction. Expected: all implemented suites exit0. Observe each output, investigate failures, never count unavailable suites as passing.
- [ ] **Step5: Commit the deliverable and update this milestone's execution ledger.** Stage only task-owned changes and tests; commit as `feat: real authentication email and own profiles` (use `docs:`/`test:` when no product code changes). Record observed RED/GREEN and full-suite results. Do not merge/push as an incidental task step.

### Task 3: Authentication screens and first browser journey

**Files:** Create/modify `apps/web/src/api/client.ts`, `apps/web/src/auth/AuthProvider.tsx`, `apps/web/src/components/ui/`, `apps/web/src/features/auth/`, `apps/web/src/features/profile/`, `apps/web/src/App.tsx`, `playwright.config.ts`, `tests/e2e/auth.spec.ts`, `package.json`. Preserve existing files where named; create missing module files. Tests are the integration/E2E files listed here.

**Interfaces:** Consumes active auth/profile DTOs and same-origin /api/v1. Produces ApiClient with request<T>(path:string,init?:RequestInit):Promise<T>, in-memory auth context and ProtectedRoute; shared Button, Field, ErrorState, EmptyState used by subsequent milestones. Refresh is single-flight across tabs using browser locking/channel coordination. All named DTOs/inputs are generated or hand-mapped exactly to the active OpenAPI schemas in packages/contracts; Page<T> is {success:true,data:T[],meta:PageMeta} for list responses. Do not return Prisma rows directly.

- [ ] **Step1: Write failing behavioral regressions.** Named cases and assertions: register_verify_login_profile_logout_browser: actual Mailpit OTP/API/DB; reset_browser_revokes_old_session; protected_navigation_redirects_and_returns; invalid_fields_keyboard_error_focus; failed_refresh_returns_login_once; production_resolution_keeps_react_production. No access/refresh token stored in localStorage.
      **Assertion anchor:** Use the browser page after successful login; access-token storage is forbidden. These assertions belong inside the named behavioral tests above; setup/fixtures must exercise the real implementation.

```ts
await expect(page.getByRole('heading', { name: /profile/i })).toBeVisible();
expect(await page.evaluate(() => localStorage.getItem('accessToken'))).toBeNull();
```

- [ ] **Step2: Run the focused command before implementation.** Run `npm run test:e2e -- tests/e2e/auth.spec.ts`. Expected: FAIL because the named behavior/schema/route does not exist or violates its assertion. An unavailable-suite exit2 is a prerequisite failure, not a meaningful RED test: install/wire the real runner in this task, rerun and observe an actual behavior assertion fail. No green claim from compilation/source inspection alone.
- [ ] **Step3: Implement the smallest complete behavior.** Use Impeccable tokens/shared shells now; generated imagery remains07. Add real Playwright runner and replace E2E unavailable script only when executable. Screens: register, verify-email, login, forgot-password, reset-password, profile. Configure test-owned web/API/worker and isolated DB lifecycle; secrets never printed. Preserve production Vite environment regression.
- [ ] **Step4: Run the focused command again.** Run `npm run test:e2e -- tests/e2e/auth.spec.ts`. Expected: PASS; every named regression and its persisted/visible assertions executed, no skipped/future-suite success. Also run `npm test`, `npm run typecheck`, `npm run lint`, `npm run docs:check`, `npm run format:check` and `npm run build`; include prior integration/E2E suites after their introduction. Expected: all implemented suites exit0. Observe each output, investigate failures, never count unavailable suites as passing.
- [ ] **Step5: Commit the deliverable and update this milestone's execution ledger.** Stage only task-owned changes and tests; commit as `feat: authentication screens and first browser journey` (use `docs:`/`test:` when no product code changes). Record observed RED/GREEN and full-suite results. Do not merge/push as an incidental task step.

## Milestone completion

Run the full applicable suite, archive exact evidence in docs/quality/phase-handoffs/, and perform the one independent whole-branch review required by native execution. Re-grade findings, fix Important/Critical in one test-first pass with green suites; record rulings/deferred minors. Archive the ledger before deleting only this plan’s scratch folder. Use finishing-a-development-branch; no automatic main merge or production launch. Advance to the next milestone only after current deliverables actually work.
