# 17 · Risks and evidence owners

| Risk                                                        | Owner milestone | Required evidence                                                              |
| ----------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------ |
| ORM hides SQL exclusions/triggers or runtime overprivileged | 02              | Fresh/incremental real PG migration and direct constraint/privilege tests      |
| Session replay/suspension bypass                            | 03/04           | Concurrent refresh and immediate revocation HTTP+DB tests                      |
| Private evidence exposed or scan bypassed                   | 04              | Real scan/content authorization/quarantine tests                               |
| Driver/vehicle overlap across both services                 | 05/06           | Separate-connection races plus persisted reservations and active-use guard     |
| Final-seat race/double cancellation                         | 06              | Concurrent joins and replay/cancellation rollback assertions                   |
| Shared backend NODE_ENV weakens frontend build              | 03/07           | Vite production-resolution regression and inspected production build           |
| Screens imply unbuilt modules or fabricated inventory       | 03–07           | API-backed browser journeys, empty/error states and imagery provenance         |
| Deployment/restore assumptions untested                     | 08              | Available-environment startup/shutdown/restore rehearsal with measured results |

Removing modules reduces breadth; correctness/privacy for retained journeys remains required. Archived risk entries for deferred services do not create current release gates.
