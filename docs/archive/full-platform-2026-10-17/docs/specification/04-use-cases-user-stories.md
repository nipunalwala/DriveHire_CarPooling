# 04 · Use Cases User Stories

Status: proposed implementation baseline; implementation requires separate human approval.

## Primary journeys and acceptance examples
| Use case / story | Preconditions and trigger | Successful steps | Alternative/negative evidence |
|---|---|---|---|
| UC01 As a passenger I verify email and sign in | Fresh email; registration | Register->OTP email->verify->login->profile | Duplicate generic ack; expired OTP; suspended login403 |
| UC02 As a multi-role user I become a provider | Verified account; enable DRIVER/OWNER | Add role->complete own profile->upload->submit->admin decision | Role alone cannot enable listings; rejection reason permits correction |
| UC03 As a qualified driver I rent a vehicle | PASSENGER+approved DRIVER | Search dates->vehicle->quote rental->request->owner accept->self starts/completes | Missing approved driver denied; driver-only availability not required for own self-drive |
| UC04 As an owner I hire an external driver | PASSENGER+OWNER; own approved vehicle | Select own vehicle->driver/time->quote DRIVER_HIRE->driver accepts | Other owner's vehicle denied; self hire denied |
| UC05 As passenger I book vehicle and driver | Active verified requester | Select compatible verified resources->quote->request->two provider consents->assigned | One provider rejects->all holds released; one accepts->still pending |
| UC06 As a host I share spare seats | Approved DRIVER+OWNER with owned approved vehicle | Draft city route/time->offer seats excluding driver->publish->accept/join->manual lifecycle | Cross-service conflict; more seats than capacity; draft private |
| UC07 As passenger I join a carpool | Published ride at least15min ahead | Search city/date/seats->detail->instant accept or request->host decision->history | Pending does not reserve; final-seat race one winner; host cannot join self |
| UC08 As participant I cancel before departure | Valid state/cutoff and reason | Confirm dialog->server atomic cancellation->history/notification | Accepted passenger last15min denied; provider pre-start cancellation recorded |
| UC09 As driver I report progress | ASSIGNED and within start window | STARTED->IN_TRANSIT->waypoint->COMPLETED | Passenger denied; backwards/skip/stale409; prior active trip blocks start |
| UC10 As participant I review or complain | Completed eligible trip for review; any participant trip for complaint | Rate actual target once; file own complaint; admin review/resolution | Own target/duplicate/foreign trip denied; no fabricated review histories |
| UC11 As admin I resolve verification and abuse | Active ADMIN; not own verification | Inspect private doc with audit->approve/reject; suspend abusive user; resolve complaint | Nonadmin403; stale revision409; last active admin protected |
| UC12 As operator I recover a release | Existing backups and migration journal | Restore DB/files->deploy compatible build->replay outbox->reconcile seats/holds | Readiness remains503 until dependencies and worker recovered |

## Concrete multi-party acceptance scenario
Use separate verified accounts Passenger A, Owner B and Driver C; approve B's five-seat vehicle and C's driver profile; availability covers10:00–14:00 UTC. A requests COMBINED10:00–12:00 with four passengers. Owner acceptance alone leaves PENDING. Driver acceptance confirms and trip becomes ASSIGNED exactly once. C starts no earlier09:45, manually enters IN_TRANSIT, completes; booking becomes COMPLETED. A can rate B's vehicle and C once each. B and C cannot review their own resource. Every party sees its own durable notification and authorized history. Attempt an overlapping carpool with B's vehicle and assert409.

## Definition of user-visible success
Every mutation has a persisted outcome confirmed by API and query invalidation. A network timeout shows an uncertain state and safe retry/reload; it never invents confirmation. Errors retain safe form fields and identify recovery. All screens include role/ownership guards, but API authorization is the authority.
