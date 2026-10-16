# Eight-milestone lean roadmap

Approved scope2026-10-17. Milestone01 remains complete; seven remain. These milestones replace the24-phase full-platform roadmap rather than claiming removed modules are done. Detailed execution plan review is the next gate.

| Milestone                                                                                   | State    | Deliverable                                                                                       |
| ------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| [01 Foundation](../implementation-prompts/01-PROJECT-FOUNDATION.md)                         | Complete | Verified existing workspace/API/worker/contracts/web shell/infrastructure/CI                      |
| [02 Database Schema Migrations](../implementation-prompts/02-DATABASE-SCHEMA-MIGRATIONS.md) | Planned  | Create only the26 active tables, forward migrations, real SQL protections and verified readiness. |
| [03 Accounts Profiles](../implementation-prompts/03-ACCOUNTS-PROFILES.md)                   | Planned  | Deliver working accounts, current permissions and profile/authentication screens.                 |
| [04 Provider Onboarding Admin](../implementation-prompts/04-PROVIDER-ONBOARDING-ADMIN.md)   | Planned  | Deliver driver/personal-vehicle qualification, private evidence and minimal administrator review. |
| [05 Driver Hiring](../implementation-prompts/05-DRIVER-HIRING.md)                           | Planned  | Deliver driver hiring from search and quote through consent, cancellation and trip completion.    |
| [06 Instant Carpooling](../implementation-prompts/06-INSTANT-CARPOOLING.md)                 | Planned  | Deliver owned-vehicle carpools with instant seats and shared physical resource protection.        |
| [07 Interface Polish Imagery](../implementation-prompts/07-INTERFACE-POLISH-IMAGERY.md)     | Planned  | Polish the retained journeys with Impeccable, generated imagery and consistent recovery states.   |
| [08 Quality Deployment Audit](../implementation-prompts/08-QUALITY-DEPLOYMENT-AUDIT.md)     | Planned  | Prove integrated quality/security and available-environment deployment/restore readiness.         |

## Dependencies and scope

02 owns the reduced schema and migration safety.03 adds working auth/profile UI and email.04 establishes approved drivers/personal vehicles and admin reviews.05 builds driver hiring end-to-end;06 builds instant carpools with shared resources.07 integrates Impeccable polish and committed generated imagery.08 proves integrated security/quality/restore readiness. Shared UI begins03 and tests occur in every feature milestone.

Rentals, combined consent, owner dashboard/fleet, reviews, product notifications, advanced reporting/complaints, approval seats, driver replacement and waypoint tracking are [deferred](deferred-scope.md). Personal vehicles and physical resource/seat protections remain. The [original baseline](../archive/full-platform-2026-10-17/README.md) is archived intact for history. Eight milestones is not a delivery-date estimate.
