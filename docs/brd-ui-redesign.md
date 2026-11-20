# Fulfillment Watch: UI Redesign (Stage A.1)
 
## Why
 
The queue works but is hard to use. Everything sits in one dark, narrow column, the buttons are small grey tags, nothing shows which order is most urgent, the evidence is hidden until you select a row, and the skipped records hide behind a tiny button. A fulfillment lead should see within five seconds what needs attention first, and verify why in one more click.
 
## Who it is for
 
The same fulfillment lead. They want to spot the stalled order, check the evidence, and record a review, on a laptop or a phone, without hunting for controls.
 
## In scope
 
A multi-page layout inside the existing single-page app, using hash routes:
 
- **App shell:** product name, a navigation bar (Queue, Reviewed, Data quality, Rule), and the evaluation time shown as a small status chip.
- **Queue page** (`#/` and `#/reviewed`): summary cards for Open, Reviewed, Skipped and Longest wait; Open and Reviewed tabs with counts; the queue table with an age chip, reason, status chip and a "Mark reviewed" button; clicking an order opens its page.
- **Order page** (`#/orders/:id`): a back link, the order number with its status chip, the evidence (payment time in UTC, elapsed time, units fulfilled with a small progress bar, the rule that fired), a "What to check next" box with the suggested action, and the review button or the recorded review time.
- **Data quality page** (`#/data-quality`): skipped records grouped by reason, with a count per reason and the order IDs.
- **Rule page** (`#/rule`): the rule in plain words, the threshold, and the fixed evaluation time. Read-only.
- A light visual theme with one accent color, a consistent spacing scale, and responsive layouts.
## Out of scope
 
- Any change to the rule, the evaluator, the review store, the dataset or the review behavior.
- Editing the threshold, sign-in, export, search, charts, notifications, or any write to order data.
- A component library or CSS framework.
- Anything not listed above.
## Requirements
 
1. **Routing.** WHEN the page loads with a hash route, THE SYSTEM SHALL show that page, including after a reload or a pasted link. WHEN the route is unknown, THE SYSTEM SHALL show a not-found message with a link back to the queue. THE navigation SHALL mark the current page with `aria-current="page"`.
2. **Queue page.** THE SYSTEM SHALL show the four summary cards, the Open and Reviewed tabs with counts, and the queue table with the Stage A columns and sort order. THE age chip SHALL show the hours since payment with a tier: "Late" from 24 h up to 47 h, and "Very late" from 48 h. Each tier SHALL be shown by an icon and text as well as color. THE empty states from Stage A SHALL still appear when a tab has no orders.
3. **Order page.** WHEN the operator opens a flagged order, THE SYSTEM SHALL show its evidence, the rule that fired, the suggested action "Confirm pick status with the warehouse.", and either the "Mark reviewed" button or the recorded review time. WHEN the order is not currently flagged or does not exist, THE SYSTEM SHALL say so and link back to the queue.
4. **Data quality and Rule pages.** THE SYSTEM SHALL list every skipped record with its reasons, grouped by reason with counts, and SHALL show the rule description, threshold and evaluation time.
5. **Visual standards.** THE design SHALL define its colors, spacing and type sizes once, as CSS variables in one file. Text SHALL meet a 4.5:1 contrast ratio. Every interactive control SHALL have a visible focus ring and a target at least 40 px high. Meaning SHALL never rely on color alone. At widths of 360, 768 and 1280 px, no page SHALL scroll sideways, and on narrow screens the table SHALL become stacked cards.
## Success criteria
 
- All Stage A tests still pass, and the Stage A success table still holds in the browser.
- From the queue, a lead opens #1042 and marks it reviewed in no more than three clicks, and it shows in Reviewed after a reload.
- The Playwright run saves screenshots of the queue, the order page, and the data quality page at 360, 768 and 1280 px.
- The whole app can be used by keyboard alone.
## Constraints
 
- React and TypeScript. Plain CSS with variables. Inline SVG icons.
- The only new runtime dependency is `react-router-dom`, pinned, using hash routing. Hash routes work behind this IDE's `/absproxy/5173/` path and on S3 and CloudFront without rewrite rules.
- Evaluator, Review_Store and dataset files are not changed. Existing component tests may be updated for the new markup, but not weakened.
- Synthetic data only, no secrets.
## Decisions made in this brief
 
- The age tiers are display only and are not part of the rule.
- "Reviewed" is both a tab on the queue page and its own route.
- The visual direction is light, calm and high contrast, with one blue accent.
 