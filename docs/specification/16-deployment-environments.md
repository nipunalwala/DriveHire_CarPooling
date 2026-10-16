# 16 · Deployment Environments

Status: proposed implementation baseline; implementation requires separate human approval.

## Environment topology
Local: web5173/API4000/PostgreSQL5432 with explicit localhost CORS; Mailpit1025/8025, scanner private. Test: isolated Compose project/database/ports, API ephemeral bind, seeded synthetic users/docs and deterministic clocks. Staging: production-built containers, TLS same-origin web and /api proxy, durable private object storage, Amazon SES SMTP sandbox account, separate DB/keys/bucket from production. Production: web reverse proxy/API+worker from same artifact, managed PostgreSQL supporting btree_gist, private persistent storage, Amazon SES SMTP adapter with verified sender and credentials, TLS and durable backups. The SMTP transport is an adapter; another approved SMTP provider can be substituted without domain change. Containerized deployment remains portable.

## Configuration inventory (names only)
NODE_ENV,PORT,APP_ORIGIN,CORS_ORIGINS,TRUST_PROXY_HOPS,DATABASE_URL (runtime),MIGRATION_DATABASE_URL (DDL job only),JWT_PRIVATE_KEY_PATH,JWT_PUBLIC_KEYS_PATH,JWT_ISSUER,JWT_AUDIENCE,OTP_PEPPER,RATE_LIMIT_PEPPER,FIELD_ENCRYPTION_KEY,FIELD_ENCRYPTION_KEY_VERSION,OUTBOX_ENCRYPTION_KEY,SMTP_HOST,SMTP_PORT,SMTP_USER,SMTP_PASSWORD,MAIL_FROM,STORAGE_DRIVER,STORAGE_PRIVATE_ROOT or OBJECT_STORAGE_BUCKET/REGION/endpoint credentials,SCAN_HOST,SCAN_PORT,WORKER_POLL_MS,LOG_LEVEL. VITE_API_BASE_URL is public path only; no VITE_* secret. Zod startup schema enforces required keys by environment, refuses insecure Secure cookie override outside localhost and production console-only mail. Keys supplied by deployment secret store, examples never real.

## Deployment sequence
1. CI locked install, documentation/contract validation, lint,typecheck,unit/integration,production builds,container scan and E2E staging candidate.
2. Snapshot backup and verify target DB identity; migration role applies checked versioned Prisma migration once. Use expand/contract for backward compatibility. No app startup migration race, no db push in production, no dev seed.
3. Roll API and same-version worker; readiness waits DB schema compatibility, scanner/storage/SMTP config and worker heartbeat. Public health reports status only. Drain old instances30s; stop worker claiming new jobs and finish/release leases.
4. Smoke login/health/authorized sample reads, transactional synthetic staging booking/carpool; production smoke does not create real customer bookings. Monitor p95/errors/outbox lag/reservation conflicts.
5. Roll back application image only if schema compatible; otherwise forward repair migration. Never edit applied migrations, reset prod DB or blindly rollback schema. Keep previous artifact/config version available.

## Persistent state and backups
Database daily encrypted backups retained30days; target RPO24h/RTO4h. Private docs durable encrypted bucket/volume with backup policy aligned to DB metadata. Restore to isolated environment quarterly and before first release: DB+files+keys, migrations integrity, auth disabled until operator checks, seat/reservation reconciliation, outbox replay dedupe, app smoke. Record timing and actual loss window; targets are unverified until rehearsal. Test restore must not send emails to real addresses; isolated mail sink and redacted fixture copies.

## Observability and runbooks
Structured requestId,status,latency,module logs with redaction. Metrics: DB pool saturation, API p95/5xx/auth denial, scanner pending age, SMTP failure, outbox/dead-letter age, expiry lease heartbeat, overdue trips and reconciliation discrepancies. Alert outbox>5min, worker heartbeat>2min, any dead letter, sustained5xx>1%, DB readiness failure. Auth floods use shared DB throttles. Runbooks: rotate JWT/peppers/encryption keys, recover worker lease, requeue event audited, resolve overrun/cancel next trip, suspend account incident, storage orphan cleanup, backup restore and failed migration repair. For rotation of field digest pepper preserve uniqueness by coordinated rehash migration, never silent pepper swap.

## Deployment gate
Hosting account/vendor, production DNS, SMTP credentials, operating region and actual capacity are not supplied. They do not block blueprint completion; they block real deployment/public launch. The implementation phase must prepare a deployable artifact and concrete environment runbook before requesting any missing credentials/launch approval. No license added without owner decision.
