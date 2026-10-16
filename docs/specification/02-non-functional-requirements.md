# 02 · Non-functional requirements

Correctness takes precedence over optimistic UI. Real PostgreSQL constraints and lock tests prove resource/seat invariants. All important writes are transactional; public errors are stable and safe; operational logs carry request IDs without request bodies, query secrets, tokens or evidence. Log only allowlisted safe metadata for unexpected failures.

Target WCAG2.2 AA, keyboard operation, usable320px-to-desktop layouts and reduced motion. Provide loading/empty/error/success states, visible form labels, focus management and server-error recovery. Never invent inventory, testimonials, provider approval or successful actions. Production assets must use production React, bounded image sizes and measured performance; no fixed production SLA is claimed from local tests.

Use supported pinned runtime/dependency versions and lockfile; Node24.22.0/npm11.19.1 baseline. Current strict TypeScript boundaries remain. HTTP readiness is bounded2seconds, fails503 until database/schema/worker heartbeat are real, and leaks no dependency details. Graceful shutdown drains work within30seconds; prove real processing recovery when jobs exist.

Deployable configuration separates development/test/staging/production, private storage and static assets, migration/runtime identities and secrets. Backup/restore and release checks require observed evidence. Security/functional tests occur in each milestone; final milestone checks assembled behavior.
