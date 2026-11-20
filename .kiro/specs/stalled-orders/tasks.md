# Implementation Plan: Stalled Orders (Fulfillment Watch, Stage A)

## Overview

The design uses TypeScript, so all tasks use TypeScript with React 19 and Vitest. The plan builds the pure modules first (timestamps, validation, queue, evaluator, format), then the Review_Store and the bundled dataset, then the React components, and ends with `App.tsx` wiring. The last task updates the steering files.

Testing rules used in this plan (Requirement 8.5, 8.6):

- Every task that adds or changes behavior names the Vitest test file(s) and cases to write. Example-based tests are required sub-work inside each implementation task.
- Property tests (Properties 1 to 13 from the design) are separate required sub-tasks. They need `fast-check`.
- Component tests need `jsdom`, `@testing-library/react`, and `@testing-library/user-event`. Each component test file starts with `// @vitest-environment jsdom`, so `vite.config.ts` stays unchanged.
- Tests always pass the evaluation time and review timestamp as arguments. No test calls `Date.now()` or `new Date()` without an argument.
- The `package.json` script is `"test": "vitest"`, so `npm test -- --run` runs one pass. Never use watch mode.

## Tasks

- [ ] 1. Set up the test runner, constants, and shared types
  - [ ] 1.1 Add Vitest and create `src/config.ts` and `src/types.ts`
    - Add `vitest` as a dev dependency (approved by the user, which overrides the "ask before adding" note in `.kiro/steering/testing.md`). Pick a release that supports Vite 8.
    - Add the script `"test": "vitest"` to `package.json` so that `npm test -- --run` runs the suite once.
    - Create `src/config.ts` with `EVALUATION_TIME`, `DEFAULT_THRESHOLD_HOURS`, `RULE_ID`, `RULE_NAME`, `SUGGESTED_ACTION`, and `REVIEW_STORAGE_KEY` exactly as in the design.
    - Create `src/types.ts` with `RawOrder`, `RefundStatus`, `Order`, `FlaggedOrder`, `SkipCode`, `SkipReason`, `SkippedRecord`, `EvaluationResult`, `ReviewRecord`, and `ReviewMap` as readonly types.
    - Vitest tests: write `src/config.test.ts` asserting `EVALUATION_TIME` is `2026-11-20T12:00:00Z`, `DEFAULT_THRESHOLD_HOURS` is 24, `RULE_NAME` is "Paid and unfulfilled", and `SUGGESTED_ACTION` is "Confirm pick status with the warehouse.". Run `npm test -- --run` and confirm it passes.
    - _Requirements: 1.1, 1.6, 4.1, 8.2, 8.3_

  - [ ] 1.2 Install the extra dev dependencies
    - The user has approved `fast-check` (property tests), `jsdom`, `@testing-library/react`, and `@testing-library/user-event` (component tests).
    - Run `npm install --save-dev --save-exact fast-check jsdom @testing-library/react @testing-library/user-event`. Confirm that `package.json` lists these four packages with exact versions and no `^` or `~` range. Keep the `"test": "vitest"` script unchanged.
    - Vitest tests: no new behavior is added. Verify the install by running `npm test -- --run` and confirming the existing `src/config.test.ts` still passes.
    - _Requirements: 8.2, 8.3_

- [ ] 2. Implement the Evaluator (pure rules)
  - [ ] 2.1 Implement `src/rules/timestamps.ts`
    - Export `parseUtcTimestamp(value: unknown): number | null`. Accept only strings matching `YYYY-MM-DDTHH:MM[:SS[.fff]]Z`, build the value with `Date.UTC`, and reject values whose fields do not round-trip (for example `2026-02-30T00:00:00Z`). Never throw and never read the clock.
    - Vitest tests: write `src/rules/timestamps.test.ts` with cases for a valid timestamp (returns epoch ms), with and without seconds and milliseconds, a missing `Z`, a `+02:00` offset, `"yesterday"`, an empty string, a number, `null`, `undefined`, and Feb 30.
    - _Requirements: 1.2, 6.1_

  - [ ] 2.2 Implement `src/rules/validateOrder.ts`
    - Export `ValidationResult` and `validateOrder(raw, evaluationTimeMs)`. Check all seven fields in the order given in the design, collect every failure, and return `{ ok: true, order }` or `{ ok: false, reasons }`.
    - Missing fields use code `missing-field` with the field name. A missing or non-boolean `canceled` is reported as missing and never defaulted. A timestamp later than the evaluation time is `future-timestamp`. A timestamp equal to the evaluation time is valid. Quantities must be non-negative safe integers. Refund status must be `none`, `partial`, or `full`. Validation ignores payment status, so malformed unpaid records are rejected too.
    - Vitest tests: write `src/rules/validateOrder.test.ts` with cases for a valid order, each of the seven fields missing (each reason names the field), a record missing several fields (one reason per field), an unparsable timestamp, a future timestamp, a timestamp equal to the evaluation time (valid), a negative, fractional, non-numeric, and empty quantity (reason names each bad field), an invalid and a missing refund status, a missing `canceled` flag, an unpaid but malformed record (rejected), and a record with several defects (all reasons present).
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.10, 6.11, 6.12_

  - [ ] 2.3 Implement `src/rules/queue.ts`
    - Export `compareOrderIds`, `compareFlagged`, `reviewKey`, `QueueRow`, and `buildQueue`. `reviewKey` is `JSON.stringify([orderId, ruleId])`. `compareOrderIds` compares all-digit IDs numerically without precision loss (strip leading zeros, compare length, then text) and compares other IDs as text with `<` and `>`. `compareFlagged` sorts by earliest `paidAtMs`, then by `compareOrderIds`. `buildQueue` splits flagged orders into `open` and `reviewed` by the review map and preserves input order.
    - Vitest tests: write `src/rules/queue.test.ts` with cases for `compareOrderIds` ("998" before "1042", "0042" equals numeric 42 and falls back to text order, non-digit IDs as text), `compareFlagged` for equal and different timestamps, `reviewKey` (an ID containing a delimiter does not collide), and `buildQueue` (reviewed vs open split, original review timestamp carried on the row, review for an unflagged order ignored and the map unchanged, an order that matches again returns to Reviewed).
    - _Requirements: 3.2, 3.4, 3.5, 3.11, 5.2, 5.7, 5.8_

  - [ ] 2.4 Implement `src/rules/paidUnfulfilled.ts`
    - Export `evaluate(orders, evaluationTime, thresholdHours): EvaluationResult`. Throw `RangeError` for an unparsable `evaluationTime`. Validate each record, detect duplicates against previously accepted IDs only (later duplicates are skipped with a `duplicate-order-id` reason), apply the rule (`paid` after trim and lowercase, `elapsedMs >= thresholdHours * 3_600_000`, fulfilled 0, not canceled, refund not `full`), sort flagged orders with `compareFlagged`, and return `checkedCount` as the input length. Do not mutate the input and do not touch the clock, storage, or the DOM.
    - Vitest tests: write `src/rules/paidUnfulfilled.test.ts` with these tests, each named with the text of its BRD success-table row (Requirement 8.4):
      - `Paid 23 hours 59 minutes ago, zero fulfilled: Stays out of the queue`
      - `Paid exactly 24 hours ago, zero fulfilled: Appears in Open`
      - `Order #1042, paid 27 hours ago, 0 of 2 fulfilled: Appears with elapsed time, reason, and suggested action` (the evaluator part: flagged with `elapsedMs` of 27 h)
      - `Paid more than 24 hours ago, canceled or fully refunded: Stays out, even when payment status still reads paid`
      - `Unpaid order, or any units fulfilled: Stays out`
      - `Payment timestamp is invalid: Record is skipped and counted; valid orders still evaluate`
      - `Same data evaluated twice: One row per matching order and rule` (identical results, unique IDs)
      - `A flagged order is later fulfilled: It leaves the queue after re-evaluation` (same order with fulfilled quantity changed, evaluated again, is not flagged)
    - Also add tests for a partial refund (flagged), `" PAID "` (flagged), a valid unpaid order (excluded, not in skipped), a duplicate ID (first kept, later skipped), a duplicate whose first record is invalid (the later valid record is kept), a skipped record not changing results for other records, an empty dataset (zero flagged, zero skipped, `checkedCount` 0, no error), and an unparsable evaluation time (throws `RangeError`). Pass the evaluation time as an argument in every test.
    - _Requirements: 1.2, 1.8, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 5.6, 6.5, 6.9, 8.1, 8.4, 8.6, 8.10, 8.11_

  - [ ] 2.5 Write property tests for the Evaluator
    - Add to `src/rules/paidUnfulfilled.test.ts` using `fast-check`, each with at least 100 runs and a comment `Feature: stalled-orders, Property {n}: {title}`.
    - **Property 1: Evaluation is deterministic and does not mutate its input**
    - **Property 2: The flag decision matches the rule** (bias generated payment times to exactly the threshold, one minute under, and zero elapsed time)
    - **Property 3: Invalid records are skipped once, with a reason per defect**
    - **Property 4: Skipped records do not affect other records**
    - **Property 5: Duplicate IDs keep the first, and flagged IDs are unique**
    - **Validates: Requirements 1.2, 1.3, 2.1 to 2.11, 5.6, 6.1 to 6.6, 6.9 to 6.12, 7.3, 8.10**

  - [ ] 2.6 Write property tests for the queue
    - Add to `src/rules/queue.test.ts` using `fast-check`, at least 100 runs each, tagged with the property number.
    - **Property 6: Queue order is earliest payment first, then natural ID**
    - **Property 7: Order ID comparison is a consistent total order**
    - **Property 8: The queue partitions flagged orders by saved review**
    - **Validates: Requirements 3.2, 3.4, 3.5, 3.11, 5.3, 5.7, 5.8**

  - [ ] 2.7 Write the purity smoke test for the Evaluator modules
    - Write `src/rules/purity.test.ts` (node environment). It reads the source text of `src/rules/*.ts` (excluding `*.test.ts`) and `src/format.ts` and asserts there is no import from `react`, `react-dom`, `../storage`, or `../components`, and no use of `Date.now`, `new Date()` with no arguments (match with the regex `/new Date\(\s*\)/`), `localStorage`, or `document`. `new Date(ms)` with an argument is allowed.
    - Vitest tests: this file is the test. Run it after tasks 2.4 and 3.1 exist.
    - _Requirements: 8.1_

- [ ] 3. Implement display formatting
  - [ ] 3.1 Implement `src/format.ts`
    - Export `formatHours`, `formatElapsed`, `formatReason`, `formatUtc`, `formatOrderId`, and `formatCounts` as in the design. Use only `getUTC*` getters so output does not depend on the time zone.
    - Vitest tests: write `src/format.test.ts` with cases for `formatHours` (27 h 0 min gives "27 h", 26 h 59 min gives "26 h"), `formatElapsed` ("27 h 0 min", "0 h 5 min"), `formatReason` ("Paid 27 h ago, 0 of 2 units fulfilled (threshold 24 h)"), `formatUtc` ("2026-11-20 12:05 UTC" from an ISO string with seconds), `formatOrderId` ("#1042"), and `formatCounts` ("20 checked, 3 skipped" and "0 checked, 0 skipped").
    - _Requirements: 1.3, 1.8, 3.8, 3.9, 3.10, 4.1, 5.10_

  - [ ] 3.2 Write property tests for formatting
    - Add to `src/format.test.ts` using `fast-check`, at least 100 runs each.
    - **Property 12: Duration and reason text agree with the elapsed time**
    - **Property 13: UTC timestamps format in UTC regardless of time zone**
    - **Validates: Requirements 3.8, 3.9, 4.1, 5.10**

- [ ] 4. Implement the Review_Store
  - [ ] 4.1 Implement `src/storage/reviews.ts`
    - Export `StorageLike`, `getBrowserStorage`, `loadReviews`, `SaveResult`, and `saveReview` as in the design. Store one JSON array under `REVIEW_STORAGE_KEY`. `loadReviews` returns an empty map for `null` storage, an absent key, a throwing `getItem`, bad JSON, a non-array, or any invalid entry (validate `reviewedAt` with `parseUtcTimestamp`). `saveReview` keeps an existing record for the same key without writing, returns `ok: false` with the previous reviews when storage is `null` or `setItem` throws, and never reads the clock. `getBrowserStorage` wraps the `window.localStorage` access in `try/catch`.
    - Vitest tests: write `src/storage/reviews.test.ts` with an in-memory fake `StorageLike`, covering: save then load returns equal `orderId`, `ruleId`, and `reviewedAt`; a second save for the same order and rule keeps the first timestamp and does not write a second record; only the single review key is written (Requirement 7.2); corrupt JSON, a non-array, a malformed entry, and an unparsable timestamp all load as empty without throwing; `null` storage and a throwing `getItem` load as empty; a throwing `setItem` returns `ok: false` with the previous reviews; the timestamp is taken from the argument.
    - _Requirements: 5.2, 5.4, 5.5, 5.9, 5.12, 7.2, 8.8, 8.9_

  - [ ] 4.2 Write property tests for the Review_Store
    - Add to `src/storage/reviews.test.ts` using `fast-check`, at least 100 runs each.
    - **Property 9: Review round trip**
    - **Property 10: A second review keeps the first**
    - **Property 11: Bad storage never breaks loading**
    - **Validates: Requirements 5.2, 5.4, 5.5, 5.12, 8.9**

- [ ] 5. Create the bundled dataset
  - [ ] 5.1 Create `src/data/orders.ts`
    - Export `DATASET: readonly RawOrder[]` with the 17 synthetic records listed in the design (IDs 998, 1042 to 1056, and the second `1043` duplicate), including the malformed ones as raw literals. Use no real customer data and no secrets.
    - Vitest tests: write `src/data/orders.test.ts` asserting the dataset has between 12 and 20 records, `evaluate(DATASET, EVALUATION_TIME, DEFAULT_THRESHOLD_HOURS)` returns `checkedCount` 17 and 5 skipped records ("17 checked, 5 skipped" via `formatCounts`), the flagged IDs in order are 1051, 1049, 1050, 998, 1042, 1043, #1042 has an elapsed time of 27 h 0 min with 0 of 2 units, and the dataset covers every BRD success-table row (one record per row, including the 23 h 59 min and exactly 24 h boundaries).
    - _Requirements: 1.1, 1.4, 1.5, 7.4, 8.4_

- [ ] 6. Checkpoint - Ensure all tests pass
  - Run `npm test -- --run`. Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Build the React UI and wire it together
  - [ ] 7.1 Implement `EmptyState` and `QueueTable` in `src/components/`
    - Create `EmptyState.tsx` (`<p role="status">` with the message) and `QueueTable.tsx` (a `<table>` with `<th scope="col">` headers for Order, Hours since payment, Reason, Review status, and Action). The order cell is a `<button>` showing `#id` with `aria-current="true"` when selected. The Action cell holds a "Mark reviewed" `<button>` in the Open view and nothing in the Reviewed view. Show `EmptyState` with "No stalled orders. Nothing needs review." (Open) or "No reviewed orders yet." (Reviewed) when there are no rows. Show a review timestamp with `formatUtc` for reviewed rows. One component per file, exporting only the component.
    - Vitest tests: write `src/components/QueueTable.test.tsx` (`// @vitest-environment jsdom`) with cases for the table and column-header roles, a row showing `#1042`, "27 h", the reason text, and review status, the "Mark reviewed" button present in Open and absent in Reviewed, both empty-state messages exposed with `role="status"`, and keyboard-only activation of the order button and "Mark reviewed" using `user-event` (Tab and Enter).
    - _Requirements: 3.1, 3.3, 3.6, 3.7, 3.8, 3.9, 3.10, 5.10, 5.11, 9.1, 9.2, 9.3, 9.4_

  - [ ] 7.2 Implement `OrderDetail`, `SkippedList`, and `Header` in `src/components/`
    - `OrderDetail.tsx` shows the UTC payment timestamp, elapsed time ("27 h 0 min"), "0 of 2 units fulfilled", the rule name "Paid and unfulfilled", and the suggested action, and is read-only. `SkippedList.tsx` is a table of order ID (or "(no ID)" with the input position) and the reasons, with a close button. `Header.tsx` shows `formatCounts`, the evaluation time in UTC, a "Re-run evaluation" button, and an "N skipped" button (zero when none).
    - Vitest tests: write `src/components/OrderDetail.test.tsx`, `src/components/SkippedList.test.tsx`, and `src/components/Header.test.tsx` (each with `// @vitest-environment jsdom`) covering: detail content for #1042 ("27 h 0 min", "0 of 2", rule name, suggested action); a different order replacing the detail on re-render; the skipped list showing each order ID and reason and "(no ID)" for a record without an ID; the header text "17 checked, 5 skipped", "0 checked, 0 skipped", the UTC evaluation time, and the "0 skipped" label; the re-run and skipped buttons calling their callbacks.
    - _Requirements: 1.3, 1.7, 1.8, 4.1, 4.2, 4.3, 4.4, 6.7, 6.8_

  - [ ] 7.3 Wire `src/App.tsx` and base styles
    - Replace the template content in `src/App.tsx` (and trim `src/App.css` as needed). `App` takes optional props `dataset`, `storage`, and `now` (defaults: `DATASET`, `getBrowserStorage()`, `() => new Date()`). It evaluates on mount and on re-run, loads reviews with `loadReviews`, builds the queue with `buildQueue`, handles the Open and Reviewed view buttons (`aria-pressed`), selection and detail, the skipped list, and "Mark reviewed". The click handler creates `now().toISOString()` and passes it to `saveReview`. A failed save keeps the order Open and shows `<p role="alert">` with "Could not save the review. The order stays open.". Clear `selectedId` when the selected order is no longer flagged. Make no network calls.
    - Vitest tests: write `src/App.test.tsx` (`// @vitest-environment jsdom`, in-memory fake storage, injected `now` returning a fixed date) with cases for: the initial load shows the header "17 checked, 5 skipped" and the flagged rows in order; the view buttons switch between Open and Reviewed; selecting a row shows its detail and selecting another replaces it; "Mark reviewed" on #1042 moves it to Reviewed with the injected timestamp in the form "2026-11-20 12:05 UTC" and hides its button; the re-run button keeps one row per order and the same views and timestamps; the skipped summary opens the list.
    - _Requirements: 1.1, 1.3, 1.7, 3.3, 3.4, 3.5, 4.1, 4.3, 5.1, 5.6, 5.9, 5.10, 5.11, 5.12, 6.7, 6.8, 7.1_

  - [ ] 7.4 Add the remaining behavior tests for `App`
    - Add to `src/App.test.tsx`, reusing the fake storage and injected `now`:
      - `Operator marks #1042 reviewed and reloads: #1042 remains in Reviewed with its timestamp` (unmount and render again with the same storage)
      - corrupt JSON, a throwing `getItem`, and `null` storage: the app does not crash, shows the evaluated Queue, and all orders are Open
      - a throwing `setItem`: the order stays Open, the `role="alert"` message shows, and the app stays usable
      - a stale review for an order that no longer matches (dataset with #1042 fulfilled): it leaves both views and its saved record stays in storage; when the order matches again it returns to Reviewed with the original timestamp
      - an empty dataset: "0 checked, 0 skipped" and the Open empty-state message
      - no `fetch` or `XMLHttpRequest` call during load and actions (spy on both)
      - only the review key is written to storage and the dataset objects are unchanged after actions
      - keyboard-only flow: select a row and mark it reviewed with `user-event`
    - _Requirements: 1.8, 5.3, 5.5, 5.7, 5.8, 5.12, 7.1, 7.2, 7.3, 8.7, 8.8, 9.1, 9.2_

- [ ] 8. Checkpoint - Ensure all tests pass
  - Run `npm test -- --run` and `npm run lint`. Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Update the steering files
  - [ ] 9.1 Update the Vitest lines in `.kiro/steering/testing.md` and `.kiro/steering/tech.md`
    - Decision Q17 and the design's follow-up note. In `testing.md`, replace line 3 ("Test runner: Vitest. It is not installed yet. Ask before adding it to `package.json`.") with a statement that Vitest is installed, and replace line 4 so it says to run tests with `npm test -- --run` (the `test` script is `vitest`), never in watch mode. Keep the rest of the file unchanged. In `tech.md`, replace line 7 ("Tests: Vitest (not installed yet; ...)") with a statement that Vitest is installed, and line 15 ("Tests, once added: `npx vitest --run` ...") with `npm test -- --run`. List the four extra dev dependencies approved and installed in task 1.2 (fast-check, jsdom, @testing-library/react, @testing-library/user-event), and keep the rule to ask before adding any other dependency.
    - Vitest tests: none, because this task changes only documentation. Run `npm test -- --run` once after the edit to confirm the suite still passes, and `npm run scan:secrets` if gitleaks is available.
    - _Requirements: 8.2, 8.3_

- [ ] 10. Final checkpoint - Ensure all tests pass
  - Run `npm test -- --run` and `npm run check`. Ensure all tests pass, ask the user if questions arise.

## Notes

- All test sub-tasks, including the property tests, are required. The property tests need `fast-check`, which task 1.2 installs.
- Example-based tests are required because Requirements 8.4 to 8.11 require them.
- Each task references specific requirements for traceability.
- Checkpoints ensure incremental validation.
- Property tests validate universal correctness properties from the design. Unit and component tests validate specific examples and edge cases.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.2", "4.1"] },
    { "id": 3, "tasks": ["2.4", "2.6", "4.2"] },
    { "id": 4, "tasks": ["2.5", "2.7", "5.1", "7.1", "7.2"] },
    { "id": 5, "tasks": ["7.3"] },
    { "id": 6, "tasks": ["7.4"] },
    { "id": 7, "tasks": ["9.1"] }
  ]
}
```
