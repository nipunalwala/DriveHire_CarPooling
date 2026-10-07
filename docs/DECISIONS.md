# DECISIONS — architecture decision log

Template for new entries:
```
## ADR-NNNN — <title>
- Date:
- Context:
- Decision:
- Consequences:
- Deviation from ARCHITECTURE (if any):
```

## ADR-0001 — Single primary role
- Date: 2026-10-07
- Context: Role model ambiguity.
- Decision: One `users.role` (`passenger|driver|owner|admin`); no driver+owner simultaneously; upgrades require admin approval.
- Consequences: Simpler RBAC; upgrade flow flips role on approval.

## ADR-0002 — Self-drive bookings
- Date: 2026-10-07
- Context: Whether bookings require a driver.
- Decision: `driver_profile_id` optional; `NULL` = self-drive; when set, driver must be approved+available; conflict checks independent for vehicle and driver.
- Consequences: Exclusion constraints on both dimensions.

## ADR-0003 — Email OTP
- Date: 2026-10-07
- Context: Verification channel.
- Decision: Email OTP only; 6 digits, 10-min expiry, 5 attempts, 60s cooldown, hash-only storage.
- Consequences: No SMS provider; rate-limit + cooldown required.

## ADR-0004 — Cancellation policy
- Date: 2026-10-07
- Context: Who/when can cancel.
- Decision: Non-admin cancel only before `start_at` with reason; admin may cancel after start. Enforced in service/domain + tests.
- Consequences: `cancel_reason` mandatory; post-start non-admin attempts rejected.

## ADR-0005 — Refresh cookie
- Date: 2026-10-07
- Context: Refresh transport.
- Decision: `httpOnly, SameSite=Strict, Secure=true prod, Path=/api/v1/auth/refresh`; opaque hashed rotated tokens with reuse-detection family revoke.
- Consequences: `Secure=false` local-dev only.
