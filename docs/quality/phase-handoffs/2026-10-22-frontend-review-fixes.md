# Desktop frontend review fixes — 22 October 2026

## Delivered scope

Completed the four findings from the focused desktop frontend review. Included the previously untracked workspace shell and dashboard sources/tests required by committed imports, plus their existing authentication, registration contract/API and document metadata dependencies. Other unfinished backend/release work remains outside this delivery.

Both registration choices now share one native radio group. Journey badges retain canonical status independently of their display label; pending is amber, suspended is red and unknown states are neutral. Existing descriptive badges pass explicit semantic status. Shared form fields align content at the start so a helper line does not stretch adjacent controls.

## Verification evidence

- Regression red/green: the new focused tests initially produced five failures and three passes; after the fixes all eight pass. Tests cover native radio grouping, both submitted registration roles and canonical badge state.
- Chromium regression probe: 12 scenarios across 1280, 1440 and 1920 desktop widths passed. Arrow keys select the registration role and submission preserves DRIVER. Pending/suspended badge colors match their intended palette. Qualification country and expiry controls share the same top coordinate and 48px height. No document overflow or uncaught page exceptions were recorded.
- Password visibility smoke: sign-in and registration retain the entered password, reveal/hide with keyboard controls and never submit through the visibility button. Desktop passed; the existing narrow-width smoke also passed without any mobile design changes.
- Dedicated test-database registration probe passed: omitted/CUSTOMER role maps to PASSENGER, DRIVER maps to DRIVER, and ADMIN self-registration is rejected with 400. No development database was reset.
- Independent final review found no functional regressions; all 180 relative frontend imports resolve in the staged snapshot. The reviewer found an audit link to an unstaged plan; it was corrected to the staged desktop plan.

Browser data was simulated. Probe scripts, JSON and screenshots are local under `artifacts/frontend-fixes/`; they are ignored evidence, not production data or committed assets. Earlier broad review covered 102 desktop samples and is recorded separately. This change does not claim mobile acceptance, production deployment or a complete accessibility certification.

## Staged snapshot acceptance

A separate checkout of HEAD plus the staged files passed Prisma client generation, full workspace TypeScript, ESLint and boundary checks, full Prettier formatting, 130 unit tests, one contract test, documentation/scope/OpenAPI checks and the complete contracts/API/web build. Installed dependencies were reused through junctions; GitHub CI validates a fresh install after push. Vite retains the existing non-failing approximately 535 kB main-chunk advisory.
