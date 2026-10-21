# Frontend UI/UX audit — 21 October 2026

Historical baseline recorded before the approved desktop implementation. Screenshot paths below refer to ignored local evidence and are not distributed with a clean checkout. Desktop remediation and final checks are recorded in the later phase handoffs; mobile redesign remains deferred.

## Verdict

The site has a coherent teal palette, readable primary text, consistent form labels and working route destinations, but it is not consistently displayed across its page families. The highest priority is mobile layout: the shared sidebar causes document-level horizontal overflow. Dashboards are visually closer to a marketing page than an operational workspace. Profile and availability use a different information layout from the remaining account pages.

This was a direct Codex inspection of source and local browser screenshots, with OpenCode used only for the separately approved password visibility task. This is a focused UI audit, not a claim of full accessibility certification or backend acceptance.

## Evidence and limits

- Local site: http://127.0.0.1:5173/.
- Browser: Chromium, 1440 × 1000 and 390 × 1000 CSS pixels, reduced motion.
- 29 route/role cases at both widths: 58 screenshots and machine-readable observations in `artifacts/ui-audit-2026-10-21/observations.json`.
- Simulated public, passenger, driver and administrator sessions. API requests were intercepted in isolated browser contexts. No actual account or database was changed.
- List pages used empty responses; detail pages used missing-record responses. Qualification showed the initial draft form. Cities were empty, so city-unavailable messages in screenshots are fixtures, not a claim that the real catalogue is broken.
- Populated lists, valid booking/carpool/trip detail, carpool editing, private evidence preview, pending/approved/rejected qualifications, long histories, destructive confirmations, and all async transitions still require dedicated fixtures. Alias routes and all links were not exhaustively clicked; the user's assessment of link correctness is not a verified link audit.
- No uncaught page exceptions were recorded in the 58 samples. No desktop document overflow was recorded. 18 of 29 mobile cases overflowed. These are route/role samples, not 29 unique screens.

## Findings

### F1 — P1: mobile workspace content escapes the viewport

Affected: driver/carpool search and details, vehicles, bookings and booking creation/details, seats, driver qualification/requests, hosted carpools/creation, trips, all four administrator pages.

At 390px the vehicles page measured 1013px document width. The sidebar itself measured 993px. `.profile-layout` changes to `grid-template-columns: 1fr` on mobile while its flex navigation has intrinsic minimum width. The grid item is not constrained, so the whole content column expands rather than just the navigation scrolling. Forms, CTAs and empty states extend off screen. This is not just a cosmetic scrollbar.

Browser-only diagnostic: `minmax(0, 1fr)` for the mobile grid track plus `min-width: 0; max-width: 100%` for the sidebar reduced document width to exactly 390px. No product layout CSS was changed by this probe.

Evidence: vehicles mobile: `artifacts/ui-audit-2026-10-21/customer-vehicles-390.png`, driver search mobile: `artifacts/ui-audit-2026-10-21/public-drivers-390.png`.

### F2 — P1: workspace context changes between pages

`AppSidebar` implements customer and driver variants, but `ProviderLayout` and `JourneyLayout` always render the default customer variant. Thus a driver opening qualification or hosted carpools sees customer journeys instead of driver tools. Public driver/carpool browsing also gets a signed-in-style workspace sidebar. Dashboards and profile omit it altogether; availability uses its own narrow heading column.

A driver profile also presents customer bookings/seats links even though those routes redirect drivers back to their dashboard. The URLs are valid, but the visible action does not lead to the promised task for this role. Accounts with DRIVER and ADMIN hide admin navigation in the driver sidebar variant.

Evidence: driver qualification mobile: `artifacts/ui-audit-2026-10-21/driver-driver-qualification-390.png`; source `AppSidebar.tsx`, `JourneyLayout.tsx`, `ProviderLayout.tsx`, `ProfilePage.tsx`.

### F3 — P2: dashboard visual weight is spent on the greeting

Both dashboards use a large two-line greeting, decorative right-hand panel, repeated shortcut cards and generous spacing. The greeting occupies roughly 446px on desktop before account status and tools. On mobile the greeting and vertically stacked cards create a long page before lower actions. Neither dashboard reads actual booking activity or driver setup state: it offers generic shortcuts irrespective of whether a next action is urgent.

Keep the brand, but reduce the welcome header and prioritize one next action, actual account/setup state and existing journey entry points. Show factual summaries only when existing permitted APIs support them; do not invent counts or require new backend scope for the initial improvement.

Evidence: customer desktop: `artifacts/ui-audit-2026-10-21/customer-app-dashboard-1440.png`, customer mobile: `artifacts/ui-audit-2026-10-21/customer-app-dashboard-390.png`, driver desktop: `artifacts/ui-audit-2026-10-21/driver-app-driver-dashboard-1440.png`.

### F4 — P2: profile and availability hierarchy differs from the rest of the app

Profile places title/account identity into the 240px column used elsewhere for navigation; the wide right column starts with journey shortcuts before personal details. The actual edit task is secondary. Availability squeezes its heading into that same narrow column, causing a three-line title while an extremely wide form starts alongside it. Users lose consistent orientation moving between tools.

Use a shared workspace shell, then a full content-column page heading. Put personal details first on profile, separate driver setup from account access, and use a bounded form measure. Put availability controls under their heading with saved windows as a peer section.

Evidence: profile desktop: `artifacts/ui-audit-2026-10-21/customer-profile-1440.png`, availability desktop: `artifacts/ui-audit-2026-10-21/driver-driver-availability-1440.png`.

### F5 — P1: secondary text tokens are too faint on light backgrounds

Measured computed dashboard kicker color: rgb(217,232,183), against the page canvas #f8faf7: approximately 1.24:1 contrast. Section-note/footer color rgb(122,153,144) on the same canvas: approximately 2.95:1. These small text styles need at least 4.5:1. The pale leaf color can remain for decoration or appropriately contrasted dark surfaces; it should not be reused as small text on light canvas.

Evidence: dashboard screenshots; `.dashboard-kicker`, `.dashboard-section-note`, `.site-footer`, `--leaf`, `--muted-light` in `styles.css`. Ratios were calculated from computed RGB values and the opaque canvas; this is not a full automated contrast audit.

### F6 — P2: empty, filter and recovery controls overcompete

Empty pages still display Previous / Page 1 / Next controls with zero records. Large form cards and full-width reload buttons compete with primary actions, particularly in administration. Search controls and filters sit in separate visual blocks without a clear apply/reset relationship. Empty qualification/vehicle prerequisites often use an inline link rather than one obvious next-step button. Missing records have generic error messaging rather than a consistently structured unavailable state.

Hide pagination when there is only one or zero pages, group filters, keep recovery controls secondary, and give prerequisite/empty/error states one contextual next action. Preserve current stale-version and uncertain-mutation safeguards.

Evidence: vehicles, admin users/operations, booking new and carpool new screenshots; `Pages` in `ProviderLayout.tsx` and shared feedback components.

### F7 — P2: small controls and long-session navigation need deliberate treatment

Sidebar links are defined at 40px minimum height, below the project's 44px touch target convention. At small widths the header hides its dashboard link while the sidebar becomes a long horizontal strip; active links can start outside the visible portion. Native date/time and select controls need verification at 320px and with text zoom after the grid fix.

Plan a labeled compact workspace menu on mobile, with current section visible and 44px controls. Avoid substituting document-level scrolling or hiding clipped content.

## Coverage matrix

| Family         | Cases captured                                                                          | State reviewed                              | Main findings                                                    |
| -------------- | --------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| Public home    | /                                                                                       | Normal                                      | Preserve imagery/brand; reduce duplicate secondary notices later |
| Authentication | login, register, forgot, verify, reset                                                  | Initial forms; reset missing token          | Generally coherent; password reveal verified separately          |
| Search         | drivers, carpools                                                                       | Empty filters/results                       | F1, F2, F6                                                       |
| Customer       | dashboard, profile, vehicles, bookings, booking new, seats                              | Identity, empty lists, missing prerequisite | F1–F7 by page                                                    |
| Driver         | dashboard, profile, qualification, availability, requests, hosted carpools, carpool new | Initial/empty/draft                         | F1–F7 by page                                                    |
| Administration | operations, users, verifications, audit                                                 | Empty lists and initial filters             | F1, F2, F5–F7                                                    |
| Detail         | driver, carpool, booking, trip                                                          | Missing record                              | F1, F2, F6; populated detail remains unreviewed                  |

## Delivery order

1. Constrain mobile grid/sidebar and correct role-aware workspace navigation.
2. Repair small-text contrast and shared page headings/form widths.
3. Rework customer/driver dashboards and profile/availability hierarchy.
4. Standardize lists, filters, pagination, prerequisite and recovery states.
5. Complete populated-state, mobile, zoom, keyboard and visual regression acceptance.

See the [implementation plan](../superpowers/plans/2026-10-21-desktop-ui-ux-opencode.md). Broader UI fixes are proposed, not implemented by this audit.
