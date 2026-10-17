# 00 · Project overview

Approved written lean design: owner said “Yes continue” on2026-10-17. Build driver hiring and instant-join city-to-city carpooling in the same repository. Completed foundation remains; seven of eight milestones remain. This approval permits documentation reconciliation and implementation planning; the detailed plan still needs review before feature implementation.

Passengers hire an external approved driver for their own registered approved vehicle. Approved drivers host carpools using their own approved vehicles. There is no vehicle rental marketplace, combined booking, owner role/dashboard, review system, product notification centre, advanced reporting or complaints subsystem. Instant joining has no host approval branch. Driver replacement and simulated waypoint tracking are deferred; cancel/new quote and manual trip states cover the core need.

React/Vite/TypeScript/Tailwind frontend; Express API and separate worker; PostgreSQL/Prisma with reviewed SQL constraints; versioned /api/v1 contract. Start with INR integer paise, English and curated Indian city/timezone catalogue. No payments, maps, GPS, navigation, chat or identity vendor. Every estimate says “Payment not collected by DriveHire.” Public generated imagery is illustrative; real qualification evidence stays private.

See the [approved design](../superpowers/specs/2026-10-17-lean-first-release-design.md), [roadmap](../planning/roadmap.md), [master guide](../implementation-prompts/00-MASTER-EXECUTION-GUIDE.md), [OpenAPI](../api/openapi.json) and [deferred inventory](../planning/deferred-scope.md). The [archived full-platform baseline](../archive/full-platform-2026-10-17/README.md) preserves the superseded24-phase design; archived requirements do not bind this release.
