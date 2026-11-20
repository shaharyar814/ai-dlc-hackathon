# Product: Fulfillment Watch (Order Exception Workbench, Stage A)

Source of truth: `docs/brd-stalled-order.md`. Read it before changing behavior.

## Non-negotiable constraints
- Read-only toward the commerce system. The app never writes to, or calls, Shopify, commercetools, or any order system. Only the local review status is written, and only to browser local storage.
- Fixed evaluation time: `2026-11-20T12:00:00Z`. Never use the real clock (`Date.now()`, `new Date()`) for rule evaluation.
- Synthetic data only. No real, customer, or sensitive data anywhere in code, fixtures, or docs.

## Purpose
Catch paid orders that sit unfulfilled for 24 hours or more, so a fulfillment lead can investigate before customers chase. The user views the queue, checks why an order was flagged, and records that they reviewed it.

## Scope (Stage A)
- Bundled synthetic dataset of 12 to 20 Shopify-style orders (order ID, payment status, payment timestamp in UTC, canceled flag, refund status, ordered quantity, fulfilled quantity).
- One rule, "Paid and unfulfilled". The threshold in hours is a single config value, default 24.
- One operator view: queue, order detail, Open and Reviewed lists, "Mark reviewed".
- Review status persists in browser local storage, keyed by order ID and rule ID.

## Out of scope
- Live Shopify or commercetools integration.
- Sign-in and user accounts (Stage B).
- Any write to order data: refunds, notifications, warehouse writes. The app is read-only toward orders.
- Real, customer, or sensitive data. Synthetic data only.
- Undo, export, search, extra filters, a second rule, a required settings screen.

## Business rules
- Flag an order when: paid, hours since payment >= threshold (exactly 24h is flagged), fulfilled quantity is 0, not canceled, refund status is not a full refund.
- Partial refund with otherwise matching fields stays flagged.
- Any fulfilled units, canceled, fully refunded, or unpaid orders are not flagged.
- Sort: earliest payment first, then order ID ascending (natural order).
- Invalid records (missing or invalid payment timestamp, timestamp after evaluation time, missing needed field, quantities that are not non-negative integers) are skipped and counted with a reason each. Evaluation continues.
- A payment timestamp equal to the evaluation time is valid.
- An order that stops matching leaves Open and Reviewed. Its saved review is kept in case it matches again.
- Re-evaluating the same data yields one row per matching order and rule.
- Detail view shows: payment timestamp, elapsed time, fulfilled vs ordered quantity, the rule that fired, and the suggested action "Confirm pick status with the warehouse."
- Header shows the number of records checked and the last successful evaluation time.
- Both Open and Reviewed lists need a clear empty state.

## Fixed values
- Evaluation time: `2026-11-20T12:00:00Z` (a constant, so demos and tests are deterministic).
- Sample data must cover every row of the success table in the BRD, plus order #1042 (paid `2026-11-19T09:00:00Z`).
