# Milestone04: Provider Onboarding Admin Implementation Plan

Current integration workflow: work directly on `main`; push to `origin/main` after the phase is implemented, independently reviewed and verified. This owner instruction supersedes older no-push/branch wording. Preserve unfinished parallel files, inspect CI results and do not deploy production.

Execution ownership: follow [persistent agent responsibilities](../planning/agent-responsibilities.md). OpenCode uses verified free models for backend/contracts/tests; GPT-6.1 Sol in Codex owns frontend/UI/UX with Impeccable. Record frontend handoffs in the milestone ledger. ImageGen assets and provenance belong to07. Continue authorized tasks without routine phase approval; never mark pending frontend work complete.

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` for preserved native execution; use `superpowers:subagent-driven-development` only if the owner chooses delegated execution. Implement task-by-task with RED->GREEN, preserve prior passing suites and one final independent review. This plan needs owner review before implementation.

**Goal:** Deliver driver/personal-vehicle qualification, private evidence and minimal administrator review.

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

- MIME spoof/private quarantine cannot become public content (Task1).
- Expiry blocks eligibility even when reconciliation job is stopped (Task1).
- Stale revision cannot approve newer evidence (Task2).
- Self/last-admin actions and direct foreign object URLs remain denied (Tasks2/3).
- A passenger registers personal vehicle without OWNER role or fleet fields (Task3).

## File responsibilities

Each task lists its owned files before steps. service files own business transactions; routes own strict IO/auth/envelopes; contracts own safe schemas/DTO types; adapters own actual external IO; feature UI owns task interaction; integration/E2E tests own persisted behavior evidence. Small cohesive files may be split within a listed module without changing its interface.

### Task 1: Private evidence and qualification services

**Files:** Create/modify `apps/api/src/adapters/private-storage.ts`, `apps/api/src/adapters/clamav-scan.ts`, `apps/api/src/modules/providers/service.ts`, `apps/api/src/modules/providers/routes.ts`, `packages/contracts/src/providers.ts`, `apps/api/src/modules/providers/qualification.integration.test.ts`. Preserve existing files where named; create missing module files. Tests are the integration/E2E files listed here.

**Interfaces:** Consumes CurrentAccount, Prisma and existing StorageAdapter/ScanAdapter interfaces unchanged. Produces provider routes for own driver/personal vehicles/documents and submitVerification(account,input):Promise<VerificationDto>; public approved driver search/detail; vehicle list at /users/me/vehicles without OWNER requirement. All named DTOs/inputs are generated or hand-mapped exactly to the active OpenAPI schemas in packages/contracts; Page<T> is {success:true,data:T[],meta:PageMeta} for list responses. Do not return Prisma rows directly.

- [ ] **Step1: Write failing behavioral regressions.** Named cases and assertions: foreign_file_and_vehicle404; MIME_magic_spoof_rejected; size_above5MiB413; quarantine_not_downloadable; scanner_failure_blocks_submission; real_eicar_rejected; material_edit_with_hold409; expired_approval_unusable_even_if_worker_paused. Assert actual disk/scan state and authorized content response.
      **Assertion anchor:** Bind foreignDownload and quarantinedDownload to real HTTP requests by a foreign account and the document owner respectively. These assertions belong inside the named behavioral tests above; setup/fixtures must exercise the real implementation.

```ts
expect(foreignDownload.status).toBe(404);
expect(quarantinedDownload.status).not.toBe(200);
```

- [ ] **Step2: Run the focused command before implementation.** Run `npm run test:integration -- apps/api/src/modules/providers/qualification.integration.test.ts`. Expected: FAIL because the named behavior/schema/route does not exist or violates its assertion. An unavailable-suite exit2 is a prerequisite failure, not a meaningful RED test: install/wire the real runner in this task, rerun and observe an actual behavior assertion fail. No green claim from compilation/source inspection alone.
- [ ] **Step3: Implement the smallest complete behavior.** JPEG/PNG/WebP/PDF allowlist with magic validation, re-encode images/strip metadata, private opaque storage key, CLEAN-only snapshots and current-revision CAS. Never static evidence URLs. Registration/license encryption and digests; no arbitrary extra fields: strict active OpenAPI only. Implement scan/orphan/qualification expiry jobs only with real handlers.
- [ ] **Step4: Run the focused command again.** Run `npm run test:integration -- apps/api/src/modules/providers/qualification.integration.test.ts`. Expected: PASS; every named regression and its persisted/visible assertions executed, no skipped/future-suite success. Also run `npm test`, `npm run typecheck`, `npm run lint`, `npm run docs:check`, `npm run format:check` and `npm run build`; include prior integration/E2E suites after their introduction. Expected: all implemented suites exit0. Observe each output, investigate failures, never count unavailable suites as passing.
- [ ] **Step5: Commit the deliverable and update this milestone's execution ledger.** Stage only task-owned changes and tests; commit as `feat: private evidence and qualification services` (use `docs:`/`test:` when no product code changes). Record observed RED/GREEN and full-suite results. Do not merge/push as an incidental task step.

### Task 2: Minimal administrator APIs and evidence review

**Files:** Create/modify `apps/api/src/modules/admin/service.ts`, `apps/api/src/modules/admin/routes.ts`, `apps/api/src/modules/admin/admin.integration.test.ts`, `apps/api/src/modules/providers/availability.ts`. Preserve existing files where named; create missing module files. Tests are the integration/E2E files listed here.

**Interfaces:** Consumes requireAccount and qualification transaction helpers. Produces requireAdmin middleware; decideVerification(account,id,input):Promise<VerificationDto>, suspendUser/reactivateUser APIs, appendAudit(tx,input):Promise<void> and own driver availability/listing routes. Suspension initially resolves existing supported rows and is extended/tested when booking/carpool services arrive. All named DTOs/inputs are generated or hand-mapped exactly to the active OpenAPI schemas in packages/contracts; Page<T> is {success:true,data:T[],meta:PageMeta} for list responses. Do not return Prisma rows directly.

- [ ] **Step1: Write failing behavioral regressions.** Named cases and assertions: self_approval403; last_admin_suspend409; foreign_role403; stale_revision409; sensitive_read_appends_safe_audit; runtime_audit_update_denied; suspended_sessions_immediately_invalid; driver_block_overlap23P01; remove_available_window_with_hold409.
      **Assertion anchor:** Bind selfApproval and lastAdminSuspension to authenticated administrator HTTP calls. These assertions belong inside the named behavioral tests above; setup/fixtures must exercise the real implementation.

```ts
expect(selfApproval.status).toBe(403);
expect(lastAdminSuspension.status).toBe(409);
```

- [ ] **Step2: Run the focused command before implementation.** Run `npm run test:integration -- apps/api/src/modules/admin/admin.integration.test.ts`. Expected: FAIL because the named behavior/schema/route does not exist or violates its assertion. An unavailable-suite exit2 is a prerequisite failure, not a meaningful RED test: install/wire the real runner in this task, rerun and observe an actual behavior assertion fail. No green claim from compilation/source inspection alone.
- [ ] **Step3: Implement the smallest complete behavior.** Current role/status DB checks, explicit reasons, immutable audit and safe pagination. Driver AVAILABLE/BLOCKED windows under shared resource locks. No fleet availability, reports, complaints or notification placeholders. Public search only valid approved accepting drivers with optional full-interval availability.
- [ ] **Step4: Run the focused command again.** Run `npm run test:integration -- apps/api/src/modules/admin/admin.integration.test.ts`. Expected: PASS; every named regression and its persisted/visible assertions executed, no skipped/future-suite success. Also run `npm test`, `npm run typecheck`, `npm run lint`, `npm run docs:check`, `npm run format:check` and `npm run build`; include prior integration/E2E suites after their introduction. Expected: all implemented suites exit0. Observe each output, investigate failures, never count unavailable suites as passing.
- [ ] **Step5: Commit the deliverable and update this milestone's execution ledger.** Stage only task-owned changes and tests; commit as `feat: minimal administrator apis and evidence review` (use `docs:`/`test:` when no product code changes). Record observed RED/GREEN and full-suite results. Do not merge/push as an incidental task step.

### Task 3: Onboarding and review screens

**Files:** Create/modify `apps/web/src/features/providers/`, `apps/web/src/features/admin/verification/`, `apps/web/src/features/admin/users/`, `apps/web/src/App.tsx`, `tests/e2e/providers.spec.ts`. Preserve existing files where named; create missing module files. Tests are the integration/E2E files listed here.

**Interfaces:** Consumes ApiClient, shared UI and provider/admin DTOs. Produces personal-vehicles, driver-verification, driver-availability, admin-users and admin-verification surfaces. ADMIN/DRIVER navigation is capability guarded; personal vehicles available to verified passenger or driver. All named DTOs/inputs are generated or hand-mapped exactly to the active OpenAPI schemas in packages/contracts; Page<T> is {success:true,data:T[],meta:PageMeta} for list responses. Do not return Prisma rows directly.

- [ ] **Step1: Write failing behavioral regressions.** Named cases and assertions: passenger_register_vehicle_admin_approves_browser; driver_upload_scan_submit_admin_review_browser; rejected_revision_corrected_resubmitted; foreign_evidence_not_exposed; stale_review_preserves_context; keyboard_upload_errors_and_status_readable. Use actual scanner/API/storage.
      **Assertion anchor:** Use actual uploaded evidence and the verification queue browser flow. These assertions belong inside the named behavioral tests above; setup/fixtures must exercise the real implementation.

```ts
await expect(page.getByText('APPROVED', { exact: true })).toBeVisible();
await expect(page.getByRole('link', { name: /owner dashboard/i })).toHaveCount(0);
```

- [ ] **Step2: Run the focused command before implementation.** Run `npm run test:e2e -- tests/e2e/providers.spec.ts`. Expected: FAIL because the named behavior/schema/route does not exist or violates its assertion. An unavailable-suite exit2 is a prerequisite failure, not a meaningful RED test: install/wire the real runner in this task, rerun and observe an actual behavior assertion fail. No green claim from compilation/source inspection alone.
- [ ] **Step3: Implement the smallest complete behavior.** Compact forms/tables, separate role from approval status, contextual pending/rejected/expired recovery, input preservation. Single verification queue with driver/vehicle filters; no owner dashboard or fake status polling success. Extend negative HTTP tests for every mounted route.
- [ ] **Step4: Run the focused command again.** Run `npm run test:e2e -- tests/e2e/providers.spec.ts`. Expected: PASS; every named regression and its persisted/visible assertions executed, no skipped/future-suite success. Also run `npm test`, `npm run typecheck`, `npm run lint`, `npm run docs:check`, `npm run format:check` and `npm run build`; include prior integration/E2E suites after their introduction. Expected: all implemented suites exit0. Observe each output, investigate failures, never count unavailable suites as passing.
- [ ] **Step5: Commit the deliverable and update this milestone's execution ledger.** Stage only task-owned changes and tests; commit as `feat: onboarding and review screens` (use `docs:`/`test:` when no product code changes). Record observed RED/GREEN and full-suite results. Do not merge/push as an incidental task step.

## Milestone completion

Run the full applicable suite, archive exact evidence in docs/quality/phase-handoffs/, and perform the one independent whole-branch review required by native execution. Re-grade findings, fix Important/Critical in one test-first pass with green suites; record rulings/deferred minors. Archive the ledger before deleting only this plan’s scratch folder. Use finishing-a-development-branch; no automatic main merge or production launch. Advance to the next milestone only after current deliverables actually work.
