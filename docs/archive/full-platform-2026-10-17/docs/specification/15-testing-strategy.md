# 15 · Testing Strategy

Status: proposed implementation baseline; implementation requires separate human approval.

## Layered strategy and test IDs
Unit Vitest: pure pricing/time/cutoff/state/role/validation and error mapping; no database mocks presented as concurrency proof. React Testing Library: semantic forms, error focus, loading/empty/error/success, role switch, no token storage. Supertest API: actual Express app with real isolated PostgreSQL schema, strict OpenAPI payload assertions, current session checks, cross-user object denial. Prisma migration tests: deploy fresh DB plus incremental upgrade fixture, introspect raw exclusions/partial uniques/FKs/append-only permission. Playwright: API-backed journeys using isolated test identities and Mailpit OTP/reset links; no mocked successful mutation for acceptance tests.

Every FR's scenario ID in [19 requirements-traceability](19-requirements-traceability.md) must appear in test.describe/test name or scenario manifest linked to passing evidence. Coverage target>=85% statements/branches in domain services, but feature completeness and race tests are release gates even if coverage high. Auth secrets/token cryptography use real primitives, deterministic clocks and test keys, not production secrets. API fuzz invalid UUID/extra keys/oversized bodies/enum abuse and missing/foreign roles.

## Required regression suites
| Suite | Cases and invariants |
|---|---|
| Auth | OTP6digit/expiry/5attempt/resend; attempt increments commit on failure; generic existence; refresh race+replay family revocation; cross-tab serialization; reset single-use; logout immediate JWT denial; suspended token |
| Verification/uploads | CLEAN gating; fake MIME/oversize/HTML/SVG/path traversal/malware; owner isolation; stale revision; self approval; expiry between quote and start; material edit conflicts |
| Resource concurrency | Parallel overlapping vehicle rental/driver hire/combined/carpool/block, driver and vehicle separately; exact adjacency; rollback second resource failure; publish-vs-book; raw exclusion exists |
| Seat concurrency |100 attempts for one seat -> one accept; many-seat fit; host approve vs approve/cancel; host cancel vs passenger cancel; repeat keys; CHECK bounds; sum accepted invariant |
| State/time | Every allowed and forbidden transition, each actor; exact deadlines; expired worker lag; no skipped/backwards/terminal edits; driver rental start; overrun prevents next start; waypoint max8 |
| Admin | Nonadmin API403; foreign404; self/last admin protection incl race; suspension cascades unstarted only, active incident; report fixed range counts; complaint terminal guards; audit append-only |
| Reviews/events | Completed actual target only, own target denied, unique race; hidden aggregates; domain rollback no event; worker crash/replay; email outage independent; duplicate parent/trip notification coalescing |
| Frontend | Safe returnTo, role union/context; query cache cleared logout; RHF inline/server errors; date offsets; money parsing; ambiguous network outcome idempotent retry; all public/dashboard routes |

## Deterministic concurrency harness
Use separate database connections, barriers to synchronize before lock/commit, Promise.allSettled to capture outcomes, no arbitrary sleep as proof. Assert persisted rows/reservations/seat sums/history/outbox after all settle. Exercise deadlock retry exhaustion and bounded jitter with fake timer. Test shared auth throttles from two API process instances. Each integration suite gets unique schema/database with migrations and cleanup limited to that verified test namespace; never truncate development/production data. Assert test DB name suffix and allowlist before destructive cleanup.

## End-to-end release journeys
1. Fresh register->Mailpit OTP->verified login->add DRIVER/OWNER->upload->admin approve->availability.
2. Three hire modes using distinct providers and correct self-supplied resource eligibility; quote+request+required consents->driver start/in-transit/complete->review.
3. Instant and approval carpools; two browser passengers race final seat; pending/rejected/cancelled/expired paths; whole-host cancellation.
4. Complaint create->admin review/resolve; suspension invalidates open browser access; user histories intact.
5. Restart worker after committed booking, notifications recover; scanner/SMTP failure visible; restore rehearsal releases no active resource incorrectly.

Run Chromium desktop+mobile project for all critical flows; Firefox/WebKit smoke for auth/booking/carpool. axe serious/critical0; manual keyboard focus/zoom/reduced-motion; screenshots desktop/mobile real seeded response. No generated fake map/payment screens.

## CI commands and evidence
Phase01 defines exact root script contract in execution guide: npm ci, typecheck, lint, format:check, test:unit, test:integration, test:contract, test:e2e, build, docs:check. Test services compose.test.yml supplies dedicated PG/Mailpit/scanner on separate ports/volumes. Phase02 adds db:migrate:deploy/db:validate/db:test:constraints; run in disposable DB. Publish JUnit/coverage/Playwright report/screenshots and environment/version manifest. CI must fail if a critical test is skipped; optional absence of future test suites before their phase is documented, never reported passed. Later phases cannot break prior passing suites.
