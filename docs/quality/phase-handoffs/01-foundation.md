# Phase 01 foundation handoff

Implementation scope: approved by “Yes Continue” after the blueprint handoff. Branch `codex/phase-01-project-foundation`, based on planning commit `60ba6a2019eca3c0354e317d2de32f092b4c0748`. The final commit range is discoverable with `git log` on this branch. Integration into main and production launch are separate decisions.

## Delivered work

- Exact-pinned npm workspace: `apps/api`, `apps/web`, `packages/contracts`; Node24.22.0/npm11.19.1; TypeScript5.9.3; ESLint10/Prettier; lockfile and safe dependency boundaries.
- Express app factory separate from HTTP listener; redacted Pino request logs; request IDs; strict JSON size cap and safe errors; exact-origin CORS; Helmet; graceful HTTP and worker-loop shutdown.
- Real `GET /api/v1/health` and `GET /api/v1/ready`. Only these two of the proposed96 operations are implemented. Readiness503 is expected until Phase02 schema and worker heartbeat exist; no fake ready state or startup DDL.
- Generic typed event and mail/scan/private-storage ports with no fake successful adapters/handlers. Worker records heartbeat only after the future schema exists, otherwise waits and reports dependency state.
- Minimal React/Vite/Tailwind/Router/Query shell with route recovery, skip link and error boundary. This is foundation UI, not the public product site. Generated imagery and full Impeccable visual implementation remain13/14.
- Digest-pinned PostgreSQL17/Mailpit/ClamAV Compose services; separate dev/test credentials/projects/ports; restricted runtime role; private disk volume outside static root; non-root API/worker and nginx web images.
- Read-only GitHub Actions verification and isolated infrastructure jobs. No deploy, image publication or database migration occurs in this phase.

## Verification evidence before independent review

These commands ran locally with Node24.22.0. HTTP/Docker tests needed execution outside the Windows sandbox because it blocked loopback socket and Docker pipe access; this was a permission limitation, not a passing test.

| Check                          | Observed result                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `npm ci`                       | Clean Windows locked install completed,438 packages added                                                          |
| `npm audit --audit-level=high` | 0 vulnerabilities reported                                                                                         |
| `npm run test:unit`            | 33 tests passed across10 files after independent-review fixes                                                      |
| `npm run test:contract`        | 1 test passed on actual Express handlers                                                                           |
| `npm run test:integration`     | 2 real PostgreSQL tests passed: restricted role/extension availability and missing-schema readiness                |
| `npm run infra:check`          | Mailpit SMTP/HTTP and ClamAV PING responded                                                                        |
| `npm run typecheck`            | All three workspaces passed                                                                                        |
| `npm run lint`                 | ESLint and AST import-boundary check passed                                                                        |
| `npm run docs:check`           | 21 specs/25 guides/30 FR/96 operations/55 screens references valid; formal OpenAPI validation passed               |
| `npm run format:check`         | Matched files passed Prettier                                                                                      |
| `npm run build`                | API/contracts/web production builds passed; web JS89.66kB gzip in observed build                                   |
| Docker API/web build targets   | Both built; runtime users `node`/UID1000 and nginx UID101                                                          |
| Temporary container HTTP smoke | API health200, readiness503; nginx unknown SPA path200 with CSP header                                             |
| Browser inspection             | Built web shell rendered in in-app browser at narrow viewport with readable text and route recovery covered by RTL |

Initial red tests failed for missing contract/env/app/boundary/safety modules; green runs followed implementation. Formal OpenAPI validation found and fixed an empty `required` array in ProfileInput; `minProperties:1` now enforces a nonempty patch body. Contract test configuration was separated from unit configuration so the contract command runs its actual suite instead of inheriting unit exclusions.

## Boundaries and next phase

No business tables or migrations were created. `btree_gist` availability was queried, not installed by runtime code. Authentication, uploads, provider management, bookings, carpools and dashboards are absent. E2E and Prisma schema/migration/constraint scripts intentionally exit2 with an explicit unavailable message; they are not counted as passing suites. This phase does not establish OPS-RESTORE's final backup/migration/restore acceptance;02/23 own that evidence. GitHub Actions workflow was authored and local equivalent commands passed; remote CI execution is not claimed.

Phase02 uses [02 Database Schema and Migrations](../../implementation-prompts/02-DATABASE-SCHEMA-MIGRATIONS.md), stable Prisma7.10.1 candidate plus compatible client/adapter, the approved entity dictionary and raw SQL invariants. Extend the integration suite for migrated-schema/heartbeat fixtures; preserve the missing-dependency behavior. New database role grants, exclusions and migrations require actual fresh/incremental PostgreSQL tests. Review [development instructions](../../operations/development.md) before using either Compose environment.

## Independent review and corrections

A fresh-context reviewer assessed `60ba6a2..5e5235a`: no Critical findings, three Important findings, no Minor findings. All three Important findings were reproduced with failing regressions and fixed in one pass:

- Test database URLs now require the dedicated database, explicit local port55433 or Compose host `database-test:5432`, and no query/fragment. This prevents PostgreSQL query options from overriding the validated target.
- Actual HTTP completion and unexpected-error logs retain the response request ID. The regression forces a serialization failure and checks that query, authorization and exception secrets remain absent.
- Import boundaries cover literal templates, package subpaths, absolute/file/Vite filesystem imports and unresolved computed imports in both browser and shared-contract code. Computed imports must be replaced with statically inspectable literals.

The focused run changed from four failures to15/15 passing. The final suite passed33 unit,1 contract and2 real PostgreSQL integration tests; local service checks passed. Typecheck, lint, documentation validation and formatting also passed after the fixes. Earlier container/browser evidence above covers the foundation shell; the reviewer did not independently rerun container/dependency checks. Final production/container build results are recorded in the execution ledger.

The review explicitly set aside later-phase business behavior, migrated schema/heartbeat success, real adapter behavior, production/recovery/load/full-accessibility acceptance, remote CI/fresh container dependency verification, and interruption as a business-work recovery guarantee. These remain unclaimed. The complete decisions and their costs are archived in [the execution ledger](01-foundation-ledger.md). No deferred minor findings.

Final host and both Docker builds passed. The shared backend NODE_ENV originally triggered Vite's internal marker guard and then development-runtime selection; a failing regression led to explicit API-value injection, disabled automatic backend-env reload, and marker cleanup. Actual Vite production configuration now resolves as production. The final host bundle is285.09kB/89.66kB gzip.
