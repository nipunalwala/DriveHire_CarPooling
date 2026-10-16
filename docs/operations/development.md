# Local development — Phase 01

Use Node24.22.0 and npm11.19.1. On this Windows checkout a checksum-verified portable runtime is available in ignored `.tools/node-v24.22.0-win-x64/`; prepend that directory to PATH for each terminal, or use your Node version manager with `.nvmrc`. The system Node20 cannot satisfy the enforced engine constraint. CI and Docker use the same supported Node24 release. Install with `npm ci`.

Run `node scripts/init-local-env.mjs` once from repository root. It creates ignored `.env` with independent random development/test migrator/runtime passwords and an absolute private-storage path; it refuses to overwrite an existing file. Do not paste or commit its contents. `.env.example` describes configuration with unusable markers only. SQL initialization passes values using quoted psql variables, not interpolated SQL. Runtime database roles are nonsuperusers without schema creation privileges; Phase02 adds precise business-table grants with migrations.

Start development services: `docker compose up -d --wait`. PostgreSQL5432, Mailpit SMTP1025/UI8025 and ClamAV3310 bind only127.0.0.1. Start source watchers with `npm run dev` (contracts, API4000, worker and web5173). Vite proxies `/api` to API4000; only `VITE_API_BASE_URL=/api/v1` is permitted in the public environment. No secret VITE variable is allowed.

For containers instead: `docker compose --profile application up -d --build --wait`. Web is8080, API4000. API/worker share the same non-root image and private named storage volume mounted at `/data/private`, outside nginx static root. The local container origin is explicitlyhttp://localhost:8080. Images are pinned by digest; changes require a tested dependency update. Docker images are built locally, never published by this phase's CI.

`GET /api/v1/health` reports200 independently of database state. `GET /api/v1/ready` reports503 until the Phase02 schema and a fresh worker heartbeat exist. This is expected in Phase01, even when PostgreSQL itself is healthy. The worker waits for `job_leases`; it creates no business tables and does not claim to process domain jobs. It writes a heartbeat only once the required future schema exists. SIGTERM/SIGINT stop new work and drain existing HTTP/tick work before pool close.

## Verification

Run `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run docs:check`, and `npm run build`. Current unit tests include real HTTP handlers, safe errors, origin policy, log redaction, configuration, graceful shutdown, contract DTOs, browser route recovery and import boundaries. Contract tests use real Express handlers; OpenAPI is formally schema-validated by Swagger Parser as well as the offline planning consistency checker.

Test services are isolated from dev: `docker compose -f compose.test.yml up -d --wait --wait-timeout 300`. Test PostgreSQL55433, Mailpit SMTP11025/UI18025, ClamAV13310 use a separate Compose project and runtime identity. Run `npm run test:integration` and `npm run infra:check`. The database guard refuses missing URLs, external hosts, wrong protocols and any database other than `drivehire_test`. Phase01 integration checks prove runtime nonsuperuser identity, `btree_gist` availability and unavailable readiness before migrations. Phase02 must extend that suite with migrated-schema/heartbeat fixtures and constraint tests.

The test database uses tmpfs; stopping its container discards it. Its scanner signature cache is a dedicated test volume. To stop only these test services use `docker compose -f compose.test.yml down`; remove its named scanner cache only when deliberately refreshing test fixtures. Never run volume deletion on a computed/unverified project name or on another application's database.

Application E2E and Prisma schema/migration/constraint commands exit2 with an explicit unavailable message until their owning phase. They are not included in the current passing test count. No authentication, booking, seat reservation, upload or product dashboard exists yet. Shared UI begins with milestone03; original generated imagery and Impeccable polish belong to milestone07 in the approved lean roadmap. The completed foundation provides a minimal shell.

## Recovery and boundaries

If5432 is occupied, inspect existing services; do not stop/delete another application's database. Change the dev host port and matching local DATABASE_URL instead. If ClamAV starts slowly, inspect only the dedicated scanner's logs and wait for its image healthcheck before infrastructure tests. Mailpit is a local sink; no real email is sent. Missing schema is not repaired by startup DDL or production seeding. Do not restore retired Knex files or point the new runtime at retired application data.
