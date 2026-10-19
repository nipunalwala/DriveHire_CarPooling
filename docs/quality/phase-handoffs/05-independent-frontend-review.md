# Phase05 independent frontend review

Independent Codex reviewer, read-only static review of the complete frontend
first draft against current OpenAPI. No backend inspection, test execution,
browser, visual or accessibility verification by the reviewer. Latest lazy
Trip/Admin routing was included. Missing shared trip/history exports were known
integration dependencies, not fabricated frontend APIs.

## Important

I1: BookingsPage.tsx booking decision/cancellation uncertainty. A committed
mutation with a lost response forwards ApiError(status0)'s misleading saved-state
message and leaves controls enabled. Require reload after status0 or malformed
success, retain form context and disable further mutations until refreshed.

## Minor findings and rulings

M1: BookingNewPage estimate expiry discards a previously attempted quote/key,
removing same-key replay recovery after an uncertain create near expiry.
Deferred to integrated hardening; current unknown-delivery copy directs checking
bookings and backend idempotency/resource protections remain authoritative.

M2: CitySelect is required on public search although cityId is optional in the
API. Interval/rate-only searches cannot be submitted. Deferred UX improvement;
curated city search remains functional and no fabricated city IDs are used.

M3: Admin operations lacks booking date filters. Regraded Important by Codex:
specification/14-admin-workflows.md explicitly requires paginated date/status
operations lists and the existing adminBookings contract already defines from/to.
Add validated date bounds and reset pagination in the one test-first fix pass.
No new endpoint or domain behavior is needed; cost if wrong is incorrect admin
query narrowing, mitigated by behavioral request/validation regressions.

Independent review is complete. One fix pass follows; do not run a second
cosmetic review cycle. Final browser/backend acceptance remains outstanding.

## Correction evidence — 2026-10-19

The Important unknown-result recovery and regraded required admin date filters
were corrected together after free OpenCode authored five meaningful failing RTL
regressions. The unchanged five regressions pass; focused and full frontend lint,
web typecheck and production build pass. See artifacts/phase05-review-green.log.
Network/malformed-success mutations require reload; valid From/To bounds use the
existing contract in UTC, reset pagination and reject reversed ranges while
preserving entered values. This closes those findings; whole-phase browser and
backend acceptance remain outstanding. No second independent cosmetic review.
