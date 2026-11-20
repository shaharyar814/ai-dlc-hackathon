# Requirements Document

## Introduction

This feature (Stage A.1) redesigns the Fulfillment Watch user interface. The Workbench moves from one dark, narrow column to a light, multi-page layout inside the existing single-page app, using hash routes. A fulfillment lead should see within five seconds which order needs attention first, and verify why in one more click.

The redesign adds an app shell, a Queue page, an Order page, a Data quality page, and a Rule page. It changes presentation and navigation only. The Rule, the Evaluator, the Review_Store and the Dataset are unchanged, and all Stage A behavior continues to hold.

Source of truth: `docs/brd-ui-redesign.md`. Binding steering: `.kiro/steering/ui-style.md` and `.kiro/steering/product.md`. Stage A behavior is defined in `.kiro/specs/stalled-orders/requirements.md`.

Decisions approved for gaps in the BRD are written into the acceptance criteria and listed under "Decisions" at the end of this document.

## Glossary

- **Workbench**: The Fulfillment Watch single-page React application.
- **Shell**: The part of the Workbench shown on every page: product name, Navigation_Bar, Evaluation_Chip and Checked_Count.
- **Navigation_Bar**: The `nav` element in the Shell with the items Queue, Reviewed, Data quality and Rule.
- **Evaluation_Chip**: The small status chip in the Shell that shows the Evaluation_Time in UTC.
- **Checked_Count**: The Stage A count of records checked, shown in the Shell next to the Evaluation_Chip in the form "20 checked, 3 skipped".
- **Router**: The hash-based routing layer, implemented with `react-router-dom`.
- **Route**: A hash path handled by the Router. The Routes are `#/`, `#/reviewed`, `#/orders/:id`, `#/data-quality` and `#/rule`.
- **Queue_Page**: The page at `#/` and `#/reviewed`.
- **Order_Page**: The page at `#/orders/:id`.
- **Data_Quality_Page**: The page at `#/data-quality`.
- **Rule_Page**: The page at `#/rule`.
- **Not_Found_Page**: The page shown for an unknown Route.
- **Summary_Card**: One of the four cards on the Queue_Page: Open, Reviewed, Skipped and Longest wait.
- **Queue_Tabs**: The Open tab and the Reviewed tab on the Queue_Page, each showing a count.
- **Queue_Table**: The table of Flagged_Orders on the Queue_Page.
- **Age_Chip**: The chip that shows the whole hours since payment of a Flagged_Order and its Age_Tier.
- **Age_Tier**: A display-only classification of a Flagged_Order: "Late" for 24 h up to under 48 h, and "Very late" for 48 h or more. The Age_Tier is not part of the Rule.
- **Status_Chip**: The chip that shows whether a Flagged_Order is Open or Reviewed, with an icon and a text label.
- **Evidence_Panel**: The part of the Order_Page that shows the payment timestamp, elapsed time, fulfilled units with a progress bar, and the Rule that fired.
- **Next_Check_Box**: The "What to check next" box on the Order_Page that shows the Suggested_Action.
- **Skipped_Group**: A group on the Data_Quality_Page for one skip reason, with a count and the order IDs.
- **Token_File**: The file `src/styles/tokens.css`, which defines all colors, spacing, radii and type sizes as CSS variables.
- **Evaluator, Order, Dataset, Rule, Rule_ID, Evaluation_Time, Threshold, Flagged_Order, Skipped_Record, Review_Record, Review_Store, Operator, Suggested_Action, Re_Run_Control**: As defined in the Stage A requirements, and unchanged here.

## Requirements

### Requirement 1: Hash routing

**User Story:** As an Operator, I want each page to have its own link, so that a reload or a pasted link shows the same page.

#### Acceptance Criteria

1. THE Router SHALL use hash routing with exactly these Routes: `#/`, `#/reviewed`, `#/orders/:id`, `#/data-quality` and `#/rule`, where `:id` is one non-empty path segment containing no `/` character.
2. WHEN the Workbench loads with a known hash Route, THE Workbench SHALL show the page for that Route and SHALL keep the hash in the address bar unchanged.
3. WHEN the Operator reloads the browser or opens a pasted link to a known hash Route, THE Workbench SHALL show the same page that was shown for that Route before the reload or paste.
4. WHEN the browser URL has no hash or an empty hash, THE Workbench SHALL show the page for `#/`.
5. IF the hash Route is unknown, THEN THE Workbench SHALL show the Not_Found_Page with a message that the page does not exist and a link to `#/`, and SHALL keep the unknown hash in the address bar.
6. WHEN the Operator activates the link to `#/` on the Not_Found_Page, THE Workbench SHALL show the page for `#/`.
7. THE Workbench SHALL add `react-router-dom` as its only new runtime dependency, pinned to an exact version with no `^` or `~` range prefix in `package.json`.

### Requirement 2: App shell and navigation

**User Story:** As an Operator, I want a consistent header and navigation on every page, so that I can move between pages and see the evaluation context.

#### Acceptance Criteria

1. THE Shell SHALL show the product name "Fulfillment Watch" in the header on every Route, including `#/orders/:id` and unknown Routes.
2. THE Navigation_Bar SHALL contain exactly four items in this order: Queue, Reviewed, Data quality and Rule, each as a link, inside a single `nav` element.
3. THE Navigation_Bar SHALL link Queue to `#/`, Reviewed to `#/reviewed`, Data quality to `#/data-quality` and Rule to `#/rule`.
4. WHILE the current Route is `#/`, `#/reviewed`, `#/data-quality` or `#/rule`, THE Navigation_Bar SHALL set `aria-current="page"` on the item for that Route and on no other item.
5. WHILE the current Route is `#/orders/:id` or an unknown Route, THE Navigation_Bar SHALL set `aria-current="page"` on no item.
6. THE Shell SHALL show the Evaluation_Chip with the Evaluation_Time formatted in UTC, and the Checked_Count immediately after it in the same header, on every Route.
7. WHILE the Navigation_Bar items do not fit on one line, THE Navigation_Bar SHALL wrap its items onto additional lines, with all four items visible and no horizontal page scrolling.
8. THE Shell SHALL keep the Re_Run_Control visible and operable in the header on every Route, with the behavior defined in the Stage A requirements.

### Requirement 3: Focus and document title on route change

**User Story:** As an Operator using a keyboard or screen reader, I want focus and the page title to follow navigation, so that I know which page I am on.

#### Acceptance Criteria

1. THE Workbench SHALL render exactly one `h1` element in the DOM on each page, and that `h1` SHALL contain non-empty text that names the page.
2. WHEN the Route changes to a different Route, THE Workbench SHALL move keyboard focus to the `h1` of the new page, so that `document.activeElement` is that `h1`.
3. WHEN the Route changes to a different Route, THE Workbench SHALL set `document.title` to the format "<page name> - Fulfillment Watch", where <page name> equals the text of the new page's `h1`.
4. WHEN the Workbench loads, THE Workbench SHALL set `document.title` to the format "<page name> - Fulfillment Watch", where <page name> equals the text of the loaded page's `h1`, and SHALL NOT move keyboard focus.
5. IF the Route changes to a path that matches no page, THEN THE Workbench SHALL render the Not_Found_Page with exactly one `h1`, move focus to that `h1`, and set `document.title` to the format "<page name> - Fulfillment Watch".
6. WHEN the Route changes and the new Route equals the current Route, THE Workbench SHALL leave `document.title` unchanged and SHALL NOT move keyboard focus.

### Requirement 4: Queue page summary cards

**User Story:** As an Operator, I want summary cards at the top of the queue, so that I see the state of the queue at a glance.

#### Acceptance Criteria

1. THE Queue_Page SHALL show exactly four Summary_Cards above the Queue_Table, in this order from left to right: Open, Reviewed, Skipped and Longest wait, each labeled with that exact text.
2. THE Open Summary_Card SHALL show the count of Flagged_Orders that are not reviewed, as a whole number.
3. THE Reviewed Summary_Card SHALL show the count of Flagged_Orders that are reviewed, as a whole number.
4. THE Skipped Summary_Card SHALL show the count of Skipped_Records, as a whole number.
5. WHILE there is at least one Open Flagged_Order, THE Longest wait Summary_Card SHALL show the greatest number of whole hours (rounded down) since payment among Open Flagged_Orders, formatted as the number followed by a space and "h" (for example "52 h").
6. IF there are no Open Flagged_Orders, THEN THE Longest wait Summary_Card SHALL show an em dash ("—") in place of a duration.
7. WHEN the Operator marks a Flagged_Order as reviewed, THE Queue_Page SHALL update the Open, Reviewed and Longest wait Summary_Cards to match the new state without a page reload, with the Open count decreasing by 1 and the Reviewed count increasing by 1.

### Requirement 5: Queue tabs

**User Story:** As an Operator, I want Open and Reviewed tabs with counts, so that I can switch between orders that need review and orders already reviewed.

#### Acceptance Criteria

1. THE Queue_Page SHALL show the Queue_Tabs with the labels "Open" and "Reviewed", each followed by its count, equal to the number of Flagged_Orders in that tab's state.
2. THE Open tab SHALL be a link to `#/`, and THE Reviewed tab SHALL be a link to `#/reviewed`.
3. WHEN the current Route is `#/`, THE Queue_Page SHALL show only Open Flagged_Orders in the Queue_Table, SHALL mark the Open tab as current with `aria-current="page"`, and SHALL NOT set `aria-current` on the Reviewed tab.
4. WHEN the current Route is `#/reviewed`, THE Queue_Page SHALL show only reviewed Flagged_Orders in the Queue_Table, SHALL mark the Reviewed tab as current with `aria-current="page"`, and SHALL NOT set `aria-current` on the Open tab.
5. THE Reviewed item in the Navigation_Bar and the Reviewed tab SHALL link to the same Route `#/reviewed`.
6. WHEN an Operator marks a Flagged_Order as reviewed, THE Queue_Page SHALL decrease the Open count by 1 and increase the Reviewed count by 1 without a page reload.
7. WHILE the Open Queue_Table contains no Flagged_Orders, THE Queue_Page SHALL show the Stage A message "No stalled orders. Nothing needs review.", announced to screen readers.
8. WHILE the Reviewed Queue_Table contains no Flagged_Orders, THE Queue_Page SHALL show the Stage A message "No reviewed orders yet.", announced to screen readers.

### Requirement 6: Queue table and Age_Chip

**User Story:** As an Operator, I want the most urgent order to stand out in the table, so that I know what to check first.

#### Acceptance Criteria

1. THE Queue_Table SHALL show one row per Flagged_Order in the current view, with these columns in this left-to-right order: order ID with a "#" prefix (for example "#1042"), hours since payment (shown by the Age_Chip), reason, review status (shown by the Status_Chip), and a "Mark reviewed" button.
2. THE Queue_Table SHALL order rows by earliest payment timestamp first, then by order ID in natural ascending order for Flagged_Orders with identical payment timestamps.
3. THE Queue_Table SHALL show the order ID of each Flagged_Order as a link whose target is `#/orders/:id`, where `:id` is that Flagged_Order's own order ID.
4. THE Age_Chip SHALL show the hours since payment rounded down to whole hours, in the form "27 h".
5. WHEN a Flagged_Order has at least 24 and at most 47 whole hours since payment, THE Age_Chip SHALL show the Age_Tier "Late" as an icon plus the text "Late".
6. WHEN a Flagged_Order has 48 or more whole hours since payment, THE Age_Chip SHALL show the Age_Tier "Very late" as an icon plus the text "Very late".
7. THE Queue_Table SHALL show the Status_Chip for each Flagged_Order as an icon plus a text label of either "Open" or "Reviewed", matching that order's review status.
8. THE Queue_Table SHALL be built from a `table` element in which every `th` element has a `scope` attribute.
9. WHILE the Queue_Table has zero rows for the current view, THE Queue_Page SHALL show the empty-state message defined in Requirement 5 and no data rows.

### Requirement 7: Mark reviewed from the queue

**User Story:** As an Operator, I want to mark an order reviewed straight from the queue, so that I can work through the list quickly.

#### Acceptance Criteria

1. WHILE a Flagged_Order is Open, THE Queue_Table SHALL show exactly one "Mark reviewed" `button` in that order's row, and SHALL show no "Mark reviewed" `button` in the row of any Flagged_Order that is not Open.
2. WHEN the Operator activates the "Mark reviewed" button by mouse click, or by the Enter or Space key while the button has keyboard focus, THE Workbench SHALL record the review using the Stage A review behavior without showing a confirmation step.
3. WHEN a review is recorded, THE Workbench SHALL move the Flagged_Order from the Open Queue_Table to the Reviewed Queue_Table, and SHALL leave every other Flagged_Order in its current table.
4. WHILE a Flagged_Order is reviewed, THE Queue_Table SHALL hide the "Mark reviewed" button for that order.
5. IF saving a Review_Record fails, THEN THE Workbench SHALL keep the Flagged_Order in the Open Queue_Table, SHALL keep the "Mark reviewed" button visible and enabled in that row, and SHALL show the Stage A inline error message "Could not save the review. The order stays open.".
6. WHEN the Operator reloads the Workbench after marking Order #1042 reviewed, THE Workbench SHALL show Order #1042 in the Reviewed Queue_Table and SHALL NOT show it in the Open Queue_Table.
7. WHEN the Operator starts on the Queue_Page, THE Workbench SHALL allow the Operator to open Order #1042 and mark it reviewed in no more than three clicks.

### Requirement 8: Order page

**User Story:** As an Operator, I want an order page with the evidence and the next step, so that I can verify why an order was flagged and record my review.

#### Acceptance Criteria

1. WHEN the Route is `#/orders/:id` and the order is a Flagged_Order, THE Order_Page SHALL show a back link to `#/`, and an `h1` containing the order ID prefixed with "#" (for example "#1042"), displayed next to its Status_Chip.
2. WHEN the order is a Flagged_Order, THE Evidence_Panel SHALL show the payment timestamp in UTC in the form "YYYY-MM-DD HH:mm UTC", the elapsed time since payment in the form "N h M min" (N is whole hours, M is whole minutes from 0 to 59), the fulfilled units against the ordered units in the form "X of Y units fulfilled" with a progress bar whose filled proportion equals X divided by Y, and the Rule name "Paid and unfulfilled".
3. WHEN the order is a Flagged_Order, THE Next_Check_Box SHALL show the heading "What to check next" and the Suggested_Action "Confirm pick status with the warehouse.".
4. WHILE the Flagged_Order is Open, THE Order_Page SHALL show a "Mark reviewed" button.
5. WHILE the Flagged_Order is reviewed, THE Order_Page SHALL show the recorded review time in UTC in the form "2026-11-20 12:05 UTC" and SHALL hide the "Mark reviewed" button, including after the page is reloaded.
6. WHEN the Operator activates the "Mark reviewed" button on the Order_Page, THE Workbench SHALL record the review using the Stage A review behavior without a page reload, show the recorded review time, and hide the "Mark reviewed" button.
7. IF saving a Review_Record fails on the Order_Page, THEN THE Order_Page SHALL keep the order Open, keep the "Mark reviewed" button visible, and show the Stage A inline error message "Could not save the review. The order stays open.".
8. IF the order is not currently flagged, does not exist, or is the ID of a Skipped_Record, THEN THE Order_Page SHALL show exactly one message stating that the order is not currently flagged or was not found, and a link to `#/`, and SHALL NOT show the Evidence_Panel, the Next_Check_Box, or the "Mark reviewed" button.
9. WHEN the Operator opens the Order_Page for Order #1042, THE Evidence_Panel SHALL show a payment timestamp of 2026-11-19 09:00 UTC, an elapsed time of "27 h 0 min", and "0 of 2 units fulfilled" with an empty progress bar.
10. WHILE the Operator views the Order_Page, THE Workbench SHALL leave Order data unchanged and SHALL write only Review_Records to browser local storage.

### Requirement 9: Data quality page

**User Story:** As an Operator, I want to see every skipped record grouped by reason, so that I can tell which data needs fixing.

#### Acceptance Criteria

1. WHEN the Data_Quality_Page is displayed, THE Data_Quality_Page SHALL list every Skipped_Record in one Skipped_Group for each distinct reason that the record has, and SHALL show no Skipped_Group that contains zero Skipped_Records.
2. WHEN a Skipped_Record has more than one reason, THE Data_Quality_Page SHALL show that record once in every Skipped_Group for its reasons.
3. THE Data_Quality_Page SHALL show, for each Skipped_Group, the reason text, the count of Skipped_Records in the group as a whole number, and the order IDs of those records, with the count equal to the number of records listed in that group.
4. IF a Skipped_Record has an order ID that is missing or an empty string, THEN THE Data_Quality_Page SHALL show the text "(no ID)" in place of the order ID for that record, and SHALL still count the record in its Skipped_Group.
5. WHEN an order ID appears in both the Queue_Table and a Skipped_Group, such as the duplicate order ID 1043, THE Data_Quality_Page SHALL show that order ID in the Skipped_Group, and THE Queue_Table SHALL continue to show the same order ID.
6. IF there are no Skipped_Records, THEN THE Data_Quality_Page SHALL show an empty-state message that no records were skipped, and SHALL show no Skipped_Group.
7. THE Data_Quality_Page SHALL show each reason text exactly as recorded by the Evaluator, without rewording, truncation or changed capitalization.
8. WHEN two or more Skipped_Records share the same order ID within one Skipped_Group, THE Data_Quality_Page SHALL list each of those records separately, so that the group count equals the number of Skipped_Records.

### Requirement 10: Rule page

**User Story:** As an Operator, I want to read the rule in plain words, so that I understand what the Workbench flags.

#### Acceptance Criteria

1. THE Rule_Page SHALL show the Rule name "Paid and unfulfilled" and a plain-language description of the Rule, written without field names, code identifiers or operators.
2. THE Rule_Page description SHALL state that an order is flagged only when all of the following are true: it is paid, it was paid at least the Threshold number of hours before the Evaluation_Time, it has no fulfilled units, it is not canceled, and it is not fully refunded.
3. THE Rule_Page description SHALL state that a partial refund does not stop an order from being flagged.
4. THE Rule_Page SHALL show the Threshold as a whole number followed by the unit "hours", read from the configuration constant.
5. THE Rule_Page SHALL show the fixed Evaluation_Time `2026-11-20T12:00:00Z` labeled as UTC.
6. THE Rule_Page SHALL be read-only and SHALL contain no input field, button or other control that changes the Threshold or the Rule.
7. THE Rule_Page description wording SHALL be drafted from the business rules in `.kiro/steering/product.md`, and the user SHALL review and approve the wording before release.

### Requirement 11: Design tokens and visual theme

**User Story:** As a developer, I want all visual values defined once, so that the theme is consistent and easy to maintain.

#### Acceptance Criteria

1. THE Workbench SHALL define every color, spacing value, border radius and font size used in any stylesheet as a CSS variable in the Token_File.
2. THE Workbench SHALL contain no hard-coded color value (hex, rgb, hsl or named color) and no hard-coded pixel value in any component stylesheet, with all such values referenced through CSS variables from the Token_File.
3. THE Workbench SHALL render the page background in an off-white color and every card background in white.
4. THE Workbench SHALL use exactly one blue accent color for interactive and highlighted elements, one green for the "Reviewed" status, one amber for the "Late" status, one red for the "Very late" status, and no other accent color.
5. THE Workbench SHALL use only spacing values that are defined in the spacing scale in the Token_File.
6. THE Workbench SHALL set the computed font size of body text to 16 px or larger.
7. THE Workbench SHALL give every text element a contrast ratio of at least 4.5:1 against its background color.
8. THE Workbench SHALL be styled using only plain CSS with CSS variables and inline SVG icons, and SHALL include no component library and no CSS framework in its dependencies.
9. THE Workbench SHALL keep animation and transitions minimal.
10. WHERE the user's system has the reduced-motion preference enabled, THE Workbench SHALL disable all non-essential animations and transitions.

### Requirement 12: Accessibility and semantics

**User Story:** As an Operator who uses a keyboard or assistive technology, I want every control to be reachable and clear, so that I can use the whole Workbench without a mouse.

#### Acceptance Criteria

1. THE Workbench SHALL allow every function available by mouse, including navigation, tab switching, opening an order link, and activating a "Mark reviewed" button, to be completed using the keyboard alone.
2. WHEN an Operator presses Tab or Shift+Tab, THE Workbench SHALL move focus to the next or previous interactive element in the visual reading order, and SHALL NOT trap focus on any element.
3. WHEN a button or link receives keyboard focus, THE Workbench SHALL show a visible focus ring around it.
4. THE Workbench SHALL render every button and link with a target at least 40 px high.
5. WHEN a button has keyboard focus and the Operator presses Enter or Space, THE Workbench SHALL activate the button. WHEN a link has keyboard focus and the Operator presses Enter, THE Workbench SHALL follow the link.
6. THE Workbench SHALL show each status (Open, Reviewed) and each urgency (Late, Very late) with both an icon and a text label, and SHALL NOT rely on color alone to distinguish any two of these four values.
7. THE Workbench SHALL use `nav` for navigation, `main` for primary content, `table` for the queue, `th` with a `scope` attribute for every header cell, `button` for actions, and `a` for navigation to another view, and SHALL NOT attach click handlers to a `div` or `span` in place of a `button` or `a`.
8. THE Workbench SHALL mark every inline SVG icon with `aria-hidden="true"` when an adjacent text label conveys its meaning, and SHALL give any inline SVG icon that has no adjacent text label a text alternative that states its meaning.

### Requirement 13: Responsive layout

**User Story:** As an Operator on a laptop or a phone, I want the layout to fit my screen, so that I never scroll sideways.

#### Acceptance Criteria

1. WHEN the viewport width is 360 px, 768 px or 1280 px, THE Workbench SHALL show every page with no horizontal page scroll, so that the document scroll width is less than or equal to the viewport width.
2. WHILE the viewport is narrow, THE Queue_Table SHALL show each row as a stacked card that contains every field and every control that the table row shows on a wide screen.
3. WHILE the viewport is wide, THE Queue_Table SHALL show its rows in table layout.
4. WHILE the viewport is narrow, THE Navigation_Bar SHALL wrap its items onto additional lines, so that every item is fully visible and the Navigation_Bar has no horizontal scroll.
5. IF a Queue_Table row contains a value wider than its container, THEN THE Workbench SHALL wrap that value inside its container, so that no horizontal page scroll appears.

### Requirement 14: Stage A preservation and change limits

**User Story:** As a maintainer, I want the redesign to change only the UI, so that rule, storage and data behavior stay correct.

#### Acceptance Criteria

1. THE redesign SHALL make no change to any file in `src/rules/`, `src/storage/` or `src/data/`, so that a diff of those three directories against the Stage A baseline is empty.
2. THE redesign SHALL NOT change the Rule, the Evaluator, the Review_Store, the Dataset or the review behavior, so that for every order in the Dataset the Evaluator returns the same result as in Stage A.
3. THE Workbench SHALL make no write to order data and no data fetch or XHR call after its own files have loaded.
4. THE Workbench SHALL keep the Stage A sort order, the Stage A empty-state messages, the Stage A review semantics and the Evaluation_Time unchanged, so that the same input Dataset produces the same row order, message text, review states and Evaluation_Time value as in Stage A.
5. WHEN the Workbench loads in the browser with the Stage A Dataset, THE Workbench SHALL show the same Flagged_Orders and the same Skipped_Records as in the Stage A success table.
6. WHEN the test suite runs with `npm test -- --run`, THE existing Stage A tests SHALL all pass.
7. IF an existing component test is updated for new markup, THEN THE updated test SHALL keep every behavior assertion of the original test, and the number of assertions SHALL be greater than or equal to the original number.
8. THE redesign SHALL add no editing of the Threshold, sign-in, export, search, charts, notifications or any other feature outside this document.
9. THE Workbench SHALL contain only synthetic data, and no secret, credential or token SHALL appear in any committed file.

### Requirement 15: Browser verification and screenshots

**User Story:** As a reviewer, I want browser evidence that the redesign works at three widths, so that I can trust the responsive and visual claims.

#### Acceptance Criteria

1. WHEN a UI change is complete, THE verification run SHALL start the Workbench, load the Queue_Page, the Order_Page for Order #1042 and the Data_Quality_Page in a browser using the Playwright tools, and confirm that each page renders with no uncaught errors in the browser console.
2. THE verification run SHALL set the browser viewport width to each of 360, 768 and 1280 px, and SHALL save one screenshot for each combination of the Queue_Page, the Order_Page for Order #1042 and the Data_Quality_Page with each width, nine screenshots in total.
3. THE verification run SHALL name each screenshot `<page>-<width>.png`, where `<page>` is one of `queue`, `order` or `data-quality` and `<width>` is one of `360`, `768` or `1280`, and SHALL save it under `docs/screenshots/`.
4. WHEN a page is loaded at a viewport width of 360, 768 or 1280 px, THE verification run SHALL confirm that the document's horizontal scroll width is less than or equal to its viewport width for each of the three pages.
5. WHEN the verification run starts from the Queue_Page with no pointer input, THE verification run SHALL confirm that the Operator can use only the keyboard (Tab, Shift+Tab, Enter, Space) to navigate to the Order_Page for Order #1042, activate "Mark reviewed", and see Order #1042 shown as reviewed, with a visible focus indicator on every control that receives focus.
6. IF a screenshot cannot be saved, a page shows horizontal overflow at any of the three widths, or any step of the keyboard-only flow cannot be completed, THEN THE verification run SHALL report the failing page, width or step, and SHALL mark the verification as failed.

## Decisions

- **D1.** Age chip hours are rounded down. "Late" is 24 h up to under 48 h. "Very late" is 48 h or more. Each shows an icon and text. The tiers are display only.
- **D2.** The Longest wait card covers Open orders only, is shown in hours, and shows an em dash when there are no Open orders.
- **D3.** A skipped record appears under every reason it has. A record with no order ID shows as "(no ID)". The Data quality page has an empty state. An order ID can appear in both the queue and Data quality.
- **D4.** The Order page uses one message for "not currently flagged" and "does not exist", including skipped IDs, with a link back to the queue.
- **D5.** The queue tabs are links that change the route. The Reviewed nav item and the Reviewed tab are the same route.
- **D6.** The Stage A "records checked" count stays in the Shell next to the Evaluation_Chip.
- **D7.** The Rule page wording is drafted from `product.md` business rules and the user reviews it.
- **D8.** Screenshots are named `<page>-<width>.png` under `docs/screenshots/`, for queue, order (Order #1042) and data quality, at 360, 768 and 1280 px.
- **D9.** On route change, focus moves to the page `h1` and `document.title` is set. The nav wraps on narrow screens. The row "Mark reviewed" button acts immediately with no confirmation.
