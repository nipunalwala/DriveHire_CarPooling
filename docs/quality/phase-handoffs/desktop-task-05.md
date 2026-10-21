# Desktop task 05 — discovery and journey flows

Refined the existing driver-search, booking, carpool, seat and trip surfaces inside `WorkspaceLayout`/`JourneyLayout` without changing routes, URL parameters, authorization, validation, quote/version rules or recovery behavior.

- Driver discovery/detail: compact URL-backed search toolbar with result count and reset, scannable driver cards, humanized status, explicit empty/error/retry, missing-driver return state and payment disclosure.
- Bookings: URL-backed status/page filters, human-readable status guidance, one primary next action per item, terminal/cancelled handling, distinct request-versus-confirmed messaging and explicit missing-booking state. Create flow now shows selected-driver context, a return link, a missing/prerequisite state and standardized estimate/date/amount presentation while retaining quote expiry, conflict and uncertain-response recovery.
- Carpools: search results expose origin/destination, departure, seats and price with URL filters and result counts; hosted drafts/published rides are separated with draft edit as the first action. Detail preserves instant-join capacity and idempotent join/reload behavior, plus roster paging, publish/cancel actions, closed/full states and payment disclosure. Create/edit keeps grouped vehicle/route/schedule/seats fields, saved-draft context and retained values on validation/conflict failures.
- Seats and trips: route/seat summaries, humanized statuses, hidden single-page pagination and explicit reload/return actions. Trip transitions retain role checks, version conflicts and uncertain-response reconciliation; the role-aware return link is now in the page heading instead of orphaned below the history list.

Files: `apps/web/src/features/bookings/JourneyLayout.tsx`, `BookingsPage.tsx`, `BookingNewPage.tsx`; `apps/web/src/features/drivers/DriversPage.tsx`; `apps/web/src/features/carpools/CarpoolsPage.tsx`, `CarpoolDetailPage.tsx`, `CarpoolNewPage.tsx`; `apps/web/src/features/seats/SeatsPage.tsx`; `apps/web/src/features/trips/TripPage.tsx`; scoped journey rules in `apps/web/src/styles.css`; new `apps/web/src/features/journeys/JourneyFlows.test.tsx`.

Verification (portable Node 24.22.0, direct binaries; PowerShell npm shims bypassed):

- Focused web tests: 4 files, 13/13 passed (`BookingRecovery`, `CarpoolRecovery`, `DraftRecovery`, `JourneyFlows`). New coverage: driver search restores URL filters and hides paging; booking list humanizes status and restores the URL filter; missing booking/carpool/trip/draft return states.
- Web typecheck: passed (`tsc -p apps/web/tsconfig.json --noEmit`).
- Scoped ESLint and Prettier check on the changed feature folders and `styles.css`: passed.

Browser evidence — `artifacts/desktop-ui-review/task-05-populated/`:

- `task-05-capture.mjs` captured 21 route/state cases at 1280×800, 1440×900 and 1920×1080 (63 screenshots) plus `results.json`.
- Cases: public driver search/empty/detail; public carpool search/missing; customer carpool detail; customer bookings/detail/missing/error/new/prerequisite, seats, trip/missing; driver requests, hosted carpools, carpool new/prerequisite/edit, trip.
- All samples: document width equals viewport width, no horizontal overflow offenders, no page exceptions, exactly one sidebar where authenticated, no pagination on single-page lists, no raw enum leaks in rendered text (status badges are intentionally CSS-uppercased after `statusLabel`).
- Visual review corrections: moved the trip return link into the heading, corrected “1 seat” singular copy on carpool join.
- Fixtures are browser-local simulated responses for UI inspection only; no real credentials, private evidence or development data were read.

Not changed: backend, contracts, dependencies/pins, database data, secrets, route guards, product rules or mobile layout. 200% zoom, keyboard-only and reduced-motion acceptance remain part of Task 8. No commit, push or deployment is made by this task.
