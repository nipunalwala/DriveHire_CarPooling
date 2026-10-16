# 08 · Active API specification

The [OpenAPI contract](../api/openapi.json) is normative. Only health and ready are implemented; other operations remain planned. 70 operations remain after removing26 optional operations. DTO fields are exact: DRIVER_HIRE service only; INSTANT join only; one DRIVER decision; no rating/rental price/waypoint fields. Personal vehicle list is /api/v1/users/me/vehicles; no /owners routes.

All operations retain success envelopes and common safe errors. Private routes require current-account authentication and object checks; actual public security is indicated in OpenAPI. Mutating existing resources use version CAS. Booking/seat creation use required Idempotency-Key with a canonical request hash. Lists are bounded and paginated. Error responses carry requestId;429 rate limits apply to auth/upload/write-sensitive routes. HTTP status codes and input limits are contract-defined; no silent coercion of unsupported modes. Public carpool detail embeds only safe vehicle/host summary fields; it does not fetch a private vehicle endpoint.

## Operation catalogue

- `POST /api/v1/auth/register` — `register`: Create passenger account and enqueue verification OTP. Access: public. Normalize email; unique identity; never accept roles; generic acknowledgement for existing address.
- `POST /api/v1/auth/login` — `login`: Issue access token and rotating refresh cookie. Access: public. Verify hash, active account and verified email; generic invalid credentials; secure cookie.
- `POST /api/v1/auth/verify-email` — `verifyEmail`: Consume email OTP. Access: public. Lock challenge, compare keyed hash, enforce attempts/expiry, consume once.
- `POST /api/v1/auth/resend-otp` — `resendOtp`: Replace verification challenge. Access: public. 60s cooldown; 5/hour/address; generic existence response.
- `POST /api/v1/auth/forgot-password` — `forgotPassword`: Queue reset email. Access: public. Generic response; random 256-bit reset token; never log token.
- `POST /api/v1/auth/reset-password` — `resetPassword`: Consume reset and revoke sessions. Access: public. 15 minute single-use token; increment token_version and revoke every session.
- `POST /api/v1/auth/refresh` — `refresh`: Rotate opaque refresh token. Access: refresh cookie. Origin/CSRF check; lock token; reuse revokes family; no bearer required.
- `POST /api/v1/auth/logout` — `logout`: Revoke current refresh family and clear cookie. Access: refresh cookie. Idempotent even with missing/expired cookie; Origin/CSRF required.
- `POST /api/v1/auth/logout-all` — `logoutAll`: Revoke all sessions. Access: active user. Increment token_version and revoke families; current access invalid immediately.
- `GET /api/v1/auth/sessions` — `listSessions`: View own active sessions. Access: active user. Own only; no token values.
- `DELETE /api/v1/auth/sessions/{id}` — `revokeSession`: Revoke own session. Access: active user. Own only; unknown/non-owned 404; current-session revocation logs out.
- `GET /api/v1/users/me` — `getMe`: Get private own profile. Access: active user. No password/token/license fields.
- `PATCH /api/v1/users/me` — `updateMe`: Edit own display name and phone. Access: active user. At least one supplied property; email changes excluded from v1.
- `POST /api/v1/users/me/roles` — `addRole`: Enable driver onboarding. Access: verified user. DRIVER only; ADMIN operator-granted; ownership is an object relationship, not a separate role.
- `GET /api/v1/cities` — `listCities`: List supported manual city catalogue. Access: public. Seeded reference data; no geocoding.
- `GET /api/v1/drivers` — `searchDrivers`: Search verified bookable drivers. Access: public. Only active approved unexpired accepting drivers; times must be supplied together.
- `GET /api/v1/drivers/{id}` — `getDriver`: Read verified driver listing. Access: public. Non-public or archived 404; omit license/contact documents.
- `GET /api/v1/drivers/me` — `getMyDriver`: Get own driver onboarding profile. Access: DRIVER. Explicit /me route registered before /{id}; no approval required.
- `PUT /api/v1/drivers/me` — `updateDriver`: Create or edit driver profile. Access: DRIVER. License identity/date edits invalidate approval; shared resource lock; reject if future commitments require identity change resolution; version mandatory when updating existing profile/resource, omitted only on first creation.
- `POST /api/v1/drivers/me/documents` — `uploadDriverDoc`: Upload private license. Access: DRIVER. Only LICENSE; require expiresOn matching license; quarantine until clean.
- `GET /api/v1/drivers/me/documents` — `listDriverDocs`: Read own document metadata. Access: DRIVER. No public object keys.
- `POST /api/v1/drivers/me/verification` — `submitDriver`: Submit complete driver verification. Access: DRIVER. Clean current license required; at most one pending revision; immutable document snapshot.
- `PATCH /api/v1/drivers/me/listing` — `setDriverListing`: Set accepting-bookings flag. Access: DRIVER. Enabling requires approval and valid license; disabling affects new requests only.
- `GET /api/v1/drivers/me/availability` — `listDriverAvailability`: Read driver windows and blocks. Access: DRIVER. Own only.
- `POST /api/v1/drivers/me/availability` — `createDriverAvailability`: Add driver availability or blocking interval. Access: DRIVER. BLOCKED acquires resource reservation; no conflict with commitments; max horizon 180 days.
- `DELETE /api/v1/drivers/me/availability/{id}` — `deleteDriverAvailability`: Remove own window/block. Access: DRIVER. Removing AVAILABLE forbidden if would uncover pending/confirmed hired bookings; release block exactly once.
- `GET /api/v1/drivers/me/bookings` — `listDriverBookings`: Read assigned driver requests/history. Access: DRIVER. Only proposed/assigned self.
- `GET /api/v1/users/me/vehicles` — `listMyVehicles`: List own personal vehicles. Access: active verified user. Ownership is users.id; no OWNER role, rental listing, fleet or hire pricing.
- `POST /api/v1/vehicles` — `createVehicle`: Register own personal vehicle. Access: active verified user. Verified user; owner_id=self immutable; no rental price/listing fields.
- `PUT /api/v1/vehicles/{id}` — `updateVehicle`: Edit own personal vehicle. Access: active verified user; object owner. Object owner only; material changes invalidate approval and are blocked by live commitments; version required.
- `DELETE /api/v1/vehicles/{id}` — `archiveVehicle`: Safely archive owned vehicle. Access: active verified user; object owner. 409 if pending/confirmed/active bookings or published future carpools; retain history.
- `POST /api/v1/vehicles/{id}/documents` — `uploadVehicleDoc`: Upload vehicle image/registration/insurance. Access: active verified user; object owner. Owned; only REGISTRATION/INSURANCE/VEHICLE_IMAGE; expiry required for insurance.
- `GET /api/v1/vehicles/{id}/documents` — `listVehicleDocs`: Read owned vehicle document metadata. Access: active verified user; object owner. Owned only; admin uses verification detail.
- `POST /api/v1/vehicles/{id}/verification` — `submitVehicle`: Submit vehicle verification revision. Access: active verified user; object owner. Clean registration, unexpired insurance and at least one clean image; immutable revision.
- `GET /api/v1/documents/{id}/content` — `getDocument`: Download approved visible image or authorized private file. Access: public or owner/admin. Public only CLEAN image of publicly visible approved vehicle; private docs owner or admin; attachment/nosniff; no executable content.
- `DELETE /api/v1/documents/{id}` — `deleteDocument`: Retire unused own document/image. Access: active owner. 409 if in current approved/pending revision or needed by future commitments; safe file cleanup job.
- `POST /api/v1/booking-quotes` — `quoteBooking`: Quote driver hiring. Access: verified PASSENGER. DRIVER_HIRE only; requester owns approved vehicle; eligible external driver with covering availability; driver-only integer paise estimate; own ten-minute immutable quote.
- `POST /api/v1/bookings` — `createBooking`: Create driver-hiring request. Access: verified PASSENGER. Revalidate own quote, versions, approval, rate and resources; DRIVER_HIRE only; exactly one DRIVER decision; lock and reserve both resources atomically; idempotent.
- `GET /api/v1/bookings` — `listBookings`: Read requester booking history. Access: PASSENGER. passenger_id=self; include pending/history.
- `GET /api/v1/bookings/{id}` — `getBooking`: Read participating booking. Access: participant/admin. Passenger, resource driver, owning vehicle owner or admin only.
- `POST /api/v1/bookings/{id}/decisions` — `decideBooking`: Driver accepts or rejects own hire request. Access: provider. Only assigned external driver; pending unexpired request and matching version; single DRIVER consent; acceptance confirms; rejection releases both resources.
- `POST /api/v1/bookings/{id}/cancel` — `cancelBooking`: Cancel future unstarted booking. Access: requester/provider/admin. Before start only for participant; requester cutoff 15min for confirmed, providers reason audited; admin incident after start uses FAILED.
- `POST /api/v1/carpools` — `createCarpool`: Create private instant-join carpool draft. Access: active verified user. Approved driver with owned approved vehicle; no OWNER role; INSTANT only; no resource holds until publish.
- `PUT /api/v1/carpools/{id}` — `updateCarpool`: Edit own draft route/seats/pricing. Access: host. DRAFT only; published changes require cancellation/new ride; version mandatory when updating existing profile/resource, omitted only on first creation.
- `POST /api/v1/carpools/{id}/publish` — `publishCarpool`: Publish instant-join carpool. Access: host. Revalidate approved host/owned vehicle and capacity; reserve both resources and assign trip atomically; no hire listing requirement.
- `GET /api/v1/carpools` — `searchCarpools`: Search published available seats. Access: public. Exact city pair and departure date in origin timezone; no map/route matching.
- `GET /api/v1/carpools/{id}` — `getCarpool`: Read published carpool or own draft. Access: public/participant. Public safe host/vehicle summary embedded; no roster, registration, contact or evidence; host/admin may inspect own private operational state.
- `GET /api/v1/users/me/carpools` — `listMyCarpools`: Read hosted ride drafts/history. Access: active user. host_id=self.
- `POST /api/v1/carpools/{id}/seat-requests` — `requestSeat`: Instantly join carpool. Access: verified PASSENGER. INSTANT only; verified non-host passenger; before cutoff; atomically check capacity, insert ACCEPTED participation and increment count; no pending approval or notification event.
- `GET /api/v1/carpools/{id}/seat-requests` — `listSeatRequests`: Host reads own carpool participants. Access: host/admin. Host/admin only; safe display names and seat counts; no accept/reject control or private contact data.
- `POST /api/v1/seat-requests/{id}/cancel` — `cancelSeat`: Cancel own pending/accepted request. Access: requester/admin. Before start; accepted cutoff 15min for requester; decrement only accepted->cancelled once.
- `GET /api/v1/users/me/seat-requests` — `listMySeats`: Read own carpool request/history. Access: PASSENGER. passenger_id=self.
- `POST /api/v1/carpools/{id}/cancel` — `cancelCarpool`: Cancel own future hosted ride. Access: host/admin. Before STARTED; cancel live requests, zero confirmedSeats, release both reservations; admin after start uses FAILED.
- `GET /api/v1/trips` — `listTrips`: Read participant trip history/active trips. Access: participant/admin. Requester/assigned driver/vehicle owner/accepted passenger/host; scope server-side.
- `GET /api/v1/trips/{id}` — `getTrip`: Read manual route and current status. Access: participant/admin. Participant object authorization; waypoints are simulated labels.
- `POST /api/v1/trips/{id}/transitions` — `transitionTrip`: Advance manual ride lifecycle. Access: assigned driver/admin. CAS version; assigned -> started -> in_transit -> completed; FAILED needs reason; no skip/backward.
- `GET /api/v1/trips/{id}/history` — `tripHistory`: Read persisted status timeline. Access: participant/admin. Same object access as trip.
- `GET /api/v1/admin/users` — `adminUsers`: Search users with status/roles. Access: ADMIN. Server admin role and active check.
- `GET /api/v1/admin/users/{id}` — `adminUser`: Inspect user for support. Access: ADMIN. Audit sensitive read; no secrets.
- `POST /api/v1/admin/users/{id}/suspend` — `suspendUser`: Suspend account and resolve commitments. Access: ADMIN. Prevent self/last-admin suspension; revoke sessions immediately; atomic unstarted cancellations; active trips incident flagged for admin resolution.
- `POST /api/v1/admin/users/{id}/reactivate` — `reactivateUser`: Reactivate eligible account. Access: ADMIN. No automatic verification renewal, bookings or sessions restored.
- `GET /api/v1/admin/verifications` — `adminVerifications`: Read pending verification queue. Access: ADMIN. Newest pending revisions; filter type/status.
- `GET /api/v1/admin/verifications/{id}` — `adminVerification`: Inspect immutable submitted documents. Access: ADMIN. Record sensitive read audit; download via protected content endpoint.
- `POST /api/v1/admin/verifications/{id}/decision` — `decideVerification`: Approve/reject current verification revision. Access: ADMIN. No own submission approval; CAS current pending revision; CLEAN docs unexpired; mandatory reason.
- `GET /api/v1/admin/bookings` — `adminBookings`: Inspect booking operations. Access: ADMIN. Date/status filters; paginated.
- `GET /api/v1/admin/carpools` — `adminCarpools`: Inspect carpool operations. Access: ADMIN. Date/status filters; paginated.
- `GET /api/v1/admin/trips` — `adminTrips`: Inspect trip operations/incidents. Access: ADMIN. Filter status and overdue; participant details via authorized resources.
- `GET /api/v1/admin/audit-logs` — `adminAudit`: Inspect immutable administrative actions. Access: ADMIN. Allowlisted action/actor/date filters; cannot mutate audit.
- `GET /api/v1/health` — `health`: Process liveness. Access: public. No database dependency.
- `GET /api/v1/ready` — `ready`: Database and worker readiness. Access: public. 503 on database/schema/worker stale; return no connection details.
