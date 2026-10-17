# 02 · Non Functional Requirements

Status: proposed implementation baseline; implementation requires separate human approval.

## Measurable quality targets
Targets below are release acceptance targets, not measured claims. Phase22 records hardware, seed size, tool version and raw results.

| ID | Target | Verification and threshold |
|---|---|---|
| NFR-PERF-001 | API performance | At 50 concurrent users, 10k users/5k vehicles/100k bookings: p95 reads<500ms, writes<800ms excluding upload/email and password hashing; error rate<1% |
| NFR-PERF-002 | Pagination/query efficiency | Every collection default20,max100; max90day reports; no unbounded joins/N+1 on list endpoints; EXPLAIN ANALYZE indexed search predicates |
| NFR-PERF-003 | Frontend delivery | On seeded mobile profile Lighthouse performance>=85, accessibility>=95; LCP<=2.5s, CLS<=0.1; initial compressed JS target<=250KiB with route splitting |
| NFR-SEC-001 | Authorization | Negative API test for every role-restricted operation and cross-owner object; no known unmitigated critical/high dependency or application finding |
| NFR-CONS-001 | Inventory integrity | 100 concurrent final-seat attempts never exceed capacity; same driver/vehicle cannot overlap across booking/carpool/blocks; rollback leaves no orphan state |
| NFR-REL-001 | Durable events | Healthy outbox worker delivers in-app within60s p95; restart/replay creates no duplicate event-recipient notifications |
| NFR-REL-002 | Availability/recovery | Initial single-region target99.5% monthly excluding declared maintenance; daily encrypted backup target RPO24h/RTO4h verified by restore rehearsal |
| NFR-A11Y-001 | Accessible web | WCAG2.2 AA target, keyboard end-to-end, contrast4.5:1 text/3:1 large text+controls, focus visibility, reduced motion, no color-only meaning; axe no serious/critical defects |
| NFR-OBS-001 | Observability | Correlated requestId on response/errors/logs; latency/status/job lag metrics; no passwords,tokens,OTP,license numbers,private object keys in logs |
| NFR-MAINT-001 | Maintainability | Strict TypeScript; layered modules; contract checks and traceability valid; no placeholder feature branches represented complete |
| NFR-TIME-001 | Time correctness | UTC timestamptz; half-open intervals; origin-zone date search; server clock controls deadlines; test exact boundaries and DST fixture |
| NFR-OPS-001 | Reproducibility | Clean checkout -> locked install -> fresh migrated test DB -> tests -> production build; containers non-root; no prod seed; graceful30s drain |

## Data minimization and retention
Private docs never enter public DTOs. Operational records retained while unresolved obligations exist. Proposed default retention: expired auth challenges24h, refresh token hashes until family expiry+7d for replay detection, idempotency24h, unread/read notifications180d, succeeded outbox90d, orphan uploads30min grace, superseded documents90d unless unresolved complaint, audits365d. Backups30d. Phase23 must record actual deployment policy and deletion jobs; public launch requires owner confirmation of operating region and retention policy. Retention deletes must not cascade booking/review/audit history or break referenced verification snapshots; skip held records and report holds.

## Scope of guarantees
Search is advisory. A quote is a price snapshot, not a hold. Committed reservation/seat transactions establish inventory. Email outages do not undo bookings; notification failures do not disappear. Manual ride updates do not prove actual movement. Reports describe estimated booking value, never processed payments.
