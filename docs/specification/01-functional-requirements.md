# 01 · Functional requirements

Active lean requirements only. Stable IDs are retained; gaps identify explicitly deferred requirements. Fields come from the active planning model and trace to OpenAPI, entities and screens.

## FR-AUTH-001 · Registration and email verification

- **Actor:** Visitor.
- **Preconditions:** No authenticated account needed.
- **Trigger:** Submit registration, then OTP.
- **Flow:** Normalize email; create ACTIVE unverified user and PASSENGER role; enqueue OTP; consume correct OTP atomically.
- **Alternatives:** Existing email receives generic acknowledgement; resend replaces prior code.
- **Errors:** Invalid body 422; bad/expired code 400; attempt/resend limit 429.
- **Postconditions:** Email verified once; no duplicate account.
- **Acceptance:** A correct OTP works once; sixth wrong attempt cannot verify; no ADMIN input accepted.
- **Milestones:** 03.
- **Evidence ID:** AUTH-REGISTER.

## FR-AUTH-002 · Login and logout

- **Actor:** Verified user.
- **Preconditions:** ACTIVE account and verified email.
- **Trigger:** Submit credentials or logout.
- **Flow:** Check Argon2id; issue 15-minute access JWT and opaque refresh cookie; logout revokes family.
- **Alternatives:** Bad email/password share error; repeated logout succeeds.
- **Errors:** Invalid credentials 401; unverified/suspended 403; rate limit 429.
- **Postconditions:** Session tracked; logged-out access rejected by family check.
- **Acceptance:** Cookie HttpOnly/Secure in staging/prod; token never localStorage; logout token fails next API request.
- **Milestones:** 03.
- **Evidence ID:** AUTH-LOGIN.

## FR-AUTH-003 · Rotating refresh and session controls

- **Actor:** User.
- **Preconditions:** Valid nonrevoked refresh family.
- **Trigger:** Refresh or revoke session.
- **Flow:** Lock token; consume; issue one successor with fixed family absolute expiry; list/revoke own sessions.
- **Alternatives:** Token reuse revokes family; client serializes refresh across tabs.
- **Errors:** Missing/reused/expired cookie 401; invalid Origin 403; foreign family 404.
- **Postconditions:** At most one rotation succeeds; revoked session immediately unusable.
- **Acceptance:** Two refreshes with same token cannot both succeed; replay invalidates successor; family age never exceeds30d.
- **Milestones:** 03.
- **Evidence ID:** AUTH-REFRESH-RACE.

## FR-AUTH-004 · Password reset

- **Actor:** User.
- **Preconditions:** Existing verified account, but response does not reveal it.
- **Trigger:** Request reset then submit link/token.
- **Flow:** Queue 256-bit reset link; consume hash under lock within15min; replace password; revoke all sessions.
- **Alternatives:** Unknown email acknowledges identically; newer request invalidates prior link.
- **Errors:** Bad/reused/expired token400; weak password422; limit429.
- **Postconditions:** No prior refresh or access token works.
- **Acceptance:** One reset token succeeds once; login with old password fails; secrets absent logs.
- **Milestones:** 03.
- **Evidence ID:** AUTH-RESET.

## FR-USER-001 · Own profile and driver capability

- **Actor:** Verified user.
- **Preconditions:** ACTIVE account.
- **Trigger:** Edit profile or enable DRIVER/OWNER.
- **Flow:** Update own safe profile; self-enable DRIVER onboarding; ADMIN is operator-granted; vehicle ownership is users.id, not an OWNER role.
- **Alternatives:** Existing DRIVER grant is idempotent; personal-vehicle form available without extra role.
- **Errors:** ADMIN grant request422; foreign profile404; invalid phone422.
- **Postconditions:** Unique user-role rows; operational verification unchanged.
- **Acceptance:** Foreign updates return404; no OWNER or ADMIN public grant; role does not imply approval.
- **Milestones:** 03.
- **Evidence ID:** USER-MULTIROLE.

## FR-DRIVER-001 · Driver profile, documents and submission

- **Actor:** DRIVER.
- **Preconditions:** Verified active email and DRIVER role.
- **Trigger:** Complete onboarding and submit.
- **Flow:** Persist license details; upload/quarantine; submit clean license revision with expiry and immutable document references.
- **Alternatives:** Rejected revision can be corrected and resubmitted; pending duplicate returns409.
- **Errors:** Bad upload415/413; expired license422; missing doc422.
- **Postconditions:** Pending revision does not confer booking eligibility.
- **Acceptance:** Unverified driver absent public search and cannot accept/host; two simultaneous submissions yield one pending.
- **Milestones:** 04,05.
- **Evidence ID:** DRIVER-ONBOARD.

## FR-DRIVER-002 · Driver approval lifecycle

- **Actor:** ADMIN.
- **Preconditions:** Pending current revision; admin not subject.
- **Trigger:** Approve/reject revision.
- **Flow:** Validate clean current unexpired snapshot; CAS status; record actor/reason in immutable audit.
- **Alternatives:** Material identity edit invalidates prior approval; expiry worker disables eligibility.
- **Errors:** Stale revision409; self approval403; expired docs422.
- **Postconditions:** Only APPROVED unexpired profile eligible.
- **Acceptance:** Outdated approval request cannot approve replacement license; expired driver blocked even if expiry job paused.
- **Milestones:** 04.
- **Evidence ID:** DRIVER-VERIFY.

## FR-DRIVER-003 · Driver availability and history

- **Actor:** DRIVER.
- **Preconditions:** Own profile; approval needed to list.
- **Trigger:** Set availability, view requests/history.
- **Flow:** Store explicit UTC AVAILABLE/BLOCKED windows; reserve blocks; public hire needs full window; list self requests.
- **Alternatives:** Disable listing preserves accepted work; self-drive/host need no hire window.
- **Errors:** Overlap409; remove window uncovering holds409.
- **Postconditions:** No double use across hire/carpool/block.
- **Acceptance:** Booking against driver BLOCKED interval fails; touching [start,end) intervals succeed.
- **Milestones:** 04,05.
- **Evidence ID:** DRIVER-AVAILABILITY.

## FR-VEHICLE-001 · Personal vehicle registration

- **Actor:** Verified user.
- **Preconditions:** ACTIVE verified account; no OWNER profile required.
- **Trigger:** Register own vehicle and submit private evidence.
- **Flow:** Create immutable owner_id=self vehicle; validate registration; scan evidence; submit current revision.
- **Alternatives:** Edit material fields only without live/future commitments, invalidating approval.
- **Errors:** Foreign vehicle404; duplicate registration409; invalid capacity422.
- **Postconditions:** Owner relationship immutable; private documents protected.
- **Acceptance:** No rental price/listing input accepted; another user cannot edit or download evidence.
- **Milestones:** 04.
- **Evidence ID:** VEHICLE-REGISTER.

## FR-VEHICLE-002 · Vehicle verification and expiry

- **Actor:** ADMIN.
- **Preconditions:** Current PENDING revision.
- **Trigger:** Approve/reject or expiry.
- **Flow:** Review registration and insurance; approve current revision; compute eligibility through document dates on every write.
- **Alternatives:** Material vehicle edits require new approval; nonmaterial description edit preserves qualification.
- **Errors:** Own verification403; stale version409; expired insurance422.
- **Postconditions:** Only valid approved vehicles can be booked/published.
- **Acceptance:** Approved but expired insurance cannot create quote/booking; rejected reason visible owner only.
- **Milestones:** 04.
- **Evidence ID:** VEHICLE-VERIFY.

## FR-VEHICLE-003 · Own vehicles and safe archival

- **Actor:** Verified vehicle owner.
- **Preconditions:** Vehicle owner or authorized administrator.
- **Trigger:** Read own vehicles or archive one.
- **Flow:** List own personal vehicles; archive only when no live/future commitments; preserve identity/history.
- **Alternatives:** Unavailable vehicle remains visible to its owner with reason.
- **Errors:** Archive with pending/future/active trip409.
- **Postconditions:** Archived vehicle unavailable for new hire requests or hosted rides.
- **Acceptance:** Archive with commitments returns409; no rental listing or fleet availability workflow.
- **Milestones:** 04.
- **Evidence ID:** VEHICLE-ARCHIVE.

## FR-BOOKING-001 · Driver search and driver-only quotes

- **Actor:** PASSENGER.
- **Preconditions:** Verified user; resources satisfy mode rules.
- **Trigger:** Choose resources and dates.
- **Flow:** Search approved drivers; quote external driver with requester-owned approved vehicle; immutable ten-minute quote prices only driver hours.
- **Alternatives:** No eligible driver/vehicle yields explicit recovery.
- **Errors:** Past/invalid date422; ineligible resources409; fabricated price rejected422.
- **Postconditions:** Quote specifies modes, rates, total and NOT_COLLECTED.
- **Acceptance:** Only DRIVER_HIRE accepted; reject self-hire, foreign vehicle and stale qualification/rate; total equals driver subtotal.
- **Milestones:** 05.
- **Evidence ID:** BOOKING-QUOTE.

## FR-BOOKING-002 · Atomic booking creation and idempotency

- **Actor:** Verified PASSENGER.
- **Preconditions:** Owned valid quote, lead>=60min, available resources.
- **Trigger:** POST booking with Idempotency-Key.
- **Flow:** Lock accounts/resources; revalidate eligibility/versions; reserve driver and vehicle; create PENDING booking, one DRIVER decision, SCHEDULED trip, history and idempotency result atomically.
- **Alternatives:** Same key/body replays same result24h; new quote needed if rates changed.
- **Errors:** Conflict409; key payload mismatch409; expired quote409.
- **Postconditions:** No partial resource holds or orphan trip.
- **Acceptance:** Concurrent overlapping booking/carpool/block commits at most one; injected failure rolls back all writes.
- **Milestones:** 05.
- **Evidence ID:** BOOKING-CONCURRENCY.

## FR-BOOKING-003 · Single driver consent

- **Actor:** Assigned external driver.
- **Preconditions:** PENDING unexpired booking; actor is assigned driver.
- **Trigger:** Accept/reject request.
- **Flow:** Lock pending unexpired booking; accept exactly one DRIVER decision and confirm or reject and release both reservations.
- **Alternatives:** Changed driver requires cancellation and a new quote/request.
- **Errors:** Nonprovider403/404; stale decision409; ineligible resource409.
- **Postconditions:** One DRIVER acceptance confirms booking and assigns trip; rejection releases both holds.
- **Acceptance:** No owner consent or driver replacement endpoint; foreign/stale/expired decision fails; one acceptance confirms.
- **Milestones:** 05.
- **Evidence ID:** BOOKING-CONSENT.

## FR-BOOKING-004 · Cancellation, rejection and expiry

- **Actor:** Requester/provider/admin/worker.
- **Preconditions:** Pending or confirmed unstarted booking.
- **Trigger:** Cancel, reject or deadline reached.
- **Flow:** Lock booking; validate version/cutoff; terminalize booking/trip; append history and release reservations once.
- **Alternatives:** Requester confirmed cutoff15min; provider cancellation allowed before start with reason; overdue pending worker expires.
- **Errors:** After start409; missing reason422; unauthorized404.
- **Postconditions:** Terminal outcomes immutable; no refund/payment claims.
- **Acceptance:** Cancel twice cannot release unrelated holds; delayed worker cannot permit accept after deadline.
- **Milestones:** 05.
- **Evidence ID:** BOOKING-CANCEL-EXPIRE.

## FR-CARPOOL-001 · Host draft and publication

- **Actor:** DRIVER+OWNER.
- **Preconditions:** Approved DRIVER with owned approved vehicle; no OWNER role.
- **Trigger:** Create/edit draft then publish.
- **Flow:** Create own draft; publish INSTANT ride with both physical resource holds and assigned trip.
- **Alternatives:** Draft edits reserve nothing; published material changes require cancel/recreate.
- **Errors:** Foreign vehicle404; seats>vehicle.seats-1 422; overlap409.
- **Postconditions:** Published capacity excludes driver and is immutable.
- **Acceptance:** Foreign/unapproved vehicle rejected; only INSTANT join mode; cross-service conflict409.
- **Milestones:** 06.
- **Evidence ID:** CARPOOL-PUBLISH.

## FR-CARPOOL-002 · Carpool search and detail

- **Actor:** Visitor/passenger.
- **Preconditions:** Published eligible ride before join cutoff.
- **Trigger:** Search origin,destination,date,seats.
- **Flow:** Use city IDs; interpret date in origin timezone; return published rides with enough remaining seats and unexpired resources.
- **Alternatives:** Full ride remains reachable by detail but absent seats>=1 search; drafts private.
- **Errors:** Invalid date/seats422; private ride404.
- **Postconditions:** No exact-location/GPS implication.
- **Acceptance:** Day boundary search includes correct UTC intervals; roster/contact absent public response.
- **Milestones:** 06.
- **Evidence ID:** CARPOOL-SEARCH.

## FR-CARPOOL-003 · Instant carpool joining

- **Actor:** PASSENGER.
- **Preconditions:** Verified non-host PASSENGER; published unstarted ride before cutoff.
- **Trigger:** Submit seat count and idempotency key.
- **Flow:** Lock carpool; check remaining capacity; create ACCEPTED participation and update count atomically.
- **Alternatives:** Full ride returns409; exact idempotent replay does not add seats.
- **Errors:** Not enough seats409; self join403; request after cutoff409.
- **Postconditions:** Available=offered-confirmed; never negative.
- **Acceptance:** Two concurrent final-seat requests cannot both succeed; no PENDING/REJECTED approval flow; per-user active participation unique.
- **Milestones:** 06.
- **Evidence ID:** CARPOOL-LAST-SEAT.

## FR-CARPOOL-005 · Passenger cancellation and host cancellation

- **Actor:** Requester/host/admin.
- **Preconditions:** Unstarted ride; requester cutoff applies.
- **Trigger:** Cancel request or entire ride.
- **Flow:** Cancel accepted seats before cutoff or whole unstarted carpool; release seats/resources exactly once with persistent history.
- **Alternatives:** Administrator pre-start override requires reason; no seats mutate after actual start.
- **Errors:** After start requester409; stale version409; unauthorized404.
- **Postconditions:** No seat count drift; changed state available in participant and host screens.
- **Acceptance:** Repeated cancel does not decrement twice; whole-ride cancel clears live seat count atomically.
- **Milestones:** 06.
- **Evidence ID:** CARPOOL-CANCEL-RACE.

## FR-RIDE-001 · Authorized lifecycle and history

- **Actor:** Assigned driver/admin.
- **Preconditions:** Confirmed booking or published carpool.
- **Trigger:** Manual transition.
- **Flow:** Follow SCHEDULED->ASSIGNED->STARTED->IN_TRANSIT->COMPLETED; lock resources and trip; CAS version; append history and outbox; sync parent.
- **Alternatives:** FAILED by driver/admin with reason; cancellation/rejection/expiry prior to start; late starts expire after30min.
- **Errors:** Skipped/backward/terminal409; passenger advance403.
- **Postconditions:** One immutable event/history per transition; parent state consistent.
- **Acceptance:** SCHEDULED cannot start; two same-version transitions commit once; completion releases reservations and updates parent.
- **Milestones:** 05,06.
- **Evidence ID:** RIDE-STATE-MACHINE.

## FR-RIDE-002 · Operational overrun protection

- **Actor:** Assigned driver/admin/participant.
- **Preconditions:** Trip STARTED or IN_TRANSIT after planned end.
- **Trigger:** Scheduled end passes while trip is active.
- **Flow:** Flag incident; retain physical-use guard; block another start with same driver or vehicle; show administrator current persisted state.
- **Alternatives:** Resolve conflict through reasoned cancellation/new booking, never automatic physical release.
- **Errors:** Nonparticipant404; unauthorized mutation403; invalid/stale transition409.
- **Postconditions:** Incident persisted; active resources guarded until deliberate resolution.
- **Acceptance:** Active overrun blocks next start even when planned intervals are adjacent; no waypoint/GPS feature.
- **Milestones:** 05,06.
- **Evidence ID:** RIDE-OVERRUN.

## FR-ADMIN-001 · User suspension/reactivation

- **Actor:** ADMIN.
- **Preconditions:** Active admin; target not self/last active admin.
- **Trigger:** Suspend with reason.
- **Flow:** Revoke session access; disable new-work eligibility; atomically cancel unstarted commitments; flag started incidents; append audit.
- **Alternatives:** Reactivation does not renew verification, restore sessions or reinstate cancelled bookings.
- **Errors:** Self/last admin409; nonadmin403; absent reason422.
- **Postconditions:** Suspended account cannot mutate/read protected APIs; history preserved.
- **Acceptance:** Already issued JWT blocked next request; active driver incident visible for admin resolution; reactivation needs fresh login.
- **Milestones:** 04,05,06.
- **Evidence ID:** ADMIN-SUSPEND.

## FR-ADMIN-002 · Operational booking/carpool/trip management

- **Actor:** ADMIN.
- **Preconditions:** Active backend ADMIN permission.
- **Trigger:** Inspect queues, cancel unstarted, fail incident trip.
- **Flow:** Inspect booking/carpool/trip; authorized reasoned cancellation before start or FAILED incident after start; preserve history and reservations correctly.
- **Alternatives:** Changing assigned driver requires cancel/new booking.
- **Errors:** Invalid transition409; nonadmin403.
- **Postconditions:** Admin cannot bypass resource overlap or seat constraints.
- **Acceptance:** No replacement workflow; active physical use never released by clock alone; all administrator writes audited.
- **Milestones:** 04,05,06.
- **Evidence ID:** ADMIN-OPERATIONS.

## FR-ADMIN-004 · Immutable administrator audit

- **Actor:** ADMIN.
- **Preconditions:** Active ADMIN; bounded pagination and allowlisted filters.
- **Trigger:** Administrator sensitive read or mutation.
- **Flow:** Record actor, action, target, reason where required, request ID and time; read paginated allowlisted audit views.
- **Alternatives:** No report/analytics/export subsystem.
- **Errors:** Excessive range422; nonadmin403; mutation of audit unsupported.
- **Postconditions:** No secrets in immutable audit payloads.
- **Acceptance:** Runtime cannot update/delete audit records; no raw secrets or documents in audit payload.
- **Milestones:** 04,05,06.
- **Evidence ID:** ADMIN-REPORTS.

## FR-SEC-001 · Private uploads and file lifecycle

- **Actor:** Owner/admin; public approved image visitor.
- **Preconditions:** Authorized subject and allowed document kind.
- **Trigger:** Upload/download/retire file.
- **Flow:** Limit5MiB; magic-byte allowlist JPEG/PNG/WebP/PDF; random storage key; scan private quarantine; stream clean authorized file; re-encode images strip metadata.
- **Alternatives:** Local private disk+scanner and durable object-storage adapter share contract; pending scan blocks submission.
- **Errors:** Oversize413; invalid MIME415; foreign document404; malware422.
- **Postconditions:** No public private-file URL or path traversal; orphan cleanup30min.
- **Acceptance:** SVG/HTML spoof rejected; public image cannot expose license; referenced approved doc cannot be removed.
- **Milestones:** 04,08.
- **Evidence ID:** SEC-UPLOAD.

## FR-OPS-001 · Health, deployment and recoverability

- **Actor:** Operator.
- **Preconditions:** Configured environment and migrated PostgreSQL.
- **Trigger:** Deploy, check readiness or restore.
- **Flow:** Validate env; migration release job; drain HTTP/worker; health/ready probes; durable storage; backup and restore rehearsal.
- **Alternatives:** Worker retry and clean restart maintain domain correctness; demo data isolated.
- **Errors:** Readiness503 on DB/schema/worker failure; refuse prod seed.
- **Postconditions:** Reproducible deploy; schema/extensions supported; backups restored.
- **Acceptance:** Fresh DB applies migrations incl exclusion constraints; production build boots; restore reconciles reservations/seats/outbox.
- **Milestones:** 01,02,08.
- **Evidence ID:** OPS-RESTORE.
