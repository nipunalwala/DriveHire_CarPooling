# 20 · Architecture Decisions

Status: proposed implementation baseline; implementation requires separate human approval.

## Decision status
ADRs001 and017 follow explicit user direction. Other decisions are recommended baseline choices to be approved with the plan; changing a material decision requires a new ADR before implementing affected phase.

### ADR001 · Use existing repository
**Decision/rationale:** User explicitly changed new-repository directive to same repo; preserve .git/history/remote; use review branch and no force-push.

**Consequence:** No new private-repo guarantee or visibility/license change.

**Alternatives considered:** New repository discarded by updated user instruction.

### ADR002 · Modular monolith
**Decision/rationale:** Inventory/seat/audit/outbox need atomic DB boundary; one API+same-code worker cheaper to reason about than distributed services.

**Consequence:** Module contracts and lock protocol must remain strict.

**Alternatives considered:** Leaving this implicit forces fresh sessions to invent policy; the recorded choice gives an explicit transaction/security/UI contract.

### ADR003 · Additive roles and separate verification
**Decision/rationale:** Identity may be passenger,driver,owner simultaneously; role unlocks onboarding, approval unlocks provision.

**Consequence:** No client primary-role authority; current DB status checked.

**Alternatives considered:** Leaving this implicit forces fresh sessions to invent policy; the recorded choice gives an explicit transaction/security/UI contract.

### ADR004 · Prisma with custom PostgreSQL SQL
**Decision/rationale:** Required stack; GiST exclusions/partial uniques and row locks exceed declarative schema features.

**Consequence:** Pin compatible supported major/patch; raw SQL reviewed and catalog tested.

**Alternatives considered:** Leaving this implicit forces fresh sessions to invent policy; the recorded choice gives an explicit transaction/security/UI contract.

### ADR005 · Shared typed resource reservations
**Decision/rationale:** One driver/vehicle can be in hire,carpool or blocked; separate booking-only constraints miss conflicts.

**Consequence:** Reserve both for each service including requester self-supplied resource.

**Alternatives considered:** Leaving this implicit forces fresh sessions to invent policy; the recorded choice gives an explicit transaction/security/UI contract.

### ADR006 · Explicit availability windows and manual cities
**Decision/rationale:** No GPS/maps/recurrence dependency; finite windows make coverage/time policy clear.

**Consequence:** City-pair matching has no geographic proximity guarantee.

**Alternatives considered:** Leaving this implicit forces fresh sessions to invent policy; the recorded choice gives an explicit transaction/security/UI contract.

### ADR007 · All hire modes have verified physical vehicle/driver
**Decision/rationale:** Self-drive uses approved requester; driver hire owned registered vehicle; combined chosen external resources.

**Consequence:** Restricts unverified off-platform cars; product decision for final approval.

**Alternatives considered:** Leaving this implicit forces fresh sessions to invent policy; the recorded choice gives an explicit transaction/security/UI contract.

### ADR008 · Provider consent with expiring holds
**Decision/rationale:** Owner and hired driver explicitly agree; hold30min avoids double promising while waiting.

**Consequence:** Pending consumes inventory; expiry guard must work without worker.

**Alternatives considered:** Leaving this implicit forces fresh sessions to invent policy; the recorded choice gives an explicit transaction/security/UI contract.

### ADR009 · Carpool pending requests do not reserve seats
**Decision/rationale:** Prevents speculative request hoarding; acceptance/instant join consumes seats atomically.

**Consequence:** Pending is not guaranteed seat; UI must distinguish.

**Alternatives considered:** Leaving this implicit forces fresh sessions to invent policy; the recorded choice gives an explicit transaction/security/UI contract.

### ADR010 · Database outbox and polling
**Decision/rationale:** Durable event commit avoids lost in-process notifications; polling adequate without realtime.

**Consequence:** Worker leases/dedupe/retry/dead letters mandatory.

**Alternatives considered:** Leaving this implicit forces fresh sessions to invent policy; the recorded choice gives an explicit transaction/security/UI contract.

### ADR011 · No payments, no revenue claims
**Decision/rationale:** Explicit scope excludes processing; server estimate snapshot only.

**Consequence:** Display NOT_COLLECTED, no paid/refund/wallet states.

**Alternatives considered:** Leaving this implicit forces fresh sessions to invent policy; the recorded choice gives an explicit transaction/security/UI contract.

### ADR012 · Strict refresh rotation with current-session checks
**Decision/rationale:** Opaque tokens hash stored, replay family revocation and DB active checks provide immediate logout/suspension.

**Consequence:** Browser tab coordination required; lost response can require re-login.

**Alternatives considered:** Leaving this implicit forces fresh sessions to invent policy; the recorded choice gives an explicit transaction/security/UI contract.

### ADR013 · Private scanned documents and immutable revisions
**Decision/rationale:** Qualification evidence must not leak or be swapped after admin review.

**Consequence:** Scanner/private storage and encryption configured, no fake CLEAN bypass.

**Alternatives considered:** Leaving this implicit forces fresh sessions to invent policy; the recorded choice gives an explicit transaction/security/UI contract.

### ADR014 · Manual lifecycle and resource overrun guard
**Decision/rationale:** No live GPS; elapsed planned end cannot prove actual release.

**Consequence:** Operator incident workflow blocks next physical use until resolved.

**Alternatives considered:** Leaving this implicit forces fresh sessions to invent policy; the recorded choice gives an explicit transaction/security/UI contract.

### ADR015 · Derived visible rating aggregates
**Decision/rationale:** SQL count/avg avoids stale cache after moderation and duplicate writes.

**Consequence:** Indexed queries initially; materialization only after measured need.

**Alternatives considered:** Leaving this implicit forces fresh sessions to invent policy; the recorded choice gives an explicit transaction/security/UI contract.

### ADR016 · Proposed initial locale/design
**Decision/rationale:** INR/English/manual city catalogue and teal travel-operations UI align brief and historical context.

**Consequence:** Proposed defaults for approval, not claims of commercial launch readiness.

**Alternatives considered:** Leaving this implicit forces fresh sessions to invent policy; the recorded choice gives an explicit transaction/security/UI contract.

### ADR017 · Documentation-only first delivery
**Decision/rationale:** User explicitly gates implementation after complete reviewed plan.

**Consequence:** No package.json, app scaffold, live DB migration or installed application dependency in planning commit.

**Alternatives considered:** Leaving this implicit forces fresh sessions to invent policy; the recorded choice gives an explicit transaction/security/UI contract.

## Change protocol
Record date,problem,alternatives,decision,evidence,affected FR/API/entity/UI/phase IDs, migration/backward-compatibility implications and approval when scope changes. Update all impacted canonical files together and rerun docs/contract checks. Applied migrations immutable; code follows latest accepted specification, not retired architecture or historical AGENTS.md. Minor implementation file naming can vary without ADR if module boundaries/contracts unchanged. Ask only for a material scope/architecture decision not resolved by current user direction.
