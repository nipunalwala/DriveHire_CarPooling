# DriveHire planning and implementation boundaries

Canonical approved-on-review documents are `docs/specification/`, `docs/api/openapi.json`, `docs/implementation-prompts/`, and `docs/specification/20-architecture-decisions.md`. This checkout is documentation only until the user explicitly approves Phase01. Do not restore historical Knex or single-role architecture. User instructions supersede this file and skill defaults.

Follow the relevant phase prompt and Superpowers planning/test/verification/review workflow after approval. Use Impeccable for frontend design and the imagegen skill for original project raster assets as specified in `docs/design/image-assets.md`. Keep generated selected assets in repository with provenance; use real clean uploads for vehicle listings. Every backend change preserves current role/object authorization, transaction-safe physical resource/seat constraints, immutable history/audit, outbox and no-payment/no-GPS scope. Document material decisions and forward migrations. Never claim a command passed without its output.

Before any implementation: read the master guide, current phase prompt, relevant specs, OpenAPI and previous handoff; verify branch and existing tests. Do not automatically start Phase01 from this planning commit.
