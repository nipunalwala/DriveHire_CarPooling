# 17 · Risk Analysis

Status: proposed implementation baseline; implementation requires separate human approval.

## Risk register
| ID | Risk / likelihood-impact | Mitigation / owner / proof |
|---|---|---|
| R01 | Cross-service double allocation / high-critical | Shared typed reservations, GiST partial exclusions, lock protocol; backend owner; BOOKING-CONCURRENCY + CARPOOL-PUBLISH |
| R02 | Final-seat race/counter drift / high-critical | Locked aggregate+conditional increment+CHECK+request unique; backend owner; CARPOOL-LAST-SEAT100concurrent |
| R03 | ORM drops raw constraints / medium-critical | Pinned Prisma workflow, reviewed custom SQL, catalog introspection after fresh/incremental deploy; DB owner; db:test:constraints |
| R04 | Refresh response loss/tab race / medium-high | Cross-tab coordinator; strict one-use/replay revocation; explicit login recovery; auth owner; AUTH-REFRESH-RACE |
| R05 | Notification lost between commit/process / high-high | Transactional outbox, recipient snapshots, channel delivery keys, dead-letter alert; API/ops; NOTIFY-REPLAY |
| R06 | Malicious documents/PII leak / medium-critical | Private quarantine+scanner+reencode, scoped blob delivery, encryption/digests, read audit; security; SEC-UPLOAD |
| R07 | Approval expiry/edits race commitments / medium-high | Subject/user locks, every-write checks, edit restriction, expiry cancellation+active incident; backend; VERIFY/EXPIRY tests |
| R08 | Admin escalation or object ID access / medium-critical | Additive explicit roles, no public admin grant, current DB auth, object scopes, last-admin singleton; security; ADMIN-SUSPEND |
| R09 | Physical trip overrun / high-high | Never auto-complete/release active use, next-start guard, operator incident; ops; RIDE-OVERRUN |
| R10 | Service eligibility too restrictive / medium-medium | Explicit self-drive approved-driver and driver-only owned-verified-vehicle decisions; owner can revise via ADR before implementation; product |
| R11 | Deployment provider lacks extension/storage/SMTP / medium-high | Validate btree_gist and durable adapters in Phase01/23, no prod fake mail/scan; ops; fresh deploy/restore |
| R12 | Estimate confused with payment/revenue / medium-high | NOT_COLLECTED everywhere, no payment status transitions, report estimate labels; product/UI; content+API tests |
| R13 | Planning/contract drift across fresh sessions / high-high | Canonical IDs, docs check, phase evidence manifests, ADR updates before shared changes; tech lead; trace coverage |
| R14 | Migration/runtime major version drift / medium-high | Verify supported exact versions in Phase01, pin lockfile, ADR for ORM major, never guess API; tech lead; recorded compatibility matrix |
| R15 | Unbounded suspension transaction / low-high initially | Initial release cap500 affected live commitments per account; reject broad operation with operator staged-maintenance procedure if exceeded, never partially suspend invisibly; backend/ops; bounded load test |
| R16 | Real operating/retention conditions unconfirmed / medium-high | Treat market/currency as proposed default; owner confirms actual operating model, region, policy before public launch; product; launch checklist |

## Explicit unresolved deployment inputs
Production host/DNS/SMTP/private-storage credentials, backup service, secret-manager choice and final operating/retention policy remain owner/deployment inputs. No blueprint permission to process payments or activate live GPS. Design tokens/service eligibility are recommended baseline decisions presented at final approval. No unresolved question may be hidden inside a future TODO; phases either use recorded default or stop for a material ADR change.

## Risk acceptance
SMTP informational emails can duplicate across crash because generic SMTP cannot prove exactly once; in-app effects must dedupe. Search availability can be stale; atomic creation returns409 with recovery. A quote10min is not an inventory guarantee. Manual trip status cannot prove physical journey completion. Single-region deployment targets are goals until measured. These limitations must be accurately described in UI/help and handoff evidence.
