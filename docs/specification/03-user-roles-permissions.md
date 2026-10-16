# 03 · User Roles Permissions

Status: proposed implementation baseline; implementation requires separate human approval.

## Role model
`users` represents identity. `user_roles(user_id,role)` is a unique additive relation. Every self-registered account gets PASSENGER. A verified active user may enable DRIVER and OWNER without admin approval to start onboarding; operational eligibility requires separate APPROVED, unexpired profile/documents. ADMIN is provisioned only by an audited operator command, never public API or role switch. The initial admin uses a one-time environment-supplied email and interactive password, never a seeded shared password.

JWT contains sub,sid,tokenVersion,iss,aud,iat,exp,jti. Backend reads current user status, roles and family revocation on every protected request. Roles are not trusted from request bodies or stale JWT claims. Active UI role is a navigation preference; permissions are the union of actual roles and object relationships. Missing role403; foreign private object404. An administrator may inspect operational data but cannot approve their own driver/vehicle verification.

| Capability | Passenger | Driver | Owner | Admin |
|---|---|---|---|---|
| Search public listings | Public | Public | Public | Public |
| Create service booking/request seats | Own verified PASSENGER | Via PASSENGER role | Via PASSENGER role | Via PASSENGER role; no eligibility bypass |
| Self-drive rental | Also approved DRIVER | Own requester | Via DRIVER | Same approval requirement |
| Provide driver service | No | Own approved profile | Via DRIVER | No implicit qualification |
| Register/manage vehicle | No | Via OWNER | Owned only | Inspect; do not impersonate owner |
| Host carpool | No | Also OWNER, approved driver | Also DRIVER, owned vehicle | Same qualification rules |
| Accept booking | No | Required assigned-driver decision | Required owned-vehicle decision | Cannot fabricate provider consent |
| Start/advance trip | No | Assigned actual driver | Only if also assigned driver | Incident override, audited |
| Read trip history | Own request/accepted seat | Assigned | Vehicle owned | Operational access |
| Review | Eligible completed requester/accepted passenger | Cannot review self | Cannot review own vehicle | Cannot bypass participation |
| Notifications | Own | Own | Own | Own; no arbitrary recipient feed |
| Verification/users/reports | No | No | No | Backend enforced, active ADMIN |

## Account suspension and lifecycle
Unverified users may login only after email verification; public resend/reset remains possible subject to limits. Suspension rejects all protected calls, revokes all refresh sessions and increments token_version. Under the shared lock protocol it cancels every unstarted booking/carpool in which the account is a requester, provider, vehicle owner or host, and cancels its future seat requests. STARTED/IN_TRANSIT trips are incident flagged; another active admin may fail them and coordinate operations. A suspended driver cannot operate the API. Do not silently release an active physical resource. Reactivation restores access after fresh login and preserves cancelled outcomes; verification expiry still applies.

ADMIN grant/revoke is out of normal web scope. Operator command requires current active admin identity, reason and atomic last-admin check under a singleton admin-policy row lock. Self-suspension prohibited; at least one active admin maintained. Phase12 must test concurrent last-admin changes. Account physical deletion/email changes are not v1 workflows; profile edit cannot accept roles/status/email/password fields.
