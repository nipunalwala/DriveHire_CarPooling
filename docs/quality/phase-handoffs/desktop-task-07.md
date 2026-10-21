# Desktop task 07 - public, authentication and shared states

Refined the public landing page, authentication forms and public not-found state for the desktop experience.

- Preserved the original service imagery and the disclosure that illustrations are simulated service concepts.
- Added a clearer public header, landing hierarchy, primary actions and factual payment disclosure.
- Kept authentication labels, autocomplete, customer/driver role choices, validation, safe return routes and password visibility controls.
- Kept verification and password-reset notices explicit and non-destructive.
- Kept the public not-found state within the shared public shell.

Verification:

- Public/auth focused browser capture: `artifacts/desktop-ui-review/task-07/` at 1280x800, 1440x900 and 1920x1080 for landing, login, registration, forgot-password and not-found routes.
- Visual review of representative 1440x900 captures confirmed bounded auth forms, readable hierarchy, visible password eye controls, clear role choices, public navigation and the simulated-image disclosure.
- Browser results reported no page exceptions or horizontal overflow across the captured routes and widths.
- Web typecheck: passed (`npm run typecheck -w @drivehire/web -- --noEmit`).
- Scoped ESLint: passed for the changed public/auth surfaces.
- Scoped Prettier: passed for the changed public/auth surfaces and shared styles.

Simulated browser fixtures contain no real credentials or private evidence. Backend, contracts, dependencies/pins, database data, secrets, route authorization and mobile behavior were not changed.
