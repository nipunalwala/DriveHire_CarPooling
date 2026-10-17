# 00 · Project Overview

Status: proposed implementation baseline; implementation requires separate human approval.

## Scope and planning gate
Build a modular monolith for vehicle rental, hiring a driver, combined vehicle-and-driver bookings, and scheduled city-to-city carpools. Passenger, Driver, Vehicle Owner and Administrator are additive account roles. PostgreSQL is authoritative; every critical operation is backend enforced and transaction safe.

This commit contains a blueprint only. It must not scaffold applications, install application packages, create live tables or run application migrations. After reviewing the documents the owner must explicitly approve Phase01. A plan can be implementation-ready without being approved for execution.

## Confirmed constraints and recommended defaults
React/Vite/TypeScript/Tailwind/React Router/TanStack Query/RHF/Zod/Lucide/Motion frontend; Express/TypeScript/Zod/JWT backend; PostgreSQL/Prisma/versioned migrations; Vitest/RTL/Supertest/Playwright; Docker Compose and OpenAPI. Recommended initial market: INR in integer paise, English, manually curated Indian cities with IANA timezones. This is a product default, not a claim of permission to operate commercially. All records store UTC instants; display origin timezone and explicit offset when needed.

No payment gateway, payment capture, paid badge, maps API, GPS, external navigation, automatic routing, microservices, chat, or identity-vendor integration. Prices are estimates; every booking says “Payment not collected by DriveHire.” Manual document review and manual ride status are real persisted workflows. Demo route markers must be visibly labeled simulated.

## Service boundaries
| Service | Vehicle source | Driving party | Required consent | Charged estimate |
|---|---|---|---|---|
| VEHICLE_RENTAL | Another owner's verified vehicle | Requester, with approved DRIVER profile | Vehicle owner | Vehicle hourly rate only |
| DRIVER_HIRE | Requester's own registered verified vehicle | Chosen approved external hired driver | Hired driver | Driver hourly rate only |
| COMBINED | Another owner's verified vehicle | Chosen approved external hired driver | Owner and driver | Both hourly rates |

All three reserve both physical vehicle and actual driver so cross-service conflicts are enforceable. Combined service permits one provider account to own the vehicle and drive; its two required consent rows are both satisfied by an explicit provider decision. Self-hire is prohibited. An owner using their own vehicle must use DRIVER_HIRE rather than pay their own rental listing. These restrictions avoid unverifiable off-platform vehicle eligibility.

Carpool hosts must hold DRIVER+OWNER, have an approved valid driver profile, and use an owned approved vehicle. Offered seats exclude the driver. A host may set INSTANT join or APPROVAL. Pending approval requests never reserve seats.

## Repository decision
The user superseded the new-private-repository request with “Work on same repo.” Use the existing origin and preserve history. Do not change repository visibility or license. Commit the authorized previous-app deletions and new planning documents on codex/platform-specification; push without force; main merge is a later human action. No new repository is to be created.

## Document map
- [01 functional-requirements](01-functional-requirements.md)
- [02 non-functional-requirements](02-non-functional-requirements.md)
- [03 user-roles-permissions](03-user-roles-permissions.md)
- [04 use-cases-user-stories](04-use-cases-user-stories.md)
- [05 business-rules](05-business-rules.md)
- [06 system-architecture](06-system-architecture.md)
- [07 database-design](07-database-design.md)
- [08 api-specification](08-api-specification.md)
- [09 authentication-security](09-authentication-security.md)
- [10 frontend-ui-ux-specification](10-frontend-ui-ux-specification.md)
- [11 booking-lifecycle](11-booking-lifecycle.md)
- [12 carpooling-lifecycle](12-carpooling-lifecycle.md)
- [13 notifications](13-notifications.md)
- [14 admin-workflows](14-admin-workflows.md)
- [15 testing-strategy](15-testing-strategy.md)
- [16 deployment-environments](16-deployment-environments.md)
- [17 risk-analysis](17-risk-analysis.md)
- [18 acceptance-criteria](18-acceptance-criteria.md)
- [19 requirements-traceability](19-requirements-traceability.md)
- [20 architecture-decisions](20-architecture-decisions.md)

Also read [OpenAPI](../api/openapi.json), [execution guide](../implementation-prompts/00-MASTER-EXECUTION-GUIDE.md), [workspace assessment](../planning/workspace-assessment.md), [roadmap](../planning/roadmap.md), and [planning review](../planning/review.md).
