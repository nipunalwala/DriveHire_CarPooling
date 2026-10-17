# Lean Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans for preserved native execution. The seven subsystem plans below carry task interfaces, RED/GREEN gates and evidence requirements; do not execute this index as a monolithic task. One fresh final reviewer per executed milestone.

**Goal:** Deliver the approved reduced driver-hiring and instant-carpool first release with seven remaining milestones.

**Architecture:** Existing TypeScript modular Express API/worker, React client and authoritative PostgreSQL remain; API-backed vertical slices replace separate backend/dashboard phases.

**Tech Stack:** Existing Node24.22.0/npm11.19.1 workspace, React/Vite/Tailwind/TypeScript, Express/Prisma/PostgreSQL, Vitest/RTL/Supertest and browser E2E.

**Spec:** [Approved lean design](../specs/2026-10-17-lean-first-release-design.md) and reconciled active docs/specification, OpenAPI, planning model and screen inventory.

## Global Constraints

Retain completed01 and same repository. Only DRIVER_HIRE, INSTANT joining and PASSENGER/DRIVER/ADMIN; private evidence and conflict/capacity/authorization protections remain. No payments/maps/GPS. Impeccable and generated imagery remain. Detailed task constraints and review focus are in each owning plan. No feature implementation or integration action is authorized by this planning commit.

## Review Focus

- Test database targeting and runtime privileges:02 Tasks1/4.
- Session replay/revocation and actual authentication email:03 Tasks1/2.
- Private qualification evidence and safe owner relationships:04 Tasks1/2.
- Cross-service resource conflicts and final-seat races:05 Task1 and06 Tasks1/2.
- Browser recovery/production mode and honest restore/release evidence:03 Task3,07 Task3 and08 Tasks2/3.

## Subsystem plans

- [Milestone02: Create only the26 active tables, forward migrations, real SQL protections and verified readiness.](../../implementation-prompts/02-DATABASE-SCHEMA-MIGRATIONS.md)
- [Milestone03: Deliver working accounts, current permissions and profile/authentication screens.](../../implementation-prompts/03-ACCOUNTS-PROFILES.md)
- [Milestone04: Deliver driver/personal-vehicle qualification, private evidence and minimal administrator review.](../../implementation-prompts/04-PROVIDER-ONBOARDING-ADMIN.md)
- [Milestone05: Deliver driver hiring from search and quote through consent, cancellation and trip completion.](../../implementation-prompts/05-DRIVER-HIRING.md)
- [Milestone06: Deliver owned-vehicle carpools with instant seats and shared physical resource protection.](../../implementation-prompts/06-INSTANT-CARPOOLING.md)
- [Milestone07: Polish the retained journeys with Impeccable, generated imagery and consistent recovery states.](../../implementation-prompts/07-INTERFACE-POLISH-IMAGERY.md)
- [Milestone08: Prove integrated quality/security and available-environment deployment/restore readiness.](../../implementation-prompts/08-QUALITY-DEPLOYMENT-AUDIT.md)

## Execution handoff

Owner reviews this plan and confirms it captures the reduced product before execution. Preserve the native execution approach already used for01, unless the owner requests a different approach. Start02 only after that review; no need to ask again about already-approved scope or routine implementation choices. This change does not resolve the separate branch merge/PR choice.
