# 10 · Lean frontend and UX

Use the26 active screen entries in [screen inventory](../planning/screens.json). Implement a shared public shell, authenticated shell with passenger/driver task navigation, and minimal guarded administrator shell. Personal vehicles sit under profile/account tasks; no owner area. Show the current role/capability without treating approval as granted by role. Driver profile/discovery and carpool search/detail are real API-backed flows. No rental tabs, ratings, notification bell, complaints, analytics, fake metrics or waypoint tracker.

Use Impeccable for design direction, tokens, typography, spacing, color, forms and responsive composition. Create shared Button, Field, StatusBadge, EmptyState, ErrorState, loading treatment and guarded navigation with visible focus. Mobile-first320px and keyboard support; WCAG2.2 AA target, semantic labels, contrast, focus after errors/navigation and reduced motion. Distinguish local validation from server conflict; preserve user inputs and offer reload/requote.

Generate original editorial imagery during milestone07 via imagegen; inspect outputs/crops, commit optimized files and provenance to apps/web/public/images/generated. Earlier screens remain usable without fabricated assets; integrate selected images in07. Depict service concepts, never verified providers, listings, documents, testimonials or badges. Factual trust copy explains manual verification and no payment collection. Relevant statuses and all estimates come from server DTOs. Trip state is manually recorded, with no navigation or location promise.

## Planned page file map

Task feature directories resolve to these exact page files; shared components remain separately listed in milestone03.

- landing: apps/web/src/features/public/LandingPage.tsx
- driver-listings: apps/web/src/features/drivers/DriverListingsPage.tsx
- driver-detail: apps/web/src/features/drivers/DriverDetailPage.tsx
- carpool-search: apps/web/src/features/carpools/CarpoolSearchPage.tsx
- carpool-detail: apps/web/src/features/carpools/CarpoolDetailPage.tsx
- login: apps/web/src/features/auth/LoginPage.tsx
- register: apps/web/src/features/auth/RegisterPage.tsx
- verify-email: apps/web/src/features/auth/VerifyEmailPage.tsx
- forgot-password: apps/web/src/features/auth/ForgotPasswordPage.tsx
- reset-password: apps/web/src/features/auth/ResetPasswordPage.tsx
- profile: apps/web/src/features/profile/ProfilePage.tsx
- personal-vehicles: apps/web/src/features/providers/PersonalVehiclesPage.tsx
- booking-create: apps/web/src/features/bookings/BookingCreatePage.tsx
- passenger-bookings: apps/web/src/features/bookings/PassengerBookingsPage.tsx
- passenger-booking-detail: apps/web/src/features/bookings/PassengerBookingDetailPage.tsx
- active-trip: apps/web/src/features/trips/ActiveTripPage.tsx
- passenger-carpool-history: apps/web/src/features/seats/PassengerCarpoolHistoryPage.tsx
- driver-verification: apps/web/src/features/providers/DriverVerificationPage.tsx
- driver-availability: apps/web/src/features/providers/DriverAvailabilityPage.tsx
- driver-requests: apps/web/src/features/bookings/DriverRequestsPage.tsx
- carpool-create: apps/web/src/features/carpools/CarpoolCreatePage.tsx
- hosted-carpools: apps/web/src/features/carpools/HostedCarpoolsPage.tsx
- admin-users: apps/web/src/features/admin/users/AdminUsersPage.tsx
- admin-verification: apps/web/src/features/admin/verification/AdminVerificationPage.tsx
- admin-operations: apps/web/src/features/admin/operations/AdminOperationsPage.tsx
- admin-audit: apps/web/src/features/admin/AdminAuditPage.tsx
