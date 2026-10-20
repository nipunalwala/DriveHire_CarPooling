# Phase07 independent acceptance review

Single read-only whole-phase review by an independent reviewer against baseline715a74b on2026-10-20. No tests, database operations, edits, staging or commits were performed by the reviewer. All tracked/untracked07 source/tests/docs/manifest/assets were inspected, including both384px illustrations. Current AGENTS/owner override,07prompt/ledger, screen inventory and relevant frontend/auth/admin specs were read.

## Important findings

1. tests/e2e/accessibility.spec.ts:6,:29 — public-only320px and keyboard coverage does not establish actual provider, hire, carpool and administrator form behavior. Main-only animationName does not establish descendant reduced-motion behavior. Add authenticated320px private-form keyboard progression/action/error-focus and descendant motion checks. This is an acceptance-evidence gap, not a reproduced layout defect.
2. apps/web/src/features/carpools/CarpoolDetailPage.tsx:44,:301 — seat count/message exist only in component state. Expired session, failed refresh and navigation through sign-in unmount the page and reset inputs. The memory helper covers hire and host drafting only. Preserve account+ride join fields under the existing short-lived memory policy and verify real expiry/relogin plus a backend-committed response-loss/reload/replay with persisted participation/count assertions.

Both findings require coordinator regression-first closure and final gates. No Critical finding. No second review round requested.

## Deferred minors

- AuthProvider.tsx:82 — explicit cross-tab signout clears session but not that tab's journey memory. Local logout clears it; account scoping prevents another account reading it. Consider clearing memory on explicit broadcast signout.
- public-pages.spec.ts:27 — explicit HTTP checks exercise768px paths, not every384px manifest output. Extend when broadening asset coverage.

## Source assessment

Local responsive WebP, explicit dimensions, decorative alt, external service copy and visible illustration disclosure are appropriate. Both inspected small variants retain understandable compositions. Exact prompts/source/tool/date/originals/conversions/placements are recorded and file sizes agree with the manifest. Audit uses the existing read-only paginated DTO/API and current-role guard. Four aliases resolve to existing protected screens. No new backend/deferred product module. Hire retains its attempt key; draft conflict disables save until explicit current-version reload.

## Declined to judge

- Execution/passing status of unit/integration/browser/type/lint/format/docs/build gates.
- HMR-invalidated or still-pending browser runs.
- Actual private320px/keyboard/assistive-technology/computed-contrast/full-WCAG behavior.
- Actual browser403 role-change navigation; client source regression was inspected only.
- Persisted lost-response seat behavior before the missing browser case executes.
- Every26screen loading/empty/error/success condition; unchanged03–06 behavior was not recertified.
- Generation authenticity beyond provenance, full-resolution quality, optimized equivalence and every-output HTTP delivery.
- Production measurements/performance/deployment/security/restore or unchanged backend concurrency certification.
- Source changes after the review snapshot; no second review planned.
- Commit/push/CI as independently observed evidence. Coordinator reports06CI39381081221 success;07final gates remain coordinator responsibility.

Acceptance requires resolving Important findings and recording actual final gates. No production-deployment authorization is implied.
