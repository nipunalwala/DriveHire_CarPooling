# 18 · Lean acceptance criteria

All active requirement scenarios below must have observed evidence before release. Milestone-level evidence is incremental; completed foundation remains valid.

## AUTH-REGISTER — FR-AUTH-001

A correct OTP works once; sixth wrong attempt cannot verify; no ADMIN input accepted Owning milestones: 03.

## AUTH-LOGIN — FR-AUTH-002

Cookie HttpOnly/Secure in staging/prod; token never localStorage; logout token fails next API request Owning milestones: 03.

## AUTH-REFRESH-RACE — FR-AUTH-003

Two refreshes with same token cannot both succeed; replay invalidates successor; family age never exceeds30d Owning milestones: 03.

## AUTH-RESET — FR-AUTH-004

One reset token succeeds once; login with old password fails; secrets absent logs Owning milestones: 03.

## USER-MULTIROLE — FR-USER-001

Foreign updates return404; no OWNER or ADMIN public grant; role does not imply approval Owning milestones: 03.

## DRIVER-ONBOARD — FR-DRIVER-001

Unverified driver absent public search and cannot accept/host; two simultaneous submissions yield one pending Owning milestones: 04,05.

## DRIVER-VERIFY — FR-DRIVER-002

Outdated approval request cannot approve replacement license; expired driver blocked even if expiry job paused Owning milestones: 04.

## DRIVER-AVAILABILITY — FR-DRIVER-003

Booking against driver BLOCKED interval fails; touching [start,end) intervals succeed Owning milestones: 04,05.

## VEHICLE-REGISTER — FR-VEHICLE-001

No rental price/listing input accepted; another user cannot edit or download evidence Owning milestones: 04.

## VEHICLE-VERIFY — FR-VEHICLE-002

Approved but expired insurance cannot create quote/booking; rejected reason visible owner only Owning milestones: 04.

## VEHICLE-ARCHIVE — FR-VEHICLE-003

Archive with commitments returns409; no rental listing or fleet availability workflow Owning milestones: 04.

## BOOKING-QUOTE — FR-BOOKING-001

Only DRIVER_HIRE accepted; reject self-hire, foreign vehicle and stale qualification/rate; total equals driver subtotal Owning milestones: 05.

## BOOKING-CONCURRENCY — FR-BOOKING-002

Concurrent overlapping booking/carpool/block commits at most one; injected failure rolls back all writes Owning milestones: 05.

## BOOKING-CONSENT — FR-BOOKING-003

No owner consent or driver replacement endpoint; foreign/stale/expired decision fails; one acceptance confirms Owning milestones: 05.

## BOOKING-CANCEL-EXPIRE — FR-BOOKING-004

Cancel twice cannot release unrelated holds; delayed worker cannot permit accept after deadline Owning milestones: 05.

## CARPOOL-PUBLISH — FR-CARPOOL-001

Foreign/unapproved vehicle rejected; only INSTANT join mode; cross-service conflict409 Owning milestones: 06.

## CARPOOL-SEARCH — FR-CARPOOL-002

Day boundary search includes correct UTC intervals; roster/contact absent public response Owning milestones: 06.

## CARPOOL-LAST-SEAT — FR-CARPOOL-003

Two concurrent final-seat requests cannot both succeed; no PENDING/REJECTED approval flow; per-user active participation unique Owning milestones: 06.

## CARPOOL-CANCEL-RACE — FR-CARPOOL-005

Repeated cancel does not decrement twice; whole-ride cancel clears live seat count atomically Owning milestones: 06.

## RIDE-STATE-MACHINE — FR-RIDE-001

SCHEDULED cannot start; two same-version transitions commit once; completion releases reservations and updates parent Owning milestones: 05,06.

## RIDE-OVERRUN — FR-RIDE-002

Active overrun blocks next start even when planned intervals are adjacent; no waypoint/GPS feature Owning milestones: 05,06.

## ADMIN-SUSPEND — FR-ADMIN-001

Already issued JWT blocked next request; active driver incident visible for admin resolution; reactivation needs fresh login Owning milestones: 04,05,06.

## ADMIN-OPERATIONS — FR-ADMIN-002

No replacement workflow; active physical use never released by clock alone; all administrator writes audited Owning milestones: 04,05,06.

## ADMIN-REPORTS — FR-ADMIN-004

Runtime cannot update/delete audit records; no raw secrets or documents in audit payload Owning milestones: 04,05,06.

## SEC-UPLOAD — FR-SEC-001

SVG/HTML spoof rejected; public image cannot expose license; referenced approved doc cannot be removed Owning milestones: 04,08.

## OPS-RESTORE — FR-OPS-001

Fresh DB applies migrations incl exclusion constraints; production build boots; restore reconciles reservations/seats/outbox Owning milestones: 01,02,08.

## Release gate

Both complete API-backed browser journeys work with real persistence, authorization, negative/concurrency coverage and private uploads. No unmitigated Critical/High issue. Keyboard, responsive and contrast evidence is recorded. Both images/builds and actual migration/restore checks pass in the available environment; production launch is separate. Deferred operations are absent from active contract/screens/schema; no placeholder success. Generated assets are committed with provenance.
