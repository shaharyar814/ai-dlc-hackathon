# Implementation Plan: UI Redesign (Stage A.1)

## Overview

Implement the multi-page hash-routed Workbench in TypeScript and React, following `design.md`. Work proceeds from dependency and tokens, to pure view functions with fast-check property tests, to state, shell, pages, wiring, styling and static checks, and ends with a Playwright verification.

Hard constraints for every task:

- Do not create, edit, rename or delete any file in `src/rules/`, `src/storage/` or `src/data/` (Req 14.1). Also leave `src/config.ts`, `src/types.ts` and `src/format.ts` unchanged. New constants go in new files.
- Only `react-router-dom` may be added as a runtime dependency (Req 1.7, 11.8).
- Run tests with `npm test -- --run`. Never start a dev server from the agent.
- Components only are exported from `.tsx` files (react-refresh rule in `code-style.md`).
- No hard-coded colors or `px` values outside `src/styles/tokens.css`.

## Tasks

- [x] 1. Dependency and design tokens
  - [x] 1.1 Pin `react-router-dom` to an exact version
    - Check the latest stable version (design time: `7.18.6`, needs Node 20+) and install it with `npm install --save-exact react-router-dom@<version>`
    - Confirm `package.json` has the version with no `^` or `~`, and that no other dependency was added
    - _Requirements: 1.7, 11.8_

  - [x] 1.2 Create `src/styles/tokens.css` and reset `src/index.css`
    - Define on `:root`: colors (`--color-page` off-white, `--color-card` white, text, muted text, border, one blue accent plus contrast color, green reviewed, amber late, red very-late, and tints for chips), spacing scale `--space-1` to `--space-6`, radii, border width, font sizes (body `1rem`), `--size-target` (`2.5rem`), focus ring tokens, `--motion-fast`
    - Rewrite `src/index.css` to import the tokens, set page background, body font size, and remove the Vite template dark theme
    - Add a `prefers-reduced-motion: reduce` block that disables transitions and animations
    - Use only tokens in `index.css`; no hex, `rgb()`, `hsl()`, named color or `px` literal
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.9, 11.10_

- [x] 2. Pure view functions in `src/view/`
  - [x] 2.1 Implement `src/view/routes.ts`
    - Export `RouteMatch`, `NavKey`, `NAV_ITEMS`, `resolveRoute`, `navCurrent`, `orderPath`
    - `resolveRoute` is total: `''` and `/` give queue-open; `/reviewed`, `/data-quality`, `/rule` give their pages; `/orders/<segment>` (non-empty, no `/`) gives order with the `decodeURIComponent` result; everything else, including a malformed escape, gives not-found; it never throws
    - `orderPath` encodes with `encodeURIComponent`
    - _Requirements: 1.1, 1.4, 1.5, 2.2, 2.3, 2.4, 2.5_

  - [x] 2.2 Write property tests for routing
    - Create `src/view/routes.test.ts` with fast-check, at least 100 runs per property, tagged `Feature: ui-redesign, Property <n>: <title>`
    - **Property 1: Route resolution is total and exact**
    - **Property 2: Order path round trip**
    - **Property 3: Navigation current item** (function part: `navCurrent(resolveRoute(p))`)
    - **Validates: Requirements 1.1, 1.4, 1.5, 2.4, 2.5, 6.3**

  - [x] 2.3 Implement the remaining view functions
    - `src/view/age.ts`: `ageTier`, `AGE_TIER_LABEL`, `wholeHours` (tier is display only; under 48 whole hours is `late`, 48 or more is `very-late`)
    - `src/view/summary.ts`: `summarize`, `formatLongestWait` (`"52 h"` or `"—"`)
    - `src/view/skipped.ts`: `groupSkippedByReason` (group by reason `message`, first-seen order, entries keyed by record `index`, a record counted once per distinct message, no empty groups), `skippedLabel` (`"(no ID)"` for `null` or empty)
    - `src/view/progress.ts`: `progressFraction` (clamped to [0,1], 0 when ordered is 0 or less)
    - `src/view/title.ts`: `PRODUCT_NAME`, `documentTitle`
    - Reuse `formatHours`, `formatElapsed`, `formatUtc`, `formatOrderId` from `src/format.ts`; do not reimplement them
    - _Requirements: 4.5, 4.6, 6.4, 6.5, 6.6, 8.2, 9.1, 9.2, 9.3, 9.4, 9.7, 9.8, 3.3_

  - [x] 2.4 Write property tests for the view functions
    - Create `src/view/view.test.ts` with fast-check, at least 100 runs per property, with the boundaries 47 h 59 min and 48 h 0 min generated explicitly
    - **Property 5: Age tier classification**
    - **Property 7: Longest wait**
    - **Property 10: Evidence formatting and progress**
    - **Property 12: Skipped grouping by reason**
    - **Property 13: Skipped label**
    - Also assert `documentTitle(name) === name + ' - Fulfillment Watch'` for any name (function part of Property 4)
    - **Validates: Requirements 3.3, 4.5, 4.6, 6.4, 6.5, 6.6, 8.2, 9.1, 9.2, 9.3, 9.4, 9.7, 9.8**

  - [x] 2.5 Write property test for marking reviewed
    - Create `src/view/review-flow.test.ts` using an in-memory `StorageLike` fake, the existing `saveReview`, `loadReviews` and `buildQueue`
    - **Property 8: Marking an order reviewed moves exactly that order**
    - Assert that `open` shrinks by 1, `reviewed` grows by 1, other orders keep their lists, and reloading gives the same result
    - **Validates: Requirements 4.7, 5.6, 7.3, 7.6**

- [x] 3. Workbench state and route effects
  - [x] 3.1 Implement the state provider
    - Create `src/state/workbenchContext.ts` with the context and `useWorkbench` (no components in this file)
    - Create `src/state/WorkbenchProvider.tsx` with the Stage A `App` props (`dataset`, `storage`, `now`), holding `result`, `reviews`, `open`, `reviewed` (from `buildQueue(result.flagged, reviews, RULE_ID)`), `saveErrorFor`, `rerun`, `markReviewed`
    - `markReviewed` calls `saveReview` and sets `saveErrorFor` to the order ID on failure, otherwise null; no confirmation step
    - `rerun` repeats the Stage A behavior: `evaluate(...)` then `loadReviews(storage)`
    - _Requirements: 2.8, 7.2, 7.3, 7.5, 8.6, 8.7, 14.2, 14.4_

  - [x] 3.2 Implement `src/hooks/useRouteEffects.ts`
    - On `pathname` change, set `document.title` from the `main h1` text via `documentTitle`, and focus the `h1` only when the pathname differs from the previous one
    - On first load, set the title and do not move focus; the same pathname leaves title and focus unchanged; safe under StrictMode double effects
    - Do nothing when no `h1` is found
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. App shell components
  - [x] 5.1 Create `Icon`, `AgeChip` and `StatusChip`
    - `src/components/Icon.tsx`: inline SVGs (open, reviewed, late, very-late, back arrow) using `currentColor`, with `aria-hidden="true"` and `focusable="false"` when a text label is adjacent
    - `AgeChip.tsx`: icon, `formatHours(elapsedMs)` and the tier label ("Late" or "Very late")
    - `StatusChip.tsx`: icon and "Open" or "Reviewed"
    - _Requirements: 6.4, 6.5, 6.6, 6.7, 12.6, 12.8_

  - [x] 5.2 Write tests for the chips
    - Create `src/components/Chips.test.tsx`
    - **Property 14: Status and urgency always have icon and label**
    - **Validates: Requirements 12.6, 12.8**
    - Add example tests for the 47 h and 48 h boundary text on `AgeChip`
    - _Requirements: 6.5, 6.6_

  - [x] 5.3 Create `NavBar` and update `Header`
    - `src/components/NavBar.tsx`: one `nav` with four `Link`s from `NAV_ITEMS`; `aria-current="page"` only on the item matching `navCurrent(match)`
    - `src/components/Header.tsx`: product name (not an `h1`), `NavBar`, Evaluation_Chip, Checked_Count right after it, and the Re-run button, on every route
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 3.1, 12.7_

  - [x] 5.4 Update `Header.test.tsx` without weakening assertions
    - Record the current `expect` count (8) in a comment in the PR notes, wrap in `MemoryRouter`
    - Keep the checked count, evaluation time and Re-run callback assertions; convert the skipped-button assertion to a link-target assertion; add nav order, `href` and `aria-current` assertions
    - The new `expect` count must be greater than or equal to the old one
    - _Requirements: 2.2, 2.3, 2.6, 14.7_

- [x] 6. Pages and page components
  - [x] 6.1 Build the queue components
    - `SummaryCards.tsx`: Open, Reviewed, Skipped, Longest wait, in that order, from `summarize`
    - `QueueTabs.tsx`: "Open (n)" linking `/` and "Reviewed (n)" linking `/reviewed`, `aria-current="page"` on the current one only
    - Update `QueueTable.tsx`: columns Order, Hours since payment (`AgeChip`), Reason, Review status (`StatusChip`, plus review time for reviewed rows to keep the Stage A assertion), Action; order ID is a link to `orderPath(id)` with `formatOrderId` text; every `th` has `scope="col"`; each `td` has `data-label`; "Mark reviewed" button only on open rows; remove `onSelect` and `selectedId`
    - Keep `EmptyState.tsx` unchanged and use it for the Stage A messages
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.7, 6.8, 7.1, 7.4, 12.7_

  - [x] 6.2 Update `QueueTable.test.tsx` without weakening assertions
    - Record the current `expect` count (17); render inside `MemoryRouter`
    - Keep row content, hours, reason, status text, Mark reviewed callback and empty-state assertions; replace `onSelect` assertions with `href` assertions
    - The new count must be greater than or equal to the old one
    - _Requirements: 6.1, 6.3, 7.1, 14.7_

  - [x] 6.3 Create `src/pages/QueuePage.tsx`
    - `h1` "Queue" for `#/` and "Reviewed" for `#/reviewed`, with `tabIndex={-1}`
    - Order: `SummaryCards`, `QueueTabs`, save-error `p role="alert"` with "Could not save the review. The order stays open." when `saveErrorFor !== null`, then `QueueTable` or the Stage A `EmptyState` message ("No stalled orders. Nothing needs review." or "No reviewed orders yet.")
    - _Requirements: 4.1, 4.7, 5.3, 5.4, 5.6, 5.7, 5.8, 6.9, 7.2, 7.5_

  - [x] 6.4 Create the Order page
    - `src/components/EvidencePanel.tsx`: payment time `formatUtc`, `formatElapsed`, "X of Y units fulfilled" with a progress bar filled by `progressFraction` via an inline unitless custom property, and `RULE_NAME`
    - `src/components/NextCheckBox.tsx`: heading "What to check next" and `SUGGESTED_ACTION`
    - `src/pages/OrderPage.tsx`: back link to `/`, `h1` `formatOrderId(id)` beside a `StatusChip`; open orders show "Mark reviewed" and, only for this order, the save error; reviewed orders show the review time and no button; unflagged, missing or skipped IDs show `h1` "Order not found", one message, a link to `/`, and no evidence, next-check box or button
    - Do not write anything except through `markReviewed`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10_

  - [x] 6.5 Move `OrderDetail` tests to the new components without weakening assertions
    - Record the current `expect` count (13) in `OrderDetail.test.tsx`; create `EvidencePanel.test.tsx` and `OrderPage.test.tsx` that keep every behavior assertion (paid-at, elapsed, fulfilled, rule, suggested action, review status)
    - Add the Order #1042 checks: "2026-11-19 09:00 UTC", "27 h 0 min", "0 of 2 units fulfilled", empty bar
    - The combined count must be greater than or equal to the old one
    - _Requirements: 8.2, 8.3, 8.9, 14.7_

  - [x] 6.6 Write property test for the Order page
    - Add to `src/pages/OrderPage.test.tsx`
    - **Property 11: Unflagged orders show only the not-found message**
    - **Validates: Requirements 8.8**

  - [x] 6.7 Create the Data quality page
    - `src/components/SkippedGroups.tsx`: one section per group from `groupSkippedByReason` with the reason text unchanged, a count equal to the entries, and the labels (`#` prefix via `formatOrderId` for real IDs, "(no ID)" otherwise)
    - `src/pages/DataQualityPage.tsx`: `h1` "Data quality"; with no groups show an `EmptyState` "No records were skipped."
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [x] 6.8 Move `SkippedList` tests to the new components without weakening assertions
    - Record the current `expect` count (6); create `SkippedGroups.test.tsx` and `DataQualityPage.test.tsx` keeping the order label, no-ID text and every reason message assertions
    - Add: ID 1043 appears in a group and the queue still shows it; empty state; duplicate IDs listed separately
    - The combined count must be greater than or equal to the old one
    - _Requirements: 9.4, 9.5, 9.6, 9.8, 14.7_

  - [x] 6.9 Create the Rule page and Not found page
    - `src/pages/RulePage.tsx`: `h1` "Rule", `RULE_NAME`, the plain-language description from design.md (all five conditions and the partial-refund sentence), the Threshold as "N hours" rendered from `DEFAULT_THRESHOLD_HOURS`, and "2026-11-20 12:00 UTC" from `formatUtc(EVALUATION_TIME)`; no input, button or other control
    - **NEEDS USER APPROVAL: the description wording is a draft from `.kiro/steering/product.md`. Ask the user to review and approve it before release. Do not mark the feature released until approved.**
    - `src/pages/NotFoundPage.tsx`: `h1` "Page not found", a message that the page does not exist, and a link to `/`
    - _Requirements: 1.5, 1.6, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

- [x] 7. Wiring
  - [x] 7.1 Wire `App.tsx` and `main.tsx`
    - `main.tsx`: wrap `App` in `HashRouter` inside `StrictMode`, passing the same Stage A props
    - `App.tsx`: `WorkbenchProvider`, `Header`, and `<main>` that renders the page chosen by `resolveRoute(useLocation().pathname)` with a `switch`; call `useRouteEffects(pathname)`; do not create a router in `App`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.8, 3.1, 3.2, 3.4, 3.5, 3.6_

  - [x] 7.2 Update `App.test.tsx` without weakening assertions
    - Record the current `expect` count (54); render with `MemoryRouter` and an initial entry; replace row selection with navigating to the order link
    - Keep header counts, row order, mark reviewed, persistence, save failure, re-run and empty-state assertions
    - Row order for the Stage A dataset must equal `['#1051', '#1049', '#1050', '#998', '#1042', '#1043']`
    - The new count must be greater than or equal to the old one
    - _Requirements: 6.2, 7.2, 7.5, 7.6, 14.4, 14.5, 14.6, 14.7_

  - [x] 7.3 Write rendering property tests
    - Create `src/App.properties.test.tsx` using `MemoryRouter` and a small generated dataset
    - **Property 3: Navigation current item** (rendered `NavBar` has `aria-current="page"` on exactly the matching item, none for order and unknown paths)
    - **Property 4: Every page has one non-empty h1, and the title matches it** (known routes, dataset order IDs, random IDs, arbitrary unknown paths)
    - **Property 6: Queue partition and counts** (cards, tab counts and row counts agree with `open` and `reviewed`)
    - **Property 9: Mark reviewed button appears only on open rows**
    - **Validates: Requirements 2.4, 2.5, 3.1, 3.3, 3.4, 3.5, 4.2, 4.3, 4.4, 5.1, 5.3, 5.4, 7.1, 7.4**

  - [x] 7.4 Write example tests for routing, focus and pages
    - Create `src/App.routing.test.tsx`
    - Known hashes show their pages; empty path shows the queue; the Not found link returns to `#/`; nav order, targets, chip and "17 checked, 5 skipped" on several routes; Re-run on every route
    - Focus and title: nav click moves focus to the `h1` and sets the title; load sets the title without focus; clicking the current-route link changes neither
    - Mark reviewed by click, Enter and Space; save failure with a throwing store; reload keeps 1042 in Reviewed; two clicks from the queue to a reviewed 1042; review time "2026-11-20 12:05 UTC" persists after remount
    - Rule page phrases, partial-refund sentence, "24 hours", "2026-11-20 12:00 UTC", no control in `main`
    - View-only rendering never calls `setItem`; with `fetch` and `XMLHttpRequest` stubbed to fail, every page still renders
    - _Requirements: 1.2, 1.3, 1.4, 1.6, 2.1, 2.2, 2.3, 2.6, 2.8, 3.2, 3.4, 3.6, 7.2, 7.5, 7.6, 7.7, 8.5, 8.6, 8.10, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 14.3_

- [x] 8. Styling, cleanup and static checks
  - [x] 8.1 Rewrite `src/App.css` for layout and responsive behavior
    - Remove the Vite template styles; use only tokens and `em` or `rem` multiples
    - Light cards on an off-white page; one blue accent; green, amber and red only for Reviewed, Late and Very late
    - `a`, `button` and tab links: `min-height: var(--size-target)` and a `:focus-visible` outline from the focus tokens
    - Below `48em`: table, `tbody`, `tr`, `td` become stacked cards with `td::before { content: attr(data-label) }`, `thead` visually hidden but available to assistive technology; at or above `48em`: normal table
    - Nav uses `flex-wrap: wrap`; long values use `overflow-wrap: anywhere`; no horizontal page scroll
    - Transitions limited to color and background using `--motion-fast`
    - _Requirements: 2.7, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.8, 11.9, 11.10, 12.3, 12.4, 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 8.2 Write the CSS static scan and contrast tests
    - Create `src/styles/styles.test.ts` reading files with `node:fs`
    - Every `.css` file except `tokens.css` has no hex color, `rgb(`, `hsl(`, named color or `px` literal
    - `tokens.css` defines the required tokens; a `prefers-reduced-motion: reduce` block exists
    - Compute the WCAG contrast ratio for each text-on-background token pair used and require at least 4.5:1
    - Check that body font size token resolves to at least 16 px and `--size-target` to at least 40 px at the default root size
    - _Requirements: 11.1, 11.2, 11.6, 11.7, 11.10, 12.4_

  - [x] 8.3 Remove superseded files
    - Delete `src/components/OrderDetail.tsx`, `OrderDetail.test.tsx`, `SkippedList.tsx` and `SkippedList.test.tsx` only after their assertions exist in the new tests (tasks 6.5 and 6.8)
    - Confirm no import of them remains and `npm run lint` passes
    - _Requirements: 14.6, 14.7_

  - [x] 8.4 Update `.kiro/steering/structure.md`
    - Document the new `src/pages/`, `src/view/`, `src/state/`, `src/hooks/` and `src/styles/` folders and the new components
    - _Requirements: 14.8_

  - [x] 8.5 Write semantic scan tests
    - Create `src/semantics.test.ts`: no `onClick` on `div` or `span` in `src/**/*.tsx`; every inline `svg` has `aria-hidden="true"` or a text alternative; `package.json` has `react-router-dom` with no `^` or `~` and no component library or CSS framework dependency
    - _Requirements: 1.7, 11.8, 12.7, 12.8_

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Final verification
  - [x] 10.1 Run the full local checks and the Stage A guard
    - Run `npm test -- --run`, `npm run lint` and `npm run check`; fix any failure
    - Run `git diff --stat -- src/rules src/storage src/data src/config.ts src/types.ts src/format.ts` and confirm it is empty
    - Confirm the assertion counts recorded in tasks 5.4, 6.2, 6.5, 6.8 and 7.2 did not decrease
    - Scan committed files for secrets and confirm the data is synthetic
    - _Requirements: 14.1, 14.2, 14.6, 14.7, 14.9_

  - [x] 10.2 Browser verification with Playwright
    - The user starts `npm run dev` manually; do not start it from the agent. Ask for the URL if it is not known
    - Using the Playwright tools, load the Queue page, the Order page for #1042 and the Data quality page, and confirm there are no uncaught console errors
    - At viewport widths 360, 768 and 1280 px, save nine screenshots named `<page>-<width>.png` (`queue`, `order`, `data-quality`) under `docs/screenshots/`, and confirm `document.documentElement.scrollWidth <= window.innerWidth` on each
    - Run the keyboard-only flow from the Queue page using only Tab, Shift+Tab, Enter and Space: reach the #1042 link, open it, reach "Mark reviewed", activate it, see #1042 shown as reviewed; confirm a visible focus indicator on every focused control
    - Confirm an order ID with a special character resolves through the router (design research note)
    - On any failed screenshot, overflow or flow step, report the page, width or step and mark the verification failed
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 12.1, 12.2, 12.3, 12.5, 13.1_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP, except that the assertion-count rule in Req 14.7 applies to the non-optional test updates (5.4, 6.2, 6.5, 6.8, 7.2).
- Each task references specific requirements for traceability.
- Property tests use fast-check 4.10.3 (already installed) with at least 100 runs and a tag comment.
- Task 6.9 contains a user-approval gate for the Rule page wording (Req 10.7).
- Nothing in `src/rules/`, `src/storage/` or `src/data/` may change (Req 14.1).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "2.3"] },
    { "id": 1, "tasks": ["2.2", "2.4", "2.5", "3.1", "3.2", "5.1"] },
    { "id": 2, "tasks": ["5.2", "5.3", "6.1", "6.4", "6.7", "6.9"] },
    { "id": 3, "tasks": ["5.4", "6.2", "6.3", "6.5", "6.6", "6.8"] },
    { "id": 4, "tasks": ["7.1"] },
    { "id": 5, "tasks": ["7.2", "7.3", "7.4", "8.1"] },
    { "id": 6, "tasks": ["8.2", "8.3", "8.4", "8.5"] },
    { "id": 7, "tasks": ["10.1"] },
    { "id": 8, "tasks": ["10.2"] }
  ]
}
```
