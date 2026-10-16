# 20 · Active architecture decisions

Historical ADR001–018 are preserved in the archived full-platform baseline. Decisions below are the current lean authority; historical reasoning for removed modules does not reactivate them.

## ADR019 · Lean scope approved2026-10-17

Problem: the24-phase platform carried more breadth than the owner wanted. Alternatives: keep full scope but combine phase labels; launch one service only; retain driver hiring and carpools with optional modules deferred. Owner approved the third approach and then the written lean design. Eight milestones include completed01; seven remain. Rentals, combined consent, reviews, owner/fleet UI, notifications, advanced reports/complaints, approval seats, replacement and waypoint tracking are deferred. Cost: participants refresh app state and use cancel/new booking; future modules need new explicit scope.

## ADR020 · Ownership without owner subsystem

Personal vehicles remain necessary for safe driver hiring and hosting. Model vehicles.owner_id -> users, enforce immutable ownership and current approval; PASSENGER/DRIVER/ADMIN roles only. No owner profile, rental charge/listing/availability APIs or separate dashboard. Safe public carpool vehicle summary is embedded, never a public evidence/registration endpoint. Cost: no fleet/rental product; adding it later requires forward migration and new contract review. Foundation OWNER enum is retired during contract implementation, not silently treated as a grant.

## ADR021 · Instant seats and single provider consent

Only DRIVER_HIRE and INSTANT join. One DRIVER decision confirms hire; accepted seat insert reserves capacity immediately. No owner decision, pending approval seat, replacement or simulated route UI. Shared driver+vehicle exclusion and active-use guards remain, since both retained services use physical resources. Cost: reduced optional workflows; cancellation/recreation required for material changes.

## ADR022 · Authentication email only

Retain a narrowly typed durable authentication-email outbox with private authenticated encryption and real SMTP worker. Remove product event producers, delivery-channel tables and in-app feed; use persisted booking/ride screens for current status. History/audit writes remain atomic with domain changes. Cost: no proactive booking notifications until explicitly added.

## ADR023 · Preserve verified foundation; deliver vertical journeys

Same repository/current branch, strict workspace boundaries, Node24.22.0/npm11.19.1, TypeScript5.9 and locked dependencies retained. Prisma7.10.1 is the prior candidate, not an installed or future-verified dependency; verify stable adapter/client compatibility at milestone02. Introduce UI foundations with first auth screens; driver hire/carpool milestones include API+database+UI. Impeccable and generated imagery remain. Cost: fewer handoffs, but each feature milestone contains frontend/backend tasks and its own regression tests.

## Change protocol

No business migration exists; this scope change changes documentation/OpenAPI only. Archive old baseline, reconcile active requirements/schema/API/screens/prompts together and verify links/refs/scope checks. Detailed plans require owner review before feature implementation. No main merge, push, repository visibility change or production launch is implied.
