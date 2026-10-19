# Phase04 provider onboarding and administration handoff

Implemented personal vehicles, driver qualification and availability, private
scanned evidence, curated city reference data, administrator verification and
user suspension/reactivation. Vehicle ownership is users.id and requires no
OWNER role. The documented cities contract is implemented with reference-data
provisioning; browser inputs use persisted catalogue IDs.

Private image evidence is decoded/re-encoded with Sharp; corrupt, oversized and
payload-bearing images fail closed. Scan status is distinct from qualification.
Immutable reviewed evidence snapshots, city-local expiry and current-version
checks protect approval. Material changes resolve pending revisions and reject
lost updates. Expired documents remain unusable with the expiry worker paused.
Administrator suspension serialization preserves an active administrator.

Independent backend/frontend reviews and their Important resolutions are
archived alongside the execution ledger. Deferred minors remain explicit; the
review was not repeated to generate a cosmetic second approval. The review-form
identity regression and owner-private rejection feedback regressions passed.
Codex used Impeccable for the interface and inspected real desktop/mobile
captures, with one CSS correction batch and one confirmation pass.

Final local checks: unit56+contract1, typecheck, lint, format, docs/OpenAPI and
production build passed. The full browser suite passed38/38 across desktop and
mobile, including all provider/admin cases. Focused admin integration passed13/13.
The complete final integration run passed: 95 tests across12 files, exit0. Earlier browser17/18 results are superseded by the clean
full38-case run, not silently counted as green.

Push and CI inspection remain pending. No production deployment, paid OpenCode
model, development reset or credential exposure is authorized. Phase05 booking
eligibility consumes these qualifications; quotes/bookings are not implemented
by this milestone. Phase07 owns actual ImageGen assets and provenance.
