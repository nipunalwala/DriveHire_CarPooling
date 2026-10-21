# DriveHire visual system

Milestone 03 establishes an operational interface for creating, verifying and managing an account. Preserve PRODUCT.md truth and docs/design/auth-interface-direction.md. The current desktop assignment (2026-10-21) has OpenCode implementing the shared visual foundations, with Codex reviewing actual browser output and owning frontend review. Desktop is the active scope; mobile behavior is retained but a mobile redesign is deferred.

## Desktop scope

Design and verify at 1280×800, 1440×900 and 1920×1080. Authenticated, account and administration surfaces use Impeccable Operate mode: familiar controls, predictable navigation, quiet styling and useful density. The landing page remains Persuade mode and may keep its illustration-led presentation. Desktop browser zoom and keyboard accessibility remain in scope.

## Palette and surfaces

Use canvas #f8faf7, surface #ffffff, primary text #0f2d28, secondary text #4a6660, helper text #5c766f, action #166453, action hover #0e4d3d, soft selection #e8f4f0, borders #dde8e4 and control borders #76938b.

Pale leaf #d9e8b7 is decorative or used on a sufficiently dark surface; never use it for small text on the light canvas. Keep normal text at 4.5:1 or better, and essential component boundaries and focus indicators at 3:1 or better. Statuses include words or icons, never color alone. Danger and success states include explicit words.

Content surfaces use a quiet 1px boundary and a 12–16px radius. Controls use a 6–8px radius; pills are reserved for compact statuses. Declare elevation once: use a border or a soft shadow for layering, not both. Operational cards and buttons use no gradients, glass or decorative glow.

## Typography

Use the existing Inter stack with a system fallback; do not add a display font or external font dependency. Operational type is fixed, not fluid: page title 30px/36px, section title 20px/28px, subsection 16px/24px, body 15–16px/24px, labels and table text 14px/20px, helper text 13px/20px. Display type stays scoped to the landing page; dashboard greetings and workspace headings are normal page titles in sentence case.

Use a 4, 8, 12, 16, 24, 32, 48px spacing scale. Page heading to content is about 24–32px, related fields 16–24px and major sections 32px. Default surface padding is 24px; 32px is reserved for larger settings sections. Do not pad empty cards to manufacture importance.

## Controls and states

Inputs, selects and buttons are approximately 44–48px tall. Labels stay visible above fields; placeholders are examples, never the only label. Preserve name/type/autocomplete, constraints, hint and error IDs, and submitted values. Default editable forms use a measure near 640px; two columns are only for clearly related short fields with a logical tab order.

Primary actions use a solid teal fill; secondary actions use a neutral outlined treatment; tertiary and reload actions are quieter. One primary action per task area. Every control defines hover, focus, pressed/selected, disabled and pending behavior with an explicit focus ring. Do not use focus-blur handlers, invisible click targets or hover-only instructions.

The password reveal control remains limited to login and registration password fields, with accessible show/hide names. Do not convert other input types to password or remove its existing styles. Use lucide-react icons consistently at 18–20px; decorative icons are aria-hidden and icon-only buttons have accessible names.

State transitions are around 150ms and convey feedback rather than decoration. Honor reduced motion and avoid orchestrated page-load sequences in workspace screens.

## Existing shell and authentication constraints

The public shell has a compact wordmark and account navigation. Authentication pairs a task introduction with one form, stacked on mobile. Desktop form width comes from a two-column max1240px shell; at 740px it becomes a single column. At 320px the form remains the priority. Form controls have visible labels, autocomplete metadata and high-contrast focus rings. Group inputs by purpose and preserve entered data on errors.

Authentication screens contain no decorative raster placeholders, metrics, testimonials or fabricated listings. Original service imagery is generated and integrated in 07 with recorded provenance and responsive crops. The landing page remains explicit about unavailable booking journeys until their implementation.

Validate keyboard behavior, error focus, responsive overflow, loading/disabled controls and actual server responses. Inspect desktop and mobile captures in a bounded visual pass. Keep tokens in memory and use an HttpOnly refresh cookie; no browser localStorage credentials.
