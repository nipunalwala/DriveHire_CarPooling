# Agent responsibilities and owner preferences

Owner-approved on 2026-10-18. This file is persistent project memory for all coding sessions; read it with AGENTS.md and the owning implementation prompt.

- Continue all remaining tasks and milestones in order without routine approval between phases. Preserve required verification and independent milestone review. Work directly on `main` as explicitly authorized on2026-10-18. Commit and push to `origin/main` after each phase is implemented, reviewed and verified; inspect its CI results and fix failures before calling the phase complete. Never push unfinished parallel work or claim pending frontend/review is complete. Production deployment still requires separate authorization.
- OpenCode uses verified free models only, including background/title/review calls. Use it for backend services, database work, business rules, shared contracts and backend tests. Never silently substitute a paid model.
- GPT-6.1 Sol in Codex owns frontend implementation and UI/UX decisions with the Impeccable skill: layouts, design tokens, typography, spacing, responsive behavior, accessibility, interaction design, UX copy and loading/error/empty states. Codex usage is separate from the free-only OpenCode restriction. OpenCode must not independently implement or redesign product screens.
- Establish reusable UI foundations during milestone03 authentication screens. Apply them to the actual screens in milestones04–06; do not defer their usability or visual quality until07. Browser and end-to-end verification must cover the implemented user journeys.
- At each frontend boundary, OpenCode records API/DTO behavior, test fixtures, completed backend checks and remaining integration needs in the milestone ledger. Codex implements the frontend and coordinates browser verification. OpenCode continues independent backend/test work where dependencies allow; it does not treat a pending frontend handoff as a completed milestone.
- ImageGen owns original raster illustrations and editorial service imagery. Define placement, composition and responsive crops with Impeccable before generation. Generate and commit the actual optimized assets and provenance during milestone07, following docs/design/image-assets.md. Do not claim assets exist before generation or use generated provider identities, real listing photos, testimonials or evidence.
- Milestone08 verifies the integrated interface, accessibility, responsive layouts, image performance and backend/security/restore evidence. Each agent records actual results and blockers; unavailable checks are never passes.
- Commits use the repository's verified owner identity, Nipun Alwala (`nipunalwala`). Never expose credentials in code, logs, prompts or handoffs.

Owner override on 2026-10-19: skip OpenCode for all remaining phases. Codex now
owns backend, contracts, tests and frontend directly. Retain Impeccable for UI,
independent phase review, verification, main/owner commits, phase pushes and CI
inspection. This supersedes the earlier OpenCode/free-model ownership split.

Owner override on2026-10-20: use OpenCode for all remaining backend/contracts/backend-test/restore work with verified FREE models only, including background/small-model calls. Codex directly owns frontend/UI/UX and browser integration. This supersedes the2026-10-19 no-OpenCode override. Continue authorized phases without routine approvals; preserve independent phase acceptance, owner/main commits and phase pushes with actual CI inspection. No production deployment or development-data reset.
