# PROGRESS — 13-prompt roadmap

Status: `TODO | DOING | DONE`. Rule: never break earlier phases; add regression tests when touching shared code.

- [ ] P04 Driver management — profile, license/doc upload via StorageProvider, availability, accept/reject stubs, admin verify queue
- [ ] P05 Vehicle management — register/edit/soft-delete, RC/insurance docs, availability, admin verify
- [ ] P06 DriveHire booking — search/filters, schedule, vehicle+driver conflict checks, confirm/cancel (pre-start rule), history; ride row on confirm
- [ ] P07 Carpooling — publish/search, request seats, owner approve/reject with `SELECT FOR UPDATE`, cancel, history
- [ ] P08 Ride status — `scheduled→assigned→started→in_transit→completed` validator, history, waypoints + percent-complete
- [ ] P09 Ratings & reviews — completed-only, one per user per ride, aggregates
- [ ] P10 Notifications — in-process event bus wiring, triggers per ARCHITECTURE §4, read APIs
- [ ] P11 Admin — users/suspend, verification queues, booking/ride mgmt, complaints, reports
- [ ] P12 Frontend — layouts/guards/routes, RHF+Zod forms, TanStack Query wiring, Tailwind; 3 Playwright flows
- [ ] P13 Hardening — rate limits, helmet/CORS, indexes, pagination caps, backups docs, CI E2E, prod compose

Notes:
- P01 Foundation, P02 Auth core, P03 Users/profile+OTP are the assumed prior phases; if re-scoped, prepend them above as DONE with commit SHAs.
- Each phase must update this file and `docs/DECISIONS.md` on deviation.
