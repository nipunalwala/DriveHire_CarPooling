# 08 · Api Specification

Status: proposed implementation baseline; implementation requires separate human approval.

## Canonical executable contract
[OpenAPI3.0.3 JSON](../api/openapi.json) defines every operation, parameter, request schema, response schema, security scheme and response code. This document binds database and authorization semantics to those schemas. `docs/planning-model.json` is a machine-readable traceability catalogue, not application data. Keep all three synchronized when changing a contract.

Prefix `/api/v1`. JSON request strict unknown-key rejection. RFC3339 times require explicit offset; use server UTC in responses. Date strings YYYY-MM-DD. UUIDs required for identifiers. Body<=100KiB except multipart<=5MiB/file plus bounded metadata; one file/request. All text trimmed, min/max lengths enforced; plain text output. PATCH ProfileInput requires at least one known field. Existing DriverInput/VehicleInput/CarpoolInput update requires `version`; initial creation omits it. PUT returns complete current own DTO. Reject unknown filters and unknown enum values; `from<to`, end>start, origin!=destination for carpool, and document kinds/expiry depend on target.

## Response and error conventions
Success `{success:true,data:T}`; collection adds `meta:{page,pageSize,total}`. Collection page>=1 default1; pageSize1..100 default20; deterministic ordering created_at DESC,id DESC except city alphabetic and departing search starts_at ASC,id ASC. All list operations use server object scope before pagination and count. No arbitrary sort SQL. JSON errors `{success:false,error:{code,message,requestId,details?}}`. Errors never include stack, DB query, credentials or private file keys. Request ID is returned in X-Request-ID on all responses. 201 new object; 202 generic email acknowledgement; 200 actions/read/deletion ack. No undocumented204.

Common codes: malformed JSON400 BAD_REQUEST; invalid/expired OTP/reset400 INVALID_CHALLENGE;401 UNAUTHENTICATED;403 FORBIDDEN/ACCOUNT_SUSPENDED/EMAIL_UNVERIFIED; private unknown/foreign404 NOT_FOUND;409 RESOURCE_CONFLICT/SEATS_UNAVAILABLE/INVALID_TRANSITION/STALE_VERSION/QUOTE_STALE/IDEMPOTENCY_MISMATCH/DUPLICATE_REVIEW/ACTIVE_COMMITMENT;413 PAYLOAD_TOO_LARGE;415 UNSUPPORTED_MEDIA_TYPE;422 VALIDATION_ERROR;429 RATE_LIMITED with Retry-After;500 INTERNAL_ERROR;503 DEPENDENCY_UNAVAILABLE/RETRYABLE_TRANSACTION. OpenAPI lists common defensive errors on every operation; handlers need return only applicable cases.

Idempotency-Key16..128 printable ASCII required on createBooking/requestSeat; scope user+operation; persist request hash+final success response24h; same-body replay returns original201 and object with no new notifications. Concurrent key insert waits/replays under DB uniqueness. Foreign objects respond404. Idempotency body hashes canonical JSON; provider request or quote IDs validated before persistence. Transport timeout is safe to retry only with original key.

Cookie auth refresh/logout requires exact allowed Origin (fallback trusted same-origin Referer only for supported clients), credentials include and application/json content type; same-site deployment, SameSite=Strict, HttpOnly, Secure outside localhost, Path=/api/v1/auth. Logout clears exact cookie path/domain. Ordinary protected operations require bearer token and are not authenticated by cookie alone. API responses containing user/booking/private documents use Cache-Control:no-store; public metadata can short-cache30s but quote/create always live-revalidate. Unverified/suspended public views follow public visibility filtering, never authorization inheritance.

## Endpoint catalogue
### `register` · POST `/api/v1/auth/register`
- **Purpose:** Create passenger account and enqueue verification OTP.
- **Authentication/role:** public. No bearer required for public projection; private alternatives require owner/admin authorization.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `RegisterInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Normalize email; unique identity; never accept roles; generic acknowledgement for existing address.
- **Database operations:** Read/lock/write `users,user_roles,auth_challenges,outbox_events` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP202; Ack.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `login` · POST `/api/v1/auth/login`
- **Purpose:** Issue access token and rotating refresh cookie.
- **Authentication/role:** public. No bearer required for public projection; private alternatives require owner/admin authorization.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `LoginInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Verify hash, active account and verified email; generic invalid credentials; secure cookie.
- **Database operations:** Read/lock/write `users,refresh_sessions,refresh_tokens` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; TokenResult; refresh Set-Cookie.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `verifyEmail` · POST `/api/v1/auth/verify-email`
- **Purpose:** Consume email OTP.
- **Authentication/role:** public. No bearer required for public projection; private alternatives require owner/admin authorization.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `OtpInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Lock challenge, compare keyed hash, enforce attempts/expiry, consume once.
- **Database operations:** Read/lock/write `users,auth_challenges` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Ack.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `resendOtp` · POST `/api/v1/auth/resend-otp`
- **Purpose:** Replace verification challenge.
- **Authentication/role:** public. No bearer required for public projection; private alternatives require owner/admin authorization.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `EmailInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** 60s cooldown; 5/hour/address; generic existence response.
- **Database operations:** Read/lock/write `auth_challenges,outbox_events` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP202; Ack.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `forgotPassword` · POST `/api/v1/auth/forgot-password`
- **Purpose:** Queue reset email.
- **Authentication/role:** public. No bearer required for public projection; private alternatives require owner/admin authorization.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `EmailInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Generic response; random 256-bit reset token; never log token.
- **Database operations:** Read/lock/write `auth_challenges,outbox_events` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP202; Ack.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `resetPassword` · POST `/api/v1/auth/reset-password`
- **Purpose:** Consume reset and revoke sessions.
- **Authentication/role:** public. No bearer required for public projection; private alternatives require owner/admin authorization.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `ResetInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** 15 minute single-use token; increment token_version and revoke every session.
- **Database operations:** Read/lock/write `users,auth_challenges,refresh_sessions` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Ack.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `refresh` · POST `/api/v1/auth/refresh`
- **Purpose:** Rotate opaque refresh token.
- **Authentication/role:** refresh cookie. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Origin/CSRF check; lock token; reuse revokes family; no bearer required.
- **Database operations:** Read/lock/write `refresh_sessions,refresh_tokens,users` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; TokenResult; refresh Set-Cookie.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `logout` · POST `/api/v1/auth/logout`
- **Purpose:** Revoke current refresh family and clear cookie.
- **Authentication/role:** refresh cookie. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Idempotent even with missing/expired cookie; Origin/CSRF required.
- **Database operations:** Read/lock/write `refresh_sessions` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Ack; refresh Set-Cookie.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `logoutAll` · POST `/api/v1/auth/logout-all`
- **Purpose:** Revoke all sessions.
- **Authentication/role:** active user. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Increment token_version and revoke families; current access invalid immediately.
- **Database operations:** Read/lock/write `users,refresh_sessions` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Ack.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `listSessions` · GET `/api/v1/auth/sessions`
- **Purpose:** View own active sessions.
- **Authentication/role:** active user. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Own only; no token values.
- **Database operations:** Read/lock/write `refresh_sessions` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated Session.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `revokeSession` · DELETE `/api/v1/auth/sessions/{id}`
- **Purpose:** Revoke own session.
- **Authentication/role:** active user. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Own only; unknown/non-owned 404; current-session revocation logs out.
- **Database operations:** Read/lock/write `refresh_sessions` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Ack.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `getMe` · GET `/api/v1/users/me`
- **Purpose:** Get private own profile.
- **Authentication/role:** active user. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** No password/token/license fields.
- **Database operations:** Read/lock/write `users,user_roles` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; User.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `updateMe` · PATCH `/api/v1/users/me`
- **Purpose:** Edit own display name and phone.
- **Authentication/role:** active user. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `ProfileInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** At least one supplied property; email changes excluded from v1.
- **Database operations:** Read/lock/write `users` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; User.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `addRole` · POST `/api/v1/users/me/roles`
- **Purpose:** Enable driver or owner onboarding.
- **Authentication/role:** verified user. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `RoleInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Idempotent grant; no ADMIN input; approval separately controls operational eligibility.
- **Database operations:** Read/lock/write `user_roles,driver_profiles,owner_profiles` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; User.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `getOwner` · GET `/api/v1/owners/me`
- **Purpose:** Read own owner profile.
- **Authentication/role:** OWNER. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Own profile only.
- **Database operations:** Read/lock/write `owner_profiles` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Owner.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `updateOwner` · PUT `/api/v1/owners/me`
- **Purpose:** Complete owner registration.
- **Authentication/role:** OWNER. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `OwnerInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Own user_id derived from token.
- **Database operations:** Read/lock/write `owner_profiles` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Owner.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `listCities` · GET `/api/v1/cities`
- **Purpose:** List supported manual city catalogue.
- **Authentication/role:** public. No bearer required for public projection; private alternatives require owner/admin authorization.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Seeded reference data; no geocoding.
- **Database operations:** Read/lock/write `cities` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated City.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `searchDrivers` · GET `/api/v1/drivers`
- **Purpose:** Search verified bookable drivers.
- **Authentication/role:** public. No bearer required for public projection; private alternatives require owner/admin authorization.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** cityId, startsAt, endsAt, maxHourlyRateMinor, minRating; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Only active approved unexpired accepting drivers; times must be supplied together.
- **Database operations:** Read/lock/write `driver_profiles,availability_windows,resource_reservations` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated Driver.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `getDriver` · GET `/api/v1/drivers/{id}`
- **Purpose:** Read verified driver listing.
- **Authentication/role:** public. No bearer required for public projection; private alternatives require owner/admin authorization.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Non-public or archived 404; omit license/contact documents.
- **Database operations:** Read/lock/write `driver_profiles` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Driver.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `getMyDriver` · GET `/api/v1/drivers/me`
- **Purpose:** Get own driver onboarding profile.
- **Authentication/role:** DRIVER. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Explicit /me route registered before /{id}; no approval required.
- **Database operations:** Read/lock/write `driver_profiles` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; DriverPrivate.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `updateDriver` · PUT `/api/v1/drivers/me`
- **Purpose:** Create or edit driver profile.
- **Authentication/role:** DRIVER. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `DriverInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** License identity/date edits invalidate approval; shared resource lock; reject if future commitments require identity change resolution; version mandatory when updating existing profile/resource, omitted only on first creation.
- **Database operations:** Read/lock/write `driver_profiles,verification_requests` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; DriverPrivate.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `uploadDriverDoc` · POST `/api/v1/drivers/me/documents`
- **Purpose:** Upload private license.
- **Authentication/role:** DRIVER. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `DocumentInput` in multipart/form-data; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Only LICENSE; require expiresOn matching license; quarantine until clean.
- **Database operations:** Read/lock/write `documents` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP201; Document.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `listDriverDocs` · GET `/api/v1/drivers/me/documents`
- **Purpose:** Read own document metadata.
- **Authentication/role:** DRIVER. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** No public object keys.
- **Database operations:** Read/lock/write `documents` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated Document.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `submitDriver` · POST `/api/v1/drivers/me/verification`
- **Purpose:** Submit complete driver verification.
- **Authentication/role:** DRIVER. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `VersionInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Clean current license required; at most one pending revision; immutable document snapshot.
- **Database operations:** Read/lock/write `verification_requests,driver_profiles,documents,outbox_events` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP201; Verification.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `setDriverListing` · PATCH `/api/v1/drivers/me/listing`
- **Purpose:** Set accepting-bookings flag.
- **Authentication/role:** DRIVER. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `ListingInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Enabling requires approval and valid license; disabling affects new requests only.
- **Database operations:** Read/lock/write `driver_profiles` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; DriverPrivate.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `listDriverAvailability` · GET `/api/v1/drivers/me/availability`
- **Purpose:** Read driver windows and blocks.
- **Authentication/role:** DRIVER. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Own only.
- **Database operations:** Read/lock/write `availability_windows` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated Availability.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `createDriverAvailability` · POST `/api/v1/drivers/me/availability`
- **Purpose:** Add driver availability or blocking interval.
- **Authentication/role:** DRIVER. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `AvailabilityInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** BLOCKED acquires resource reservation; no conflict with commitments; max horizon 180 days.
- **Database operations:** Read/lock/write `availability_windows,resource_reservations` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP201; Availability.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `deleteDriverAvailability` · DELETE `/api/v1/drivers/me/availability/{id}`
- **Purpose:** Remove own window/block.
- **Authentication/role:** DRIVER. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Removing AVAILABLE forbidden if would uncover pending/confirmed hired bookings; release block exactly once.
- **Database operations:** Read/lock/write `availability_windows,resource_reservations` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Ack.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `listDriverBookings` · GET `/api/v1/drivers/me/bookings`
- **Purpose:** Read assigned driver requests/history.
- **Authentication/role:** DRIVER. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Only proposed/assigned self.
- **Database operations:** Read/lock/write `bookings,booking_decisions` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated Booking.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `searchVehicles` · GET `/api/v1/vehicles`
- **Purpose:** Search verified listed vehicles.
- **Authentication/role:** public. No bearer required for public projection; private alternatives require owner/admin authorization.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** cityId, category, seats, startsAt, endsAt, maxHourlyRateMinor, transmission; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Only active owner, approved unexpired documents, listed and unarchived; not a reservation.
- **Database operations:** Read/lock/write `vehicles,availability_windows,resource_reservations` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated Vehicle.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `getVehicle` · GET `/api/v1/vehicles/{id}`
- **Purpose:** Read verified vehicle listing.
- **Authentication/role:** public. No bearer required for public projection; private alternatives require owner/admin authorization.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Public image delivery separately authorized by visibility; no plate or private docs.
- **Database operations:** Read/lock/write `vehicles,documents` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Vehicle.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `listMyVehicles` · GET `/api/v1/owners/me/vehicles`
- **Purpose:** Read own vehicles including drafts.
- **Authentication/role:** OWNER. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Own unarchived; include status.
- **Database operations:** Read/lock/write `vehicles` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated VehiclePrivate.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `createVehicle` · POST `/api/v1/vehicles`
- **Purpose:** Register owner vehicle.
- **Authentication/role:** OWNER. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `VehicleInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Require complete owner profile; normalized registration unique; server derives owner.
- **Database operations:** Read/lock/write `vehicles` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP201; VehiclePrivate.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `updateVehicle` · PUT `/api/v1/vehicles/{id}`
- **Purpose:** Edit owned vehicle.
- **Authentication/role:** OWNER. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `VehicleInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Own only; material identity/capacity edits invalidate approval; forbidden with future commitments until resolved; version mandatory when updating existing profile/resource, omitted only on first creation.
- **Database operations:** Read/lock/write `vehicles,verification_requests` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; VehiclePrivate.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `archiveVehicle` · DELETE `/api/v1/vehicles/{id}`
- **Purpose:** Safely archive owned vehicle.
- **Authentication/role:** OWNER. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** 409 if pending/confirmed/active bookings or published future carpools; retain history.
- **Database operations:** Read/lock/write `vehicles` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Ack.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `uploadVehicleDoc` · POST `/api/v1/vehicles/{id}/documents`
- **Purpose:** Upload vehicle image/registration/insurance.
- **Authentication/role:** OWNER. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `DocumentInput` in multipart/form-data; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Owned; only REGISTRATION/INSURANCE/VEHICLE_IMAGE; expiry required for insurance.
- **Database operations:** Read/lock/write `documents` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP201; Document.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `listVehicleDocs` · GET `/api/v1/vehicles/{id}/documents`
- **Purpose:** Read owned vehicle document metadata.
- **Authentication/role:** OWNER. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Owned only; admin uses verification detail.
- **Database operations:** Read/lock/write `documents` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated Document.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `submitVehicle` · POST `/api/v1/vehicles/{id}/verification`
- **Purpose:** Submit vehicle verification revision.
- **Authentication/role:** OWNER. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `VersionInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Clean registration, unexpired insurance and at least one clean image; immutable revision.
- **Database operations:** Read/lock/write `vehicles,verification_requests,documents` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP201; Verification.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `setVehicleListing` · PATCH `/api/v1/vehicles/{id}/listing`
- **Purpose:** Set vehicle public booking flag.
- **Authentication/role:** OWNER. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `ListingInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Owned; enabling requires valid approval; unlisting keeps commitments.
- **Database operations:** Read/lock/write `vehicles` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; VehiclePrivate.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `listVehicleAvailability` · GET `/api/v1/vehicles/{id}/availability`
- **Purpose:** Read owned availability.
- **Authentication/role:** OWNER. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Owned only.
- **Database operations:** Read/lock/write `availability_windows` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated Availability.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `createVehicleAvailability` · POST `/api/v1/vehicles/{id}/availability`
- **Purpose:** Add vehicle window/block.
- **Authentication/role:** OWNER. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `AvailabilityInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Owned; BLOCKED shares conflict constraint with bookings/carpools.
- **Database operations:** Read/lock/write `availability_windows,resource_reservations` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP201; Availability.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `deleteVehicleAvailability` · DELETE `/api/v1/vehicles/{vehicleId}/availability/{id}`
- **Purpose:** Remove owned vehicle window/block.
- **Authentication/role:** OWNER. Authentication plus current DB account/role/session checks.
- **Path parameters:** vehicleId, id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Ownership through vehicleId; id must belong to vehicle; cannot uncover committed hire.
- **Database operations:** Read/lock/write `availability_windows,resource_reservations` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Ack.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `listOwnerBookings` · GET `/api/v1/owners/me/bookings`
- **Purpose:** Read vehicle booking requests/history.
- **Authentication/role:** OWNER. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Own vehicle only.
- **Database operations:** Read/lock/write `bookings,vehicles` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated Booking.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `getDocument` · GET `/api/v1/documents/{id}/content`
- **Purpose:** Download approved visible image or authorized private file.
- **Authentication/role:** public or owner/admin. No bearer required for public projection; private alternatives require owner/admin authorization.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Public only CLEAN image of publicly visible approved vehicle; private docs owner or admin; attachment/nosniff; no executable content.
- **Database operations:** Read/lock/write `documents,vehicles,verification_requests` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; authorized binary image/PDF.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `deleteDocument` · DELETE `/api/v1/documents/{id}`
- **Purpose:** Retire unused own document/image.
- **Authentication/role:** active owner. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** 409 if in current approved/pending revision or needed by future commitments; safe file cleanup job.
- **Database operations:** Read/lock/write `documents` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Ack.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `quoteBooking` · POST `/api/v1/booking-quotes`
- **Purpose:** Price a chosen service and resources.
- **Authentication/role:** verified PASSENGER. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `QuoteInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Use server rates; service-specific ownership/driver checks; no inventory hold; expires 10min.
- **Database operations:** Read/lock/write `booking_quotes,vehicles,driver_profiles` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP201; Quote.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `createBooking` · POST `/api/v1/bookings`
- **Purpose:** Reserve resources from valid quote.
- **Authentication/role:** verified PASSENGER. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `BookingInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Mandatory Idempotency-Key; atomic dual resource hold; quote owner and freshness rechecked.
- **Database operations:** Read/lock/write `bookings,booking_decisions,trips,resource_reservations,idempotency_keys,outbox_events` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP201; Booking.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `listBookings` · GET `/api/v1/bookings`
- **Purpose:** Read requester booking history.
- **Authentication/role:** PASSENGER. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** status; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** passenger_id=self; include pending/history.
- **Database operations:** Read/lock/write `bookings` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated Booking.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `getBooking` · GET `/api/v1/bookings/{id}`
- **Purpose:** Read participating booking.
- **Authentication/role:** participant/admin. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Passenger, resource driver, owning vehicle owner or admin only.
- **Database operations:** Read/lock/write `bookings,vehicles` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Booking.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `decideBooking` · POST `/api/v1/bookings/{id}/decisions`
- **Purpose:** Accept/reject own provider request.
- **Authentication/role:** provider. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `BookingDecisionInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Only required undecided provider; cannot decide for another party; reject needs reason; lock booking.
- **Database operations:** Read/lock/write `booking_decisions,bookings,trips,resource_reservations,outbox_events` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Booking.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `cancelBooking` · POST `/api/v1/bookings/{id}/cancel`
- **Purpose:** Cancel future unstarted booking.
- **Authentication/role:** requester/provider/admin. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `VersionReasonInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Before start only for participant; requester cutoff 15min for confirmed, providers reason audited; admin incident after start uses FAILED.
- **Database operations:** Read/lock/write `bookings,trips,resource_reservations,outbox_events` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Booking.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `replaceDriver` · POST `/api/v1/bookings/{id}/driver-assignment`
- **Purpose:** Propose replacement hired driver.
- **Authentication/role:** requester/admin. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `AssignmentInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Pending only; DRIVER_HIRE/COMBINED; atomic replace reservation, reset driver consent, retain original deadline; reject self/ineligible driver.
- **Database operations:** Read/lock/write `bookings,booking_decisions,trips,resource_reservations` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Booking.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `createCarpool` · POST `/api/v1/carpools`
- **Purpose:** Create private ride draft.
- **Authentication/role:** verified DRIVER+OWNER. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `CarpoolInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Host must own verified vehicle and be approved driver; no reservations until publication.
- **Database operations:** Read/lock/write `carpools,trips` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP201; Carpool.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `updateCarpool` · PUT `/api/v1/carpools/{id}`
- **Purpose:** Edit own draft route/seats/pricing.
- **Authentication/role:** host. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `CarpoolInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** DRAFT only; published changes require cancellation/new ride; version mandatory when updating existing profile/resource, omitted only on first creation.
- **Database operations:** Read/lock/write `carpools,trips` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Carpool.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `publishCarpool` · POST `/api/v1/carpools/{id}/publish`
- **Purpose:** Publish and reserve host/vehicle.
- **Authentication/role:** host. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `VersionInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Atomic shared resource reservation; lead >=60min; host verified; seats <= vehicle.seats-1.
- **Database operations:** Read/lock/write `carpools,trips,resource_reservations,outbox_events` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Carpool.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `searchCarpools` · GET `/api/v1/carpools`
- **Purpose:** Search published available seats.
- **Authentication/role:** public. No bearer required for public projection; private alternatives require owner/admin authorization.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** originCityId, destinationCityId, date, seats; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Exact city pair and departure date in origin timezone; no map/route matching.
- **Database operations:** Read/lock/write `carpools,driver_profiles,vehicles` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated Carpool.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `getCarpool` · GET `/api/v1/carpools/{id}`
- **Purpose:** Read public published ride or participant history.
- **Authentication/role:** public/participant. No bearer required for public projection; private alternatives require owner/admin authorization.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** DRAFT host/admin only; terminal details only host/participant/admin; omit passenger roster from public.
- **Database operations:** Read/lock/write `carpools` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Carpool.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `listMyCarpools` · GET `/api/v1/users/me/carpools`
- **Purpose:** Read hosted ride drafts/history.
- **Authentication/role:** active user. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** host_id=self.
- **Database operations:** Read/lock/write `carpools` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated Carpool.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `requestSeat` · POST `/api/v1/carpools/{id}/seat-requests`
- **Purpose:** Join instantly or request approval.
- **Authentication/role:** verified PASSENGER. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `SeatInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Idempotency-Key required; lock carpool; own ride forbidden; one live request/user; instant consumes seats, approval does not.
- **Database operations:** Read/lock/write `seat_requests,carpools,idempotency_keys,outbox_events` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP201; SeatRequest.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `listSeatRequests` · GET `/api/v1/carpools/{id}/seat-requests`
- **Purpose:** Read hosted requests and accepted roster.
- **Authentication/role:** host/admin. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Host ownership; hide unnecessary passenger PII.
- **Database operations:** Read/lock/write `seat_requests,carpools` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated SeatRequest.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `decideSeat` · POST `/api/v1/seat-requests/{id}/decision`
- **Purpose:** Accept/reject a pending seat request.
- **Authentication/role:** host. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `DecisionInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Lock carpool then request; conditional seat increment only on ACCEPT; cutoff 15min; no host overbooking.
- **Database operations:** Read/lock/write `carpools,seat_requests,outbox_events` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; SeatRequest.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `cancelSeat` · POST `/api/v1/seat-requests/{id}/cancel`
- **Purpose:** Cancel own pending/accepted request.
- **Authentication/role:** requester/admin. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `VersionReasonInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Before start; accepted cutoff 15min for requester; decrement only accepted->cancelled once.
- **Database operations:** Read/lock/write `carpools,seat_requests,outbox_events` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; SeatRequest.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `listMySeats` · GET `/api/v1/users/me/seat-requests`
- **Purpose:** Read own carpool request/history.
- **Authentication/role:** PASSENGER. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** passenger_id=self.
- **Database operations:** Read/lock/write `seat_requests` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated SeatRequest.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `cancelCarpool` · POST `/api/v1/carpools/{id}/cancel`
- **Purpose:** Cancel own future hosted ride.
- **Authentication/role:** host/admin. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `VersionReasonInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Before STARTED; cancel live requests, zero confirmedSeats, release both reservations; admin after start uses FAILED.
- **Database operations:** Read/lock/write `carpools,trips,seat_requests,resource_reservations,outbox_events` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Carpool.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `listTrips` · GET `/api/v1/trips`
- **Purpose:** Read participant trip history/active trips.
- **Authentication/role:** participant/admin. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** status; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Requester/assigned driver/vehicle owner/accepted passenger/host; scope server-side.
- **Database operations:** Read/lock/write `trips,bookings,carpools,seat_requests` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated Trip.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `getTrip` · GET `/api/v1/trips/{id}`
- **Purpose:** Read manual route and current status.
- **Authentication/role:** participant/admin. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Participant object authorization; waypoints are simulated labels.
- **Database operations:** Read/lock/write `trips` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Trip.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `transitionTrip` · POST `/api/v1/trips/{id}/transitions`
- **Purpose:** Advance manual ride lifecycle.
- **Authentication/role:** assigned driver/admin. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `TransitionInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** CAS version; assigned -> started -> in_transit -> completed; FAILED needs reason; no skip/backward.
- **Database operations:** Read/lock/write `trips,trip_status_history,bookings,carpools,resource_reservations,outbox_events` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Trip.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `advanceWaypoint` · POST `/api/v1/trips/{id}/waypoint`
- **Purpose:** Advance simulated route marker.
- **Authentication/role:** assigned driver. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `VersionInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Only IN_TRANSIT; monotone index <= count; no fabricated GPS/ETA.
- **Database operations:** Read/lock/write `trips,trip_status_history` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Trip.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `tripHistory` · GET `/api/v1/trips/{id}/history`
- **Purpose:** Read persisted status timeline.
- **Authentication/role:** participant/admin. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Same object access as trip.
- **Database operations:** Read/lock/write `trip_status_history` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated HistoryEntry.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `createReview` · POST `/api/v1/reviews`
- **Purpose:** Review completed driver/vehicle.
- **Authentication/role:** verified participant. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `ReviewInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Completed eligible trip; target bound to actual resource; not self/own vehicle; unique author/trip/target.
- **Database operations:** Read/lock/write `reviews,trips,bookings,seat_requests` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP201; Review.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `myReviews` · GET `/api/v1/reviews/mine`
- **Purpose:** Read own review history.
- **Authentication/role:** active user. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Author=self; includes own hidden marker.
- **Database operations:** Read/lock/write `reviews` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated Review.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `driverReviews` · GET `/api/v1/drivers/{id}/reviews`
- **Purpose:** Read visible driver reviews.
- **Authentication/role:** public. No bearer required for public projection; private alternatives require owner/admin authorization.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Public approved driver; hidden excluded; count/mean derived visible reviews.
- **Database operations:** Read/lock/write `reviews,driver_profiles` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated Review.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `vehicleReviews` · GET `/api/v1/vehicles/{id}/reviews`
- **Purpose:** Read visible vehicle reviews.
- **Authentication/role:** public. No bearer required for public projection; private alternatives require owner/admin authorization.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Public approved vehicle; hidden excluded.
- **Database operations:** Read/lock/write `reviews,vehicles` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated Review.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `listNotifications` · GET `/api/v1/notifications`
- **Purpose:** Read in-app notifications.
- **Authentication/role:** active user. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** unread; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** recipient_id=self.
- **Database operations:** Read/lock/write `notifications` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated Notification.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `unreadCount` · GET `/api/v1/notifications/unread-count`
- **Purpose:** Read own unread count.
- **Authentication/role:** active user. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Indexed recipient/read_at predicate.
- **Database operations:** Read/lock/write `notifications` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; UnreadCount.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `readNotification` · POST `/api/v1/notifications/{id}/read`
- **Purpose:** Mark own notification read.
- **Authentication/role:** active user. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Own only, idempotent; foreign recipient 404.
- **Database operations:** Read/lock/write `notifications` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Notification.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `readAllNotifications` · POST `/api/v1/notifications/read-all`
- **Purpose:** Mark existing own notifications read.
- **Authentication/role:** active user. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Capture server cutoff timestamp at request start; later arrivals remain unread.
- **Database operations:** Read/lock/write `notifications` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Ack.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `createComplaint` · POST `/api/v1/complaints`
- **Purpose:** File complaint about own trip.
- **Authentication/role:** participant. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `ComplaintInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Verified participant; max 3 open complaints/user/trip; reason plain text.
- **Database operations:** Read/lock/write `complaints,trips` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP201; Complaint.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `myComplaints` · GET `/api/v1/complaints/mine`
- **Purpose:** Read own complaints.
- **Authentication/role:** active user. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** reporter=self.
- **Database operations:** Read/lock/write `complaints` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated Complaint.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `adminUsers` · GET `/api/v1/admin/users`
- **Purpose:** Search users with status/roles.
- **Authentication/role:** ADMIN. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** search, status, role; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Server admin role and active check.
- **Database operations:** Read/lock/write `users,user_roles` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated User.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `adminUser` · GET `/api/v1/admin/users/{id}`
- **Purpose:** Inspect user for support.
- **Authentication/role:** ADMIN. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Audit sensitive read; no secrets.
- **Database operations:** Read/lock/write `users,user_roles` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; User.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `suspendUser` · POST `/api/v1/admin/users/{id}/suspend`
- **Purpose:** Suspend account and resolve commitments.
- **Authentication/role:** ADMIN. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `ReasonInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Prevent self/last-admin suspension; revoke sessions immediately; atomic unstarted cancellations; active trips incident flagged for admin resolution.
- **Database operations:** Read/lock/write `users,refresh_sessions,bookings,carpools,trips,resource_reservations,audit_logs,outbox_events` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; User.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `reactivateUser` · POST `/api/v1/admin/users/{id}/reactivate`
- **Purpose:** Reactivate eligible account.
- **Authentication/role:** ADMIN. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `ReasonInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** No automatic verification renewal, bookings or sessions restored.
- **Database operations:** Read/lock/write `users,audit_logs` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; User.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `adminVerifications` · GET `/api/v1/admin/verifications`
- **Purpose:** Read pending verification queue.
- **Authentication/role:** ADMIN. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** type, status; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Newest pending revisions; filter type/status.
- **Database operations:** Read/lock/write `verification_requests` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated Verification.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `adminVerification` · GET `/api/v1/admin/verifications/{id}`
- **Purpose:** Inspect immutable submitted documents.
- **Authentication/role:** ADMIN. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Record sensitive read audit; download via protected content endpoint.
- **Database operations:** Read/lock/write `verification_requests,documents` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Verification.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `decideVerification` · POST `/api/v1/admin/verifications/{id}/decision`
- **Purpose:** Approve/reject current verification revision.
- **Authentication/role:** ADMIN. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `VerificationDecisionInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** No own submission approval; CAS current pending revision; CLEAN docs unexpired; mandatory reason.
- **Database operations:** Read/lock/write `verification_requests,driver_profiles,vehicles,audit_logs,outbox_events` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Verification.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `adminBookings` · GET `/api/v1/admin/bookings`
- **Purpose:** Inspect booking operations.
- **Authentication/role:** ADMIN. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** status, from, to; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Date/status filters; paginated.
- **Database operations:** Read/lock/write `bookings` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated Booking.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `adminCarpools` · GET `/api/v1/admin/carpools`
- **Purpose:** Inspect carpool operations.
- **Authentication/role:** ADMIN. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** status, from, to; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Date/status filters; paginated.
- **Database operations:** Read/lock/write `carpools` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated Carpool.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `adminTrips` · GET `/api/v1/admin/trips`
- **Purpose:** Inspect trip operations/incidents.
- **Authentication/role:** ADMIN. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** status, overdue; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Filter status and overdue; participant details via authorized resources.
- **Database operations:** Read/lock/write `trips` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated Trip.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `adminComplaints` · GET `/api/v1/admin/complaints`
- **Purpose:** Read complaint queue.
- **Authentication/role:** ADMIN. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** status; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Filter state; paginated.
- **Database operations:** Read/lock/write `complaints` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated Complaint.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `decideComplaint` · POST `/api/v1/admin/complaints/{id}/decision`
- **Purpose:** Review/resolve/dismiss complaint.
- **Authentication/role:** ADMIN. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `ComplaintDecisionInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** OPEN->IN_REVIEW->RESOLVED or DISMISSED; no silent deletes; reason mandatory.
- **Database operations:** Read/lock/write `complaints,audit_logs,outbox_events` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Complaint.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `hideReview` · POST `/api/v1/admin/reviews/{id}/hide`
- **Purpose:** Hide abusive review.
- **Authentication/role:** ADMIN. Authentication plus current DB account/role/session checks.
- **Path parameters:** id; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** `ReasonInput` in JSON; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Idempotent; aggregation excludes hidden reviews immediately.
- **Database operations:** Read/lock/write `reviews,audit_logs` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Review.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `adminAudit` · GET `/api/v1/admin/audit-logs`
- **Purpose:** Inspect immutable administrative actions.
- **Authentication/role:** ADMIN. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** actorId, action, from, to; page and pageSize. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Allowlisted action/actor/date filters; cannot mutate audit.
- **Database operations:** Read/lock/write `audit_logs` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; paginated AuditEntry.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `adminReport` · GET `/api/v1/admin/reports/summary`
- **Purpose:** Read bounded operational counts/estimates.
- **Authentication/role:** ADMIN. Authentication plus current DB account/role/session checks.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** from, to. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** Required from/to dates max90d; UTC half-open boundaries; totals not collected revenue.
- **Database operations:** Read/lock/write `bookings,carpools,seat_requests,verification_requests,complaints` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Report.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `health` · GET `/api/v1/health`
- **Purpose:** Process liveness.
- **Authentication/role:** public. No bearer required for public projection; private alternatives require owner/admin authorization.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** No database dependency.
- **Database operations:** Read/lock/write `none` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Health.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


### `ready` · GET `/api/v1/ready`
- **Purpose:** Database and worker readiness.
- **Authentication/role:** public. No bearer required for public projection; private alternatives require owner/admin authorization.
- **Path parameters:** none; UUID, ownership checked through aggregate.
- **Query parameters:** none. Types and bounds in OpenAPI.
- **Request:** no body; reject unknown fields; schemas below define exact required properties.
- **Validation/business/authorization:** 503 on database/schema/worker stale; return no connection details.
- **Database operations:** Read/lock/write `database` as the purpose requires; writes with history/audit/outbox follow the transaction protocol in [05 business-rules](05-business-rules.md). Reads never mutate domain status.
- **Success:** HTTP200; Health.
- **Errors:** common contract above;401 authentication,403 role/precondition,404 private ownership,409 stale/inventory/state conflict,422 field validation,429 throttle,500 redacted unexpected failure,503 dependency/retry exhaustion, plus400 challenge/token errors or413/415 for upload where applicable.


## Request/response schemas
The full JSON Schema-compatible definitions live in OpenAPI components; the following index makes every field reviewable without generating API code.
### `Error`
- `success` required: `{"type":"boolean","enum":[false]}`
- `error` required: `{"type":"object","required":["code","message","requestId"],"properties":{"code":{"type":"string","minLength":1,"maxLength":80},"message":{"type":"string","minLength":1,"maxLength":500},"requestId":{"type":"string","minLength":1,"maxLength":80},"details":{"type":"object","additionalProperties":true}},"additionalProperties":false}`

### `Ack`
- `acknowledged` required: `{"type":"boolean"}`

### `PageMeta`
- `page` required: `{"type":"integer","minimum":1,"maximum":2147483647}`
- `pageSize` required: `{"type":"integer","minimum":1,"maximum":100}`
- `total` required: `{"type":"integer","minimum":0,"maximum":2147483647}`

### `User`
- `id` required: `{"type":"string","format":"uuid"}`
- `displayName` required: `{"type":"string","minLength":1,"maxLength":80}`
- `email` required: `{"type":"string","minLength":1,"maxLength":254,"format":"email"}`
- `emailVerified` required: `{"type":"boolean"}`
- `phone` optional: `{"type":"string","minLength":1,"maxLength":16,"pattern":"^\\+[1-9][0-9]{7,14}$"}`
- `roles` required: `{"type":"array","items":{"type":"string","enum":["PASSENGER","DRIVER","OWNER","ADMIN"]},"maxItems":4}`
- `status` required: `{"type":"string","enum":["ACTIVE","SUSPENDED"]}`
- `createdAt` required: `{"type":"string","format":"date-time"}`

### `RegisterInput`
- `displayName` required: `{"type":"string","minLength":1,"maxLength":80}`
- `email` required: `{"type":"string","minLength":1,"maxLength":254,"format":"email"}`
- `password` required: `{"type":"string","minLength":12,"maxLength":128}`

### `LoginInput`
- `email` required: `{"type":"string","minLength":1,"maxLength":254,"format":"email"}`
- `password` required: `{"type":"string","minLength":1,"maxLength":128}`

### `EmailInput`
- `email` required: `{"type":"string","minLength":1,"maxLength":254,"format":"email"}`

### `OtpInput`
- `email` required: `{"type":"string","minLength":1,"maxLength":254,"format":"email"}`
- `code` required: `{"type":"string","minLength":6,"maxLength":6,"pattern":"^[0-9]{6}$"}`

### `ResetInput`
- `token` required: `{"type":"string","minLength":32,"maxLength":256}`
- `newPassword` required: `{"type":"string","minLength":12,"maxLength":128}`

### `TokenResult`
- `accessToken` required: `{"type":"string","minLength":1,"maxLength":4096}`
- `expiresIn` required: `{"type":"integer","enum":[900]}`
- `user` required: `{"$ref":"#/components/schemas/User"}`

### `ProfileInput`
- `displayName` optional: `{"type":"string","minLength":1,"maxLength":80}`
- `phone` optional: `{"type":"string","minLength":1,"maxLength":16,"pattern":"^\\+[1-9][0-9]{7,14}$"}`

### `RoleInput`
- `role` required: `{"type":"string","enum":["DRIVER","OWNER"]}`

### `ReasonInput`
- `reason` required: `{"type":"string","minLength":10,"maxLength":1000}`

### `VersionReasonInput`
- `version` required: `{"type":"integer","minimum":1,"maximum":2147483647}`
- `reason` required: `{"type":"string","minLength":10,"maxLength":1000}`

### `DocumentInput`
- `kind` required: `{"type":"string","enum":["LICENSE","REGISTRATION","INSURANCE","VEHICLE_IMAGE"]}`
- `file` required: `{"type":"string","format":"binary"}`
- `expiresOn` optional: `{"type":"string","format":"date"}`

### `Document`
- `id` required: `{"type":"string","format":"uuid"}`
- `kind` required: `{"type":"string","minLength":1,"maxLength":40}`
- `scanStatus` required: `{"type":"string","enum":["PENDING","CLEAN","REJECTED"]}`
- `createdAt` required: `{"type":"string","format":"date-time"}`
- `expiresOn` optional: `{"type":"string","format":"date"}`

### `DriverInput`
- `licenseNumber` required: `{"type":"string","minLength":1,"maxLength":40}`
- `licenseCountry` required: `{"type":"string","minLength":2,"maxLength":2,"pattern":"^[A-Z]{2}$"}`
- `licenseExpiresOn` required: `{"type":"string","format":"date"}`
- `serviceCityId` required: `{"type":"string","format":"uuid"}`
- `hourlyRateMinor` required: `{"type":"integer","minimum":1,"maximum":10000000}`
- `bio` optional: `{"type":"string","minLength":1,"maxLength":1000}`
- `version` optional: `{"type":"integer","minimum":1,"maximum":2147483647}`

### `Driver`
- `id` required: `{"type":"string","format":"uuid"}`
- `displayName` required: `{"type":"string","minLength":1,"maxLength":80}`
- `cityId` required: `{"type":"string","format":"uuid"}`
- `verificationStatus` required: `{"type":"string","enum":["DRAFT","PENDING","APPROVED","REJECTED","EXPIRED"]}`
- `hourlyRateMinor` required: `{"type":"integer","minimum":0,"maximum":100000000}`
- `currency` required: `{"type":"string","enum":["INR"]}`
- `acceptingBookings` required: `{"type":"boolean"}`
- `ratingAverage` required: `{"type":"number","minimum":1,"maximum":5,"nullable":true}`
- `ratingCount` required: `{"type":"integer","minimum":0,"maximum":2147483647}`
- `bio` optional: `{"type":"string","minLength":1,"maxLength":1000}`
- `version` required: `{"type":"integer","minimum":1,"maximum":2147483647}`

### `AvailabilityInput`
- `startsAt` required: `{"type":"string","format":"date-time"}`
- `endsAt` required: `{"type":"string","format":"date-time"}`
- `kind` required: `{"type":"string","enum":["AVAILABLE","BLOCKED"]}`

### `Availability`
- `id` required: `{"type":"string","format":"uuid"}`
- `startsAt` required: `{"type":"string","format":"date-time"}`
- `endsAt` required: `{"type":"string","format":"date-time"}`
- `kind` required: `{"type":"string","enum":["AVAILABLE","BLOCKED"]}`

### `VehicleInput`
- `registrationNumber` required: `{"type":"string","minLength":1,"maxLength":30}`
- `make` required: `{"type":"string","minLength":1,"maxLength":60}`
- `model` required: `{"type":"string","minLength":1,"maxLength":60}`
- `year` required: `{"type":"integer","minimum":1990,"maximum":2100}`
- `category` required: `{"type":"string","enum":["HATCHBACK","SEDAN","SUV","VAN"]}`
- `seats` required: `{"type":"integer","minimum":2,"maximum":12}`
- `transmission` required: `{"type":"string","enum":["MANUAL","AUTOMATIC"]}`
- `fuelType` required: `{"type":"string","enum":["PETROL","DIESEL","ELECTRIC","HYBRID"]}`
- `cityId` required: `{"type":"string","format":"uuid"}`
- `hourlyRateMinor` required: `{"type":"integer","minimum":1,"maximum":10000000}`
- `description` optional: `{"type":"string","minLength":1,"maxLength":1500}`
- `version` optional: `{"type":"integer","minimum":1,"maximum":2147483647}`

### `Vehicle`
- `id` required: `{"type":"string","format":"uuid"}`
- `ownerId` required: `{"type":"string","format":"uuid"}`
- `make` required: `{"type":"string","minLength":1,"maxLength":60}`
- `model` required: `{"type":"string","minLength":1,"maxLength":60}`
- `year` required: `{"type":"integer","minimum":1990,"maximum":2100}`
- `category` required: `{"type":"string","minLength":1,"maxLength":20}`
- `seats` required: `{"type":"integer","minimum":2,"maximum":12}`
- `transmission` required: `{"type":"string","minLength":1,"maxLength":20}`
- `fuelType` required: `{"type":"string","minLength":1,"maxLength":20}`
- `cityId` required: `{"type":"string","format":"uuid"}`
- `hourlyRateMinor` required: `{"type":"integer","minimum":0,"maximum":100000000}`
- `currency` required: `{"type":"string","enum":["INR"]}`
- `verificationStatus` required: `{"type":"string","enum":["DRAFT","PENDING","APPROVED","REJECTED","EXPIRED"]}`
- `listed` required: `{"type":"boolean"}`
- `imageIds` required: `{"type":"array","items":{"type":"string","format":"uuid"},"maxItems":8}`
- `ratingAverage` required: `{"type":"number","minimum":1,"maximum":5,"nullable":true}`
- `ratingCount` required: `{"type":"integer","minimum":0,"maximum":2147483647}`
- `version` required: `{"type":"integer","minimum":1,"maximum":2147483647}`

### `OwnerInput`
- `displayName` required: `{"type":"string","minLength":1,"maxLength":80}`
- `contactPhone` required: `{"type":"string","minLength":1,"maxLength":16,"pattern":"^\\+[1-9][0-9]{7,14}$"}`

### `Owner`
- `userId` required: `{"type":"string","format":"uuid"}`
- `displayName` required: `{"type":"string","minLength":1,"maxLength":80}`
- `contactPhone` required: `{"type":"string","minLength":1,"maxLength":16}`

### `ListingInput`
- `enabled` required: `{"type":"boolean"}`
- `version` required: `{"type":"integer","minimum":1,"maximum":2147483647}`

### `QuoteInput`
- `service` required: `{"type":"string","enum":["VEHICLE_RENTAL","DRIVER_HIRE","COMBINED"]}`
- `vehicleId` required: `{"type":"string","format":"uuid"}`
- `driverId` required: `{"type":"string","format":"uuid"}`
- `startsAt` required: `{"type":"string","format":"date-time"}`
- `endsAt` required: `{"type":"string","format":"date-time"}`
- `originCityId` required: `{"type":"string","format":"uuid"}`
- `destinationCityId` required: `{"type":"string","format":"uuid"}`
- `passengers` required: `{"type":"integer","minimum":1,"maximum":11}`

### `Quote`
- `id` required: `{"type":"string","format":"uuid"}`
- `service` required: `{"type":"string","minLength":1,"maxLength":30}`
- `vehicleId` required: `{"type":"string","format":"uuid"}`
- `driverId` required: `{"type":"string","format":"uuid"}`
- `startsAt` required: `{"type":"string","format":"date-time"}`
- `endsAt` required: `{"type":"string","format":"date-time"}`
- `billableHours` required: `{"type":"integer","minimum":1,"maximum":720}`
- `vehicleSubtotalMinor` required: `{"type":"integer","minimum":0,"maximum":100000000}`
- `driverSubtotalMinor` required: `{"type":"integer","minimum":0,"maximum":100000000}`
- `totalMinor` required: `{"type":"integer","minimum":0,"maximum":100000000}`
- `currency` required: `{"type":"string","enum":["INR"]}`
- `expiresAt` required: `{"type":"string","format":"date-time"}`
- `paymentStatus` required: `{"type":"string","enum":["NOT_COLLECTED"]}`

### `BookingInput`
- `quoteId` required: `{"type":"string","format":"uuid"}`

### `Booking`
- `id` required: `{"type":"string","format":"uuid"}`
- `passengerId` required: `{"type":"string","format":"uuid"}`
- `service` required: `{"type":"string","minLength":1,"maxLength":30}`
- `vehicleId` required: `{"type":"string","format":"uuid"}`
- `driverId` required: `{"type":"string","format":"uuid"}`
- `tripId` required: `{"type":"string","format":"uuid"}`
- `status` required: `{"type":"string","enum":["PENDING","CONFIRMED","REJECTED","CANCELLED","EXPIRED","COMPLETED","FAILED"]}`
- `startsAt` required: `{"type":"string","format":"date-time"}`
- `endsAt` required: `{"type":"string","format":"date-time"}`
- `totalMinor` required: `{"type":"integer","minimum":0,"maximum":100000000}`
- `currency` required: `{"type":"string","enum":["INR"]}`
- `expiresAt` required: `{"type":"string","format":"date-time"}`
- `version` required: `{"type":"integer","minimum":1,"maximum":2147483647}`
- `paymentStatus` required: `{"type":"string","enum":["NOT_COLLECTED"]}`
- `decisions` required: `{"type":"array","items":{"$ref":"#/components/schemas/BookingDecision"},"maxItems":2}`

### `BookingDecisionInput`
- `decision` required: `{"type":"string","enum":["ACCEPT","REJECT"]}`
- `version` required: `{"type":"integer","minimum":1,"maximum":2147483647}`
- `reason` optional: `{"type":"string","minLength":10,"maxLength":1000}`

### `AssignmentInput`
- `driverId` required: `{"type":"string","format":"uuid"}`
- `version` required: `{"type":"integer","minimum":1,"maximum":2147483647}`
- `reason` required: `{"type":"string","minLength":10,"maxLength":1000}`

### `CarpoolInput`
- `vehicleId` required: `{"type":"string","format":"uuid"}`
- `originCityId` required: `{"type":"string","format":"uuid"}`
- `destinationCityId` required: `{"type":"string","format":"uuid"}`
- `pickupNote` required: `{"type":"string","minLength":1,"maxLength":300}`
- `dropoffNote` required: `{"type":"string","minLength":1,"maxLength":300}`
- `startsAt` required: `{"type":"string","format":"date-time"}`
- `endsAt` required: `{"type":"string","format":"date-time"}`
- `seatsOffered` required: `{"type":"integer","minimum":1,"maximum":11}`
- `pricePerSeatMinor` required: `{"type":"integer","minimum":0,"maximum":100000000}`
- `joinMode` required: `{"type":"string","enum":["INSTANT","APPROVAL"]}`
- `waypoints` optional: `{"type":"array","items":{"type":"string","minLength":1,"maxLength":120},"maxItems":8}`
- `version` optional: `{"type":"integer","minimum":1,"maximum":2147483647}`

### `Carpool`
- `id` required: `{"type":"string","format":"uuid"}`
- `hostId` required: `{"type":"string","format":"uuid"}`
- `vehicleId` required: `{"type":"string","format":"uuid"}`
- `tripId` required: `{"type":"string","format":"uuid"}`
- `originCityId` required: `{"type":"string","format":"uuid"}`
- `destinationCityId` required: `{"type":"string","format":"uuid"}`
- `pickupNote` required: `{"type":"string","minLength":1,"maxLength":300}`
- `dropoffNote` required: `{"type":"string","minLength":1,"maxLength":300}`
- `startsAt` required: `{"type":"string","format":"date-time"}`
- `endsAt` required: `{"type":"string","format":"date-time"}`
- `seatsOffered` required: `{"type":"integer","minimum":1,"maximum":11}`
- `confirmedSeats` required: `{"type":"integer","minimum":0,"maximum":11}`
- `availableSeats` required: `{"type":"integer","minimum":0,"maximum":11}`
- `pricePerSeatMinor` required: `{"type":"integer","minimum":0,"maximum":100000000}`
- `currency` required: `{"type":"string","enum":["INR"]}`
- `joinMode` required: `{"type":"string","enum":["INSTANT","APPROVAL"]}`
- `status` required: `{"type":"string","enum":["DRAFT","PUBLISHED","CANCELLED","COMPLETED","EXPIRED","FAILED"]}`
- `version` required: `{"type":"integer","minimum":1,"maximum":2147483647}`
- `waypoints` required: `{"type":"array","items":{"type":"string","minLength":1,"maxLength":120},"maxItems":8}`

### `SeatInput`
- `seats` required: `{"type":"integer","minimum":1,"maximum":11}`
- `message` optional: `{"type":"string","minLength":1,"maxLength":500}`

### `SeatRequest`
- `id` required: `{"type":"string","format":"uuid"}`
- `carpoolId` required: `{"type":"string","format":"uuid"}`
- `passengerId` required: `{"type":"string","format":"uuid"}`
- `seats` required: `{"type":"integer","minimum":1,"maximum":11}`
- `status` required: `{"type":"string","enum":["PENDING","ACCEPTED","REJECTED","CANCELLED","EXPIRED"]}`
- `version` required: `{"type":"integer","minimum":1,"maximum":2147483647}`
- `pricePerSeatMinor` required: `{"type":"integer","minimum":0,"maximum":100000000}`

### `DecisionInput`
- `decision` required: `{"type":"string","enum":["ACCEPT","REJECT"]}`
- `version` required: `{"type":"integer","minimum":1,"maximum":2147483647}`
- `reason` optional: `{"type":"string","minLength":10,"maxLength":1000}`

### `Trip`
- `id` required: `{"type":"string","format":"uuid"}`
- `kind` required: `{"type":"string","enum":["BOOKING","CARPOOL"]}`
- `status` required: `{"type":"string","enum":["SCHEDULED","ASSIGNED","STARTED","IN_TRANSIT","COMPLETED","CANCELLED","REJECTED","EXPIRED","FAILED"]}`
- `driverId` required: `{"type":"string","format":"uuid"}`
- `vehicleId` required: `{"type":"string","format":"uuid"}`
- `startsAt` required: `{"type":"string","format":"date-time"}`
- `endsAt` required: `{"type":"string","format":"date-time"}`
- `version` required: `{"type":"integer","minimum":1,"maximum":2147483647}`
- `waypoints` required: `{"type":"array","items":{"type":"string","minLength":1,"maxLength":120},"maxItems":8}`
- `waypointIndex` required: `{"type":"integer","minimum":0,"maximum":8}`
- `simulation` required: `{"type":"boolean","enum":[true]}`
- `incidentFlag` required: `{"type":"boolean"}`

### `TransitionInput`
- `toStatus` required: `{"type":"string","enum":["STARTED","IN_TRANSIT","COMPLETED","FAILED"]}`
- `version` required: `{"type":"integer","minimum":1,"maximum":2147483647}`
- `reason` optional: `{"type":"string","minLength":10,"maxLength":1000}`

### `VersionInput`
- `version` required: `{"type":"integer","minimum":1,"maximum":2147483647}`

### `HistoryEntry`
- `id` required: `{"type":"string","format":"uuid"}`
- `fromStatus` required: `{"type":"string","minLength":1,"maxLength":30}`
- `toStatus` required: `{"type":"string","minLength":1,"maxLength":30}`
- `actorId` required: `{"type":"string","format":"uuid","nullable":true}`
- `reason` optional: `{"type":"string","minLength":1,"maxLength":1000}`
- `createdAt` required: `{"type":"string","format":"date-time"}`

### `ReviewInput`
- `tripId` required: `{"type":"string","format":"uuid"}`
- `targetType` required: `{"type":"string","enum":["DRIVER","VEHICLE"]}`
- `targetId` required: `{"type":"string","format":"uuid"}`
- `rating` required: `{"type":"integer","minimum":1,"maximum":5}`
- `text` optional: `{"type":"string","minLength":1,"maxLength":2000}`

### `Review`
- `id` required: `{"type":"string","format":"uuid"}`
- `tripId` required: `{"type":"string","format":"uuid"}`
- `authorDisplayName` required: `{"type":"string","minLength":1,"maxLength":80}`
- `targetType` required: `{"type":"string","minLength":1,"maxLength":20}`
- `targetId` required: `{"type":"string","format":"uuid"}`
- `rating` required: `{"type":"integer","minimum":1,"maximum":5}`
- `text` optional: `{"type":"string","minLength":1,"maxLength":2000}`
- `createdAt` required: `{"type":"string","format":"date-time"}`
- `hidden` required: `{"type":"boolean"}`

### `Notification`
- `id` required: `{"type":"string","format":"uuid"}`
- `eventType` required: `{"type":"string","minLength":1,"maxLength":80}`
- `title` required: `{"type":"string","minLength":1,"maxLength":160}`
- `body` required: `{"type":"string","minLength":1,"maxLength":500}`
- `link` required: `{"type":"string","minLength":1,"maxLength":300}`
- `readAt` required: `{"type":"string","format":"date-time","nullable":true}`
- `createdAt` required: `{"type":"string","format":"date-time"}`

### `UnreadCount`
- `count` required: `{"type":"integer","minimum":0,"maximum":2147483647}`

### `ComplaintInput`
- `tripId` required: `{"type":"string","format":"uuid"}`
- `subject` required: `{"type":"string","minLength":1,"maxLength":120}`
- `description` required: `{"type":"string","minLength":10,"maxLength":4000}`

### `Complaint`
- `id` required: `{"type":"string","format":"uuid"}`
- `tripId` required: `{"type":"string","format":"uuid"}`
- `reporterId` required: `{"type":"string","format":"uuid"}`
- `subject` required: `{"type":"string","minLength":1,"maxLength":120}`
- `description` required: `{"type":"string","minLength":1,"maxLength":4000}`
- `status` required: `{"type":"string","enum":["OPEN","IN_REVIEW","RESOLVED","DISMISSED"]}`
- `resolution` optional: `{"type":"string","minLength":1,"maxLength":2000}`
- `version` required: `{"type":"integer","minimum":1,"maximum":2147483647}`
- `createdAt` required: `{"type":"string","format":"date-time"}`

### `ComplaintDecisionInput`
- `status` required: `{"type":"string","enum":["IN_REVIEW","RESOLVED","DISMISSED"]}`
- `resolution` required: `{"type":"string","minLength":10,"maxLength":2000}`
- `version` required: `{"type":"integer","minimum":1,"maximum":2147483647}`

### `VerificationDecisionInput`
- `decision` required: `{"type":"string","enum":["APPROVE","REJECT"]}`
- `version` required: `{"type":"integer","minimum":1,"maximum":2147483647}`
- `reason` required: `{"type":"string","minLength":10,"maxLength":1000}`

### `Verification`
- `id` required: `{"type":"string","format":"uuid"}`
- `subjectType` required: `{"type":"string","enum":["DRIVER","VEHICLE"]}`
- `subjectId` required: `{"type":"string","format":"uuid"}`
- `status` required: `{"type":"string","enum":["DRAFT","PENDING","APPROVED","REJECTED","EXPIRED"]}`
- `version` required: `{"type":"integer","minimum":1,"maximum":2147483647}`
- `documentIds` required: `{"type":"array","items":{"type":"string","format":"uuid"},"maxItems":8}`
- `submittedAt` required: `{"type":"string","format":"date-time"}`
- `reason` optional: `{"type":"string","minLength":1,"maxLength":1000}`

### `AuditEntry`
- `id` required: `{"type":"string","format":"uuid"}`
- `actorId` required: `{"type":"string","format":"uuid","nullable":true}`
- `action` required: `{"type":"string","minLength":1,"maxLength":100}`
- `subjectType` required: `{"type":"string","minLength":1,"maxLength":60}`
- `subjectId` required: `{"type":"string","format":"uuid"}`
- `reason` optional: `{"type":"string","minLength":1,"maxLength":1000}`
- `requestId` required: `{"type":"string","minLength":1,"maxLength":80}`
- `createdAt` required: `{"type":"string","format":"date-time"}`

### `Report`
- `from` required: `{"type":"string","format":"date"}`
- `to` required: `{"type":"string","format":"date"}`
- `bookingsCreated` required: `{"type":"integer","minimum":0,"maximum":2147483647}`
- `bookingsCompleted` required: `{"type":"integer","minimum":0,"maximum":2147483647}`
- `carpoolsPublished` required: `{"type":"integer","minimum":0,"maximum":2147483647}`
- `acceptedSeats` required: `{"type":"integer","minimum":0,"maximum":2147483647}`
- `pendingVerifications` required: `{"type":"integer","minimum":0,"maximum":2147483647}`
- `openComplaints` required: `{"type":"integer","minimum":0,"maximum":2147483647}`
- `estimatedBookingValueMinor` required: `{"type":"integer","format":"int64","minimum":0}`
- `currency` required: `{"type":"string","enum":["INR"]}`
- `paymentStatus` required: `{"type":"string","enum":["NOT_COLLECTED"]}`

### `City`
- `id` required: `{"type":"string","format":"uuid"}`
- `name` required: `{"type":"string","minLength":1,"maxLength":80}`
- `region` required: `{"type":"string","minLength":1,"maxLength":80}`
- `country` required: `{"type":"string","minLength":1,"maxLength":2}`
- `timezone` required: `{"type":"string","minLength":1,"maxLength":60}`

### `Health`
- `status` required: `{"type":"string","enum":["ok","unavailable"]}`

### `Session`
- `id` required: `{"type":"string","format":"uuid"}`
- `createdAt` required: `{"type":"string","format":"date-time"}`
- `expiresAt` required: `{"type":"string","format":"date-time"}`
- `current` required: `{"type":"boolean"}`

### `DriverPrivate`
- `id` required: `{"type":"string","format":"uuid"}`
- `displayName` required: `{"type":"string","minLength":1,"maxLength":80}`
- `cityId` required: `{"type":"string","format":"uuid","nullable":true}`
- `verificationStatus` required: `{"type":"string","enum":["DRAFT","PENDING","APPROVED","REJECTED","EXPIRED"]}`
- `hourlyRateMinor` required: `{"type":"integer","minimum":0,"maximum":100000000,"nullable":true}`
- `currency` required: `{"type":"string","enum":["INR"]}`
- `acceptingBookings` required: `{"type":"boolean"}`
- `ratingAverage` required: `{"type":"number","minimum":1,"maximum":5,"nullable":true}`
- `ratingCount` required: `{"type":"integer","minimum":0,"maximum":2147483647}`
- `bio` optional: `{"type":"string","minLength":1,"maxLength":1000}`
- `version` required: `{"type":"integer","minimum":1,"maximum":2147483647}`
- `licenseNumber` required: `{"type":"string","minLength":1,"maxLength":40,"nullable":true}`
- `licenseCountry` required: `{"type":"string","minLength":1,"maxLength":2,"nullable":true}`
- `licenseExpiresOn` required: `{"type":"string","format":"date","nullable":true}`

### `VehiclePrivate`
- `id` required: `{"type":"string","format":"uuid"}`
- `ownerId` required: `{"type":"string","format":"uuid"}`
- `make` required: `{"type":"string","minLength":1,"maxLength":60}`
- `model` required: `{"type":"string","minLength":1,"maxLength":60}`
- `year` required: `{"type":"integer","minimum":1990,"maximum":2100}`
- `category` required: `{"type":"string","minLength":1,"maxLength":20}`
- `seats` required: `{"type":"integer","minimum":2,"maximum":12}`
- `transmission` required: `{"type":"string","minLength":1,"maxLength":20}`
- `fuelType` required: `{"type":"string","minLength":1,"maxLength":20}`
- `cityId` required: `{"type":"string","format":"uuid"}`
- `hourlyRateMinor` required: `{"type":"integer","minimum":0,"maximum":100000000}`
- `currency` required: `{"type":"string","enum":["INR"]}`
- `verificationStatus` required: `{"type":"string","enum":["DRAFT","PENDING","APPROVED","REJECTED","EXPIRED"]}`
- `listed` required: `{"type":"boolean"}`
- `imageIds` required: `{"type":"array","items":{"type":"string","format":"uuid"},"maxItems":8}`
- `ratingAverage` required: `{"type":"number","minimum":1,"maximum":5,"nullable":true}`
- `ratingCount` required: `{"type":"integer","minimum":0,"maximum":2147483647}`
- `version` required: `{"type":"integer","minimum":1,"maximum":2147483647}`
- `registrationNumber` required: `{"type":"string","minLength":1,"maxLength":30}`
- `description` optional: `{"type":"string","minLength":1,"maxLength":1500}`

### `BookingDecision`
- `providerId` required: `{"type":"string","format":"uuid"}`
- `kind` required: `{"type":"string","enum":["OWNER","DRIVER"]}`
- `status` required: `{"type":"string","enum":["PENDING","ACCEPTED","REJECTED"]}`
- `decidedAt` required: `{"type":"string","format":"date-time","nullable":true}`

## Consumer/provider validation
Phase01 adds Spectral or equivalent OpenAPI structural validation with pinned tool versions. Phase20 checks each registered Express method/path and DTO against this contract, exercises both public and own projections, and fails CI for drift. Generated frontend types do not replace Zod runtime validation. Never add a generic `/admin/:table` mutation route or patch arbitrary role/status/resource identifiers.
