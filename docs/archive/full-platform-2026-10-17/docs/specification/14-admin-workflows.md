# 14 · Admin Workflows

Status: proposed implementation baseline; implementation requires separate human approval.

## Administrative entry and control
Only ACTIVE backend ADMIN role enters any /admin route. Browser role switch cannot grant role. Operator-provisioned first admin, no web ADMIN grant; least privilege and final-active-admin guard. Admin can also be a provider via additive roles but cannot approve own verification or fabricate counterpart acceptance. Every privileged mutation requires explicit reason and transactionally writes audit; sensitive document/admin-user detail reads audited separately before content delivery. Audit records immutable and redacted.

## Verification workflow
Queue filter DRIVER/VEHICLE and PENDING, ordered oldest submitted first (override generic newest order for this queue). Detail loads immutable revision and its protected document IDs; verify CLEAN scan, license/insurance validity, subject versions and identity consistency. Approve/reject with revision version and reason. Under subject resource locks compare current PENDING revision; stale409. Approval updates current pointer and status, rejection leaves unbookable and surfaces reason to owner. Driver endpoints introduced Phase05; Phase06 extends common verification API for vehicles; Phase12 completes operational filters/audit coverage. Expiry workers never blindly reset active trips; follow incident rules.

## Suspension/reactivation
Preview consequences from scoped bookings/trips, then confirm with reason. Transaction locks target user plus all discovered affected resource and aggregate rows in canonical order, rechecks set, revokes families/increments tokenVersion and cancels unstarted obligations (including passenger seat requests). Do not delete history. Flag active incidents; operator can finish safe failure through active admin trip controls. Notification target snapshot recorded before terminal changes. Disallow self/last-admin suspension; singleton admin_policy lock serializes last-admin checks. Reactivation needs reason; does not restore any session/booking/approval and requires fresh login.

## Booking and carpool operations
Queues bounded date/status, links to participant-visible detail under admin access. Cancel unstarted via same service with explicit admin cutoff override. Pending hired-driver reassignment must meet same rate/current quote total, verification/availability and exclusion rules; new driver must consent before original deadline. Confirmed vehicle/driver changes require cancel/new booking. Started trip incident -> FAILED with reason and safe operational confirmation. Never provide arbitrary status/seat override SQL controls. Reports flag overdue active resources; no real location known.

## Complaints and moderation
Participant creates OPEN case with trip; admin transitions to IN_REVIEW then RESOLVED or DISMISSED with version+resolution. Persist complaint_history and audit together; notify reporter. Terminal case remains readable, no reopening/deletion in v1. Hide abusive review with reason and audit; SQL mean/count excludes hidden immediately. Reporter/private evidence never appears in public reviews. No fabricated ticket-chat interface; text case/resolution is complete v1 scope.

## Reports
GET admin/reports/summary requires from/to YYYY-MM-DD representing UTC half-open range, max90days; defaults are UI-generated explicit7/30/90days. BookingsCreated based created_at; completed based completed_at via trip; carpoolPublished uses publication event timestamp (store published_at on carpool); acceptedSeats counts accepted requests of trips starting in range, including completed retained accepted participants; pendingVerifications/openComplaints are current snapshot counts labelled as such. EstimatedBookingValue sums confirmed/completed booking snapshots created in range, excluding cancelled/rejected/expired/failed; it is NOT collected revenue. Query fixtures verify definitions and safe integer bounds. No payment reports.

## Audit querying and retention
Filter actor/action/date and paginate deterministic created_at,id descending. Detail safe before/after contains status/version/linked IDs, not email/secret/file key. Audit runtime role has INSERT+SELECT only; append-only trigger and permissions tests. Operator retention uses separate audited privileged role and policy, never ordinary API. Log failed admin permission attempts with requestId and redacted subject; successful sensitive reads recorded in audit. Operational requeue/reconciliation repair requires reason and audit, not hidden dashboard utility buttons.
