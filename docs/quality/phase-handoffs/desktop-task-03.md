# Desktop task03 — customer and driver dashboards

Replaced the oversized greeting, decorative hero and repeated four-card shortcut grid with compact page headings, one primary action, and concise journey/request management plus account/setup state. Driver setup and its blockers now precede accepting work. Admin entry points on the customer dashboard and all role redirects are retained. No fabricated counts, upcoming trips or activity were added; the driver setup summary uses the existing authorized `/drivers/me` read with loading, retry and failure states.

Qualification states are explicit: missing profile (not started), saved draft (in progress), pending, approved accepting/paused, rejected, and expired (renewal required). EXPIRED no longer falls through to the not-started copy.

Files: `apps/web/src/features/dashboard/DashboardPage.tsx`, `apps/web/src/features/dashboard/DriverDashboardPage.tsx`, `apps/web/src/features/dashboard/DashboardPage.test.tsx`, scoped dashboard rules in `apps/web/src/styles.css`.

Verification (portable Node 24.22.0, direct):

- Focused dashboard tests: 8/8 pass, including customer/ADMIN links, unverified account state, approved, missing, saved DRAFT, EXPIRED, summary failure and role redirects.
- Web typecheck: passed (`tsc -p apps/web/tsconfig.json --noEmit`).
- Scoped ESLint on the three dashboard TSX files: passed.
- Scoped Prettier check on the three dashboard files and `styles.css`: passed.
- Codex browser review: dashboard hierarchy accepted at 1280×800, 1440×900 and 1920×1080 with no overflow or console errors; EXPIRED/DRAFT copy refinement applied after review.

No mobile redesign, backend, contracts, dependencies, secrets, resets, commits, pushes or deployments. Task 3 awaits final acceptance.

Codex acceptance: 8 dashboard regression tests and independent web typecheck passed after review correction; six desktop captures had no overflow/page exceptions. Removed unsupported claim about expired qualification leaving existing journeys unaffected. Screenshots shown to owner; browser account data simulated. Task3 accepted; no release claim.
