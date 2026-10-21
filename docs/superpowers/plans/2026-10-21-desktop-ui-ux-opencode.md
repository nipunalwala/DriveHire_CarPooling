# DriveHire Desktop UI/UX — Final OpenCode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not create extra agents unless the owner requests them. Use the Impeccable skill for the visual work.

**Goal:** Deliver a coherent, production-quality desktop web interface across public browsing, authentication, customer journeys, driver tools, account settings and administration.

**Architecture:** Keep React Router, existing authentication and business APIs. Establish one role-aware authenticated workspace shell, one public shell, and a shared operational component vocabulary; migrate each existing page family onto those foundations. Make layout and visual hierarchy task-driven rather than adding decoration.

**Tech stack:** Existing React/TypeScript/Vite, CSS/Tailwind, lucide-react, Vitest/Testing Library and Playwright. Preserve exact package pins. No additional UI framework or runtime dependency is needed.

**Design basis:** `docs/design/2026-10-21-frontend-ui-ux-audit.md`, PRODUCT.md, DESIGN.md, and the desktop direction in this document. This document supersedes the mobile-first priorities and mobile implementation tasks in `2026-10-21-frontend-ui-ux-remediation.md` for this assignment.

**Scope:** Desktop only: 1280×800, 1440×900 and 1920×1080. Retain existing small-screen behavior where possible, but do not implement a mobile redesign, mobile menu, bottom navigation or mobile-specific acceptance suite. Desktop browser zoom and keyboard accessibility remain in scope.

**Status:** Final execution handoff prepared at the owner's request. Creating this plan does not launch OpenCode or claim the redesign is implemented. The latest direct owner instruction selects OpenCode for this frontend assignment, overriding historical Codex-only frontend ownership for this task. Keep the existing free-model-only restriction for OpenCode.

## Copy-ready instruction for OpenCode

You are implementing DriveHire's desktop frontend redesign. Read this entire plan, AGENTS.md, PRODUCT.md, DESIGN.md and the UI audit before editing. The owner wants a proper production-quality application using Impeccable, not a collection of CSS fixes or another decorative landing-page treatment. Desktop is the current scope; mobile work is deferred. The user explicitly selects OpenCode for this frontend assignment. Preserve the dirty working tree and all unrelated code. Implement the tasks in order, build shared foundations before changing page families, verify actual browser output, and finish with a reviewable handoff. Keep all OpenCode calls, including small/background/review models, on verified free models. Never silently select a paid fallback. Do not edit secrets, backend services, contracts, database data or package pins. Preserve every business rule and route guard. Do not commit, push, deploy or change global tooling/settings solely because this UI plan exists; leave the completed changes reviewable unless separately instructed. If a required API or free model is unavailable, report the precise limitation rather than fabricating data, bypassing authorization or claiming a pass.

## What production-quality means here

A signed-in person should recognize the same app on every page, know where they are, see the most useful action immediately, and understand loading, failure and success. The work is complete only when real page compositions and important states have been inspected at desktop sizes. A working link or successful typecheck alone is insufficient.

Keep: deep teal brand, warm neutral canvas, restrained white surfaces, existing original service illustrations, clear labels, existing route destinations and backend truth.

Replace: giant promotional greetings on operational dashboards, decorative tall panels, repeated shortcuts, inconsistent navigation shells, pale low-contrast labels, arbitrary card nesting, oversized full-width utility buttons and misleading empty/loading states.

This is an interface quality target, not authorization for production deployment or a claim that backend release readiness has been certified.

## Impeccable workflow

1. Read the installed Impeccable SKILL.md at `C:/Users/nipun/.codex/plugins/cache/openai-curated-remote/impeccable/4.3.1/skills/impeccable/SKILL.md`. If installation paths have changed, locate the current installed skill; do not invent a replacement.
2. Run its `scripts/impeccable.cmd context --target apps/web/src` once for the execution session, from repository root. Follow its failure fallback when necessary.
3. Read `reference/operate.md` and `reference/craft-floor.md`. Authenticated screens use Operate mode: familiar controls, predictable navigation, quiet styling and useful density. The landing page remains Persuade mode and may retain its existing illustration-led presentation.
4. Use the pinned direction below instead of independently inventing a new palette, font or brand. Inspect current screenshots before editing. Record the chosen desktop direction and scope in DESIGN.md without deleting still-valid product constraints.
5. For each completed page family, inspect desktop captures and its important states together. Fix the evidenced defects in one batch, then make one confirmation pass. Avoid open-ended polish loops.

## Desktop design specification

### Application shell

- Keep a compact global top bar, approximately 64px tall. Brand at left; current workspace/account controls at right. Remove duplicate page actions from the top bar.
- Authenticated desktop workspace: 232–248px sidebar (target 240px), 24–32px gutter, flexible content column with `min-width: 0`. Sidebar and content share aligned top edges.
- Sidebar groups are contextual: customer journeys/account, driver tools/account, administration for authorized users. DRIVER+ADMIN must retain both authorized groups. One current destination should be visibly active with an accessible current-page state.
- Resolve workspace context centrally; ProviderLayout and JourneyLayout must not default every role to customer. Do not display a signed-in workspace sidebar to a signed-out public visitor.
- Keep navigation stable between dashboard, profile, vehicles, availability, booking, carpool, trip and admin pages. No page should substitute a narrow title column where navigation appears elsewhere.
- Center the workspace at a maximum width near 1600px on very wide screens. Use the available width for tables; cap normal forms and prose independently. Do not stretch a profile form across the entire screen.
- App footer is quiet and does not compete with work. Retain factual payment disclosure where it helps the journey; avoid repeating it in every adjacent section.

### Typography and spacing

- One existing sans-serif stack; verify the font actually loaded. Do not add a display font or external font dependency.
- Fixed operational type scale: page title 30px/36px, section title 20px/28px, subsection 16px/24px, body 15–16px/24px, labels and table text 14px/20px, helper text 13px/20px.
- Dashboard greeting is a normal page title, not 60–72px marketing copy. Use sentence case and restrained weight.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48px. Page heading to content about 24–32px; related fields 16–24px; major sections 32px. Do not pad empty cards to manufacture importance.
- Use 24px surface padding by default, 32px for larger settings sections only when needed. Keep action bars aligned with the fields they affect.

### Color, surfaces and states

- Core palette: canvas #f8faf7, surface #ffffff, primary text #0f2d28, secondary text #4a6660, action #166453, action hover #0e4d3d, soft selection #e8f4f0, borders #dde8e4.
- Pale leaf #d9e8b7 is decorative or used against a sufficiently dark surface; never small text on light canvas. Do not reuse #7a9990 for essential small text without verifying contrast.
- Text contrast at least 4.5:1 for normal text; essential component boundaries and focus indicators at least 3:1 against adjacent colors. Include words/icons in statuses, not color alone.
- Prefer a quiet 1px boundary for a content surface. Reserve soft elevation for actual layering; avoid giving every panel both an emphasized border and a heavy shadow.
- Surface radius 12–16px; control radius 6–8px; pills only for compact statuses. No gradients/glass/decorative glow on operational cards or buttons.
- Primary buttons use a solid teal fill. Secondary actions use a neutral outlined treatment; tertiary/reload actions are visually quieter. One primary action per task area.
- Every control needs visible hover, focus, pressed/selected, disabled and pending behavior. No focus-blur handlers, invisible click targets or hover-only instructions.
- Use lucide-react consistently, usually 18–20px. Decorative icons are aria-hidden; icon-only buttons require accessible action names. Do not create custom raster icons.
- Keep transitions around 150ms for useful state feedback, honor reduced motion, and avoid orchestrated page-load animation in workspace screens.

### Forms, data and feedback

- Inputs/selects/buttons approximately 44–48px tall. Visible labels remain above fields; placeholders are examples, never the only label. Preserve name/type/autocomplete, constraints, hint/error IDs and submitted values.
- Default editable form measure about 640px. Use two columns only for clearly related short fields with a logical tab order. Descriptions should not become long full-width paragraphs.
- List pages have a coherent toolbar: search, relevant filters, apply/reset where required, primary action and result count. Preserve URL filter state and server pagination.
- Use semantic tables for dense comparable admin records; use concise lists/cards for journeys where a summary and next action matter more. Avoid changing a list into a table without checking real row content.
- Hide pagination when there is one or zero pages. Preserve counts and page reset logic. Disabled controls should not dominate an empty page.
- Loading preserves the eventual content geometry where practical; distinguish loading from empty results. Use aria-busy/status appropriately without repeated announcements.
- Empty state: concise explanation plus one useful next action. Error state: explain what failed and offer a safe retry. Missing record: unavailable heading plus return-to-list action. Preserve typed data on errors.
- Stale-version and uncertain mutation recovery must remain explicit and server-reconciled. A toast must never replace required reconciliation or imply an unconfirmed booking succeeded.

## Page-by-page brief

| Page family                | Intended desktop composition                                                                                                                  | Required UX behavior                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer dashboard         | Compact welcome/action row; real next-step or journey summary; secondary account/setup links                                                  | Prioritize booking/seat management and discovery without repeated shortcut cards. No fabricated counts or activity.                               |
| Driver dashboard           | Compact heading; qualification/setup status; requests and schedule entry points; hosted carpools                                              | Driver setup blockers precede accepting work. Use permitted existing reads; provide honest loading/empty/error states.                            |
| Profile                    | Shared shell; account identity near heading; personal details first in bounded form; secondary vehicles/driver access/account access sections | Show role-relevant links. Save pending/error/success is clear. Sign-out is separated from profile edits. No customer-only shortcuts for a driver. |
| Vehicles and evidence      | Heading with Add vehicle action; saved vehicle summary/list; selected vehicle details and evidence section                                    | Show status, scan/review feedback and next requirement. Keep private evidence private and destructive actions explicit.                           |
| Driver qualification       | Heading and qualification status; grouped license/service form; separate evidence/submission area                                             | Explain what is missing, review status and whether edits are allowed. Do not collapse rejected/pending/approved into one generic badge.           |
| Driver availability        | Full content-column heading; bounded time-window form; saved windows beside/below where appropriate                                           | Keep timezone and available/blocked meaning near controls. Preserve conflict validation and saved data.                                           |
| Driver search/detail       | Compact filter toolbar, result count, readable driver summaries; detail with qualification/service information and request action             | Public visitor gets public navigation. Keep city/time/rate constraints readable and use truthful availability.                                    |
| Carpool search/detail      | Route/time filters; clear origin → destination, time, price and seats; detail summary with the allowed next action                            | Show capacity, join conditions and current status clearly; instant join is not an approval queue.                                                 |
| Customer bookings/seats    | Status/filter toolbar and scannable journey list; clear primary action per item                                                               | Distinguish requests, confirmed/cancelled journeys and seats. Avoid raw enum strings as the only user explanation.                                |
| Booking creation/detail    | Driver/vehicle/journey context; input and estimate/confirmation sections; coherent status/action area                                         | Make request versus confirmed booking unmistakable. Preserve quote expiry, current version, conflicts and uncertain response recovery.            |
| Driver requests            | Driver workspace shell and task-focused request list                                                                                          | Surface the existing authorized accept/decline/lifecycle actions with appropriate pending/confirmation feedback.                                  |
| Hosted carpool create/edit | Driver shell; grouped route/schedule/vehicle/seats/price fields; contextual summary and save/publish actions                                  | Draft versus published is clear; prerequisites link directly to the required vehicle/setup step.                                                  |
| Trip detail                | Summary, participants/time/status, lifecycle information and authorized next action                                                           | Role-appropriate transitions, clear confirmation and stale-version recovery. No map/GPS visualization.                                            |
| Admin operations           | Admin-aware shell; compact kind/status/date toolbar; dense useful records and selected-record detail                                          | Filters feel like one system. Audited actions and required reasons remain explicit; reload is secondary.                                          |
| Admin users/reviews/audit  | Shared admin hierarchy, coherent filters, semantic records and detail/review area                                                             | Avoid oversized search forms. Show identity/status/review reason clearly; long audit metadata must wrap or use controlled detail expansion.       |
| Sign-in/register/recovery  | Consistent desktop auth layout with one focal form; restrained supporting copy                                                                | Preserve the approved password toggle, role choice, verification/reset flows and validation. No gratuitous marketing panels.                      |
| Landing and not-found      | Preserve real brand/assets; align header/buttons/type with shared vocabulary; intentional not-found state                                     | Public visitors understand driver hiring versus shared journeys and where to go next. Do not invent claims or service inventory.                  |

Every actual route in `apps/web/src/App.tsx` must be accounted for in the final route/state checklist, including alias redirects and `*`. An empty-state screenshot is not verification of the populated detail or edit page.

## Implementation order and file ownership

### Task 1 — Establish baseline and shared desktop foundations

**Files:** DESIGN.md; `apps/web/src/styles.css`; existing shared UI components; new `components/PageHeading.tsx` only if justified.

- [ ] Inspect `git status --short` and existing diffs; record which files are already dirty. Do not reset, stash or overwrite unrelated modifications.
- [ ] Read source/current screenshots and map all routes and owning layouts. Capture baseline at 1440×900 for customer/driver dashboard, profile, vehicles, search and admin operations.
- [ ] Inventory existing tokens, selectors and component APIs. Extend existing components instead of creating a parallel design system. Record the visual rules above in DESIGN.md and an owned surface brief if the skill requires it.
- [ ] Implement operational typography, readable tokens and button/field/status vocabulary. Keep display typography scoped to landing, never global h1 rules that unexpectedly resize forms.
- [ ] Verify all original non-target field types, input padding, error associations and keyboard focus. Do not force all shared inputs to type=password.
- [ ] Run scoped type/lint checks and review captures before migrating pages.

### Task 2 — Implement one role-aware desktop workspace

**Files:** `components/WorkspaceLayout.tsx`, `components/AppSidebar.tsx`, App.tsx, `features/bookings/JourneyLayout.tsx`, `features/providers/ProviderLayout.tsx`, styles.css.

- [ ] Add meaningful failing tests for public vs authenticated navigation and passenger/driver/admin/DRIVER+ADMIN visibility.
- [ ] Build the stable topbar/sidebar/content shell with a single page heading and no nested sidebar. Resolve role/workspace once and pass it intentionally.
- [ ] Preserve route guards, role enums and deep links. Do not introduce a new backend CUSTOMER role. Report any existing contract mismatch separately.
- [ ] Verify exactly one active destination and correct context across dashboard, profile, vehicles, qualification, availability, requests and admin pages.
- [ ] Assert desktop document width does not exceed viewport at 1280/1440/1920. Tables may scroll inside a clearly defined region; do not hide overflow on body as a fix.

### Task 3 — Rebuild customer and driver dashboard hierarchy

**Files:** `features/dashboard/DashboardPage.tsx`, `DriverDashboardPage.tsx`, scoped styles and focused tests.

- [ ] Replace oversized greeting/ornamental panel with a compact header and a useful primary action.
- [ ] Group existing task entry points by purpose. Keep booking/request management visible in the first viewport at 1440×900; do not make users scroll through an onboarding explainer to reach their work.
- [ ] Derive any live summary only from existing permitted API responses. Do not add unsupported totals, synthetic upcoming trips or generic success metrics. If a useful aggregate is unavailable, use a concise contextual action instead.
- [ ] Distinguish new/established/driver-setup states and summary loading/error. Do not require a backend redesign to ship the initial layout.
- [ ] Verify normal/empty/blocked fixtures, long names, combined roles and summary request failure without breaking the rest of the dashboard.

### Task 4 — Refine profile, vehicles, qualification and availability

**Files:** `features/profile/ProfilePage.tsx`, `features/providers/*`, shared shell/components and scoped styles.

- [ ] Put headings in the content column and personal details first. Keep form measure bounded and actions aligned.
- [ ] Give vehicle/qualification setup a clear progression using the existing state model, not new workflow steps or invented approval rules.
- [ ] Preserve evidence scanning/privacy, status/version handling and real validation messages. Keep sensitive information out of public summaries.
- [ ] Verify profile save, pending, failure and success; vehicle empty/populated/selected/evidence states; qualification draft/pending/approved/rejected/expired; availability populated/conflict/empty states using permitted fixtures.

### Task 5 — Refine discovery and journey flows

**Files:** `features/drivers/*`, `features/bookings/*`, `features/carpools/*`, `features/seats/*`, `features/trips/*`.

- [ ] Build consistent search/filter/list/detail hierarchy following the page briefs. Preserve route parameters and URL search state.
- [ ] Standardize amount/date/time/status presentation, next actions and relevant payment disclosure without fabricating product features.
- [ ] Verify booking create/detail, carpool create/edit/detail and trip detail with schema-valid populated fixtures; preserve constraints, version checks and replay/reconciliation behavior.
- [ ] Hide irrelevant paging controls and improve prerequisite/404/empty/retry states. Keep returned form values and error focus.

### Task 6 — Refine administration

**Files:** `features/admin/operations/*`, `users/*`, `verification/*`, `audit/*` and reusable list/filter components.

- [ ] Group filters into compact toolbars and display comparable data at useful desktop density. Use selection/detail space deliberately rather than nesting large cards.
- [ ] Make status, identity, time and action reason easy to scan. Keep reload/filter/reset actions secondary to the actual administrative task.
- [ ] Preserve authorization, evidence access, current-version checks, reason requirements and audit behavior.
- [ ] Verify populated and empty pages, long identities/reasons, multi-page lists, selected records, pending changes, error and forbidden states. Test DRIVER+ADMIN context.

### Task 7 — Align public/auth surfaces and shared states

**Files:** `features/auth/*`, `features/landing/*`, App.tsx not-found, shared feedback components.

- [ ] Preserve original service imagery/provenance and factual product copy. Refine alignment/type/actions without an unrelated brand replacement.
- [ ] Keep auth form labels/autocomplete/role choices and password eye toggle. Test hidden → visible → hidden, retained value, keyboard operation and no accidental submit.
- [ ] Align loading, empty, forbidden, missing-record, validation, success, stale-version and uncertain mutation states across families.
- [ ] Ensure confirmations are used only for consequential actions; ordinary navigation and simple edits should not open unnecessary modals.

### Task 8 — Desktop acceptance and handoff

- [ ] Create route/state fixtures for all page families without reading real credentials or private evidence. Label mocked evidence as simulated. Use dedicated E2E services for persisted behavior; never reset development data.
- [ ] Run the focused regressions, web typecheck, scoped ESLint/Prettier and web build. Broaden to required repository gates when shared behavior warrants it. Avoid contract emits while doing live Vite acceptance.
- [ ] Capture final 1280×800, 1440×900 and 1920×1080 views. Inspect important pages at 200% browser zoom, keyboard-only, reduced motion and long-content fixtures. Mobile redesign is not an acceptance condition of this assignment.
- [ ] Inspect initial, populated, loading, empty, error and relevant destructive/recovery states. Inspect actual DOM bounds, focus, clipping and contrast; do not approve from source alone.
- [ ] Make one batched fix pass and one confirmation capture pass per changed family. Log unresolved limitations explicitly.
- [ ] Write `docs/quality/phase-handoffs/desktop-ui-ux.md` listing changed files, route/state coverage, screenshot paths, exact test commands/results, remaining limitations and work intentionally left untouched.
- [ ] Leave a reviewable diff. Do not claim the UI is production-ready solely because tooling is green. Request final review under the owner's chosen execution workflow; no release/deployment claim.

## Acceptance checklist for the final reviewer

- [ ] A user stays oriented across dashboard, profile, vehicles and journey pages without a disappearing/changing workspace shell.
- [ ] Driver pages show driver tools; administrator tools remain available for combined roles; public visitors see public navigation.
- [ ] Primary task/action and page purpose are obvious in the first desktop viewport; operational pages do not lead with giant marketing artwork or greetings.
- [ ] Profile and similar forms have a comfortable line measure, aligned labels and predictable save/error behavior.
- [ ] Buttons/fields/tables/statuses follow one consistent vocabulary; no duplicate global CSS blocks or conflicting new component libraries.
- [ ] Text is readable, contrast measured, focus visible, overlays unclipped and dense content usable at all three desktop widths and 200% zoom.
- [ ] Every listed page family has real populated-state visual evidence or an explicit unresolved limitation. No fake backend or private data was introduced to make a screenshot look finished.
- [ ] All original auth/business safeguards, original imagery and unrelated dirty changes are retained.
- [ ] Actual verification results and remaining work are documented; mobile redesign is clearly deferred.

## Local execution notes

Actual checkout observed in this session: `D:/CODING/Projects/DriveHire/DriveHire_CarPooling`. The chat's older `D:/DriveHire` workspace path did not exist; verify current location before execution. Portable Node: `D:/CODING/Projects/DriveHire/.tools/node-v24.22.0-win-x64`. Portable OpenCode CLI: `D:/CODING/Projects/DriveHire/.tools/cli/opencode.cmd`.

Use PowerShell-aware paths and quoting. Do not assume bash command syntax or chain failure-masking `|| echo` into verification. Capture the real exit status. OpenCode's model list and free eligibility must be checked at execution time; a historical free identifier is not proof of current availability. Pin both `model` and `small_model` and restrict providers so background work cannot fall back to a paid model. Do not print credentials/config secrets.

Existing audit captures live in `artifacts/ui-audit-2026-10-21/`. Their account/API data is simulated; the detail pages show missing records and are not populated-state acceptance. Use these as defect evidence, not as the intended final appearance.
