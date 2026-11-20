# Requirements Document

## Introduction

Fulfillment Watch (Order Exception Workbench, Stage A) helps a fulfillment lead find paid orders that have no fulfillment after a threshold number of hours (default 24), check why each order was flagged, and record that the order was reviewed. The app is read-only toward order data. It evaluates a bundled synthetic dataset at a fixed evaluation time and stores only review status in browser local storage.

Source of truth: `docs/brd-stalled-order.md`, including its "Decisions made in this brief" section. Product context comes from `.kiro/steering/product.md`, `tech.md`, `structure.md`, and `testing.md`.

Decisions that resolve earlier open questions are recorded under "Decisions" at the end of this document and are written into the acceptance criteria.

## Glossary

- **Workbench**: The Fulfillment Watch single-page React application.
- **Evaluator**: The pure function module that applies the Rule to Orders. It has no React, DOM, or storage access.
- **Order**: One synthetic record with order ID, payment status, payment timestamp (UTC), canceled flag, refund status, ordered quantity, and fulfilled quantity.
- **Dataset**: The bundled set of 12 to 20 synthetic Orders, including the invalid demo records.
- **Rule**: The rule "Paid and unfulfilled".
- **Rule_ID**: The identifier of the Rule, used as part of the review key.
- **Evaluation_Time**: The fixed constant `2026-11-20T12:00:00Z`.
- **Threshold**: The number of hours since payment at or beyond which an Order is flagged. Default 24. Held as a single configuration constant.
- **Flagged_Order**: An Order that matches the Rule.
- **Skipped_Record**: An Order that fails validation and is excluded from evaluation.
- **Queue**: The list of Flagged_Orders, shown in an Open view and a Reviewed view.
- **Review_Record**: A saved record containing order ID, Rule_ID, and review timestamp.
- **Review_Store**: The module that reads and writes Review_Records in browser local storage.
- **Operator**: The fulfillment lead using the Workbench.
- **Suggested_Action**: The text "Confirm pick status with the warehouse."
- **Re_Run_Control**: The single button labeled "Re-run evaluation" that evaluates the Dataset again.
- **Skipped_Summary**: The "N skipped" summary in the Workbench header that opens the list of Skipped_Records.

## Requirements

### Requirement 1: Load and evaluate the Dataset

**User Story:** As an Operator, I want the Workbench to evaluate every Order when it opens, so that I see the current stalled orders without any setup.

#### Acceptance Criteria

1. WHEN the Workbench opens, THE Workbench SHALL load the Dataset and evaluate every Order in the Dataset against the Rule at the Evaluation_Time `2026-11-20T12:00:00Z`, without any user action and without sign-in.
2. THE Evaluator SHALL receive the Evaluation_Time and the Threshold as arguments, SHALL NOT read the system clock, and SHALL return identical results for identical Dataset, Evaluation_Time, and Threshold inputs.
3. WHEN evaluation completes, THE Workbench SHALL display the count of all Orders checked with the count of Skipped_Records beside it, in the form "20 checked, 3 skipped", and SHALL display the last successful evaluation time as the Evaluation_Time in UTC.
4. THE Workbench SHALL contain a Dataset of at least 12 and at most 20 Orders, inclusive, and the invalid demo Orders SHALL count toward this range.
5. THE Dataset SHALL contain at least one Order for each row of the BRD success table, plus Order #1042 with payment timestamp `2026-11-19T09:00:00Z` and 0 of 2 units fulfilled.
6. THE Workbench SHALL read the Threshold, in hours, from one configuration constant with a default of 24 hours, and SHALL provide no settings screen.
7. WHEN the Operator selects the Re_Run_Control, THE Workbench SHALL evaluate the Dataset again at the Evaluation_Time and update the Queue, the checked and skipped counts, and the Skipped_Summary.
8. IF the Dataset contains zero Orders, THEN THE Evaluator SHALL return zero Flagged_Orders and zero Skipped_Records, THE Workbench SHALL display "0 checked, 0 skipped", and THE Workbench SHALL continue to operate without error.

### Requirement 2: Apply the Rule

**User Story:** As an Operator, I want orders flagged by a clear rule, so that I can trust why each order appears.

#### Acceptance Criteria

1. WHEN the Evaluator evaluates an Order that has payment status paid, elapsed time since payment greater than or equal to the Threshold, fulfilled quantity of zero, canceled flag false, and refund status other than full, THE Evaluator SHALL flag the Order.
2. WHEN the Evaluator evaluates an Order that has payment status paid, was paid exactly 24 hours (86,400 seconds) before the Evaluation_Time, has fulfilled quantity of zero, has canceled flag false, and has refund status other than full, THE Evaluator SHALL flag the Order.
3. WHEN the Evaluator evaluates an Order that has payment status paid and was paid 23 hours 59 minutes (86,340 seconds) before the Evaluation_Time, THE Evaluator SHALL exclude the Order, regardless of the other conditions.
4. WHEN the Evaluator evaluates an Order that has fulfilled quantity greater than zero, THE Evaluator SHALL exclude the Order, regardless of the other conditions.
5. WHEN the Evaluator evaluates an Order that has canceled flag true, THE Evaluator SHALL exclude the Order even if payment status is paid.
6. WHEN the Evaluator evaluates an Order that has refund status full, THE Evaluator SHALL exclude the Order even if payment status is paid.
7. WHEN the Evaluator evaluates a valid Order that has payment status other than paid, THE Evaluator SHALL exclude the Order without adding it to the Skipped_Records.
8. WHEN the Evaluator evaluates an Order that has refund status partial and meets all other flagging conditions, THE Evaluator SHALL flag the Order.
9. THE Evaluator SHALL be deterministic: FOR ALL Datasets, evaluating the same Dataset with the same Evaluation_Time and Threshold twice SHALL produce identical results, including the same set of Flagged_Orders.
10. THE Evaluator SHALL compare payment status after trimming whitespace and converting to lowercase, and SHALL flag an Order only WHEN the result equals "paid".
11. THE Evaluator SHALL accept the refund status values none, partial, and full.

### Requirement 3: Show the Queue

**User Story:** As an Operator, I want a sorted queue with Open and Reviewed views, so that I can work through stalled orders in priority order.

#### Acceptance Criteria

1. THE Workbench SHALL show each Flagged_Order in the Queue with order ID, hours since payment, reason, and review status.
2. THE Workbench SHALL sort Flagged_Orders in each view by earliest payment timestamp first, then by order ID in natural ascending order for Flagged_Orders with identical payment timestamps.
3. THE Workbench SHALL provide an Open view and a Reviewed view of the Queue.
4. WHEN the Operator selects the Open view, THE Workbench SHALL show only Flagged_Orders whose review status is not reviewed.
5. WHEN the Operator selects the Reviewed view, THE Workbench SHALL show only Flagged_Orders whose review status is reviewed.
6. WHILE the Open view contains no Flagged_Orders, THE Workbench SHALL show the message "No stalled orders. Nothing needs review." in the Open view.
7. WHILE the Reviewed view contains no Flagged_Orders, THE Workbench SHALL show the message "No reviewed orders yet." in the Reviewed view.
8. THE Workbench SHALL show hours since payment in the Queue as whole hours rounded down, in the form "27 h".
9. THE Workbench SHALL show the reason for each Flagged_Order in the form "Paid 27 h ago, 0 of 2 units fulfilled (threshold 24 h)", using the Order's own hours, fulfilled quantity, ordered quantity, and the Threshold.
10. THE Workbench SHALL show each order ID with a "#" prefix.
11. WHEN comparing two order IDs for natural ascending order, THE Workbench SHALL compare them numerically if both consist only of digits, and SHALL compare them as text otherwise.

### Requirement 4: Show order detail

**User Story:** As an Operator, I want to see the evidence for a flagged order, so that I can verify why it was flagged.

#### Acceptance Criteria

1. WHEN the Operator selects a Flagged_Order, THE Workbench SHALL show its UTC payment timestamp, its elapsed time in the form "27 h 0 min", its fulfilled quantity against its ordered quantity, the name of the Rule that fired ("Paid and unfulfilled"), and the Suggested_Action "Confirm pick status with the warehouse."
2. WHEN the Operator selects Order #1042, THE Workbench SHALL show an elapsed time of "27 h 0 min" and a fulfilled quantity of 0 of 2 units.
3. WHEN the Operator selects a different Flagged_Order while a detail is already shown, THE Workbench SHALL replace the shown detail with that of the newly selected Order.
4. WHILE the Operator views a Flagged_Order's detail, THE Workbench SHALL leave the Order data and the Order's review status unchanged.

### Requirement 5: Record a review

**User Story:** As an Operator, I want to mark an order as reviewed and have that persist, so that the team knows it has been checked.

#### Acceptance Criteria

1. WHEN the Operator selects "Mark reviewed" on an Open Flagged_Order, THE Workbench SHALL move the Order from the Open view to the Reviewed view and record the review timestamp.
2. WHEN a review is recorded, THE Review_Store SHALL save one Review_Record keyed by the combination of order ID and Rule_ID in browser local storage, and WHERE a Review_Record with the same key already exists, THE Review_Store SHALL keep the existing Review_Record and its first review timestamp unchanged and SHALL NOT overwrite it or create a second one.
3. WHEN the Workbench reloads, THE Workbench SHALL show every Order that has a saved Review_Record and matches the Rule in the Reviewed view with its review timestamp, and SHALL NOT show it in the Open view.
4. FOR ALL Review_Records, saving then loading SHALL produce a Review_Record whose order ID, Rule_ID, and review timestamp are equal to the saved values (round-trip property).
5. IF local storage is unavailable, missing, or holds data that cannot be parsed into valid Review_Records, THEN THE Review_Store SHALL treat all Orders as not reviewed, SHALL NOT throw an unhandled error, and SHALL leave the Workbench usable with all matching Orders in the Open view.
6. WHEN the same Dataset is evaluated again, including through the Re_Run_Control, THE Workbench SHALL show exactly one row per matching order ID and Rule_ID combination, and SHALL keep each Order in the same view with the same review timestamp as before.
7. WHEN an Order no longer matches the Rule on re-evaluation, including when it is later fulfilled, THE Workbench SHALL remove the Order from both the Open view and the Reviewed view, and SHALL keep its saved Review_Record unchanged in the Review_Store indefinitely.
8. WHEN an Order with a saved Review_Record matches the Rule again, THE Workbench SHALL show the Order in the Reviewed view with its original saved review timestamp, and SHALL NOT show it in the Open view.
9. THE Workbench SHALL take the review timestamp from the real clock at the moment the Operator selects "Mark reviewed" and SHALL pass it to the Review_Store as an argument.
10. THE Workbench SHALL display a review timestamp in UTC in the form "2026-11-20 12:05 UTC".
11. WHILE an Order is in the Reviewed view, THE Workbench SHALL hide the "Mark reviewed" action for that Order.
12. IF saving a Review_Record to local storage fails, THEN THE Workbench SHALL keep the Order in the Open view, SHALL show an inline error message, and SHALL remain usable.

### Requirement 6: Skip invalid records

**User Story:** As an Operator, I want invalid records skipped and reported, so that one bad record does not hide the valid ones.

#### Acceptance Criteria

1. IF an Order has a missing payment timestamp, an unparsable payment timestamp, or a payment timestamp later than the Evaluation_Time, THEN THE Evaluator SHALL exclude the Order from evaluation, add the Order to the Skipped_Records, and record a reason that identifies which condition applied.
2. IF an Order is missing any of the seven Order fields (order ID, payment status, payment timestamp, canceled flag, refund status, ordered quantity, fulfilled quantity), THEN THE Evaluator SHALL exclude the Order from evaluation, add the Order to the Skipped_Records, and record a reason that names each missing field, and THE Evaluator SHALL NOT assume a default value for a missing canceled flag.
3. IF an Order has an ordered quantity or a fulfilled quantity that is not a non-negative whole number (including negative, fractional, non-numeric, or empty values), THEN THE Evaluator SHALL exclude the Order from evaluation, add the Order to the Skipped_Records, and record a reason that names each invalid quantity field.
4. WHEN an Order has a payment timestamp equal to the Evaluation_Time, THE Evaluator SHALL treat the payment timestamp as valid and SHALL NOT skip the Order for that timestamp.
5. WHEN an Order is skipped, THE Evaluator SHALL continue evaluating the remaining Orders, and the result for every valid Order SHALL be the same as if the skipped Order were not in the input.
6. IF an Order has more than one validation failure, THEN THE Evaluator SHALL add the Order to the Skipped_Records once and record a reason for each failure found.
7. WHEN an evaluation completes, THE Workbench SHALL show the Skipped_Summary in the header in the form "N skipped" (zero when none).
8. WHEN the Operator selects the Skipped_Summary, THE Workbench SHALL open a list showing the order ID and the recorded reason for each Skipped_Record.
9. IF an Order has a duplicate order ID, THEN THE Evaluator SHALL keep the first Order with that ID, and SHALL add each later Order with that ID to the Skipped_Records with a reason that identifies the duplicate.
10. IF an Order has a refund status that is missing or is not one of none, partial, or full, THEN THE Evaluator SHALL add the Order to the Skipped_Records with a reason that identifies the invalid refund status.
11. IF an Order has a missing payment status, THEN THE Evaluator SHALL add the Order to the Skipped_Records with a reason that identifies the missing field.
12. IF an Order fails any validation check, THEN THE Evaluator SHALL add the Order to the Skipped_Records even if its payment status is not paid.

### Requirement 7: Read-only behavior and data safety

**User Story:** As a fulfillment lead, I want the Workbench to never change order data, so that reviewing is safe.

#### Acceptance Criteria

1. WHILE the Workbench is loaded in the browser, THE Workbench SHALL make no data fetch or XHR calls after the application's own files have finished loading.
2. WHEN a review is recorded, THE Workbench SHALL write only Review_Records to browser local storage.
3. THE Workbench SHALL leave all Order data field values identical before and after any user action.
4. THE Workbench SHALL contain only synthetic Order data, with no real customer names, addresses, emails, or phone numbers, and SHALL contain no secrets in its source files or bundled data.

### Requirement 8: Structure and testing

**User Story:** As a developer, I want the rule separated from the screens and fully tested, so that behavior is verifiable.

#### Acceptance Criteria

1. THE Evaluator SHALL be a pure function that returns the same output for the same inputs, performs no reads or writes of storage, the real clock, or the DOM, and resides in a module that imports nothing from React components or storage code.
2. THE Workbench SHALL include Vitest as a dev dependency. The user has approved adding it, which overrides the "ask before adding" note in `.kiro/steering/testing.md`.
3. WHEN tests are run, THE Workbench SHALL run them with `npm test -- --run`, SHALL exit after one pass, and SHALL NOT use watch mode.
4. THE test suite SHALL contain at least one test per row of the 9-row BRD success table, each named with the text of its row. The tests SHALL include the 23h59m boundary, the exactly-24h boundary, and evaluating the same data twice.
5. THE implementation plan SHALL include at least one Vitest test for every task that adds or changes behavior.
6. THE tests SHALL pass the Evaluation_Time as an argument and SHALL NOT read the real clock (for example `Date.now()` or `new Date()` with no argument).
7. WHEN the test suite simulates a reload after "Mark reviewed" is recorded for an Order, THE test suite SHALL verify that the Order is still in the Reviewed view with its review timestamp.
8. IF local storage contains corrupt data or is unavailable, THEN THE test suite SHALL verify that the Workbench does not crash, still shows the evaluated Queue, and treats every Order as Open.
9. THE test suite SHALL pass the review timestamp to the Review_Store as an argument and SHALL verify that a second review of the same order ID and Rule_ID keeps the first review timestamp.
10. THE test suite SHALL verify that a flagged Order whose fulfilled quantity changes in the input data leaves the Queue after re-evaluation.
11. THE test suite SHALL verify that an empty Dataset produces zero Flagged_Orders, zero checked, and no error.

### Requirement 9: Accessibility

**User Story:** As an Operator who uses a keyboard or a screen reader, I want to work the queue without a mouse, so that I can review orders with assistive technology.

#### Acceptance Criteria

1. THE Workbench SHALL allow the Operator to select a Flagged_Order using the keyboard only.
2. THE Workbench SHALL allow the Operator to activate "Mark reviewed" using the keyboard only.
3. THE Workbench SHALL render the Queue as a semantic table with column headers.
4. WHEN an empty-state message is shown in the Open view or the Reviewed view, THE Workbench SHALL announce the message to screen readers.

## Decisions

- **Q1.** Payment status is compared in lowercase after trimming. Only "paid" can flag. Any other value is excluded, not skipped. A missing value is skipped.
- **Q2.** Refund status values are none, partial, full. A missing or unrecognized value is skipped as invalid.
- **Q3.** All 7 fields are required. A missing or duplicate order ID is skipped (keep the first). A missing canceled flag is skipped, not assumed false. Any record that fails validation is skipped, even if unpaid.
- **Q4.** The list shows whole hours rounded down ("27 h"). The detail shows "27 h 0 min" and the UTC payment timestamp.
- **Q5.** Records checked counts all records, with skipped shown beside it, for example "20 checked, 3 skipped".
- **Q6.** Last successful evaluation time is the fixed Evaluation_Time, shown in UTC.
- **Q7.** Reason text: "Paid 27 h ago, 0 of 2 units fulfilled (threshold 24 h)". Open empty state: "No stalled orders. Nothing needs review." Reviewed empty state: "No reviewed orders yet."
- **Q8.** The review timestamp comes from the real clock at the click, passed into the Review_Store as an argument so tests can control it. Display as "2026-11-20 12:05 UTC".
- **Q9.** Add one "Re-run evaluation" button. "Later fulfilled" is covered by automated tests with changed data only.
- **Q10.** A "N skipped" summary in the header opens a list of order ID and reason.
- **Q11.** The Threshold is a single config constant. No settings screen.
- **Q12.** Show order IDs with "#". Natural ascending order compares numerically when the ID is digits, otherwise as text.
- **Q13.** "Mark reviewed" is hidden for orders already in Reviewed.
- **Q14.** Keep stale Review_Records indefinitely.
- **Q15.** The 12 to 20 Order total includes the invalid demo records.
- **Q16.** Ignore the Stage B brief reference for Stage A.
- **Q17.** Update the Vitest line in `.kiro/steering/testing.md` after this change.
- **Q18.** If saving a review fails, the order stays Open and an inline error is shown. The app stays usable.
