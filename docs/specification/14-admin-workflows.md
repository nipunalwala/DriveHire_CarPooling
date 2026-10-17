# 14 · Minimal administrator workflows

Four task-focused surfaces: users, verification queue, operations and immutable audit. No analytics/report widgets, complaint queue, review moderation or owner/fleet management.

Verification: inspect current pending driver/personal-vehicle revision and its immutable CLEAN document snapshot; audit sensitive reads; approve/reject with reason and matching version. Reject own-submission approval, stale/superseded revision, unscanned/expired/missing evidence. Approval grants qualification, not a new role. Material edits with commitments are blocked; otherwise invalidate approval and require new revision.

Accounts: inspect safe profile; suspend with reason (not self/last admin), revoke sessions, atomically cancel unstarted commitments/seats while preserving history. Active use remains an incident needing deliberate completion/failure resolution. Reactivation restores access only; no sessions, verification or bookings are automatically restored.

Operations: paginated date/status lists and own-resource detail endpoints under ADMIN authorization; cancel unstarted work or fail started incident with reason using same transactional services as participants. Changing driver requires cancel/new booking, never replacement or silent price changes. All mutations and evidence reads append actor/action/target/requestId/time and safe reason; runtime cannot update/delete audit. Negative object/role tests and suspension-vs-create races are mandatory.
