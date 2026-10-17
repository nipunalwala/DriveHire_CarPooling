# Milestone08: Quality Deployment Audit Implementation Plan

Current integration workflow: work directly on `main`; push to `origin/main` after the phase is implemented, independently reviewed and verified. This owner instruction supersedes older no-push/branch wording. Preserve unfinished parallel files, inspect CI results and do not deploy production.

Execution ownership: follow [persistent agent responsibilities](../planning/agent-responsibilities.md). OpenCode uses verified free models for backend/contracts/tests; GPT-6.1 Sol in Codex owns frontend/UI/UX with Impeccable. Record frontend handoffs in the milestone ledger. ImageGen assets and provenance belong to07. Continue authorized tasks without routine phase approval; never mark pending frontend work complete.

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` for preserved native execution; use `superpowers:subagent-driven-development` only if the owner chooses delegated execution. Implement task-by-task with RED->GREEN, preserve prior passing suites and one final independent review. This plan needs owner review before implementation.

**Goal:** Prove integrated quality/security and available-environment deployment/restore readiness.

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

- Foreign IDs and forged roles across all private operations (Task1).
- Cookie/session/upload attack cases with real persistence (Task1).
- Worker interruption/restore cannot lose committed state/evidence (Task2).
- Missing production destination/secrets must not be called deployed (Task2).
- Deferred modules cannot re-enter release gates unnoticed (Task3).

## File responsibilities

Each task lists its owned files before steps. service files own business transactions; routes own strict IO/auth/envelopes; contracts own safe schemas/DTO types; adapters own actual external IO; feature UI owns task interaction; integration/E2E tests own persisted behavior evidence. Small cohesive files may be split within a listed module without changing its interface.

### Task 1: Integrated correctness and security release gate

**Files:** Create/modify `tests/e2e/release.spec.ts`, `apps/api/src/security/`, `docs/quality/security-review.md`, `docs/quality/acceptance-evidence.md`, `.github/workflows/ci.yml`. Preserve existing files where named; create missing module files. Tests are the integration/E2E files listed here.

**Interfaces:** Consumes all active requirements/OpenAPI/screens and earlier test evidence. Produces requirement->test->observed result matrix and no unmitigated Critical/High correctness/security finding. All named DTOs/inputs are generated or hand-mapped exactly to the active OpenAPI schemas in packages/contracts; Page<T> is {success:true,data:T[],meta:PageMeta} for list responses. Do not return Prisma rows directly.

- [ ] **Step1: Write failing behavioral regressions.** Named cases and assertions: real_driver_hire_and_carpool_cross_role_journeys; foreign_object_and_role_spoof_matrix; CSRF_origin_cookie_and_refresh_replay; upload_polyglot_traversal_and_private_download; stale_versions_and_concurrency_suite; unsupported_routes404_not_placeholder200. Check26 active FRs,70 operations and26 screens dynamically from model.
      **Assertion anchor:** Bind foreignResponses to the real HTTP negative object-access matrix and highFindings to the recorded security review inventory. These assertions belong inside the named behavioral tests above; setup/fixtures must exercise the real implementation.

```ts
expect(foreignResponses.every((response) => [403, 404].includes(response.status))).toBe(true);
expect(highFindings.filter((finding) => !finding.mitigated)).toHaveLength(0);
```

- [ ] **Step2: Run the focused command before implementation.** Run `npm test && npm run test:integration && npm run db:test:constraints && npm run test:e2e && npm run typecheck && npm run lint && npm run docs:check && npm run build`. Expected: FAIL because the named behavior/schema/route does not exist or violates its assertion. An unavailable-suite exit2 is a prerequisite failure, not a meaningful RED test: install/wire the real runner in this task, rerun and observe an actual behavior assertion fail. No green claim from compilation/source inspection alone.
- [ ] **Step3: Implement the smallest complete behavior.** Complete missing negative tests, dependency audit and actual browser checks; remediation follows regression-first. No removed-module acceptance gates. Verify actual endpoint coverage rather than declarations. Remote CI results require an actual remote run; local command equivalence remains labeled.
- [ ] **Step4: Run the focused command again.** Run `npm test && npm run test:integration && npm run db:test:constraints && npm run test:e2e && npm run typecheck && npm run lint && npm run docs:check && npm run build`. Expected: PASS; every named regression and its persisted/visible assertions executed, no skipped/future-suite success. Also run `npm test`, `npm run typecheck`, `npm run lint`, `npm run docs:check`, `npm run format:check` and `npm run build`; include prior integration/E2E suites after their introduction. Expected: all implemented suites exit0. Observe each output, investigate failures, never count unavailable suites as passing.
- [ ] **Step5: Commit the deliverable and update this milestone's execution ledger.** Stage only task-owned changes and tests; commit as `feat: integrated correctness and security release gate` (use `docs:`/`test:` when no product code changes). Record observed RED/GREEN and full-suite results. Do not merge/push as an incidental task step.

### Task 2: Deployable artifacts and restore rehearsal

**Files:** Create/modify `docker/Dockerfile`, `compose.yml`, `docs/operations/deployment.md`, `docs/operations/backup-restore.md`, `scripts/restore-check.mjs`, `docs/quality/restore-evidence.md`. Preserve existing files where named; create missing module files. Tests are the integration/E2E files listed here.

**Interfaces:** Consumes locked builds/migrations, configured environment and isolated restore target. Produces tested container startup/shutdown, actual DB+private-file backup/restore procedure and measured recovery evidence. Production credentials/destination are owner supplied. All named DTOs/inputs are generated or hand-mapped exactly to the active OpenAPI schemas in packages/contracts; Page<T> is {success:true,data:T[],meta:PageMeta} for list responses. Do not return Prisma rows directly.

- [ ] **Step1: Write failing behavioral regressions.** Named cases and assertions: nonroot_containers_health_and_ready; migration_before_ready; active_request_and_job_shutdown_recovers; restore_preserves_users_quotes_bookings_participation_private_evidence_and_history; runtime_privilege_and_private_static_boundary_after_restore; missing_key_or_scan_service_fails_honestly.
      **Assertion anchor:** Bind before and restored to deterministic snapshots of domain IDs/relationships/history and evidence content hashes from source and isolated restored environment. These assertions belong inside the named behavioral tests above; setup/fixtures must exercise the real implementation.

```ts
expect(restored.domainSnapshot).toEqual(before.domainSnapshot);
expect(restored.evidenceHashes).toEqual(before.evidenceHashes);
```

- [ ] **Step2: Run the focused command before implementation.** Run `docker compose --profile application build && npm run test:integration && npm run infra:check`. Expected: FAIL because the named behavior/schema/route does not exist or violates its assertion. An unavailable-suite exit2 is a prerequisite failure, not a meaningful RED test: install/wire the real runner in this task, rerun and observe an actual behavior assertion fail. No green claim from compilation/source inspection alone.
- [ ] **Step3: Implement the smallest complete behavior.** Rehearse backup/restore into explicitly dedicated disposable local/staging target, never overwrite original DB/storage. Record backup command, encryption-key recovery dependency, measured duration, integrity queries and content checks. If destination/secrets absent, deliver verified local artifacts and identify blocked production evidence; do not claim deployment.
- [ ] **Step4: Run the focused command again.** Run `docker compose --profile application build && npm run test:integration && npm run infra:check`. Expected: PASS; every named regression and its persisted/visible assertions executed, no skipped/future-suite success. Also run `npm test`, `npm run typecheck`, `npm run lint`, `npm run docs:check`, `npm run format:check` and `npm run build`; include prior integration/E2E suites after their introduction. Expected: all implemented suites exit0. Observe each output, investigate failures, never count unavailable suites as passing.
- [ ] **Step5: Commit the deliverable and update this milestone's execution ledger.** Stage only task-owned changes and tests; commit as `feat: deployable artifacts and restore rehearsal` (use `docs:`/`test:` when no product code changes). Record observed RED/GREEN and full-suite results. Do not merge/push as an incidental task step.

### Task 3: Final lean release audit and handoff

**Files:** Create/modify `docs/quality/phase-handoffs/08-release.md`, `docs/planning/approval-log.md`, `README.md`, `docs/planning/roadmap.md`. Preserve existing files where named; create missing module files. Tests are the integration/E2E files listed here.

**Interfaces:** Consumes acceptance matrix, security/restore/browser evidence and immutable phase handoffs. Produces release readiness decision with exact remaining risks and deferred-module inventory, plus integration choice for owner. All named DTOs/inputs are generated or hand-mapped exactly to the active OpenAPI schemas in packages/contracts; Page<T> is {success:true,data:T[],meta:PageMeta} for list responses. Do not return Prisma rows directly.

- [ ] **Step1: Write failing behavioral regressions.** Named cases and assertions: all_active_requirements_have_observed_evidence; no_unmitigated_critical_high; deferred_scope_absent_from_active_contract_schema_screens; generated_assets_provenance_complete; no_future_suite_or_production_false_claim.
      **Assertion anchor:** Bind missingEvidence to the active FR/test evidence reconciliation and unmitigated to the final Critical/High finding inventory. These assertions belong inside the named behavioral tests above; setup/fixtures must exercise the real implementation.

```ts
expect(missingEvidence).toEqual([]);
expect(unmitigated).toEqual([]);
```

- [ ] **Step2: Run the focused command before implementation.** Run `npm run docs:check && npm run format:check && git diff --check`. Expected: FAIL because the named behavior/schema/route does not exist or violates its assertion. An unavailable-suite exit2 is a prerequisite failure, not a meaningful RED test: install/wire the real runner in this task, rerun and observe an actual behavior assertion fail. No green claim from compilation/source inspection alone.
- [ ] **Step3: Implement the smallest complete behavior.** Use verification-before-completion and one independent whole-branch review under native Superpowers execution; fix Important findings via RED->GREEN and green suites. Archive execution ledger; preserve repository history. Present integration decision and require separate production authorization.
- [ ] **Step4: Run the focused command again.** Run `npm run docs:check && npm run format:check && git diff --check`. Expected: PASS; every named regression and its persisted/visible assertions executed, no skipped/future-suite success. Also run `npm test`, `npm run typecheck`, `npm run lint`, `npm run docs:check`, `npm run format:check` and `npm run build`; include prior integration/E2E suites after their introduction. Expected: all implemented suites exit0. Observe each output, investigate failures, never count unavailable suites as passing.
- [ ] **Step5: Commit the deliverable and update this milestone's execution ledger.** Stage only task-owned changes and tests; commit as `feat: final lean release audit and handoff` (use `docs:`/`test:` when no product code changes). Record observed RED/GREEN and full-suite results. Do not merge/push as an incidental task step.

## Milestone completion

Run the full applicable suite, archive exact evidence in docs/quality/phase-handoffs/, and perform the one independent whole-branch review required by native execution. Re-grade findings, fix Important/Critical in one test-first pass with green suites; record rulings/deferred minors. Archive the ledger before deleting only this plan’s scratch folder. Use finishing-a-development-branch; no automatic main merge or production launch. Advance to the next milestone only after current deliverables actually work.
