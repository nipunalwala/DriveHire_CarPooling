# 00 · Lean master execution guide

Current owner integration instruction (2026-10-18): execute directly on `main` and push verified/reviewed completed phases to `origin/main`. This supersedes earlier branch/no-push restrictions; preserve unfinished parallel files, commit under the owner's GitHub identity and investigate CI failures. Do not deploy production. See persistent agent responsibilities for the backend/frontend split.

## Current owner authorization and agent ownership

Read [persistent agent responsibilities](../planning/agent-responsibilities.md) before executing any milestone. The owner authorized continued execution through all remaining phases without routine approval. Free-model OpenCode implements backend/contracts/tests; GPT-6.1 Sol in Codex implements frontend and UI/UX with Impeccable from03 onward. Record backend-to-frontend handoffs in each milestone ledger. Milestone07 includes actual ImageGen assets, responsive optimization and provenance;08 verifies the integrated result. Historical approval/stop language below does not revoke this renewed authorization. No push, merge or deployment is authorized.

Approved scope: driver hiring and instant-join carpooling. Eight milestones, completed01 plus seven remaining. The owner approved the written lean design2026-10-17; the reconciled detailed plan awaits review. Preserve native Superpowers execution, TDD and one final independent reviewer. Use Impeccable for frontend work and generated project imagery in07. No main merge, push or production launch is implied.

Read the approved design, current overview/business/database/security/lifecycle specifications, active OpenAPI and planning model, previous handoff and owning milestone prompt. The archived24-phase baseline is history, not an instruction to implement deferred modules. Plans are separated by subsystem below; each milestone verifies a working result before later dependencies consume it.

## Milestones and gates

- [01 PROJECT FOUNDATION](./01-PROJECT-FOUNDATION.md)
- [02 DATABASE SCHEMA MIGRATIONS](./02-DATABASE-SCHEMA-MIGRATIONS.md)
- [03 ACCOUNTS PROFILES](./03-ACCOUNTS-PROFILES.md)
- [04 PROVIDER ONBOARDING ADMIN](./04-PROVIDER-ONBOARDING-ADMIN.md)
- [05 DRIVER HIRING](./05-DRIVER-HIRING.md)
- [06 INSTANT CARPOOLING](./06-INSTANT-CARPOOLING.md)
- [07 INTERFACE POLISH IMAGERY](./07-INTERFACE-POLISH-IMAGERY.md)
- [08 QUALITY DEPLOYMENT AUDIT](./08-QUALITY-DEPLOYMENT-AUDIT.md)

## Execution requirements

Use the project-local Node24.22.0/npm11.19.1 runtime if needed. Never repeat completed01. Read task interfaces before changes, ledger conflicts/rulings, watch a meaningful RED then GREEN and keep previously passing suites green. Validate each current behavior against actual handler/DB/browser evidence. Start dedicated test services for integration; never migrate/reset retired or development data during tests. No schema implementation, dependency installation or new feature code during this documentation reconciliation.

Feature work does not wait until07 for all UI;03 auth,04 qualification,05 hire and06 carpool include actual screens.07 polishes and generates imagery. Testing/security happen in every milestone;08 assembles final evidence, restore and release audit. API extension without a corresponding approved requirement is out of scope.

Every current feature's FR and acceptance ID is traced below. Deferred IDs/operations live in the deferred inventory and cannot become acceptance requirements through an archived link.

## Active evidence IDs

- FR-AUTH-001 -> AUTH-REGISTER; milestones03.
- FR-AUTH-002 -> AUTH-LOGIN; milestones03.
- FR-AUTH-003 -> AUTH-REFRESH-RACE; milestones03.
- FR-AUTH-004 -> AUTH-RESET; milestones03.
- FR-USER-001 -> USER-MULTIROLE; milestones03.
- FR-DRIVER-001 -> DRIVER-ONBOARD; milestones04,05.
- FR-DRIVER-002 -> DRIVER-VERIFY; milestones04.
- FR-DRIVER-003 -> DRIVER-AVAILABILITY; milestones04,05.
- FR-VEHICLE-001 -> VEHICLE-REGISTER; milestones04.
- FR-VEHICLE-002 -> VEHICLE-VERIFY; milestones04.
- FR-VEHICLE-003 -> VEHICLE-ARCHIVE; milestones04.
- FR-BOOKING-001 -> BOOKING-QUOTE; milestones05.
- FR-BOOKING-002 -> BOOKING-CONCURRENCY; milestones05.
- FR-BOOKING-003 -> BOOKING-CONSENT; milestones05.
- FR-BOOKING-004 -> BOOKING-CANCEL-EXPIRE; milestones05.
- FR-CARPOOL-001 -> CARPOOL-PUBLISH; milestones06.
- FR-CARPOOL-002 -> CARPOOL-SEARCH; milestones06.
- FR-CARPOOL-003 -> CARPOOL-LAST-SEAT; milestones06.
- FR-CARPOOL-005 -> CARPOOL-CANCEL-RACE; milestones06.
- FR-RIDE-001 -> RIDE-STATE-MACHINE; milestones05,06.
- FR-RIDE-002 -> RIDE-OVERRUN; milestones05,06.
- FR-ADMIN-001 -> ADMIN-SUSPEND; milestones04,05,06.
- FR-ADMIN-002 -> ADMIN-OPERATIONS; milestones04,05,06.
- FR-ADMIN-004 -> ADMIN-REPORTS; milestones04,05,06.
- FR-SEC-001 -> SEC-UPLOAD; milestones04,08.
- FR-OPS-001 -> OPS-RESTORE; milestones01,02,08.
