# DriveHire & CarPooling Platform — planning baseline

This repository currently contains a reviewed blueprint for a React/Express/PostgreSQL platform. **Application implementation has not started.** The user approved removing the old application and instructed work to stay in this existing repository. Historical application commits remain recoverable in Git; no new GitHub repository or license was created.

Start with [project overview](docs/specification/00-project-overview.md), [architecture](docs/specification/06-system-architecture.md), [business rules](docs/specification/05-business-rules.md), [API contract](docs/api/openapi.json), [UI specification](docs/specification/10-frontend-ui-ux-specification.md) and [master execution guide](docs/implementation-prompts/00-MASTER-EXECUTION-GUIDE.md). The [roadmap](docs/planning/roadmap.md), [workspace assessment](docs/planning/workspace-assessment.md), [planning review](docs/planning/review.md) and [traceability](docs/specification/19-requirements-traceability.md) show the approval baseline.

The first implementation prompt is [01 Project Foundation](docs/implementation-prompts/01-PROJECT-FOUNDATION.md), to be used only after separate approval. Public explanatory imagery will be generated as original project assets during the UI phases, recorded in [image asset policy](docs/design/image-assets.md). Impeccable and Superpowers workflows are encoded in the guide and phase prompts.

Documentation-only check: `python docs/check_plan.py`. No application dependency install, app scaffold, database migration or production service is required to inspect this blueprint.
