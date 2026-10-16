# 10 · Frontend Ui Ux Specification

Status: proposed implementation baseline; implementation requires separate human approval.

## Design brief and authority
Impeccable was read for this planning task. Its context launcher could not install its engine under sandbox permissions; existing historical design/product context and the user's detailed brief were read directly. No interface or design mockup is implemented here. The following is a proposed system for approval with the overall plan; visual screenshots and production accessibility evidence belong to Phases13–20.

Public pages use Persuade mode to explain service eligibility and lead into a real search. Dashboards use Operate mode: next departure, required consent and verification blockers outrank vanity analytics. Document pages use Read mode. Preserve the product name; use editorial travel clarity with deep teal, warm neutral paper and disciplined route timelines. Avoid invented testimonials, verified-safety guarantees, charts with fake values, gradients as content, and uniform dashboard card grids.

## Proposed design tokens
| Token family | Values and intended use |
|---|---|
| Typography | Self-host Inter for body/controls and headings;16/24 body,14/20 secondary,12/16 metadata only,24/32 section,32/40 page,48/52 public display shrinking to36/40 mobile; weights400/500/600/700 |
| Colors | ink #142827, muted #4B6160, paper #F7F8F4, surface #FFFFFF, primary #086B67, primary-hover #075954, border #CBD5CF; success #166534, warning #854D0E, danger #B42318, info #075985; status uses text+icon |
| Spacing |4px base;8/12/16 controls;24 section gap;32/48 panels;64/96 public sections; max content1200px, reading680px |
| Geometry | Buttons/inputs radius8px, primary panels12px, dialogs16px; quiet border and restrained elevation for overlays; no glass dependency |
| Focus |2px teal outline+2px gap; visible on all backgrounds; error border does not replace focus |
| Motion |120–200ms for feedback; no layout-moving entrance on forms/status; prefers-reduced-motion removes movement; content visible before animation |

Implement CSS custom properties with semantic aliases, tested contrast per actual foreground/background pair. Light theme is release scope; dark theme is deferred unless independently specified/tested. This replaces historical dark-theme instructions. Fonts locally bundled; no third-party font dependency at runtime. Use actual owner-uploaded clean images for vehicle listings; no generated user photos or fabricated stock testimonials. Neutral accessible silhouette for missing assets; seed images visibly synthetic and licensed/original with provenance.

## Original generated imagery
The public product site must use original project-generated raster artwork, chosen for informative editorial placements such as the landing service comparison and how-it-works explanation. Phase13 defines composition and asset briefs under Impeccable; Phase14 uses the imagegen skill, inspects actual outputs at desktop/mobile crops, commits selected images under `apps/web/public/images/generated/`, and records the full prompt, provenance, dimensions, responsive variants and alt/decorative decision in [image asset policy](../design/image-assets.md). The images illustrate modes of travel without implying that pictured people or cars are actual platform users, verified drivers, listings, customer testimonials or identity evidence. Actual public vehicle cards use only approved CLEAN owner uploads. Do not replace product screenshots, status/data, maps or documents with generated fiction. Choose SVG/CSS for icons and simple diagrams. Generated assets must satisfy performance and contrast targets.

## Shared component system
Buttons: primary one per form/decision context, secondary/navigation, danger destructive; disabled label explains unmet prerequisite. Forms: visible labels, help/error IDs, RHF/Zod, autocomplete, server field errors, first-invalid focus, no error until touched/submitted. Date/time controls show timezone, reject nonexistent/ambiguous local times unless explicit offset selected. Money input decimal rupees parsed exactly to integer paise; never binary floating multiplication.

Navigation: public header with Services/Vehicles/Drivers/Carpools; app shell role switch, active role label, notifications, profile; mobile focus-trapped drawer/skip link; admin visually marked. Tables: semantic headers, row labels, pagination; mobile labelled cards or expandable rows preserve all actions. Dialogs: semantic modal, focus trap/restore, escape except active noncancelable submit, explicit confirm+reason on cancellation/suspension/archive. Cards group meaningful subjects only. Status chips include label+icon, no color-only meaning. Toasts announce polite success; persistent critical error inline; do not put personal/license details into toast. Icon-only controls require accessible names; Lucide icons decorative unless providing unique meaning.

## Universal states and interaction contract
Every page below inherits: loading uses aria-busy, stable skeleton geometry and text status; empty uses domain-specific recovery listed; query errors show requestId/support-safe retry and retain URL filters;401 routes through single refresh then login;403 clears unauthorized cached data;404 private object has neutral unavailable message. Mutation pending prevents double submit but retains original idempotency key. Success reflects server response then invalidates affected keys; destructive/state actions wait for confirmed response. Optimistic mark-read is allowed with rollback; booking/seat/verification/status never optimistic. Network timeouts are uncertain and require safe same-key retry/current-state fetch.

Responsive target320,390,768,1280,1440 CSSpx; no body horizontal scroll at200% zoom. Touch targets44px where possible, minimum24px spacing per accessibility standard. One h1, landmarks, skip link, labelled controls, semantic headings/tables, keyboard order follows visual order, live region for async outcomes, errors associated to field, reduced-motion and200% zoom verified. Date/route/price never conveyed by icon only. Route transitions focus page heading, preserve search URL/back state; dialog close restores trigger. No live polling in hidden tabs; query caches cleared by account/session/role loss. All pages require real persisted APIs, no demo data masquerading as live state.

## Page-by-page contracts
Each page explicitly uses the universal loading/accessibility/state contract above plus the specifics below. API operation IDs resolve to exact routes in [08 api-specification](08-api-specification.md) and [OpenAPI](../api/openapi.json).
### `landing` · `/`
- **Purpose:** Choose rental, driver hire, combined booking or carpool without confusing eligibility.
- **Role:** Public.
- **Layout:** Editorial public shell with full-width service selector and useful departure form.
- **Components:** Wordmark, service tabs, city/date search, concise eligibility explanation, honest how-it-works, provider CTAs.
- **API dependencies:** `listCities`, `searchVehicles`, `searchDrivers`, `searchCarpools`.
- **Interactions:** Tabs retain separate fields; search navigates with URL filters; provider CTA starts role onboarding.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No invented inventory counts or testimonials; explain launch catalogue if empty.
- **Error:** City service failure has retry and preserves service choice.
- **Success:** Search displays real matching results.
- **Responsive:** Single-column form320px; split service explanation desktop; primary action in flow.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `about` · `/about`
- **Purpose:** Explain operating model and verification boundaries.
- **Role:** Public.
- **Layout:** Reading layout, short product story plus service comparison.
- **Components:** Service table, manual verification explanation, scope and support link.
- **API dependencies:** No remote API; factual static content only.
- **Interactions:** Navigate to services and registration.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; no remote skeleton for factual copy.
- **Empty:** Use factual copy; omit unverified company claims.
- **Error:** Global fallback for navigation failure.
- **Success:** Reader can identify platform limitations.
- **Responsive:** Reading width68ch, no clipped comparison.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `services` · `/services`
- **Purpose:** Compare three hire modes and carpools.
- **Role:** Public.
- **Layout:** Public comparison matrix and service-specific next action.
- **Components:** Eligibility rows, pricing example explicitly illustrative, no payment claims.
- **API dependencies:** `listCities`.
- **Interactions:** Choose service -> preselected search mode.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** If catalogue missing retain explanation.
- **Error:** Search dependency retry at control.
- **Success:** Service selection persists in URL.
- **Responsive:** Cards mobile; semantic matrix desktop.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `vehicle-listings` · `/vehicles`
- **Purpose:** Find approved vehicles by city, category, capacity and time.
- **Role:** Public.
- **Layout:** Search/filter rail with result list and pagination.
- **Components:** Filter form, vehicle photo, rate/hour, verification badge, time notice.
- **API dependencies:** `listCities`, `searchVehicles`.
- **Interactions:** URL-backed filters; clear/page; open detail; no optimistic availability claim.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No vehicles for dates: clear filters/change city/dates.
- **Error:** Inline retry with filters retained; no stale result labelled available.
- **Success:** Result count and advisory availability shown.
- **Responsive:** Filter drawer mobile with apply button and focus return; rail desktop.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `vehicle-detail` · `/vehicles/:id`
- **Purpose:** Assess actual vehicle and begin eligible booking.
- **Role:** Public.
- **Layout:** Large real vehicle image plus facts; sticky in-flow booking panel desktop.
- **Components:** Image gallery, specs, rating list, date form, price estimate and self-drive rule.
- **API dependencies:** `getVehicle`, `vehicleReviews`, `getDocument`.
- **Interactions:** Select dates/service; authenticated quote; no document download.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No reviews: honest zero count; missing image neutral vehicle silhouette.
- **Error:** 404 unavailable; quote409 reload resources.
- **Success:** Continue to quote with authoritative totals.
- **Responsive:** Booking panel stacks before long reviews mobile.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `driver-listings` · `/drivers`
- **Purpose:** Find approved available drivers.
- **Role:** Public.
- **Layout:** Search rail/results consistent with vehicle surface.
- **Components:** City/date/rate/rating filters, driver profile row, availability advisory.
- **API dependencies:** `listCities`, `searchDrivers`.
- **Interactions:** Choose driver, keep search context in detail/back navigation.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No drivers: adjust dates/city.
- **Error:** Dependency retry; retain fields.
- **Success:** Verified eligible profiles shown.
- **Responsive:** Mobile filter drawer; long names wrap.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `driver-detail` · `/drivers/:id`
- **Purpose:** Review driver skills, rating and hire requirements.
- **Role:** Public.
- **Layout:** Profile masthead, facts, rate/booking panel, review list.
- **Components:** Approval badge, bio, service city, review summary, own-vehicle requirement.
- **API dependencies:** `getDriver`, `driverReviews`.
- **Interactions:** Choose DRIVER_HIRE/COMBINED and dates; login safe returnTo.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No ratings: first review explanation.
- **Error:** 404 private/ineligible; query retry.
- **Success:** Selection transfers driver ID to booking form.
- **Responsive:** One column mobile, booking panel near main action.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `carpool-search` · `/carpools`
- **Purpose:** Find published rides by city pair/date/seats.
- **Role:** Public.
- **Layout:** Departure search band and schedule-like results.
- **Components:** Origin/destination city controls, date, seats, departure/timezone, seats left, price/seat.
- **API dependencies:** `listCities`, `searchCarpools`.
- **Interactions:** URL filters; swap city; open ride; date uses origin timezone.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No rides: choose adjacent date explicitly, no fabricated alternatives.
- **Error:** Invalid same-city field error; server retry.
- **Success:** Real published seat availability displayed.
- **Responsive:** Compact vertical itinerary mobile; no maps.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `carpool-detail` · `/carpools/:id`
- **Purpose:** Understand route, host, seats and join mode.
- **Role:** Public/participant.
- **Layout:** Text route spine with host/vehicle context and reservation panel.
- **Components:** City/time, pickup notes, manual markers, capacity, join mode, cost estimate, seats form.
- **API dependencies:** `getCarpool`, `requestSeat`, `getDriver`, `getVehicle`.
- **Interactions:** Join -> instant ACCEPTED or PENDING; preserve key on retry; active requester sees cancel.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** Full ride: disable request with clear count; no draft leakage.
- **Error:** 409 final seat refreshes count and retains intended seats.
- **Success:** Status accurately says requested or accepted; payment not collected.
- **Responsive:** Booking panel follows route mobile; roster never public.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `login` · `/login`
- **Purpose:** Sign in securely.
- **Role:** Public.
- **Layout:** Focused auth shell with small service context.
- **Components:** Email/password, show password toggle, reset link, verified feedback.
- **API dependencies:** `login`.
- **Interactions:** Submit once; memory token; safe returnTo; show OTP resend link on unverified.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No session: normal entry.
- **Error:** Generic credentials error; 429 countdown; suspended support message.
- **Success:** Redirect to safe requested route or role overview.
- **Responsive:** Keyboard-safe compact form; no fixed viewport clipping.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `register` · `/register`
- **Purpose:** Create account and start email verification.
- **Role:** Public.
- **Layout:** Auth shell single form.
- **Components:** Name,email,password, requirements text, sign-in link.
- **API dependencies:** `register`.
- **Interactions:** Submit -> verify screen; do not expose email existence.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No preselected provider/admin role.
- **Error:** Inline422, generic202 ack, network preserves safe fields.
- **Success:** Verification instructions without login claim.
- **Responsive:** 320px fields full width; password manager autocomplete.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `verify-email` · `/verify-email`
- **Purpose:** Consume OTP and resend within quota.
- **Role:** Public.
- **Layout:** Auth shell with address and expiry explanation.
- **Components:** Single labelled6digit input, paste support, resend countdown.
- **API dependencies:** `verifyEmail`, `resendOtp`.
- **Interactions:** Submit OTP; resend invalidates old; no auto-submit at sixth digit.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No address context: link registration/login.
- **Error:** Invalid/expired code; limit countdown; no token in logs.
- **Success:** Verified -> login, no fake token.
- **Responsive:** Numeric keyboard; one accessible input.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `forgot-password` · `/forgot-password`
- **Purpose:** Request secure recovery link.
- **Role:** Public.
- **Layout:** Auth shell.
- **Components:** Email form and generic acknowledgement.
- **API dependencies:** `forgotPassword`.
- **Interactions:** Submit generic202.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No remembered email required.
- **Error:** 422/429 explicit; network retry.
- **Success:** Same ack for existing/unknown address.
- **Responsive:** One column; status live region.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `reset-password` · `/reset-password`
- **Purpose:** Set new password using single-use link.
- **Role:** Public.
- **Layout:** Auth shell.
- **Components:** New/confirm password fields, expiry feedback.
- **API dependencies:** `resetPassword`.
- **Interactions:** Read token fragment, scrub URL; submit token only to API.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** Missing token: request new link.
- **Error:** Expired/reused code -> recovery; preserve no password after failure navigation.
- **Success:** All sessions revoked, go to login.
- **Responsive:** Keyboard and manager new-password autocomplete.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `passenger-overview` · `/app/passenger`
- **Purpose:** See next booking, seat requests and actionable status.
- **Role:** PASSENGER.
- **Layout:** Task-first dashboard with next departure as focal row.
- **Components:** Upcoming booking, accepted/pending seats, unread link, service shortcuts.
- **API dependencies:** `listBookings`, `listMySeats`, `unreadCount`.
- **Interactions:** Open nearest trip; choose new service; no fabricated analytics.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** First use: choose hire or carpool.
- **Error:** Section retry independent; stale data timestamp.
- **Success:** Current server statuses shown.
- **Responsive:** Stack upcoming items mobile; compact two-column desktop.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `passenger-search-vehicles` · `/app/passenger/vehicles`
- **Purpose:** Search vehicles in authenticated context.
- **Role:** PASSENGER.
- **Layout:** Shared listing surface in app shell.
- **Components:** Vehicle filters, role eligibility guidance.
- **API dependencies:** `listCities`, `searchVehicles`, `getMe`.
- **Interactions:** Search->detail->booking-create.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No qualified self-drive profile prompts driver onboarding; combined remains available.
- **Error:** Filter/server error retained.
- **Success:** Resource chosen for authoritative quote.
- **Responsive:** Shared listing responsive rules.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `passenger-search-drivers` · `/app/passenger/drivers`
- **Purpose:** Search hired drivers.
- **Role:** PASSENGER.
- **Layout:** Shared listing app shell.
- **Components:** Driver filter form, own verified vehicle selector.
- **API dependencies:** `searchDrivers`, `listMyVehicles`.
- **Interactions:** Choose own vehicle for driver-only or external vehicle for combined.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No own vehicle offers owner onboarding or combined mode.
- **Error:** Eligibility422 explained at field.
- **Success:** Driver selected into quote form.
- **Responsive:** Shared responsive listing layout.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `booking-create` · `/app/passenger/bookings/new`
- **Purpose:** Create one service booking using server quote.
- **Role:** Verified PASSENGER.
- **Layout:** Two-step resource/time form then review and request.
- **Components:** Service radios, chosen driver/vehicle, origin/destination, passengers, dates, line items,10min quote timer, no-payment label.
- **API dependencies:** `getMe`, `listMyVehicles`, `searchVehicles`, `searchDrivers`, `quoteBooking`, `createBooking`.
- **Interactions:** Get quote->review->request with stable idempotency key; back edit invalidates quote.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No resource selected: search CTA; unmet self-drive/own-vehicle eligibility explicit.
- **Error:** 409 quote/resource stale requires refresh; timeout reconcile same key.
- **Success:** 201 -> persisted PENDING detail; never CONFIRMED before consent.
- **Responsive:** Summary stacks after fields mobile; desktop side summary; focus first error.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `passenger-bookings` · `/app/passenger/bookings`
- **Purpose:** View own current/past bookings.
- **Role:** PASSENGER.
- **Layout:** Status filters and sortable-by-fixed-order history list.
- **Components:** Service badge, departure, consent status, estimate, cancellation action.
- **API dependencies:** `listBookings`, `cancelBooking`.
- **Interactions:** Detail/cancel with version+reason; invalidate list and trip.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No history: search CTA.
- **Error:** 409 reload current state; cancellation values retained.
- **Success:** Cancelled row/timeline from server.
- **Responsive:** Table desktop; labelled cards mobile.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `passenger-booking-detail` · `/app/passenger/bookings/:id`
- **Purpose:** Track provider approvals and trip.
- **Role:** Participant.
- **Layout:** Booking summary plus consent timeline and next action.
- **Components:** Resources, server totals, pending expiry, owner/driver decision rows, cancellation/replacement dialog.
- **API dependencies:** `getBooking`, `replaceDriver`, `cancelBooking`, `getTrip`, `tripHistory`.
- **Interactions:** Pending replace driver at same rate; cancel reason; active trip link.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No consent yet says awaiting provider until expiry.
- **Error:** 404 ownership; stale409 reload.
- **Success:** Confirmed only when all required decisions accepted.
- **Responsive:** Timeline stacked mobile; no horizontal status overflow.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `passenger-rides` · `/app/passenger/rides`
- **Purpose:** Review active and past trips.
- **Role:** PASSENGER.
- **Layout:** Upcoming/active/history sections.
- **Components:** Trip cards, current status, route labels, review actions.
- **API dependencies:** `listTrips`.
- **Interactions:** Open detail; review only completed eligible target.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No trips: book or join.
- **Error:** Retry own filtered query.
- **Success:** Real current trip states.
- **Responsive:** Cards mobile and rows desktop.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `active-trip` · `/app/trips/:id`
- **Purpose:** Inspect persisted manual route/status.
- **Role:** Participant/admin.
- **Layout:** Text route spine beside status history.
- **Components:** Simulated badge, timezone/date, waypoint list, current state, participant-safe resources, incident notice.
- **API dependencies:** `getTrip`, `tripHistory`.
- **Interactions:** Participant reads; assigned driver actions via same domain controls; poll only visible active trip15s.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No progress yet scheduled/assigned explanation.
- **Error:** Permission404; polling stops terminal/unmount; no fake movement.
- **Success:** Persisted status/history visible immediately.
- **Responsive:** Route text and timeline readable320px, no canvas-only information.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `passenger-carpool-search` · `/app/passenger/carpools/search`
- **Purpose:** Search and join from dashboard.
- **Role:** PASSENGER.
- **Layout:** Shared carpool search app shell.
- **Components:** City/date/seats filters.
- **API dependencies:** `listCities`, `searchCarpools`.
- **Interactions:** Open ride/request seats.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No matching rides explanatory state.
- **Error:** Shared search recovery.
- **Success:** Chosen real ride.
- **Responsive:** Shared search responsiveness.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `passenger-carpool-history` · `/app/passenger/carpools`
- **Purpose:** Track own pending/accepted/terminal seat requests.
- **Role:** PASSENGER.
- **Layout:** Status-filtered reservation history.
- **Components:** Seats,status,departure,reason,cancel,trip link.
- **API dependencies:** `listMySeats`, `getCarpool`, `cancelSeat`.
- **Interactions:** Cancel with reason/version before cutoff; open trip.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No requests: search CTA.
- **Error:** 409 cutoff/current state reload.
- **Success:** Cancelled seats reflect refreshed availability.
- **Responsive:** Cards mobile; full labels.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `notifications` · `/app/notifications`
- **Purpose:** Read own durable notifications.
- **Role:** All active roles.
- **Layout:** Chronological list with unread filter.
- **Components:** Unread count, mark read, mark all, safe deep link.
- **API dependencies:** `listNotifications`, `unreadCount`, `readNotification`, `readAllNotifications`.
- **Interactions:** Mark idempotently; mark-all cutoff does not consume later arrivals;30s visible polling.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** All caught up; no invented activity.
- **Error:** Independent retry; no losing unread state on optimistic failure.
- **Success:** Server readAt and count refreshed.
- **Responsive:** Compact wrapping rows; touch targets44px.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `reviews` · `/app/reviews`
- **Purpose:** Write permitted reviews and inspect own history.
- **Role:** Eligible participants.
- **Layout:** Eligible completed trip selector plus review list.
- **Components:** Target selector constrained to trip,1..5 radio rating,plain-text review.
- **API dependencies:** `listTrips`, `createReview`, `myReviews`.
- **Interactions:** Submit one target; disable duplicates from server; no editing policy in v1.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No completed eligible rides: explain eligibility.
- **Error:** 409 duplicate reload; invalid/self target denied.
- **Success:** 201 review appears in history and public count.
- **Responsive:** Stars are labelled radio controls; no hover-only input.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `profile` · `/app/profile`
- **Purpose:** Manage personal details, roles and sessions.
- **Role:** All active roles.
- **Layout:** Account sections with independent forms.
- **Components:** Name/phone, email read-only, role enabling, active-role navigation, session list/revoke/logout-all.
- **API dependencies:** `getMe`, `updateMe`, `addRole`, `listSessions`, `revokeSession`, `logoutAll`.
- **Interactions:** Save valid section; add role then onboarding; revoke own session.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No other sessions normal state.
- **Error:** 422 field feedback;401 clears user query cache.
- **Success:** Saved values from server; current revocation signs out.
- **Responsive:** One-column mobile, section nav desktop.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `complaints` · `/app/complaints`
- **Purpose:** File and track own trip complaints.
- **Role:** Participant.
- **Layout:** Trip-linked form and complaint history.
- **Components:** Subject/description, case status,resolution.
- **API dependencies:** `listTrips`, `createComplaint`, `myComplaints`.
- **Interactions:** Submit against visible trip; view own case.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No complaints normal; no trip means disabled create with explanation.
- **Error:** Open-limit409; unknown trip404.
- **Success:** Case number and saved OPEN state.
- **Responsive:** Long descriptions wrap; no sensitive content in toast.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `driver-overview` · `/app/driver`
- **Purpose:** See qualification, next assignment and pending requests.
- **Role:** DRIVER.
- **Layout:** Operational dashboard with eligibility banner.
- **Components:** Verification expiry, next ride, request counts, availability link.
- **API dependencies:** `getMyDriver`, `listDriverBookings`, `listTrips`.
- **Interactions:** Open actionable onboarding/request/ride.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** Draft driver sees qualification tasks.
- **Error:** Queries recover independently.
- **Success:** Approved driver sees real workload.
- **Responsive:** Stack summary; no vanity chart.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `driver-verification` · `/app/driver/verification`
- **Purpose:** Upload license and submit current revision.
- **Role:** DRIVER.
- **Layout:** Stepwise document workflow with explicit states.
- **Components:** License form,expiry,upload/scanning status,submit,reason/history.
- **API dependencies:** `getMyDriver`, `updateDriver`, `uploadDriverDoc`, `listDriverDocs`, `submitDriver`.
- **Interactions:** Upload->scan->submit; rejected correction; approved material edits warn commitments.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No document: supported types/size.
- **Error:** Scanner unavailable stays pending;422 missing fields;409 revision stale.
- **Success:** PENDING then admin decision notification; never auto-approved.
- **Responsive:** Single-column controls; document details accessible text.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `driver-availability` · `/app/driver/availability`
- **Purpose:** Maintain hire windows and unavailable blocks.
- **Role:** DRIVER.
- **Layout:** Accessible interval list and add form.
- **Components:** Date/time/timezone controls,kind, accepting toggle, delete dialog.
- **API dependencies:** `listDriverAvailability`, `createDriverAvailability`, `deleteDriverAvailability`, `setDriverListing`.
- **Interactions:** Add/remove explicit intervals; block conflicts shown; no drag-only calendar.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No windows means unavailable for hire.
- **Error:** 409 conflict shows safe conflicting interval guidance.
- **Success:** Persisted interval reflected in list.
- **Responsive:** List usable keyboard/mobile; optional calendar supplementary.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `driver-requests` · `/app/driver/requests`
- **Purpose:** Accept/reject required hire consent.
- **Role:** DRIVER.
- **Layout:** Pending request queue with expiry.
- **Components:** Booking interval,service,vehicle,estimate,accept/reject reason.
- **API dependencies:** `listDriverBookings`, `getBooking`, `decideBooking`.
- **Interactions:** Provider chooses accept/reject; versioned single submit.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No requests: availability CTA.
- **Error:** Expired409 reload; nonprovider403.
- **Success:** Accepted may remain waiting for owner; accurate status.
- **Responsive:** Queue cards mobile, rows desktop.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `driver-active-rides` · `/app/driver/active-rides`
- **Purpose:** Operate assigned trip lifecycle.
- **Role:** DRIVER.
- **Layout:** Next-action trip workspace.
- **Components:** Start/in-transit/complete controls, simulation progress, incident action.
- **API dependencies:** `listTrips`, `getTrip`, `transitionTrip`, `advanceWaypoint`, `tripHistory`.
- **Interactions:** One valid next action; failure needs reason; overrun alert.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No assigned trip: upcoming schedule.
- **Error:** 409 active resource/eligibility/state with reload; no local advancement.
- **Success:** History appears only after server commit.
- **Responsive:** Large action targets; confirmation for completion/failure.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `driver-history` · `/app/driver/history`
- **Purpose:** Review completed/cancelled assignments.
- **Role:** DRIVER.
- **Layout:** Chronological booking/trip list.
- **Components:** State/service/date,amount estimate,trip detail.
- **API dependencies:** `listDriverBookings`, `listTrips`.
- **Interactions:** Filter history; open detail.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No history explanatory.
- **Error:** Retry query.
- **Success:** Actual terminal outcomes.
- **Responsive:** Semantic table/cards switch.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `driver-profile` · `/app/driver/profile`
- **Purpose:** Maintain driver service information.
- **Role:** DRIVER.
- **Layout:** Profile form plus identity verification warning.
- **Components:** Bio,city,rate,license fields via verification flow.
- **API dependencies:** `getMyDriver`, `updateDriver`, `listCities`.
- **Interactions:** Nonmaterial save; material fields route through guarded re-verification.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** Draft fields incomplete guidance.
- **Error:** 422 field errors;409 active commitment blocks identity edit.
- **Success:** Server version and status updated.
- **Responsive:** Form sections mobile; numeric rate with currency label.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `carpool-create` · `/app/driver/carpools/new`
- **Purpose:** Create qualified hosted ride.
- **Role:** DRIVER+OWNER.
- **Layout:** Draft form then publication review.
- **Components:** Owned vehicle selector,city pair,pickup/dropoff,time,seats,price,join mode,manual waypoints.
- **API dependencies:** `listMyVehicles`, `getMyDriver`, `listCities`, `createCarpool`, `updateCarpool`, `publishCarpool`.
- **Interactions:** Save draft no holds; publish atomic reservations; explain immutable publication.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** Missing approval/owned vehicle shows qualification path.
- **Error:** 409 overlap;422 capacity; stale revision reload.
- **Success:** Published persisted route with correct remaining seats.
- **Responsive:** Review readable mobile; no map placeholder.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `hosted-carpools` · `/app/driver/carpools`
- **Purpose:** Manage own drafts/published/history.
- **Role:** Host.
- **Layout:** Hosted departure list and detail actions.
- **Components:** Draft edit,publish,cancel,requests,trip link.
- **API dependencies:** `listMyCarpools`, `getCarpool`, `updateCarpool`, `publishCarpool`, `cancelCarpool`.
- **Interactions:** Edit draft only; cancel published with reason; open seat queue.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No hosted rides: create if qualified.
- **Error:** 409 transition/overlap reload.
- **Success:** Server publication/cancellation outcomes.
- **Responsive:** Cards mobile; route/date emphasized.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `host-seat-requests` · `/app/driver/carpools/:id/requests`
- **Purpose:** Approve pending seats and inspect accepted roster.
- **Role:** Host.
- **Layout:** Capacity header and two scoped request lists.
- **Components:** Remaining seats,pending seats,accept/reject,private passenger name.
- **API dependencies:** `getCarpool`, `listSeatRequests`, `decideSeat`.
- **Interactions:** Accept only within capacity/cutoff; reject with reason.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No requests or instant mode accepted roster.
- **Error:** 409 final seat/state refreshes queue and capacity.
- **Success:** Persisted decision and current seat total.
- **Responsive:** No wide roster; accessible action labels with name.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `owner-overview` · `/app/owner`
- **Purpose:** See vehicle readiness and booking requests.
- **Role:** OWNER.
- **Layout:** Operational fleet dashboard.
- **Components:** Verification tasks,next booking,pending request list.
- **API dependencies:** `getOwner`, `listMyVehicles`, `listOwnerBookings`.
- **Interactions:** Complete owner profile,add vehicle,open request.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No vehicles: onboarding action.
- **Error:** Section retries.
- **Success:** Real fleet eligibility.
- **Responsive:** One-column mobile; summary+fleet desktop.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `owner-add-vehicle` · `/app/owner/vehicles/new`
- **Purpose:** Register own vehicle draft.
- **Role:** OWNER.
- **Layout:** Structured form with subsequent document step.
- **Components:** Identity,specs,city,rate,capacity fields.
- **API dependencies:** `getOwner`, `createVehicle`, `listCities`.
- **Interactions:** Submit->owned vehicle document workflow.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** Incomplete owner profile links profile.
- **Error:** Duplicate409,field422.
- **Success:** Created DRAFT ID, no public listing claim.
- **Responsive:** Grouped fields; no forced multi-column narrow layout.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `owner-vehicles` · `/app/owner/vehicles`
- **Purpose:** Manage owned vehicles and safe archival.
- **Role:** OWNER.
- **Layout:** Fleet list and owned detail editor.
- **Components:** Status,expiry,list toggle,edit,archive,history links.
- **API dependencies:** `listMyVehicles`, `updateVehicle`, `setVehicleListing`, `archiveVehicle`.
- **Interactions:** Material edit warns reapproval; archive confirm; listing requires qualification.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No fleet CTA add.
- **Error:** 409 commitments prevent archive/edit; preserve form.
- **Success:** Updated/archive state from API.
- **Responsive:** Fleet rows/cards; no icon-only destructive action.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `owner-documents` · `/app/owner/vehicles/:id/documents`
- **Purpose:** Submit registration/insurance/images.
- **Role:** OWNER.
- **Layout:** Document checklist and revision timeline.
- **Components:** Upload kind/expiry,scan state,preview authorized file,submit verification.
- **API dependencies:** `listVehicleDocs`, `uploadVehicleDoc`, `submitVehicle`, `getDocument`, `deleteDocument`.
- **Interactions:** Quarantine->CLEAN->submit; no browser-declared clean state.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** Missing required docs explicit checklist.
- **Error:** 413/415/scan failure/revision409.
- **Success:** PENDING/APPROVED/REJECTED visible with reason.
- **Responsive:** Preview optional; metadata provides accessible equivalent.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `owner-availability` · `/app/owner/vehicles/:id/availability`
- **Purpose:** Set hire windows and maintenance blocks.
- **Role:** OWNER.
- **Layout:** Interval form/list scoped to vehicle.
- **Components:** Dates,kind,timezone,remove,conflict guidance.
- **API dependencies:** `listVehicleAvailability`, `createVehicleAvailability`, `deleteVehicleAvailability`.
- **Interactions:** Block reserves vehicle shared with carpools; remove availability cannot uncover work.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No windows unavailable for hire.
- **Error:** 409 conflict no optimistic removal.
- **Success:** Persisted interval only after success.
- **Responsive:** Shared availability behavior.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `owner-bookings` · `/app/owner/bookings`
- **Purpose:** Handle vehicle-provider consent.
- **Role:** OWNER.
- **Layout:** Request queue and booking detail.
- **Components:** Vehicle,date,requester safe name,decision rows,accept/reject/cancel.
- **API dependencies:** `listOwnerBookings`, `getBooking`, `decideBooking`, `cancelBooking`.
- **Interactions:** Own required owner consent only; accurate combined waiting state.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No requests: listing guidance.
- **Error:** Expired/stale409 reload.
- **Success:** Owner decision persisted and other consent preserved.
- **Responsive:** Cards mobile; decision clearly scoped to vehicle.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `owner-history` · `/app/owner/history`
- **Purpose:** Inspect bookings for own fleet.
- **Role:** OWNER.
- **Layout:** Vehicle/date/status history filters.
- **Components:** Booked estimate,trip status,archived vehicle reference.
- **API dependencies:** `listOwnerBookings`, `listTrips`.
- **Interactions:** Filter and inspect retained history.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No history normal state.
- **Error:** Scoped retry.
- **Success:** Historical vehicle labels retained.
- **Responsive:** Responsive table with row detail.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `owner-profile` · `/app/owner/profile`
- **Purpose:** Complete owner service contact profile.
- **Role:** OWNER.
- **Layout:** Single owner form within shared account navigation.
- **Components:** Display name,contact phone,role switch links.
- **API dependencies:** `getOwner`, `updateOwner`.
- **Interactions:** Save owner details separately from personal profile.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** Uncompleted profile blocks vehicle create with explanation.
- **Error:** 422 field feedback.
- **Success:** Own persisted profile.
- **Responsive:** Mobile-friendly phone input.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `admin-overview` · `/admin`
- **Purpose:** Prioritize pending verification, active incidents and complaints.
- **Role:** ADMIN.
- **Layout:** Operational queue overview with bounded report.
- **Components:** Pending counts,overdue trips,open complaints,date range,estimated value label.
- **API dependencies:** `adminReport`, `adminTrips`, `adminVerifications`, `adminComplaints`.
- **Interactions:** Click count->filtered queue; no decorative chart.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** Zero backlog is explicit.
- **Error:** Section retries; forbidden redirects without leaking data.
- **Success:** Counts correspond same report boundaries.
- **Responsive:** Compact summaries mobile; task queue first.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `admin-users` · `/admin/users`
- **Purpose:** Inspect and suspend/reactivate accounts.
- **Role:** ADMIN.
- **Layout:** Search/filter table and detail drawer.
- **Components:** Role/status filters,profile,suspend reason dialog,reactivate.
- **API dependencies:** `adminUsers`, `adminUser`, `suspendUser`, `reactivateUser`.
- **Interactions:** Require reason; show future cancellation and active incident consequences; protect last admin.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No matching accounts: clear filters.
- **Error:** 409 protected admin/current changes;403 role removal clears cache.
- **Success:** Persisted status and audit outcome.
- **Responsive:** Drawer full-screen mobile; focus restored on close.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `admin-driver-verification` · `/admin/verifications/drivers`
- **Purpose:** Review driver document revisions.
- **Role:** ADMIN.
- **Layout:** Queue plus side-by-side current revision detail.
- **Components:** Private license viewer,expiry,submitted revision,reason,approve/reject.
- **API dependencies:** `adminVerifications`, `adminVerification`, `getDocument`, `decideVerification`.
- **Interactions:** Review CLEAN doc; cannot approve self; CAS decision.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No pending revisions all clear.
- **Error:** 409 stale revision reload; file failure never approve blind.
- **Success:** Decision reason and next queue item.
- **Responsive:** Stack preview/detail mobile; downloadable PDF accessible.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `admin-vehicle-verification` · `/admin/verifications/vehicles`
- **Purpose:** Review vehicle ownership/insurance evidence.
- **Role:** ADMIN.
- **Layout:** Queue/detail with required document checklist.
- **Components:** Registration,insurance,images,expiry,current revision,decision.
- **API dependencies:** `adminVerifications`, `adminVerification`, `getDocument`, `decideVerification`.
- **Interactions:** Approve only complete clean current revision; reason required.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No pending vehicle revisions.
- **Error:** Expired422/stale409 clearly explain.
- **Success:** Persisted decision and audit.
- **Responsive:** Same responsive review pattern.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `admin-bookings` · `/admin/bookings`
- **Purpose:** Resolve booking operations safely.
- **Role:** ADMIN.
- **Layout:** Date/status queue and detail.
- **Components:** Provider decisions,resource holds summary,cancel pending/confirmed,reassign pending driver.
- **API dependencies:** `adminBookings`, `getBooking`, `cancelBooking`, `replaceDriver`, `getTrip`, `transitionTrip`.
- **Interactions:** Use guarded domain actions; started failure incident reason; no arbitrary status dropdown.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No matching bookings.
- **Error:** 409 state/conflict; no bypass control.
- **Success:** Terminal status and audit timeline.
- **Responsive:** Table row details mobile full-screen.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `admin-carpools` · `/admin/carpools`
- **Purpose:** Resolve published ride issues and overruns.
- **Role:** ADMIN.
- **Layout:** Carpool/trip queue with incident filter.
- **Components:** Seat counters,state,host,trip,unstarted cancel,active fail.
- **API dependencies:** `adminCarpools`, `adminTrips`, `getCarpool`, `cancelCarpool`, `transitionTrip`.
- **Interactions:** Cancel unstarted; fail active through trip API; no capacity override.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No rides/incidents.
- **Error:** 409 current state reload.
- **Success:** Participants notified and holds updated atomically.
- **Responsive:** Route rows wrap; no map dependency.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `admin-complaints` · `/admin/complaints`
- **Purpose:** Review and resolve participant cases.
- **Role:** ADMIN.
- **Layout:** Queue plus case narrative/history.
- **Components:** Status filters,trip link,reporter,description,resolution reason.
- **API dependencies:** `adminComplaints`, `decideComplaint`, `getTrip`.
- **Interactions:** OPEN->IN_REVIEW->RESOLVED/DISMISSED; no silent deletion.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No cases in filter.
- **Error:** 422 reason;409 stale/terminal.
- **Success:** Resolution visible reporter and audit.
- **Responsive:** Long plain text readable; preserve dialog draft.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `admin-reports` · `/admin/reports`
- **Purpose:** Inspect bounded operational performance.
- **Role:** ADMIN.
- **Layout:** Date controls and compact tables/trend-ready counts.
- **Components:** Booking/completion/seat/verification counts,estimated value,not revenue label.
- **API dependencies:** `adminReport`.
- **Interactions:** Query from/to<=90days; share URL range.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No activity returns zero actual counts.
- **Error:** 422 range on fields; unavailable report retry.
- **Success:** Totals match server response; date boundaries explicit.
- **Responsive:** Tables scroll within labelled region only if necessary.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


### `admin-audit` · `/admin/audit-logs`
- **Purpose:** Inspect who changed sensitive state.
- **Role:** ADMIN.
- **Layout:** Read-only searchable audit table and detail.
- **Components:** Actor/action/date filters,reason,requestId,safe before/after.
- **API dependencies:** `adminAudit`.
- **Interactions:** Inspect,filter,paginate; no edit/delete/export secrets.
- **Loading:** Universal stable skeleton/aria-busy for each remote section; submit progress distinct from initial query loading.
- **Empty:** No records for filter.
- **Error:** Retry with filters;403 clears admin caches.
- **Success:** Immutable entries shown with UTC/local labelled times.
- **Responsive:** Expandable mobile row; JSON safe formatted text.
- **Accessibility:** Universal keyboard/landmarks/focus/contrast/zoom contract; label page-specific controls, announce status changes, expose route/time/price as text.


## Cross-surface behavior
Driver and owner notifications/profile routes may link to shared `/app/notifications` and `/app/profile`; both roles have dedicated profile editing pages for business fields. Search pages share feature components but preserve public/app shell contexts. Owner who also hosts uses the same DRIVER+OWNER host workspace, not a second conflicting carpool implementation. Admin has no masquerade control. Upload previews fetch authenticated blobs and revoke object URLs on unmount. Unauthorized private information never remains in query cache after logout.404 and general error routes have clear home/back actions and safe messages. Route-level lazy-loading fallback must not shift header/navigation.

## Verification packet for UI phases
Capture desktop1280px and mobile390px plus actual requested width and320px overflow check; settle motion and wait for seeded API state. One batched review pass, one batched fix pass, one confirmation; report material defects left. Measure contrast and run axe, keyboard login->booking and carpool join, role switch, modal focus and error recovery. Use labelled synthetic test fixtures, never fabricated production metrics. Planning approval does not claim these implementation checks have passed.
