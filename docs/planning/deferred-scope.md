# Deferred full-platform scope

Approved2026-10-17. This inventory is excluded from current implementation and acceptance. Nothing here is marked completed; restoring a module needs a new scope decision and forward migrations. The [original baseline](../archive/full-platform-2026-10-17/README.md) preserves full details.

## Requirements deferred entirely

- FR-CARPOOL-004
- FR-REVIEW-001
- FR-NOTIFY-001
- FR-ADMIN-003

## Operations removed from active OpenAPI

- `adminComplaints`
- `adminReport`
- `advanceWaypoint`
- `createComplaint`
- `createReview`
- `createVehicleAvailability`
- `decideComplaint`
- `decideSeat`
- `deleteVehicleAvailability`
- `driverReviews`
- `getOwner`
- `getVehicle`
- `hideReview`
- `listNotifications`
- `listOwnerBookings`
- `listVehicleAvailability`
- `myComplaints`
- `myReviews`
- `readAllNotifications`
- `readNotification`
- `replaceDriver`
- `searchVehicles`
- `setVehicleListing`
- `unreadCount`
- `updateOwner`
- `vehicleReviews`

## Schema branches omitted

complaint_history, complaints, notifications, outbox_deliveries, owner_profiles, reviews. Additional rental pricing/listing, owner-role, review aggregate, waypoint, multi-provider-consent and approval-seat fields are removed from retained entities. outbox_events remains only for authentication email.

## Partial requirements narrowed

FR-VEHICLE: personal owned vehicles only, no marketplace/fleet. FR-BOOKING: DRIVER_HIRE, one driver decision, no replacement. FR-CARPOOL: instant joining, host participant read only. FR-RIDE: manual status/overrun, no waypoint tracker. FR-ADMIN: basic review/accounts/operations/audit, no complaints/reports. FR-USER: no OWNER role/profile. UI:26 consolidated surfaces instead of55; these are planned surfaces, not implemented claims.
