# 19 · Requirements Traceability

Status: proposed implementation baseline; implementation requires separate human approval.

## Functional traceability
All requirement IDs resolve to [01 functional-requirements](01-functional-requirements.md). API IDs resolve to [08 api-specification](08-api-specification.md). Screen keys resolve to [10 frontend-ui-ux-specification](10-frontend-ui-ux-specification.md). Entity definitions resolve to [07 database-design](07-database-design.md). Test scenario names bind implementation evidence, not present test passes.

| Requirement | Phases | API operation IDs | DB entities | UI surfaces | Test scenario |
|---|---|---|---|---|---|
| FR-AUTH-001 | 03,15 | `register`, `verifyEmail`, `resendOtp` | users,user_roles,auth_challenges,outbox_events | register,verify-email | `AUTH-REGISTER` |
| FR-AUTH-002 | 03,15 | `login`, `logout`, `logoutAll` | users,refresh_sessions,refresh_tokens | login | `AUTH-LOGIN` |
| FR-AUTH-003 | 03,15 | `refresh`, `listSessions`, `revokeSession` | refresh_sessions,refresh_tokens | profile | `AUTH-REFRESH-RACE` |
| FR-AUTH-004 | 03,15 | `forgotPassword`, `resetPassword` | users,auth_challenges,refresh_sessions | forgot-password,reset-password | `AUTH-RESET` |
| FR-USER-001 | 04,15 | `getMe`, `updateMe`, `addRole`, `getOwner`, `updateOwner` | users,user_roles,driver_profiles,owner_profiles | profile,driver-profile,owner-profile | `USER-MULTIROLE` |
| FR-DRIVER-001 | 05 | `getMyDriver`, `updateDriver`, `uploadDriverDoc`, `listDriverDocs`, `submitDriver` | driver_profiles,documents,verification_requests | driver-verification,driver-profile | `DRIVER-ONBOARD` |
| FR-DRIVER-002 | 05,12,19 | `adminVerifications`, `adminVerification`, `decideVerification` | verification_requests,driver_profiles,audit_logs | admin-driver-verification,driver-verification | `DRIVER-VERIFY` |
| FR-DRIVER-003 | 05,17 | `setDriverListing`, `listDriverAvailability`, `createDriverAvailability`, `deleteDriverAvailability`, `listDriverBookings` | availability_windows,resource_reservations,bookings | driver-availability,driver-requests,driver-history | `DRIVER-AVAILABILITY` |
| FR-VEHICLE-001 | 06,18 | `getOwner`, `updateOwner`, `createVehicle`, `updateVehicle`, `uploadVehicleDoc`, `listVehicleDocs`, `submitVehicle` | owner_profiles,vehicles,documents,verification_requests | owner-add-vehicle,owner-documents | `VEHICLE-REGISTER` |
| FR-VEHICLE-002 | 06,12,19 | `adminVerifications`, `adminVerification`, `decideVerification` | vehicles,documents,verification_requests,audit_logs | admin-vehicle-verification,owner-documents | `VEHICLE-VERIFY` |
| FR-VEHICLE-003 | 06,18 | `setVehicleListing`, `listMyVehicles`, `listVehicleAvailability`, `createVehicleAvailability`, `deleteVehicleAvailability`, `archiveVehicle`, `listOwnerBookings` | vehicles,availability_windows,resource_reservations | owner-vehicles,owner-availability,owner-history | `VEHICLE-ARCHIVE` |
| FR-BOOKING-001 | 07,14,16 | `listCities`, `searchVehicles`, `getVehicle`, `searchDrivers`, `getDriver`, `quoteBooking` | booking_quotes,vehicles,driver_profiles | vehicle-listings,driver-listings,booking-create | `BOOKING-QUOTE` |
| FR-BOOKING-002 | 07 | `createBooking` | bookings,booking_decisions,trips,resource_reservations,idempotency_keys | booking-create,passenger-booking-detail | `BOOKING-CONCURRENCY` |
| FR-BOOKING-003 | 07,17,18 | `decideBooking`, `replaceDriver`, `getBooking` | booking_decisions,bookings,trips,resource_reservations | driver-requests,owner-bookings,passenger-booking-detail | `BOOKING-CONSENT` |
| FR-BOOKING-004 | 07,09 | `cancelBooking`, `decideBooking` | bookings,trips,resource_reservations,trip_status_history,outbox_events | passenger-bookings,owner-bookings,driver-requests | `BOOKING-CANCEL-EXPIRE` |
| FR-CARPOOL-001 | 08,17,18 | `createCarpool`, `updateCarpool`, `publishCarpool`, `listMyCarpools` | carpools,trips,resource_reservations | carpool-create,hosted-carpools | `CARPOOL-PUBLISH` |
| FR-CARPOOL-002 | 08,14,16 | `searchCarpools`, `getCarpool` | carpools,vehicles,driver_profiles | carpool-search,carpool-detail | `CARPOOL-SEARCH` |
| FR-CARPOOL-003 | 08,16 | `requestSeat`, `listMySeats` | carpools,seat_requests,idempotency_keys,outbox_events | carpool-detail,passenger-carpool-history | `CARPOOL-LAST-SEAT` |
| FR-CARPOOL-004 | 08,17 | `listSeatRequests`, `decideSeat` | carpools,seat_requests,outbox_events | host-seat-requests | `CARPOOL-APPROVAL` |
| FR-CARPOOL-005 | 08,09 | `cancelSeat`, `cancelCarpool`, `listMySeats` | carpools,seat_requests,trips,resource_reservations | passenger-carpool-history,hosted-carpools | `CARPOOL-CANCEL-RACE` |
| FR-RIDE-001 | 09,16,17,19 | `listTrips`, `getTrip`, `transitionTrip`, `tripHistory` | trips,trip_status_history,bookings,carpools | active-trip,passenger-rides,driver-active-rides | `RIDE-STATE-MACHINE` |
| FR-RIDE-002 | 09,17,19 | `advanceWaypoint`, `getTrip`, `adminTrips` | trips,trip_status_history | active-trip,admin-carpools | `RIDE-OVERRUN` |
| FR-REVIEW-001 | 10,16 | `createReview`, `myReviews`, `driverReviews`, `vehicleReviews` | reviews,trips,bookings,seat_requests | reviews,vehicle-detail,driver-detail | `REVIEW-ELIGIBILITY` |
| FR-NOTIFY-001 | 11,16,17,18,19 | `listNotifications`, `unreadCount`, `readNotification`, `readAllNotifications` | outbox_events,outbox_deliveries,notifications | notifications | `NOTIFY-REPLAY` |
| FR-ADMIN-001 | 12,19 | `adminUsers`, `adminUser`, `suspendUser`, `reactivateUser` | users,refresh_sessions,bookings,carpools,trips,audit_logs | admin-users | `ADMIN-SUSPEND` |
| FR-ADMIN-002 | 12,19 | `adminBookings`, `adminCarpools`, `adminTrips`, `cancelBooking`, `cancelCarpool`, `replaceDriver`, `transitionTrip` | bookings,carpools,trips,audit_logs | admin-bookings,admin-carpools | `ADMIN-OPERATIONS` |
| FR-ADMIN-003 | 12,16,19 | `createComplaint`, `myComplaints`, `adminComplaints`, `decideComplaint`, `hideReview` | complaints,audit_logs,reviews,outbox_events | complaints,admin-complaints | `ADMIN-COMPLAINT` |
| FR-ADMIN-004 | 12,19 | `adminReport`, `adminAudit` | audit_logs,bookings,carpools,complaints | admin-overview,admin-reports,admin-audit | `ADMIN-REPORTS` |
| FR-SEC-001 | 05,06,21 | `getDocument`, `deleteDocument`, `uploadDriverDoc`, `uploadVehicleDoc` | documents,verification_requests | driver-verification,owner-documents | `SEC-UPLOAD` |
| FR-OPS-001 | 01,02,23 | `health`, `ready` | database,outbox_events | operations-runbook | `OPS-RESTORE` |

## Nonfunctional phase ownership
| NFR | Phases | Verification |
|---|---|---|
| NFR-PERF-001/002 |07,08,12,20,22 | Load seed+concurrency report, EXPLAIN plans |
| NFR-PERF-003 |13..20,22 | Lighthouse/build-size/screenshot evidence |
| NFR-SEC-001 |03..12,21,22 | Per-operation role/object negative suite, scan report |
| NFR-CONS-001 |02,07,08,09,22 | PostgreSQL barrier race/invariant suite |
| NFR-REL-001 |03,11,23 | Outbox crash/replay and SMTP outage |
| NFR-REL-002 |23,24 | Backup restore rehearsal, measured RPO/RTO |
| NFR-A11Y-001 |13..20,22 | axe+keyboard+zoom/reduced-motion |
| NFR-OBS-001 |01,11,21,23 | Redaction/requestId/alerts tests |
| NFR-MAINT-001 |01,20,22,24 | Strict types, contract/docs check, phase evidence |
| NFR-TIME-001 |02,07,08,09,20 | Cutoff/zone/DST tests |
| NFR-OPS-001 |01,02,23,24 | Clean deploy/migrations/containers/drain |

## Coverage maintenance
Adding/removing an FR requires updating this table, the machine-readable catalogue, acceptance criteria, roadmap/phase prompt and test scenario. Operation changes update OpenAPI+prose+page dependencies. New entity needs FKs/constraints/deletion/index design and migration owner. An implementation phase cannot declare complete with unassigned business rule or unresolved earlier prerequisite.
