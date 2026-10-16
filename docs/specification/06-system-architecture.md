# 06 · System architecture

Single TypeScript monorepo: apps/api modular Express API plus separately started worker, apps/web React/Vite, packages/contracts browser-safe DTO/Zod contracts. PostgreSQL is authoritative through Prisma and reviewed custom SQL. Preserve the Phase01 entry points, logging, safe envelopes, CORS, readiness and shutdown behavior. Never import server code, database adapters or secrets into web/contracts.

Modules: accounts; profiles; providers (driver, personal vehicle, verification, private evidence); driver-hire bookings; instant carpools; shared trip/resources; minimal administrator operations. No rental/review/notification/complaint/report modules. Ownership is users.id, with no owner-profile subsystem. Shared transactional resource functions prevent cross-service overlaps.

Worker owns only implemented jobs: authentication email delivery, document scan/private-file cleanup, expiry/qualification reconciliation and heartbeat. Register actual job handlers in the owning milestone. Authentication outbox is durable and SMTP delivery at-least-once; token use is one-time. No domain notification queue or unhandled-event success. External IO occurs outside row locks. Leases, retries and safe error metadata are explicit.

REST /api/v1 uses strict schemas, bounded pagination, response envelopes, current auth checks, object authorization, idempotency for create booking/join seats and version CAS. Transactions acquire users, drivers, vehicles, aggregates and children in stable order; READ COMMITTED+locks+constraints, bounded deadlock retry3. Mapper translates constraint conflicts to409; public errors never echo SQL or credentials. Separate runtime and migration identities, private disk outside static serving, SMTP and ClamAV are retained.
