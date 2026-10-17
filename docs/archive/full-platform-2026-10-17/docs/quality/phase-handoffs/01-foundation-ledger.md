# SDD ledger — plan: docs/implementation-prompts/01-PROJECT-FOUNDATION.md

Approval: user said “Yes Continue” after blueprint handoff. Execute Phase 01 only.
Base: 60ba6a2019eca3c0354e317d2de32f092b4c0748. Branch: codex/phase-01-project-foundation.
Execution: native implementation with one independent final reviewer, per executing-plans.

Pre-flight: clean planning baseline; 21 specs/25 guides/30 FR/96 API/55 screens checker passes. No app exists. Node20.20.2/npm10.8.2 installed; Docker CLI/Compose available, daemon stopped.
Pre-flight: scope excludes schema/migrations until02 and product pages until13/14. Readiness must be genuinely unavailable until DB+schema/worker requirements exist. Interface producers and consumers are contracts->API/web; never API->web or web->server. Verification probes must fail closed and never return connection strings.
Task 1: Ruling: use project-local portable Node24 and TypeScript5.9 until tool compatibility is verified — installed Node20 is no longer the selected LTS line; no system runtime mutation — cost if wrong: update local tooling/lockfile before next phase.
Task 1: Ruling: use a feature branch in current clean checkout — user asked to continue in same repository/current workspace, no worktree created — cost if wrong: changes need migration to isolated worktree; current branch protects main.
Task 1: Ruling: narrow OPS-RESTORE acceptance to Phase01 infrastructure evidence — migrations/restore are explicitly owned by02/23, cannot be claimed here — cost if wrong: owner may require earlier DB schema work; blueprint remains clear.

Tasks: 1 compatibility; 2 workspace/toolchain; 3 runtime; 4 boundary contracts; 5 local infra; 6 CI/handoff.
Task 1: complete (commits 60ba6a2..25d40c9, tests: node --version → v24.22.0)
Task 2: complete (commits 25d40c9..7681083, tests: npm run test:unit -- packages/contracts/src/index.test.ts apps/web/src/App.test.tsx → Duration 4.03s (environment 67%, import 21%, tests 10%, transform 2%, worker 1%))
Task 3: complete (commits 7681083..aaef731, tests: npm run test:unit -- apps/api/src/app.test.ts apps/api/src/config apps/api/src/runtime/run-worker.test.ts apps/api/src/runtime/shutdown.test.ts → Duration 1.57s (tests 48%, import 46%, transform 3%, worker 2%))
Task 4: complete (commits aaef731..0686370, tests: npm run test:unit -- scripts/check-boundaries.test.ts packages/contracts/src/index.test.ts → Duration 912ms (import 67%, transform 16%, tests 15%, worker 2%))
Task 5: complete (commits 0686370..65b2f2f, tests: npm run test:integration → Duration 861ms (tests 42%, import 37%, transform 19%, worker 2%))
Task 6: complete (commits 65b2f2f..379ea8c, tests: npm test → Duration 1.23s (import 83%, tests 8%, transform 7%, worker 1%))
Final review: fresh independent reviewer, range60ba6a2..5e5235a; no Critical, three Important, no Minor. Severity retained for each Important finding; one TDD fix pass, no re-review.
Final: fixed test database connection-target override — dedicated target rejection regression RED→GREEN, focused15/15; full suite31 unit+1 contract+2 integration passed.
Final: fixed missing HTTP request correlation — actual completion/error logging regression RED→GREEN, focused15/15; full suite31 unit+1 contract+2 integration passed.
Final: fixed alternate/computed import bypasses — browser/contracts fixture regressions RED→GREEN, focused15/15; full suite31 unit+1 contract+2 integration passed.
Final: Ruling: business authorization/transactions/history/outbox/workflows excluded — users receive only foundation shell; later phases own product behavior — cost if wrong: product release must wait for those phases.
Final: Ruling: successful migrated-schema/worker-heartbeat readiness excluded — missing-schema503 is correct until Phase02 — cost if wrong: application cannot become ready before schema work.
Final: Ruling: real mail/scan/private-storage adapters excluded — interfaces/connectivity only, no successful business adapter claims — cost if wrong: integration work moves earlier.
Final: Ruling: production/recovery/load/full-accessibility acceptance excluded — local foundation evidence cannot establish these later-phase gates — cost if wrong: additional release qualification is required.
Final: Ruling: reviewer did not repeat remote CI/container/dependency checks — implementation evidence accepted with remote CI still unclaimed; final containers rebuilt by implementer — cost if wrong: environment-specific defects may require follow-up.
Final: Ruling: startup interruption is not a business-work recovery guarantee — worker accepts no business work; signal after operational loop exited0, immediate startup interruption previously exited137 — cost if wrong: future work processing needs shutdown/recovery tests before adoption.
Final: deferred minors: none.
Final verification: discovered host build rejection with shared .env NODE_ENV; Vite loadEnv synthesizes internal VITE_USER_NODE_ENV. Regression failed before correction; internal marker tolerated but excluded from browser envPrefix. Unexpected public keys still rejected. This is an additional verification fix within the same unclosed fix pass.
Final verification complete:33 unit/1 contract/2 integration tests pass; typecheck/lint/docs/format/build pass; SMTP/HTTP/ClamAV pass; final API and web Docker targets rebuilt successfully. Host production bundle285.09kB/89.66kB gzip. Actual Vite production-resolution regression passes after excluding backend env reload/internal marker. No remote CI/e2e/migration success claim.
