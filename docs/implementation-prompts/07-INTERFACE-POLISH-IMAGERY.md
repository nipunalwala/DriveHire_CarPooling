# Milestone07: Interface Polish Imagery Implementation Plan

Execution ownership: follow [persistent agent responsibilities](../planning/agent-responsibilities.md). OpenCode uses verified free models for backend/contracts/tests; GPT-6.1 Sol in Codex owns frontend/UI/UX with Impeccable. Record frontend handoffs in the milestone ledger. ImageGen assets and provenance belong to07. Continue authorized tasks without routine phase approval; never mark pending frontend work complete.

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` for preserved native execution; use `superpowers:subagent-driven-development` only if the owner chooses delegated execution. Implement task-by-task with RED->GREEN, preserve prior passing suites and one final independent review. This plan needs owner review before implementation.

**Goal:** Polish the retained journeys with Impeccable, generated imagery and consistent recovery states.

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

- Keyboard/focus and320px layout on actual forms (Task1).
- Reduced-motion and text/control contrast are verified (Task1).
- Image crops/alt/dimensions and original provenance survive optimization (Task2).
- Expired sessions and unavailable services preserve recoverable input (Task3).
- Retry/offline recovery cannot duplicate hire or seat actions (Task3).

## File responsibilities

Each task lists its owned files before steps. service files own business transactions; routes own strict IO/auth/envelopes; contracts own safe schemas/DTO types; adapters own actual external IO; feature UI owns task interaction; integration/E2E tests own persisted behavior evidence. Small cohesive files may be split within a listed module without changing its interface.

### Task 1: Impeccable usability and visual system pass

**Files:** Create/modify `apps/web/src/styles.css`, `apps/web/src/components/ui/`, `apps/web/src/features/`, `PRODUCT.md`, `docs/design/lean-ui-review.md`, `tests/e2e/accessibility.spec.ts`. Preserve existing files where named; create missing module files. Tests are the integration/E2E files listed here.

**Interfaces:** Consumes all working journeys and existing shared controls. Produces consistent tokens, typography, responsive shells and state treatments without changing API/business rules. All named DTOs/inputs are generated or hand-mapped exactly to the active OpenAPI schemas in packages/contracts; Page<T> is {success:true,data:T[],meta:PageMeta} for list responses. Do not return Prisma rows directly.

- [ ] **Step1: Write failing behavioral regressions.** Named cases and assertions: keyboard_auth_provider_booking_carpool_and_admin_flows; focus_moves_to_error_and_route_heading;320px_no_horizontal_page_overflow; contrast_AA_for_text_controls; reduced_motion_preference_respected. Automated checks plus recorded manual browser evidence.
      **Assertion anchor:** Use the real browser page for each shared form at320px viewport; test keyboard focus separately. These assertions belong inside the named behavioral tests above; setup/fixtures must exercise the real implementation.

```ts
await page.setViewportSize({ width: 320, height: 800 });
expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
```

- [ ] **Step2: Run the focused command before implementation.** Run `npm run test:e2e -- tests/e2e/accessibility.spec.ts`. Expected: FAIL because the named behavior/schema/route does not exist or violates its assertion. An unavailable-suite exit2 is a prerequisite failure, not a meaningful RED test: install/wire the real runner in this task, rerun and observe an actual behavior assertion fail. No green claim from compilation/source inspection alone.
- [ ] **Step3: Implement the smallest complete behavior.** Use Impeccable craft guidance and inspect real pages in browser. Fix hierarchy, content, focus, labels, spacing and recovery; remove references to deferred modules. Keep motion restrained; no decorative dashboards or fabricated activity metrics.
- [ ] **Step4: Run the focused command again.** Run `npm run test:e2e -- tests/e2e/accessibility.spec.ts`. Expected: PASS; every named regression and its persisted/visible assertions executed, no skipped/future-suite success. Also run `npm test`, `npm run typecheck`, `npm run lint`, `npm run docs:check`, `npm run format:check` and `npm run build`; include prior integration/E2E suites after their introduction. Expected: all implemented suites exit0. Observe each output, investigate failures, never count unavailable suites as passing.
- [ ] **Step5: Commit the deliverable and update this milestone's execution ledger.** Stage only task-owned changes and tests; commit as `feat: impeccable usability and visual system pass` (use `docs:`/`test:` when no product code changes). Record observed RED/GREEN and full-suite results. Do not merge/push as an incidental task step.

### Task 2: Original project imagery and provenance

**Files:** Create/modify `apps/web/public/images/generated/`, `docs/design/image-assets.md`, `apps/web/src/features/landing/`, `tests/e2e/public-pages.spec.ts`. Preserve existing files where named; create missing module files. Tests are the integration/E2E files listed here.

**Interfaces:** Consumes approved Impeccable placements and imagegen skill. Produces two original editorial assets: driver-hiring scene and shared-journey scene, optimized responsive variants with manifest containing exact prompt/tool/date/source/edits/alt/dimensions/placement. All named DTOs/inputs are generated or hand-mapped exactly to the active OpenAPI schemas in packages/contracts; Page<T> is {success:true,data:T[],meta:PageMeta} for list responses. Do not return Prisma rows directly.

- [ ] **Step1: Write failing behavioral regressions.** Named cases and assertions: landing_shows_two_real_services_no_rental_links; images_have_explicit_dimensions_and_correct_decorative_alt_policy; mobile_crop_keeps_text_readable; generated_asset_paths_load200; no_fake_provider_listing_or_testimonial. Inspect original outputs and mobile/desktop render.
      **Assertion anchor:** Bind imageResponses to HTTP requests for each committed manifest output path, not preview/cache URLs. These assertions belong inside the named behavioral tests above; setup/fixtures must exercise the real implementation.

```ts
expect(imageResponses.every((response) => response.status() === 200)).toBe(true);
await expect(page.getByRole('link', { name: /rent a vehicle/i })).toHaveCount(0);
```

- [ ] **Step2: Run the focused command before implementation.** Run `npm run test:e2e -- tests/e2e/public-pages.spec.ts`. Expected: FAIL because the named behavior/schema/route does not exist or violates its assertion. An unavailable-suite exit2 is a prerequisite failure, not a meaningful RED test: install/wire the real runner in this task, rerun and observe an actual behavior assertion fail. No green claim from compilation/source inspection alone.
- [ ] **Step3: Implement the smallest complete behavior.** Generate via imagegen at execution; do not substitute stock links or image placeholders. Commit selected originals and optimized variants within repo with provenance. Imagery communicates service concepts, distinct from private evidence and actual users. Generation failure is a reported blocker for imagery, not fake success.
- [ ] **Step4: Run the focused command again.** Run `npm run test:e2e -- tests/e2e/public-pages.spec.ts`. Expected: PASS; every named regression and its persisted/visible assertions executed, no skipped/future-suite success. Also run `npm test`, `npm run typecheck`, `npm run lint`, `npm run docs:check`, `npm run format:check` and `npm run build`; include prior integration/E2E suites after their introduction. Expected: all implemented suites exit0. Observe each output, investigate failures, never count unavailable suites as passing.
- [ ] **Step5: Commit the deliverable and update this milestone's execution ledger.** Stage only task-owned changes and tests; commit as `feat: original project imagery and provenance` (use `docs:`/`test:` when no product code changes). Record observed RED/GREEN and full-suite results. Do not merge/push as an incidental task step.

### Task 3: Integrated role navigation and recovery polish

**Files:** Create/modify `apps/web/src/App.tsx`, `apps/web/src/features/`, `tests/e2e/journey-recovery.spec.ts`, `docs/quality/phase-handoffs/07-interface.md`. Preserve existing files where named; create missing module files. Tests are the integration/E2E files listed here.

**Interfaces:** Consumes finalized controls/assets and real services. Produces consistent role navigation, empty/error/loading/success behavior across26 screen entries with trace evidence. All named DTOs/inputs are generated or hand-mapped exactly to the active OpenAPI schemas in packages/contracts; Page<T> is {success:true,data:T[],meta:PageMeta} for list responses. Do not return Prisma rows directly.

- [ ] **Step1: Write failing behavioral regressions.** Named cases and assertions: expired_session_mid_action_safe_relogin;403_role_change_refreshes_navigation;409_conflict_preserves_input;503_service_error_retry; offline_recovery_no_duplicate_booking_join; no_OWNER_reviews_notifications_or_reports_navigation.
      **Assertion anchor:** Bind before and after to persisted own booking counts around a retried offline/recovered submit using the same idempotency key. These assertions belong inside the named behavioral tests above; setup/fixtures must exercise the real implementation.

```ts
expect(after - before).toBe(1);
await expect(page.getByText('CONFIRMED', { exact: true })).toHaveCount(0);
```

- [ ] **Step2: Run the focused command before implementation.** Run `npm run test:e2e -- tests/e2e/journey-recovery.spec.ts`. Expected: FAIL because the named behavior/schema/route does not exist or violates its assertion. An unavailable-suite exit2 is a prerequisite failure, not a meaningful RED test: install/wire the real runner in this task, rerun and observe an actual behavior assertion fail. No green claim from compilation/source inspection alone.
- [ ] **Step3: Implement the smallest complete behavior.** Audit all inventory entries; consolidate repeated UI patterns without adding product modules. Route guards remain UX only, backend authorization remains authoritative. Verify production bundle mode and measured asset budget; document any material residual accessibility risk rather than claiming perfect audit.
- [ ] **Step4: Run the focused command again.** Run `npm run test:e2e -- tests/e2e/journey-recovery.spec.ts`. Expected: PASS; every named regression and its persisted/visible assertions executed, no skipped/future-suite success. Also run `npm test`, `npm run typecheck`, `npm run lint`, `npm run docs:check`, `npm run format:check` and `npm run build`; include prior integration/E2E suites after their introduction. Expected: all implemented suites exit0. Observe each output, investigate failures, never count unavailable suites as passing.
- [ ] **Step5: Commit the deliverable and update this milestone's execution ledger.** Stage only task-owned changes and tests; commit as `feat: integrated role navigation and recovery polish` (use `docs:`/`test:` when no product code changes). Record observed RED/GREEN and full-suite results. Do not merge/push as an incidental task step.

## Milestone completion

Run the full applicable suite, archive exact evidence in docs/quality/phase-handoffs/, and perform the one independent whole-branch review required by native execution. Re-grade findings, fix Important/Critical in one test-first pass with green suites; record rulings/deferred minors. Archive the ledger before deleting only this plan’s scratch folder. Use finishing-a-development-branch; no automatic main merge or production launch. Advance to the next milestone only after current deliverables actually work.
