# Architecture decision log

## Prompt 4.5 implementation notes

- Added public landing and information/legal pages, public/auth/dashboard shells, persisted theme choice, dev-only design preview, semantic component primitives, SEO metadata, sitemap and robots file. Contact messages are validated, rate limited and persisted by a forward-only Knex migration.
- The requested Radix UI, lucide-react, framer-motion, react-helmet-async and self-hosted Inter dependencies are not installed. The package installation attempt stalled without registry output and was stopped, so controls use native semantic elements and CSS; the font stack falls back to installed system fonts.
- Lighthouse scores and committed 360/1440 Playwright screenshots remain unverified because Playwright and Lighthouse tooling are unavailable in the current install. The public home page was visually inspected in the in-app browser at its current viewport; this does not prove the requested viewport matrix or Lighthouse thresholds.

Add one entry for each decision or deviation:

```text
## ADR-NNNN — Title
- Date:
- Context:
- Decision:
- Consequences:
- Deviation from ARCHITECTURE (if any):
```
