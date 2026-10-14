# DriveHire design system

## Brand and voice

DriveHire pairs two clear ways to travel: hire a vehicle or share a carpool. The tagline is “Go your way. Get there together.” Use short, helpful copy and never use placeholder lorem ipsum. The mark is an outlined route pin; the wordmark is DriveHire.

## Tokens

The primary is deep teal (`#086b67`) with white text (contrast 6.1:1). Neutrals use slate 50–950. Semantic success, warning, danger and info tokens are `#166534`, `#854d0e`, `#b42318`, and `#075985`; pair them with white or pale tinted surfaces. Surfaces are white and slate-50, borders slate-200, text slate-900/600 and focus ring teal-700. Dark mode is stored in localStorage under `drivehire-theme` and can also follow system preference.

## Type and layout

Self-host Inter from `@fontsource/inter`; headings use the same family at 650–750 weight. Body is 16/24, small 14/20, display 48–72/1.04. Keep prose to 68 characters per line. Spacing follows 4 px increments with 8 px as the common step. Radius values are 8, 12 and 16 px. Use subtle borders and layered shadows. Content max width is 1200 px, reading width 680 px.

## Interaction and accessibility

Motion uses 150–250 ms ease-out and is disabled under `prefers-reduced-motion`. Every interactive control has a visible focus ring, label and keyboard behavior. Status always has text alongside color. Forms show inline errors and retain values. Async content offers loading, empty, error/retry and success states. Toasts use an aria-live region. Pages have one h1 and a skip link. Keep all layouts usable from 360 to 1440 px.

## Components and layouts

Reusable controls live in `client/src/components/ui`. Public, Auth and Dashboard layouts share the same tokens and header rhythm. The public header is sticky and translucent; the footer contains product and legal links. Dashboard navigation changes by role. Destructive actions require confirmation.

## Pages

Home is a real public landing page with hire/carpool search tabs, trust points, three steps, benefits, Mumbai/Pune/Bengaluru city links, testimonials, FAQ and clear driver/owner calls to action. About, How it works, Contact, FAQ, Terms and Privacy have distinct useful copy and page metadata. The design gallery is available only in development.
