# Phase06 independent acceptance review

Reviewed 2026-10-19 against accepted main baseline `4be37b417a3f0541d19bb017692aac2e70984b69`, including tracked changes and untracked Phase06 source. Owner override applied: Codex owns implementation; no OpenCode. This is the single whole-phase source review, not browser acceptance or a new test execution.

## Important findings

### [P2] Complete the required transaction-boundary race and rollback regressions

`apps/api/src/modules/carpools/seats.integration.test.ts:157` exercises join against whole-ride cancellation, but the remaining required join-versus-start, join-versus-expiry and join-versus-host-suspension interleavings are absent. `apps/api/src/modules/carpools/lifecycle.integration.test.ts:178` and `:196` exercise suspension/expiry sequentially. `apps/api/src/modules/carpools/seats.integration.test.ts:180` injects failure during seat insertion; it does not exercise the separately required whole-ride cancellation failure after child updates.

These are explicit Phase06 Task2 acceptance requirements and lifecycle12 requirements. They protect the integration boundaries between `withLockedCarpool`, shared trip transitions, suspension graph rediscovery and worker terminalization; final-seat coverage alone does not establish these outcomes. Add real synchronized PostgreSQL regressions for these three races and a failing child/update trigger during whole cancellation. Assert parent/trip/seat state, accepted-seat sum, reservation releases and immutable history/audit after both requests finish; assert complete rollback and successful retry for injected failure. Include a graph-expansion interleaving where a newly accepted passenger was absent from suspension's original discovery. This is an Important acceptance-evidence gap, not a claim that a product race was reproduced.

## Minor improvements

- `apps/web/src/features/carpools/CarpoolNewPage.tsx:121`: draft edit 409 only displays the error and retains the old version; the form has no explicit reload-draft recovery. Provide a reload control with clear preservation/reconciliation of entered values. Existing join and cancellation screens already expose explicit reload recovery. This does not block the primary journey.

## Source assessment

No confirmed Critical or Important product invariant defect was found. Publication validates owned approved vehicle/current qualification under shared account/resource locks; PostgreSQL reservations protect cross-service conflicts. Seat creation serializes relevant users/resources and the parent, rediscovers newly accepted users, guards capacity, persists idempotency and audit in the same transaction, and rejects self-join. Cancellation, expiry and suspension preserve transactional terminal synchronization; manual completion/failure retains accepted participation and releases physical reservations. Public DTOs exclude registration/contact/evidence/roster, and roster access is host/admin only. Migration0005 is forward-only and shared contracts represent the extended terminal states and private roster name. Search uses origin-local dates and current qualification. UI has server-authoritative counts, preserved join inputs/key, conflict/unknown-result recovery, private hosted drafts, passenger history and administrator carpool navigation.

Read AGENTS.md, responsibilities, prompt06, specifications05/12/14, active OpenAPI, Phase05 handoff and Phase06 ledger; inspected backend/contracts/migration/frontend/test source together. No database/browser commands were run and no product files were edited. Reported prior 172 integration passes and pending browser journeys remain coordinator evidence, not independently rerun passes. Acceptance remains conditional on the Important regression coverage and coordinator's final required verification/browser evidence. No cosmetic review cycle requested.

## Targeted closure — 2026-10-20

The single Important acceptance-evidence finding above is **closed** by the four added `review_*` regressions in `apps/api/src/modules/carpools/lifecycle.integration.test.ts:380`, `:432`, `:477` and `:529`.

- Start and expiry cases hold a real account row lock, observe PostgreSQL lock waiters for both operations, then release them and assert the legal persisted outcomes: rejected join, correct trip state/history, consistent accepted-seat sum and retained/released reservations. Join/start/expiry admissibility windows are disjoint except the exact start-opening/join-cutoff boundary; these tests correctly use current database time with mutually consistent parent/trip/reservation fixture windows instead of pretending both actions must succeed.
- Suspension blocks on the first sorted administrator account after initial graph discovery, permits a passenger to join, then releases the blocker. This exercises expanded-user graph rediscovery/retry and verifies cancellation, zero live capacity, released reservations and one cancellation audit.
- Whole cancellation injects a trip-update failure after seat and parent writes. Assertions establish rollback to published/assigned state, accepted capacity, both holds and no cancellation history/audit; cleanup is in `finally`, and retry subsequently succeeds.

Inspected the recorded focused output at `artifacts/phase06-review-races.log`: one test file passed, four selected tests passed, ten unselected tests skipped, duration19.11seconds. This is recorded coordinator execution evidence; the independent reviewer did not execute database/browser commands. No additional whole-phase review or product changes were performed in this closure.

No Important/Critical findings remain open from this independent review. The minor draft-edit reload improvement remains explicitly deferred to Phase07 hardening. Final full gates and fresh browser acceptance remain coordinator responsibilities; the interrupted browser run is not a pass.
