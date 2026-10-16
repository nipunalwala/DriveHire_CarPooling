# 01 · Functional Requirements

Status: proposed implementation baseline; implementation requires separate human approval.

Every record below is normative; acceptance/test IDs are traced in [19 requirements-traceability](19-requirements-traceability.md). All HTTP routes are defined by [OpenAPI](../api/openapi.json).

## FR-AUTH-001 · Registration and email verification
- **Actor:** Visitor.
- **Preconditions:** No authenticated account needed.
- **Trigger:** Submit registration, then OTP.
- **Main flow:** Normalize email; create ACTIVE unverified user and PASSENGER role; enqueue OTP; consume correct OTP atomically.
- **Alternative flows:** Existing email receives generic acknowledgement; resend replaces prior code.
- **Error cases:** Invalid body 422; bad/expired code 400; attempt/resend limit 429.
- **Postconditions:** Email verified once; no duplicate account.
- **Acceptance criteria:** A correct OTP works once; sixth wrong attempt cannot verify; no ADMIN input accepted.
- **Implementation phases:** 03,15. **Verification scenario:** `AUTH-REGISTER`.


## FR-AUTH-002 · Login and logout
- **Actor:** Verified user.
- **Preconditions:** ACTIVE account and verified email.
- **Trigger:** Submit credentials or logout.
- **Main flow:** Check Argon2id; issue 15-minute access JWT and opaque refresh cookie; logout revokes family.
- **Alternative flows:** Bad email/password share error; repeated logout succeeds.
- **Error cases:** Invalid credentials 401; unverified/suspended 403; rate limit 429.
- **Postconditions:** Session tracked; logged-out access rejected by family check.
- **Acceptance criteria:** Cookie HttpOnly/Secure in staging/prod; token never localStorage; logout token fails next API request.
- **Implementation phases:** 03,15. **Verification scenario:** `AUTH-LOGIN`.


## FR-AUTH-003 · Rotating refresh and session controls
- **Actor:** User.
- **Preconditions:** Valid nonrevoked refresh family.
- **Trigger:** Refresh or revoke session.
- **Main flow:** Lock token; consume; issue one successor with fixed family absolute expiry; list/revoke own sessions.
- **Alternative flows:** Token reuse revokes family; client serializes refresh across tabs.
- **Error cases:** Missing/reused/expired cookie 401; invalid Origin 403; foreign family 404.
- **Postconditions:** At most one rotation succeeds; revoked session immediately unusable.
- **Acceptance criteria:** Two refreshes with same token cannot both succeed; replay invalidates successor; family age never exceeds30d.
- **Implementation phases:** 03,15. **Verification scenario:** `AUTH-REFRESH-RACE`.


## FR-AUTH-004 · Password reset
- **Actor:** User.
- **Preconditions:** Existing verified account, but response does not reveal it.
- **Trigger:** Request reset then submit link/token.
- **Main flow:** Queue 256-bit reset link; consume hash under lock within15min; replace password; revoke all sessions.
- **Alternative flows:** Unknown email acknowledges identically; newer request invalidates prior link.
- **Error cases:** Bad/reused/expired token400; weak password422; limit429.
- **Postconditions:** No prior refresh or access token works.
- **Acceptance criteria:** One reset token succeeds once; login with old password fails; secrets absent logs.
- **Implementation phases:** 03,15. **Verification scenario:** `AUTH-RESET`.


## FR-USER-001 · Profile and multiple roles
- **Actor:** Verified user.
- **Preconditions:** ACTIVE account.
- **Trigger:** Edit profile or enable DRIVER/OWNER.
- **Main flow:** Keep PASSENGER; add role idempotently; create draft onboarding profile; role union grants navigation, never approval.
- **Alternative flows:** Account may hold PASSENGER+DRIVER+OWNER+ADMIN; UI role switch changes context only.
- **Error cases:** ADMIN grant request422; foreign profile404; invalid phone422.
- **Postconditions:** Unique user-role rows; operational verification unchanged.
- **Acceptance criteria:** Repeated addRole creates one row; role switch does not alter token authority; backend ownership tested.
- **Implementation phases:** 04,15. **Verification scenario:** `USER-MULTIROLE`.


## FR-DRIVER-001 · Driver profile, documents and submission
- **Actor:** DRIVER.
- **Preconditions:** Verified active email and DRIVER role.
- **Trigger:** Complete onboarding and submit.
- **Main flow:** Persist license details; upload/quarantine; submit clean license revision with expiry and immutable document references.
- **Alternative flows:** Rejected revision can be corrected and resubmitted; pending duplicate returns409.
- **Error cases:** Bad upload415/413; expired license422; missing doc422.
- **Postconditions:** Pending revision does not confer booking eligibility.
- **Acceptance criteria:** Unverified driver absent public search and cannot accept/host; two simultaneous submissions yield one pending.
- **Implementation phases:** 05. **Verification scenario:** `DRIVER-ONBOARD`.


## FR-DRIVER-002 · Driver approval lifecycle
- **Actor:** ADMIN.
- **Preconditions:** Pending current revision; admin not subject.
- **Trigger:** Approve/reject revision.
- **Main flow:** Validate clean current unexpired snapshot; CAS status; record actor/reason; emit event.
- **Alternative flows:** Material identity edit invalidates prior approval; expiry worker disables eligibility.
- **Error cases:** Stale revision409; self approval403; expired docs422.
- **Postconditions:** Only APPROVED unexpired profile eligible.
- **Acceptance criteria:** Outdated approval request cannot approve replacement license; expired driver blocked even if expiry job paused.
- **Implementation phases:** 05,12,19. **Verification scenario:** `DRIVER-VERIFY`.


## FR-DRIVER-003 · Driver availability and history
- **Actor:** DRIVER.
- **Preconditions:** Own profile; approval needed to list.
- **Trigger:** Set availability, view requests/history.
- **Main flow:** Store explicit UTC AVAILABLE/BLOCKED windows; reserve blocks; public hire needs full window; list self requests.
- **Alternative flows:** Disable listing preserves accepted work; self-drive/host need no hire window.
- **Error cases:** Overlap409; remove window uncovering holds409.
- **Postconditions:** No double use across hire/carpool/block.
- **Acceptance criteria:** Booking against driver BLOCKED interval fails; touching [start,end) intervals succeed.
- **Implementation phases:** 05,17. **Verification scenario:** `DRIVER-AVAILABILITY`.


## FR-VEHICLE-001 · Owner and vehicle registration
- **Actor:** OWNER.
- **Preconditions:** Complete own owner profile.
- **Trigger:** Add/edit vehicle.
- **Main flow:** Normalize unique registration; set DRAFT; upload clean registration/insurance/image; submit immutable revision.
- **Alternative flows:** Owner may own many vehicles; archived registrations remain reserved.
- **Error cases:** Foreign vehicle404; duplicate registration409; invalid capacity422.
- **Postconditions:** Owner relationship immutable; private documents protected.
- **Acceptance criteria:** Cross-owner edit/read/download denied; no unverified public listing.
- **Implementation phases:** 06,18. **Verification scenario:** `VEHICLE-REGISTER`.


## FR-VEHICLE-002 · Vehicle verification and expiry
- **Actor:** ADMIN.
- **Preconditions:** Current PENDING revision.
- **Trigger:** Approve/reject or expiry.
- **Main flow:** Review registration and insurance; approve current revision; compute eligibility through document dates on every write.
- **Alternative flows:** Material vehicle edits need new approval; price edits affect new quotes only.
- **Error cases:** Own verification403; stale version409; expired insurance422.
- **Postconditions:** Only valid approved vehicles can be booked/published.
- **Acceptance criteria:** Approved but expired insurance cannot create quote/booking; rejected reason visible owner only.
- **Implementation phases:** 06,12,19. **Verification scenario:** `VEHICLE-VERIFY`.


## FR-VEHICLE-003 · Vehicle availability, safe archive and history
- **Actor:** OWNER.
- **Preconditions:** Own unarchived vehicle.
- **Trigger:** List/unlist, edit windows or archive.
- **Main flow:** Require explicit hire window; blocks use shared reservations; prohibit archival with live commitments; retain history.
- **Alternative flows:** Unlist affects discovery/new commitments only; bookings/history remain accessible.
- **Error cases:** Conflicting block409; archive with pending/future/active trip409.
- **Postconditions:** Archived vehicle absent discovery and new bookings.
- **Acceptance criteria:** History/reviews remain after archive; block cannot overlap host carpool.
- **Implementation phases:** 06,18. **Verification scenario:** `VEHICLE-ARCHIVE`.


## FR-BOOKING-001 · Search and quotes for three service modes
- **Actor:** PASSENGER.
- **Preconditions:** Verified user; resources satisfy mode rules.
- **Trigger:** Choose resources and dates.
- **Main flow:** Filter listings by city/category/seats/time; server prices rounded-up hours; issue owned10min quote snapshot.
- **Alternative flows:** Search results do not hold inventory; self-drive uses approved requester driver; DRIVER_HIRE uses requester-owned verified vehicle.
- **Error cases:** Past/invalid date422; ineligible resources409; fabricated price rejected422.
- **Postconditions:** Quote specifies modes, rates, total and NOT_COLLECTED.
- **Acceptance criteria:** Changing client total cannot change persisted price; quote after10min rejected; own vehicle rental rejected.
- **Implementation phases:** 07,14,16. **Verification scenario:** `BOOKING-QUOTE`.


## FR-BOOKING-002 · Atomic booking creation and idempotency
- **Actor:** Verified PASSENGER.
- **Preconditions:** Owned valid quote, lead>=60min, available resources.
- **Trigger:** POST booking with Idempotency-Key.
- **Main flow:** Lock accounts/resources; revalidate eligibility/versions; reserve both driver/vehicle; create PENDING booking, decisions, SCHEDULED trip, events and idempotency result in one transaction.
- **Alternative flows:** Same key/body replays same result24h; new quote needed if rates changed.
- **Error cases:** Conflict409; key payload mismatch409; expired quote409.
- **Postconditions:** No partial resource holds or orphan trip.
- **Acceptance criteria:** Concurrent overlapping booking/carpool/block commits at most one; injected failure rolls back all writes.
- **Implementation phases:** 07. **Verification scenario:** `BOOKING-CONCURRENCY`.


## FR-BOOKING-003 · Provider consent and assignment
- **Actor:** Owner/hired driver.
- **Preconditions:** PENDING unexpired booking, required provider.
- **Trigger:** Accept/reject request.
- **Main flow:** Record required owner consent for rental, driver consent for driver hire, both for combined; last acceptance confirms and assigns trip.
- **Alternative flows:** Pending replacement driver atomically swaps hold and resets driver consent; no deadline extension.
- **Error cases:** Nonprovider403/404; stale decision409; ineligible resource409.
- **Postconditions:** All approvals required before CONFIRMED/ASSIGNED; rejection releases holds.
- **Acceptance criteria:** Combined one approval stays PENDING; simultaneous final decisions produce one confirmation event.
- **Implementation phases:** 07,17,18. **Verification scenario:** `BOOKING-CONSENT`.


## FR-BOOKING-004 · Cancellation, rejection and expiry
- **Actor:** Requester/provider/admin/worker.
- **Preconditions:** Pending or confirmed unstarted booking.
- **Trigger:** Cancel, reject or deadline reached.
- **Main flow:** Lock booking; validate version/cutoff; terminalize booking and trip; release reservations; emit participant notifications.
- **Alternative flows:** Requester confirmed cutoff15min; provider cancellation allowed before start with reason; overdue pending worker expires.
- **Error cases:** After start409; missing reason422; unauthorized404.
- **Postconditions:** Terminal outcomes immutable; no refund/payment claims.
- **Acceptance criteria:** Cancel twice cannot release unrelated holds; delayed worker cannot permit accept after deadline.
- **Implementation phases:** 07,09. **Verification scenario:** `BOOKING-CANCEL-EXPIRE`.


## FR-CARPOOL-001 · Host draft and publication
- **Actor:** DRIVER+OWNER.
- **Preconditions:** Approved host driver and owned approved vehicle.
- **Trigger:** Create/edit draft then publish.
- **Main flow:** Store exact city pair, notes, times, seats and join mode; publish acquires same dual reservation as DriveHire; trip becomes ASSIGNED.
- **Alternative flows:** DRAFT holds no resources; published route/seat/price edits forbidden; cancel and recreate.
- **Error cases:** Foreign vehicle404; seats>vehicle.seats-1 422; overlap409.
- **Postconditions:** Published capacity excludes driver and is immutable.
- **Acceptance criteria:** Driver-only role cannot host without owned verified vehicle; published ride conflicts with hire reservation.
- **Implementation phases:** 08,17,18. **Verification scenario:** `CARPOOL-PUBLISH`.


## FR-CARPOOL-002 · Carpool search and detail
- **Actor:** Visitor/passenger.
- **Preconditions:** Published eligible ride before join cutoff.
- **Trigger:** Search origin,destination,date,seats.
- **Main flow:** Use city IDs; interpret date in origin timezone; return published rides with enough remaining seats and unexpired resources.
- **Alternative flows:** Full ride remains reachable by detail but absent seats>=1 search; drafts private.
- **Error cases:** Invalid date/seats422; private ride404.
- **Postconditions:** No exact-location/GPS implication.
- **Acceptance criteria:** Day boundary search includes correct UTC intervals; roster/contact absent public response.
- **Implementation phases:** 08,14,16. **Verification scenario:** `CARPOOL-SEARCH`.


## FR-CARPOOL-003 · Seat request and instant join
- **Actor:** PASSENGER.
- **Preconditions:** Verified active non-host; published ride >=15min before departure.
- **Trigger:** Submit positive seat count.
- **Main flow:** Lock carpool; create PENDING request for approval or ACCEPTED request + increment confirmedSeats for instant; store seat-price snapshot.
- **Alternative flows:** Pending requests consume no seats; existing live request409; user may request again after cancellation.
- **Error cases:** Not enough seats409; self join403; request after cutoff409.
- **Postconditions:** Available=offered-confirmed; never negative.
- **Acceptance criteria:** Many concurrent joins for final seat yield one ACCEPTED; idempotent retry consumes seats once.
- **Implementation phases:** 08,16. **Verification scenario:** `CARPOOL-LAST-SEAT`.


## FR-CARPOOL-004 · Host accept/reject requests
- **Actor:** Host.
- **Preconditions:** Own published ride; PENDING request; >=15min before start.
- **Trigger:** Choose accept/reject.
- **Main flow:** Lock ride then request; validate request version; accept checks capacity and increments counter atomically; reject changes request only.
- **Alternative flows:** Request may already be cancelled; host must reload; full ride can reject remaining requests.
- **Error cases:** Foreign host404; stale/capacity409; reason on rejection422.
- **Postconditions:** Accepted passengers visible only host/participants where authorized.
- **Acceptance criteria:** Two accepts for final seat cannot both succeed; accepted request cannot be accepted again.
- **Implementation phases:** 08,17. **Verification scenario:** `CARPOOL-APPROVAL`.


## FR-CARPOOL-005 · Passenger cancellation and host cancellation
- **Actor:** Requester/host/admin.
- **Preconditions:** Unstarted ride; requester cutoff applies.
- **Trigger:** Cancel request or entire ride.
- **Main flow:** Accepted cancellation restores seats once; pending cancellation changes no counter; ride cancellation cancels live requests, resets confirmedSeats, releases resources.
- **Alternative flows:** Pending requests expire at join cutoff; published unstarted ride expires30min after scheduled start; accepted no-show remains participant/history.
- **Error cases:** After start requester409; stale version409; unauthorized404.
- **Postconditions:** No seat count drift; affected users notified.
- **Acceptance criteria:** Race accept/cancel serializes; host cancellation plus passenger cancellation never produces negative count.
- **Implementation phases:** 08,09. **Verification scenario:** `CARPOOL-CANCEL-RACE`.


## FR-RIDE-001 · Authorized lifecycle and history
- **Actor:** Assigned driver/admin.
- **Preconditions:** Confirmed booking or published carpool.
- **Trigger:** Manual transition.
- **Main flow:** Follow SCHEDULED->ASSIGNED->STARTED->IN_TRANSIT->COMPLETED; lock resources and trip; CAS version; append history and outbox; sync parent.
- **Alternative flows:** FAILED by driver/admin with reason; cancellation/rejection/expiry prior to start; late starts expire after30min.
- **Error cases:** Skipped/backward/terminal409; passenger advance403.
- **Postconditions:** One immutable event/history per transition; parent state consistent.
- **Acceptance criteria:** SCHEDULED cannot start; two same-version transitions commit once; completion releases reservations and updates parent.
- **Implementation phases:** 09,16,17,19. **Verification scenario:** `RIDE-STATE-MACHINE`.


## FR-RIDE-002 · Simulated route and operational overruns
- **Actor:** Assigned driver/admin/participant.
- **Preconditions:** Visible trip; IN_TRANSIT for progress.
- **Trigger:** Advance marker or inspect overdue trip.
- **Main flow:** Persist manual waypoint index; label simulation; forbid start if resource still in any other STARTED/IN_TRANSIT trip; flag overrun.
- **Alternative flows:** Admin resolves upcoming conflict by cancellation/reassignment before resources start; never auto-complete or invent location.
- **Error cases:** Advance at end409; stale version409; non-driver403.
- **Postconditions:** Progress monotone; no real GPS or computed live ETA.
- **Acceptance criteria:** Overrunning earlier ride blocks next ride start even after scheduled interval ends; marker accessible text.
- **Implementation phases:** 09,17,19. **Verification scenario:** `RIDE-OVERRUN`.


## FR-REVIEW-001 · Eligible ratings and duplicate prevention
- **Actor:** Completed trip requester/accepted passenger.
- **Preconditions:** COMPLETED trip and actual resource.
- **Trigger:** Submit driver or vehicle review.
- **Main flow:** Validate participation and target; prevent reviewing self/own vehicle; save rating1..5 and plain text; unique target per author/trip.
- **Alternative flows:** Rental requester rates vehicle only; driver hire requester rates hired driver only; combined/carpool can rate both.
- **Error cases:** Uncompleted/foreign target403/404; duplicate409; invalid rating422.
- **Postconditions:** Public aggregate reflects visible eligible reviews only.
- **Acceptance criteria:** Parallel duplicate submissions create one review; hidden review removed from count/mean immediately.
- **Implementation phases:** 10,16. **Verification scenario:** `REVIEW-ELIGIBILITY`.


## FR-NOTIFY-001 · Reliable database notifications
- **Actor:** Participants and operators.
- **Preconditions:** Committed domain event.
- **Trigger:** Booking/verification/ride/request event.
- **Main flow:** Write outbox in domain transaction; worker fans out typed notification records with unique event-recipient key; poll unread feed.
- **Alternative flows:** Worker crash replays safely; email failures independent of in-app delivery.
- **Error cases:** Unauthorized recipient read404; DB write failure leaves retryable event.
- **Postconditions:** Persistent notification delivery despite process restart.
- **Acceptance criteria:** Crash after one recipient insert and retry yields exactly one notification per recipient within60s healthy worker.
- **Implementation phases:** 11,16,17,18,19. **Verification scenario:** `NOTIFY-REPLAY`.


## FR-ADMIN-001 · User suspension/reactivation
- **Actor:** ADMIN.
- **Preconditions:** Active admin; target not self/last active admin.
- **Trigger:** Suspend with reason.
- **Main flow:** Revoke token/session access immediately; remove listings; atomically cancel unstarted commitments; flag started trips incident; audit and notify.
- **Alternative flows:** Reactivation does not renew verification, restore sessions or reinstate cancelled bookings.
- **Error cases:** Self/last admin409; nonadmin403; absent reason422.
- **Postconditions:** Suspended account cannot mutate/read protected APIs; history preserved.
- **Acceptance criteria:** Already issued JWT blocked next request; active driver incident visible for admin resolution; reactivation needs fresh login.
- **Implementation phases:** 12,19. **Verification scenario:** `ADMIN-SUSPEND`.


## FR-ADMIN-002 · Operational booking/carpool/trip management
- **Actor:** ADMIN.
- **Preconditions:** Active backend ADMIN permission.
- **Trigger:** Inspect queues, cancel unstarted, fail incident trip.
- **Main flow:** Use same domain services as participant APIs with audited override policy; never patch arbitrary state.
- **Alternative flows:** Replacement only pending; confirmed change cancel/rebook; active incident FAILED allowed.
- **Error cases:** Invalid transition409; nonadmin403.
- **Postconditions:** Admin cannot bypass resource overlap or seat constraints.
- **Acceptance criteria:** Admin cancellation shares rollback behavior; every intervention includes reason and requestId.
- **Implementation phases:** 12,19. **Verification scenario:** `ADMIN-OPERATIONS`.


## FR-ADMIN-003 · Complaints and moderation
- **Actor:** Participant/ADMIN.
- **Preconditions:** Trip participant to complain; ADMIN to decide.
- **Trigger:** Create complaint then review/resolve.
- **Main flow:** Persist own complaint; admin queue OPEN->IN_REVIEW->RESOLVED/DISMISSED with reason; notify reporter; hide abusive review with audit.
- **Alternative flows:** Duplicate abuse capped3 open/user/trip; terminal complaint immutable.
- **Error cases:** Foreign trip404; invalid transition409; missing resolution422.
- **Postconditions:** Case and action history retained; public abusive review hidden.
- **Acceptance criteria:** Nonadmin cannot decide; resolution/notification/audit commit atomically.
- **Implementation phases:** 12,16,19. **Verification scenario:** `ADMIN-COMPLAINT`.


## FR-ADMIN-004 · Reports and immutable audit trail
- **Actor:** ADMIN.
- **Preconditions:** Active role and bounded date range.
- **Trigger:** Inspect summary or audit.
- **Main flow:** Return operational counts and estimated value; append reasoned admin mutation audits and sensitive document/user read audits.
- **Alternative flows:** No collected-revenue language; report UTC [from,to) with max90day span.
- **Error cases:** Excessive range422; nonadmin403; mutation of audit unsupported.
- **Postconditions:** No secrets in immutable audit payloads.
- **Acceptance criteria:** Report counts match seeded database; hidden review excluded rating; app DB role cannot UPDATE/DELETE audit rows.
- **Implementation phases:** 12,19. **Verification scenario:** `ADMIN-REPORTS`.


## FR-SEC-001 · Private uploads and file lifecycle
- **Actor:** Owner/admin; public approved image visitor.
- **Preconditions:** Authorized subject and allowed document kind.
- **Trigger:** Upload/download/retire file.
- **Main flow:** Limit5MiB; magic-byte allowlist JPEG/PNG/WebP/PDF; random storage key; scan private quarantine; stream clean authorized file; re-encode images strip metadata.
- **Alternative flows:** Local private disk+scanner and durable object-storage adapter share contract; pending scan blocks submission.
- **Error cases:** Oversize413; invalid MIME415; foreign document404; malware422.
- **Postconditions:** No public private-file URL or path traversal; orphan cleanup30min.
- **Acceptance criteria:** SVG/HTML spoof rejected; public image cannot expose license; referenced approved doc cannot be removed.
- **Implementation phases:** 05,06,21. **Verification scenario:** `SEC-UPLOAD`.


## FR-OPS-001 · Health, deployment and recoverability
- **Actor:** Operator.
- **Preconditions:** Configured environment and migrated PostgreSQL.
- **Trigger:** Deploy, check readiness or restore.
- **Main flow:** Validate env; migration release job; drain HTTP/worker; health/ready probes; durable storage; backup and restore rehearsal.
- **Alternative flows:** Worker retry and clean restart maintain domain correctness; demo data isolated.
- **Error cases:** Readiness503 on DB/schema/worker failure; refuse prod seed.
- **Postconditions:** Reproducible deploy; schema/extensions supported; backups restored.
- **Acceptance criteria:** Fresh DB applies migrations incl exclusion constraints; production build boots; restore reconciles reservations/seats/outbox.
- **Implementation phases:** 01,02,23. **Verification scenario:** `OPS-RESTORE`.
