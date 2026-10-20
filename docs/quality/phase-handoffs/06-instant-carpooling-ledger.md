# Phase06 instant carpool execution ledger

Owner override: Codex directly implements backend/contracts/tests/UI. No OpenCode.
The approved Phase06 plan and lifecycle12 remain scope; use existing physical
resource locks, trip service and qualification checks. No approval seat workflow,
payments, GPS, private public roster or production deployment.

Phase05 predecessor is accepted/pushed as4be37b417a3f0541d19bb017692aac2e70984b69.
CI39295099810 completed SUCCESS for verify and infrastructure. Local149integration,
61unit,1contract and54browser tests passed; handoff/review files are archived.

Task1 initial extraction had a CRLF fixture setup error, not meaningful RED.
Corrected fixture execution observed4missing-route assertion failures and one
incidental404 match. Draft/publish implementation then passed5/5 in9.92seconds.
Qualified fixtures use valid approval/current clean evidence and owned vehicles;
no development data reset or production invariant disabled. Additional real
hire/publication race and DST local-day search cases are being exercised.

Remaining: finish Task1 time/search/race qualification regressions; instant seats,
cancellation/expiry/suspension/terminal synchronization and reviewed forward
migration; real frontend and browser journeys; independent whole-phase review,
full verification, main/owner commit/push and CI inspection. Phase06 not complete.

## Direct implementation and observed gates

Publication suite7/7 passes, including a real hire-versus-publish resource race
and next-DST-day search boundaries. Instant seats first failed4/4 then passed;
expanded coverage includes final-seat concurrency, duplicate/replay/hash mismatch,
join-versus-whole-cancel and injected child-insert rollback with trigger cleanup
in finally on the dedicated test database. Host self-join is forbidden.

Cancellation/failure/suspension and worker regressions observed actual persisted
failures, then passed. The existing journey expiry entrypoint now reconciles
carpools under its lease: DB-time grace expiry terminalizes seats/releases once;
invalid qualification cancels unstarted rides; active overdue/ineligible rides
retain physical holds and receive one incident plus a safe extension attempt.
Migration0005 adds EXPIRED/FAILED without editing accepted migrations. Dedicated
schema reconstruction removes0005 history with prior reviewed migrations.

Suspension discovery includes hosted rides and accepted passenger seats, full
account/resource sets and aggregate locks. Active participation remains incident
history; unstarted host rides cancel atomically, suspended passenger seats are
released with one decrement. Shared trip FAILED/COMPLETED synchronizes parent
while preserving ACCEPTED historical participation.

The lifecycle spec requires private host roster display names, which the original
SeatRequest schema could not represent. An optional read-only passengerDisplayName
is documented in OpenAPI/shared contracts and returned only to host/admin roster
reads; public Carpool DTO remains unchanged and excludes contacts/evidence/roster.
Admin carpool lists validate current ADMIN, status, pagination and UTC date bounds.
Additional RED regressions fixed cancelled-unpublished-draft privacy and separated
host whole-ride cancellation from passenger seat cutoff.

Full backend integration passed172/172 across22files in378.96s. Typecheck/lint
passed. Frontend uses Impeccable's established operational world and native forms.
The absent search heading was observed in the real browser before implementation.
Search/hosted lists, create/edit draft, publish/detail/join, read-only roster,
passenger cancellation/history and admin tab are implemented. Three recovery RTL
checks pass: same-key uncertain join with preserved message, lost final seat with
no false confirmation, and missing-vehicle onboarding link. These added recovery
checks were green when first run; they are not claimed as independent RED evidence.
Full workspace typecheck/lint and production build pass. Browser runtime and one
independent whole-phase review are active; no Phase06 acceptance/push yet.

## Final acceptance — 2026-10-20

Full lifecycle14/14 and full integration176/176 across22files passed; the complete integration run took752.38seconds. Browser desktop/mobile60/60 passed in13.7minutes. Unit64/64, contract1/1, workspace typecheck/lint/docs and production build passed. Inspected desktop joined details and mobile draft captures. Important independent-review gap closed by four synchronized race/rollback tests; minor stale-draft reload deferred to07. Earlier interrupted/timeout runs remain diagnostic evidence only, with no claim of proved original cause. Final formatting is checked on the phase deliverables before commit. Owner/main phase commit and push exclude all separately prepared07 source, tests and generated images. No development reset or production deployment.
