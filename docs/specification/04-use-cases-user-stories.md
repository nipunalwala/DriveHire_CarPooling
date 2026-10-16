# 04 · Core use cases

1. Passenger verifies an account, registers an owned vehicle, uploads clean evidence and obtains administrator approval. They find an external approved driver, obtain a server quote and request the driver. Acceptance confirms; cancellation/rejection/expiry releases both reservations exactly once.
2. Approved driver sets availability, receives own requests in the driver area, accepts/rejects and records authorized manual start/completion. A current trip cannot overlap a published hosted carpool or another hire.
3. Approved driver with an owned approved vehicle drafts/publishes a carpool. Passenger searches cities/date/seats, instantly joins available seats, sees persisted participation and can cancel within cutoff. No host acceptance action exists.
4. Administrator reviews immutable driver/vehicle document revisions, suspends/reactivates accounts and resolves booking/ride incidents with a reason and immutable audit. Review queues and operational lists are sufficient; analytics/complaints are deferred.

Recovery journeys: empty search offers changed filters; unverified account offers verification; unapproved vehicle offers its status; stale quote prompts requote;409 capacity/conflict prompts refresh; expired request cannot be accepted; canceled bookings remain in history. Authentication emails work; product state is read in app rather than promised as a notification.
