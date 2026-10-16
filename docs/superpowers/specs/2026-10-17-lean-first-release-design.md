# DriveHire lean first release

Status: scope proposal accepted in conversation; written design awaiting owner review.

## Intent and existing work

Deliver a smaller, usable first release with driver hiring and scheduled city-to-city carpooling. The owner agreed to defer the optional modules listed below. This interpretation keeps both core services; it does not select a driver-hiring-only release.

Continue in the existing repository and retain completed Phase01, including its verified API/worker foundation, contracts, React shell, local infrastructure and CI configuration. No new repository, application reset or migration of existing production data is required. No business schema exists yet.

This document describes the proposed replacement scope. Until the written design is approved and the implementation documents are synchronized, the original 24-phase roadmap is historical planning context and must not be executed automatically. This document does not authorize a merge, push, production deployment or new feature implementation.

## Included journeys

- Accounts: registration, email verification, login, logout and password recovery. Passenger and driver capabilities remain additive; administrator access remains protected on the server.
- Driver onboarding: basic profile, availability, private qualification evidence and a small administrator approval queue. Only approved, currently eligible drivers can receive bookings.
- Driver hiring: find an eligible driver, specify a scheduled interval and an owned vehicle, view a server-calculated estimate, send a request, receive the driver's acceptance or rejection, cancel under the applicable rules, and record start/completion. Persist status history and enforce conflict checks.
- Carpooling: an approved host registers an owned vehicle, publishes a scheduled ride between curated cities, sets offered seats, and passengers find and join it. Preserve safe cancellation and manual start/completion. The proposed first release supports instant joining only; host-approval seat requests are deferred.
- Passenger area: profile, driver bookings, carpool participation and history.
- Driver area: onboarding, availability, booking decisions, trip actions, hosted carpools and vehicle details needed for hosting.
- Administrator area: account suspension, driver/vehicle review and booking/ride inspection with essential reasoned intervention and audit history.

Driver hiring continues to use the requester's registered, approved vehicle as specified by the existing service rules. A simple personal-vehicle form and review path remain necessary. Removing the rental marketplace does not remove vehicle eligibility, private evidence or physical vehicle scheduling constraints. There is no fleet marketplace or separate vehicle-owner dashboard; any ownership permission needed internally must not grant access to another person's records.

## Deferred modules

- Vehicle rental listings, rental search and rental bookings.
- Combined vehicle-plus-driver bookings and their two-provider consent flow.
- Ratings, reviews, reputation aggregates and review moderation.
- Separate owner onboarding/dashboard, fleet operations and rental pricing/availability management.
- Notification centre, configurable notification channels, booking-message delivery and advanced notification retries. Authentication email still works; participants inspect current state in their booking/ride screens.
- Advanced reports, analytics, exports and a dedicated complaint-management subsystem. Basic operational inspection and essential administrator controls remain.
- Elaborate animations and dashboard decoration. Interface clarity, responsive layout and useful interaction feedback remain.
- Approval-mode carpool seat requests, as a proposed additional simplification requiring acceptance with this written design.

Do not create unused tables, endpoints, screens, event consumers or passing placeholders for deferred features. Keep historical documents in Git; deferred does not mean permanently deleted.

## Correctness and safety retained

The server controls permissions, eligibility, estimates, transitions and capacity. PostgreSQL transactions and constraints prevent overlapping driver/vehicle commitments and seat overbooking, including races between driver hiring and carpool publishing. Cancellation releases capacity once; active trips cannot silently free physical resources. Repeated requests must not duplicate bookings or seats. Preserve essential history and administrator audit records.

Private evidence remains outside public static storage with authorized access, type/size validation and malware scanning. Passwords, sessions and secrets retain the existing security requirements. No payment processing, maps, GPS or automatic navigation is introduced; estimates clearly state that DriveHire does not collect payment.

Authentication email requires actual SMTP delivery through the configured service and honest failures. Deferred product notifications must not enqueue events that have no delivery handler or be marked delivered without delivery. The existing worker may support only implemented expiry/email/heartbeat work; it must not claim future capabilities.

## Interface direction

Use Impeccable to create a compact, consistent design system and a few polished public, authentication and role-area pages. Keep accessibility, keyboard use, responsive behavior, loading, empty and error states. Generate original project imagery using the imagegen skill, commit selected assets and provenance, and keep decorative imagery separate from real provider/vehicle evidence. No generated identities, listing photos or testimonials.

## Proposed delivery structure

The revised roadmap has eight milestones in total, including the completed foundation. This is a scope outline, not the detailed implementation plan.

| Milestone    | Deliverable                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------- |
| 1 — complete | Existing verified project foundation                                                               |
| 2            | Reduced database schema, migrations and real constraint tests                                      |
| 3            | Accounts, permissions and basic profiles, with working authentication screens                      |
| 4            | Driver/vehicle onboarding, private documents and minimal administrator review screens              |
| 5            | Driver hiring as a complete API/database/UI journey                                                |
| 6            | Instant-join carpooling as a complete API/database/UI journey                                      |
| 7            | Shared interface polish, generated imagery and participant/admin area integration                  |
| 8            | End-to-end/security/accessibility checks, deployment preparation, restore evidence and final audit |

UI foundations are introduced when the first real screens need them; milestone7 refines existing flows. Every feature milestone includes its own permission, negative, integration and relevant concurrency tests. Milestone8 validates the assembled product rather than postponing all testing or security until the end. Eight milestones means seven remain; it is not an effort or delivery-date estimate.

## Acceptance and document migration

Acceptance requires real persisted end-to-end driver hiring and carpool journeys, tested account boundaries, database-proven conflict/capacity protection, private evidence handling and usable responsive screens. No Critical/High correctness or security defects may remain unmitigated. Deployment readiness requires actual available-environment evidence; production launch remains a separate decision.

After written-design approval, replace the active roadmap and phase prompts with the reduced sequence, update the overview, functional requirements, role/vehicle rules, lifecycle documents, schema design, OpenAPI, screen inventory, planning model and traceability together. Explicitly mark superseded requirements and operations as deferred so documentation checks do not demand removed modules. Preserve the Phase01 handoff and historical implementation record. Then prepare the detailed implementation plan against that coherent reduced baseline using the Superpowers writing-plans workflow.
