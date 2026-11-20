# Order Exception Workbench: Stalled Paid Orders (Stage A)
 
## Why
 
A paid order can sit unfulfilled in the warehouse for a day, and nobody notices until a customer asks where it is. The fulfillment team then chases the order after the customer has already been let down. This queue catches those orders early and tells the team what to check first.
 
## Who it is for
 
A fulfillment lead. They want to spot a stalled order, verify why it was flagged, and record that they reviewed it, without changing the order in the commerce system.
 
User story: As a fulfillment lead, I want to see paid orders with no fulfillment after 24 hours so I can investigate delays before customers have to chase us.
 
## In scope
 
- A bundled synthetic dataset of 12 to 20 Shopify-style orders. Each record has: order ID, payment status, payment timestamp (UTC), canceled flag, refund status, ordered quantity, fulfilled quantity.
- A fixed evaluation time, so demos and tests give the same result every time.
- One rule, "Paid and unfulfilled", with the threshold in hours as a configurable value (default 24).
- One operator view: queue, order detail, Open and Reviewed lists, review recording.
- Review status saved in browser local storage.
## Out of scope
 
- Live Shopify or commercetools integration. Sample data only.
- Sign-in or user accounts. These belong to a separate Stage B brief.
- Automated refunds, customer notifications, warehouse writes, or any change to an order. The app is read-only toward order data.
- Real, customer, or sensitive data.
- A settings screen. It is optional and not required.
- Extras not listed here, such as undo, export, search, or extra filters.
- A second rule (shipments missing tracking). See Later.
## Requirements
 
1. **Load and evaluate.** WHEN the app opens, THE SYSTEM SHALL load the bundled dataset and evaluate every record against the rule at the fixed evaluation time, and SHALL show how many records were checked and the last successful evaluation time.
2. **The rule.** THE SYSTEM SHALL flag an order WHEN its payment status is paid, the time since payment is at least the threshold (default 24 hours, so exactly 24 hours is flagged), its fulfilled quantity is zero, it is not canceled, and its refund status is not a full refund. An order with any units fulfilled is outside the rule, and so is an order that is only partially refunded and otherwise matches (it stays flagged).
3. **Queue and evidence.** THE SYSTEM SHALL show flagged orders with order ID, hours since payment, reason, and review status, sorted with the oldest payment first and order ID ascending as the tie-breaker, with Open and Reviewed views and a clear empty state for each. WHEN the operator selects an order, THE SYSTEM SHALL show its payment timestamp, elapsed time, fulfilled quantity against ordered quantity, the rule that fired, and the suggested action "Confirm pick status with the warehouse." Example: #1042, paid 27 hours ago, 0 of 2 units fulfilled.
4. **Record review.** WHEN the operator selects "Mark reviewed", THE SYSTEM SHALL move the order from Open to Reviewed, record the review timestamp, and save it in local storage keyed by order ID and rule ID, so it is still there after a reload. WHEN the same dataset is evaluated again, THE SYSTEM SHALL show one row per matching order and rule and keep each order's review status. WHEN an order no longer matches the rule on re-evaluation, THE SYSTEM SHALL remove it from the queue.
5. **Invalid records.** THE SYSTEM SHALL skip a record whose payment timestamp is missing, invalid, or later than the evaluation time, or that is missing any field the rule needs, or whose quantities are not non-negative whole numbers. It SHALL show the count of skipped records with a reason for each, and SHALL keep evaluating the remaining records.
## Success criteria
 
Check each row in the browser and with an automated test.
 
| Given | Expected result |
| --- | --- |
| Paid 23 hours 59 minutes ago, zero fulfilled | Stays out of the queue |
| Paid exactly 24 hours ago, zero fulfilled | Appears in Open |
| Order #1042, paid 27 hours ago, 0 of 2 fulfilled | Appears with elapsed time, reason, and suggested action |
| Paid more than 24 hours ago, canceled or fully refunded | Stays out, even when payment status still reads paid |
| Unpaid order, or any units fulfilled | Stays out |
| Payment timestamp is invalid | Record is skipped and counted; valid orders still evaluate |
| Operator marks #1042 reviewed and reloads | #1042 remains in Reviewed with its timestamp |
| Same data evaluated twice | One row per matching order and rule |
| A flagged order is later fulfilled | It leaves the queue after re-evaluation |
 
## Constraints
 
- React and TypeScript from the Vite react-ts template. Storage is browser local storage. No backend in Stage A.
- The rule is a pure function, separate from the screens, so it can be tested on its own.
- Evaluation time is a fixed constant: `2026-11-20T12:00:00Z`. The threshold is a single config value with default 24.
- The sample dataset must include at least one record for every row of the success table, plus #1042 (paid `2026-11-19T09:00:00Z`).
- Tests use Vitest. Every success criterion has a test, including the 23h59m and exactly-24h boundaries and evaluating the same data twice.
- Synthetic data only. No secrets in the code or repo.
## Decisions made in this brief
 
Change any of these before the spec is approved.
 
- Exactly 24 hours is included (matches the acceptance table).
- A partially refunded order that otherwise matches is still flagged. Only a full refund excludes it.
- "Oldest first" means earliest payment timestamp first. Ties sort by order ID in natural ascending order.
- An order that stops matching leaves both Open and Reviewed. Its saved review is kept, so it shows as reviewed if it matches again.
- A payment timestamp equal to the evaluation time counts as valid and not future.
## Later (not part of this spec)
 
- A second rule: shipments missing tracking, with an explicit exemption for shipping methods that do not require tracking. Add it only after rule 1 and its tests are solid.
- Stage B: an AWS backend with sign-in. See `docs/brd-stalled-orders-aws.md`.
 