# 13 · Notifications

Status: proposed implementation baseline; implementation requires separate human approval.

## Durable event contract
Domain transaction inserts outbox event{id,eventType,aggregateType,aggregateId,aggregateVersion,occurredAt,payload}. Safe payload contains immutable recipient IDs, resulting status, resource/trip IDs and actor display-safe info. No documents, tokens, password hashes, raw email/phone/license in normal event JSON. Verification/reset email sensitive fields are separately encrypted, restricted and scrubbed after delivery. Event type is versioned in code and schema-tested. Unique(aggregate_type,aggregate_id,event_type,aggregate_version) deduplicates mutation event replay.

| Event | Recipient snapshot | In-app | Email |
|---|---|---|---|
| auth.verify_requested / auth.reset_requested | Account | No | Required secure OTP/link |
| verification.submitted | Subject account; admin queue is query based | Yes to submitter | No |
| verification.approved/rejected/expired | Driver or vehicle owner | Yes with safe reason | Optional informational SMTP, no private doc |
| booking.created | Requester + required provider accounts | Yes | Optional confirmation request |
| booking.provider_decided | Requester + other providers | Yes | No |
| booking.confirmed/rejected/cancelled/expired/completed/failed | All requester/provider accounts deduped | Yes | Optional confirmed/cancelled only |
| carpool.published/cancelled/expired/completed/failed | Host + live/accepted relevant participants snapshotted before termination | Yes | Optional cancelled only |
| seat.requested/accepted/rejected/cancelled/expired | Requester and host, deduped | Yes | No |
| trip.assigned/started/in_transit/completed/failed | Requester/provider or host+accepted participants | Yes | No |
| trip.waypoint_advanced | Participant views poll trip; no notification spam | No | No |
| account.suspended/reactivated | Target (feed available on reactivation) | Yes | Required service notice |
| complaint.updated | Reporter | Yes | No |

Multiple lifecycle events may legitimately describe different facts, but avoid duplicate same-title spam: e.g. completion event generates trip notification and booking event reserved for parent audit if same audience; handler policy emits one user-facing completion per trip. Unique event/recipient is minimum guard; use stable semantic delivery key trip+completion+recipient when coalescing parent/child events. Explicit event tests verify title/body/link and count.

## Worker execution
Claim up to50 due events using FOR UPDATE SKIP LOCKED; set lease2min; release claim transaction before external calls. Fanout in-app insert + delivery mark atomic per recipient with unique(event,recipient), retries safe. Mark channel complete only after all its recipients done. Email uses stable provider idempotency/message ID where supported; SMTP crash window may duplicate; document at-least-once email behavior. Retry exponential5s,30s,2m,10m,30m with jitter, max10 attempts then dead letter; don't discard. Lease reclaim on crash. Admin/operator job command can requeue with reason/audit; no unbounded automatic retries. Alert oldest pending>5min or dead letter>0. Scheduled worker leases heartbeat30s and ready fails after2min without expected worker heartbeat in production.

## Feed behavior
Notifications database table is source of truth; newest created_at,id first; own recipient scoped before count/page.30s visible-tab polling, refetch on focus; no WebSockets needed. Own mark-read idempotent; foreign404. Mark-all captures transaction cutoff NOW and updates unread created_at<=cutoff so new arrivals remain unread. No delete endpoint in v1; retention180d batch cleanup respects event FK policy. Keep related events until associated notifications retained, then delete children before event or archive safe event metadata. A notification deep link is same-origin relative and must pass current authorization when followed.

## Verification
Crash after fanout recipient1, restart and complete recipients2/3 without duplicate1. Simulate SMTP outage; in-app persists and email retries. Kill process after domain commit before worker claim: notification later arrives. Rollback domain mutation: no notification. Cross-user read/read-all does not affect victim. Query count and feed consistent under mark-all/new arrival race. Event handlers must be registered by explicit channel; unknown type dead-letters visibly, never silently processed.
