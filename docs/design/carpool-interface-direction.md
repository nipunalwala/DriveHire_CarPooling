# Carpool interface direction

Extend DriveHire's established daytime operational interface. Inherit the teal,
ivory, white and leaf palette, existing typography, two-column task introduction
and content layout, native forms and record lists. Stack naturally on mobile.
Original service imagery remains Phase07 work; no fabricated listing portraits.

Passengers search by curated origin/destination, origin-local departure day and
seat count. Saved URL filters and pagination preserve context. Detail presents
meeting notes, planned times, remaining capacity and per-seat INR estimate before
one explicit instant-join action. Only a server-persisted accepted request earns
confirmation. Keep the exact payment-not-collected notice and cutoff visible.

Hosts select an approved owned vehicle, save a private draft, then deliberately
publish. Published route/times/capacity/price are immutable; edit private drafts or
cancel/recreate. Host roster shows safe display names, seats and status with no
approval/rejection controls. Shared trip page records manual progress.

Participation history distinguishes accepted seats from the parent ride's final
state. Completion/failure keeps accepted participation historical. Conflicts and
unknown results require reload, preserve entries and never optimistically change
counts. Unknown join retry retains the same idempotency key. Empty states link
to actual search, qualification and vehicle onboarding routes.

Inspect one combined desktop/mobile set after runtime success. Fix concrete
visual defects in one batch and confirm at most once. Independent review and
required tests precede main/owner commit, phase push and CI inspection.
