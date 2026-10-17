# DriveHire & CarPooling

The approved first release focuses on driver hiring and instant-join carpools. The roadmap now has **eight milestones: foundation complete, seven remaining**. Vehicle rentals, combined bookings, reviews, owner/fleet dashboard, product notifications and advanced reporting are deferred. No payments, maps or GPS.

Read the [approved scope](docs/superpowers/specs/2026-10-17-lean-first-release-design.md), [eight-milestone roadmap](docs/planning/roadmap.md) and [implementation plan](docs/superpowers/plans/2026-10-17-lean-release-plan.md). Current contracts live in [specifications](docs/specification/00-project-overview.md), [OpenAPI](docs/api/openapi.json) and [screen inventory](docs/planning/screens.json). The detailed plan awaits owner review before feature implementation; next is [02 Database Schema and Migrations](docs/implementation-prompts/02-DATABASE-SCHEMA-MIGRATIONS.md).

Implemented today: strict TypeScript npm workspace, operational Express API/worker, safe shared contracts, minimal React shell, isolated local PostgreSQL/Mailpit/ClamAV and CI. [Foundation handoff](docs/quality/phase-handoffs/01-foundation.md) records actual evidence. Product authentication, schema and business journeys are still planned. /api/v1/health is live; ready returns503 until real schema/worker prerequisites exist.

Use [local development instructions](docs/operations/development.md) with Node24.22.0/npm11.19.1. Current checks: npm test, npm run typecheck, npm run lint, npm run format:check, npm run docs:check and npm run build. Integration/services require dedicated test infrastructure. Future migration/E2E commands deliberately report unavailable until implemented; that is not a pass.

Impeccable guides the interface. Original [generated project imagery](docs/design/image-assets.md) arrives in milestone07 with committed assets/provenance. Real qualification evidence stays private. Same repository and preserved history; the [superseded full-platform baseline](docs/archive/full-platform-2026-10-17/README.md) is archival only. No merge, PR or deployment has been performed for this scope change.
