# Toolchain selection — Phase 01

Selected on 2026-10-16: portable project-local Node24.22.0 (official Windows ZIP SHA256 verified against release SHASUMS), npm11.19.1. The system Node20 remains untouched. `.nvmrc` and `.node-version` pin24.22.0; npm engine checks refuse unsupported runtimes. CI and container builds use this same Node line.

The registry's Prisma `latest` tag currently points to8.0.0-rc.23; choose stable7.10.1 for Phase02, whose engine requirement is `^20.19 || ^22.12 || >=24.0`. Do not install a release candidate or create schema in Phase01. Verify exact Prisma/client/adapter version alignment and migration commands again when Phase02 begins. This follows the approved schema/Migrate architecture. TypeScript5.9.3 is compatible with typescript-eslint8's supported `>=4.8.4 <6.1.0`; the registry's TypeScript7 latest tag is intentionally not chosen.

Vite8.3.4 supports Node `^20.19.0 || >=22.12.0`; React19.3.1, Vite React plugin6.1.2 and Vitest5.0.5 support the selected runtime. Express5.3.0 requires Node>=18. Lock exact installed direct versions in package.json/package-lock.json; the lockfile is authoritative for transitive integrity. PostgreSQL17 is the approved database baseline; Compose image digests and verified toolchain evidence are recorded in the Phase01 handoff.

References: [Node releases](https://nodejs.org/en/blog/release), [Vite getting started](https://vite.dev/guide/), [Prisma release status](https://www.prisma.io/docs/orm/release-status). Registry engine/peer metadata was queried before installation. Version numbers alone are not passing build/test evidence.
