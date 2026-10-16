# Lean scope reconciliation — 2026-10-17

The owner approved the written lean first-release design. This change reconciles documentation and plans; it implements no new product workflows and applies no migrations.

The active roadmap has eight milestones, including the completed foundation. Seven remain. Active inventories contain 26 functional requirements, 70 API operations and 26 planned screens. Only foundation health/readiness operations are currently implemented. Driver hiring and instant-join carpools retain eligibility, personal-vehicle evidence, physical resource protection, seat capacity, permissions and essential history/audit. Deferred modules are explicitly excluded from schema, API, screens and acceptance gates.

The original 24-phase documentation is preserved in a repository-shaped archive. All 63 archived files were compared with their original paths at source commit `6d4bd80`; contents match after line-ending normalization. Archive snapshots are excluded from formatting rewrites and active scope inventories; relative links remain checked. No app/package source files changed. The root package script now runs scope-validator regression tests as part of documentation checks.

Observed verification:

- Six Python scope-validator tests pass. Altered fixtures prove that unsupported service/join modes, deferred operations, owner grants, multiple consents, catalogue mismatches, missing UI coverage, rental fields and missing safe carpool summaries are rejected.
- Documentation consistency passes: 21 specifications, eight milestones, 26 FRs, 70 operations and 26 screens, including archive/active links, references, entity/operation/screen trace IDs and scope boundaries.
- Formal OpenAPI 3.0 validation passes with schema references resolved.
- Existing foundation tests pass: 33 unit tests in ten files and one actual-handler contract test.
- ESLint/import-boundary checks, repository formatting and `git diff --check` pass.

Plan self-review covered approved-design sections, module scope, future enum alignment, shared service/DTO interfaces, task file ownership, named tests/assertion anchors, review-focus assignment, test commands, unavailable-suite behavior and milestone handoffs. Authentication starts the real browser runner; UI accompanies each core feature. Schema/migrations, integration races, actual adapters and restore remain future execution evidence, not accomplishments of this planning change. Dedicated service/integration and container builds were not repeated for documentation-only changes.

The subsystem plans preserve native Superpowers execution with one independent final reviewer per implemented milestone. Impeccable and committed generated imagery remain included. The next gate is owner review of the detailed implementation plan before milestone02 starts. No merge, push, remote CI run, production deployment or new repository is implied.
