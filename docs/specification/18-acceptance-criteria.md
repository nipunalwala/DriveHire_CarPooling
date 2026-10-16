# 18 · Acceptance Criteria

Status: proposed implementation baseline; implementation requires separate human approval.

## Release gate
Every FR acceptance below is mandatory, with exact API/DB/UI linkage in [19 requirements-traceability](19-requirements-traceability.md). Planning validates the blueprint only; implementation must attach actual test evidence. No skipped critical scenario, placeholder code, frontend-only persistence, silent permission bypass, fake payment/route or invented test pass may be accepted.

| Requirement | Objective acceptance | Scenario evidence |
|---|---|---|
| FR-AUTH-001 | A correct OTP works once; sixth wrong attempt cannot verify; no ADMIN input accepted | `AUTH-REGISTER` |
| FR-AUTH-002 | Cookie HttpOnly/Secure in staging/prod; token never localStorage; logout token fails next API request | `AUTH-LOGIN` |
| FR-AUTH-003 | Two refreshes with same token cannot both succeed; replay invalidates successor; family age never exceeds30d | `AUTH-REFRESH-RACE` |
| FR-AUTH-004 | One reset token succeeds once; login with old password fails; secrets absent logs | `AUTH-RESET` |
| FR-USER-001 | Repeated addRole creates one row; role switch does not alter token authority; backend ownership tested | `USER-MULTIROLE` |
| FR-DRIVER-001 | Unverified driver absent public search and cannot accept/host; two simultaneous submissions yield one pending | `DRIVER-ONBOARD` |
| FR-DRIVER-002 | Outdated approval request cannot approve replacement license; expired driver blocked even if expiry job paused | `DRIVER-VERIFY` |
| FR-DRIVER-003 | Booking against driver BLOCKED interval fails; touching [start,end) intervals succeed | `DRIVER-AVAILABILITY` |
| FR-VEHICLE-001 | Cross-owner edit/read/download denied; no unverified public listing | `VEHICLE-REGISTER` |
| FR-VEHICLE-002 | Approved but expired insurance cannot create quote/booking; rejected reason visible owner only | `VEHICLE-VERIFY` |
| FR-VEHICLE-003 | History/reviews remain after archive; block cannot overlap host carpool | `VEHICLE-ARCHIVE` |
| FR-BOOKING-001 | Changing client total cannot change persisted price; quote after10min rejected; own vehicle rental rejected | `BOOKING-QUOTE` |
| FR-BOOKING-002 | Concurrent overlapping booking/carpool/block commits at most one; injected failure rolls back all writes | `BOOKING-CONCURRENCY` |
| FR-BOOKING-003 | Combined one approval stays PENDING; simultaneous final decisions produce one confirmation event | `BOOKING-CONSENT` |
| FR-BOOKING-004 | Cancel twice cannot release unrelated holds; delayed worker cannot permit accept after deadline | `BOOKING-CANCEL-EXPIRE` |
| FR-CARPOOL-001 | Driver-only role cannot host without owned verified vehicle; published ride conflicts with hire reservation | `CARPOOL-PUBLISH` |
| FR-CARPOOL-002 | Day boundary search includes correct UTC intervals; roster/contact absent public response | `CARPOOL-SEARCH` |
| FR-CARPOOL-003 | Many concurrent joins for final seat yield one ACCEPTED; idempotent retry consumes seats once | `CARPOOL-LAST-SEAT` |
| FR-CARPOOL-004 | Two accepts for final seat cannot both succeed; accepted request cannot be accepted again | `CARPOOL-APPROVAL` |
| FR-CARPOOL-005 | Race accept/cancel serializes; host cancellation plus passenger cancellation never produces negative count | `CARPOOL-CANCEL-RACE` |
| FR-RIDE-001 | SCHEDULED cannot start; two same-version transitions commit once; completion releases reservations and updates parent | `RIDE-STATE-MACHINE` |
| FR-RIDE-002 | Overrunning earlier ride blocks next ride start even after scheduled interval ends; marker accessible text | `RIDE-OVERRUN` |
| FR-REVIEW-001 | Parallel duplicate submissions create one review; hidden review removed from count/mean immediately | `REVIEW-ELIGIBILITY` |
| FR-NOTIFY-001 | Crash after one recipient insert and retry yields exactly one notification per recipient within60s healthy worker | `NOTIFY-REPLAY` |
| FR-ADMIN-001 | Already issued JWT blocked next request; active driver incident visible for admin resolution; reactivation needs fresh login | `ADMIN-SUSPEND` |
| FR-ADMIN-002 | Admin cancellation shares rollback behavior; every intervention includes reason and requestId | `ADMIN-OPERATIONS` |
| FR-ADMIN-003 | Nonadmin cannot decide; resolution/notification/audit commit atomically | `ADMIN-COMPLAINT` |
| FR-ADMIN-004 | Report counts match seeded database; hidden review excluded rating; app DB role cannot UPDATE/DELETE audit rows | `ADMIN-REPORTS` |
| FR-SEC-001 | SVG/HTML spoof rejected; public image cannot expose license; referenced approved doc cannot be removed | `SEC-UPLOAD` |
| FR-OPS-001 | Fresh DB applies migrations incl exclusion constraints; production build boots; restore reconciles reservations/seats/outbox | `OPS-RESTORE` |

## System-level acceptance
- Clean checkout installs from lockfile, creates separate local/test PG, applies forward migrations including custom constraints, builds API/web/worker containers and passes ready with configured dependencies.
- All public and role dashboard pages in UI specification exist with real endpoints, safe loading/empty/error/success and keyboard/mobile behavior; no decorative action without behavior.
- Original generated explanatory imagery appears on landing/service surfaces; selected images and responsive variants are committed under `apps/web/public/images/generated/` with exact prompts, provenance and accessible treatment documented in `docs/design/image-assets.md`. Public vehicle listing photos come only from authorized CLEAN owner uploads.
- Every API operation method/path exists and validates both expected success DTO and negative permission/error contract; route count drift fails checks.
- All NFR targets measured under documented conditions; no high/critical unresolved security finding; resource/seat concurrency and restart recovery proven with real DB.
- Admin actions audited, secrets absent source/log evidence, docs private, no app role UPDATE/DELETE audit/history; backup+restore timing recorded.
- Requirements traceability complete, phase evidence files include commands/exit codes/artifacts; final review distinguishes achieved evidence from remaining launch input.

## Planning completion acceptance
All21 named specs and25 named guide/prompts present; OpenAPI parses, refs/path params/operation IDs consistent; all FRs map phases+operations+entities+UI+tests; page API IDs resolve; all internal document links valid; two review passes documented with actual corrections; no app source/dependencies/migrations created. Existing repository used per latest instruction, old history retained, approved deletion committed, no license invented. Record actual push URL/branch/SHA only after successful tools. Final gate requests approval for Phase01; never run that phase automatically.
