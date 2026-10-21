# Desktop task04 — profile, vehicles, qualification and availability

Refined the four account/setup surfaces within the existing `WorkspaceLayout` and provider navigation.

- Profile: account identity sits beside the heading; bounded personal-details form comes first; role-aware secondary sections replace the generic journey list for drivers; vehicles, qualification/availability links and sign-out are separated. Passenger, driver and admin links use existing routes. Existing save validation, password-free profile behavior, driver capability and sign-out behavior are preserved.
- Vehicles: heading action, saved-vehicle list, selected detail and private evidence now form one hierarchy. Empty, populated and selected states are explicit; status guidance and scan/review next steps are visible. Add/edit, archive, upload, retire, submit and reload keep their existing APIs, versions and private-evidence safeguards.
- Qualification: status summary renders distinct not-started, DRAFT, PENDING, APPROVED, REJECTED and EXPIRED guidance with persisted rejection feedback. License/service fields are grouped in a bounded form; PENDING fields and evidence remain locked. Evidence and public availability are separate sections. No unsupported lifecycle promises were added.
- Availability: bounded schedule form and saved-window column, with timezone visible in the heading and form. Available/blocked choices explain their effect; saved windows show local date/time and keep the existing create/remove/reload behavior.

Files: `apps/web/src/components/PageHeading.tsx`, `apps/web/src/components/ui/index.tsx`, `apps/web/src/features/providers/ProviderLayout.tsx`, `apps/web/src/features/profile/ProfilePage.tsx`, `apps/web/src/features/providers/VehiclesPage.tsx`, `apps/web/src/features/providers/DriverQualificationPage.tsx`, `apps/web/src/features/providers/EvidencePanel.tsx`, `apps/web/src/features/providers/DriverAvailabilityPage.tsx`, scoped rules in `apps/web/src/styles.css`, `apps/web/src/features/profile/ProfilePage.test.tsx`, `apps/web/src/features/providers/ProviderWorkflows.test.tsx`, and the existing `apps/web/src/features/providers/QualificationFeedback.test.tsx` selectors.

Verification (portable Node 24.22.0, direct binaries; PowerShell npm shims bypassed):

- Focused web tests: 3 files, 18/18 passed. Covers profile save payload, error value preservation, passenger/driver/admin role links, five qualification lifecycle states, qualification save/version and stale-version preservation, vehicle add/save/selection, populated evidence next-step, availability save/persisted window and conflict preservation.
- Web typecheck: passed (`tsc -p apps/web/tsconfig.json --noEmit`).
- Scoped ESLint on the 11 changed TS/TSX files: passed.
- Scoped Prettier check on the 11 changed TS/TSX files and `styles.css`: passed.
- Browser capture at 1280×800, 1440×900 and 1920×1080 for `/profile`, `/vehicles`, `/driver/qualification` and `/driver/availability`: 12 initial samples plus 12 populated samples, no horizontal document overflow, no page exceptions, one heading and one sidebar per route. Driver profile links were checked separately. A direct populated vehicle capture was re-run after the handoff to confirm the fixture response and selected vehicle/evidence composition.
- Screenshots: `artifacts/desktop-ui-review/task-04/`, `artifacts/desktop-ui-review/task-04-populated/`, including `customer-vehicles-selected-1440.png` and `driver-profile-1440.png`. Browser account/vehicle/evidence data is simulated for UI inspection only; no real credentials or evidence were read.
- Review correction after capture: evidence copy now refers to the record rather than always saying "qualification" when shown under vehicles.

Not changed: backend, contracts, dependencies/pins, database data, secrets, mobile layout, route guards or product rules. Task 4 was independently accepted and pushed to `origin/main`; no deployment or release claim is made.
