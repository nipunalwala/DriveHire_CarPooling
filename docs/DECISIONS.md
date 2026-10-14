# Architecture decision log

## Prompt 4.5 implementation notes

- Added public landing and information/legal pages, public/auth/dashboard shells, persisted theme choice, dev-only design preview, semantic component primitives, SEO metadata, sitemap and robots file. Contact messages are validated, rate limited and persisted by a forward-only Knex migration.
- The requested Radix UI, lucide-react, framer-motion, react-helmet-async and self-hosted Inter dependencies are not installed. The package installation attempt stalled without registry output and was stopped, so controls use native semantic elements and CSS; the font stack falls back to installed system fonts.
- Lighthouse scores and committed 360/1440 Playwright screenshots remain unverified because Playwright and Lighthouse tooling are unavailable in the current install. The public home page was visually inspected in the in-app browser at its current viewport; this does not prove the requested viewport matrix or Lighthouse thresholds.

## ADR-0001 — Password hashing while registry access is unavailable

- Date: 2026-10-14
- Context: Prompt 5 requires bcrypt cost 12. The implementation environment has no reliable npm registry access, and bcrypt is not installed in the workspace.
- Decision: Use Node's built-in scrypt with a random per-password salt and timing-safe comparison so auth can be implemented and exercised without adding an unavailable native package.
- Consequences: Passwords are salted and memory-hard, but this is not the specified bcrypt format and existing hashes will need an explicit migration strategy before switching algorithms.
- Deviation from ARCHITECTURE (if any): Deviates from the fixed bcrypt cost 12 requirement. Revisit when the bcrypt dependency can be installed and use algorithm-prefixed hashes for a safe transition.

## ADR-0002 — Local email adapter does not disclose verification secrets

- Date: 2026-10-14
- Context: The development mail adapter logs only recipient domain and subject; it does not deliver messages or reveal OTP/reset values.
- Decision: Keep secrets out of logs and retain the adapter abstraction; configure SMTP for usable verification and recovery flows.
- Consequences: Local developers need SMTP configuration or a test mail provider to receive OTP and reset messages.
- Deviation from ARCHITECTURE (if any): None for production SMTP; local mail usability is limited until a test provider is configured.

```text
## ADR-NNNN — Title
- Date:
- Context:
- Decision:
- Consequences:
- Deviation from ARCHITECTURE (if any):
```
