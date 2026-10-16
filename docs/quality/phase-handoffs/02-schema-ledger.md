# Milestone02 execution ledger (scratch; archived into 02-schema.md in Task 5)

## Task 1: database harness and identity schema — GREEN 2026-10-17

- RED: `npm run test:integration -- apps/api/src/runtime/migrations.integration.test.ts`
  failed to load (`Cannot find module '../test/database-fixture.js'`). Real
  runner, missing behavior. Prisma 7.10.1 pinned after verifying latest stable
  (8.0.0-rc.23 prerelease excluded); @prisma/client/@prisma/adapter-pg 7.10.1.
- GREEN: same command 3/3 pass (guard refusal, normalized unique email via
  CHECK+UNIQUE, runtime DDL denied 42501, Prisma adapter read-back).
- Full suite: unit 33/33, contract 1/1, typecheck (3 workspaces), lint +
  boundaries, docs:check (6 scope regressions, 21 specs/70 ops/26 screens),
  format:check, build — all exit 0.
- Fixes during GREEN: added `datasource db` + explicit client output under
  `src/generated` (rootDir rule); generated client gitignored, eslint/prettier
  ignored; `$queryRaw` used as template tag.
- Notes: cities.timezone IANA membership enforced at service layer once
  curated seeds exist (no invented seed rows). Old
  `database.integration.test.ts` missing-schema case now observes migrated
  schema; its isolation update is owned by Task 5. Test services started with
  `compose.test.yml` only; dev data untouched.
