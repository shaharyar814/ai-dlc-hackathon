---
inclusion: always
---
 
# UI style rules
 
Follow these for every UI change in this project. They are rules for you, not documentation.
 
- All colors, spacing, radii and type sizes MUST be CSS variables defined once in `src/styles/tokens.css`. NEVER hard-code a color or pixel value in a component stylesheet.
- Use a light theme: off-white page, white cards, one blue accent, a green for "Reviewed", an amber for "Late", a red for "Very late". NEVER add a second accent color.
- Body text MUST be at least 16 px. Text and its background MUST meet a 4.5:1 contrast ratio.
- Status and urgency MUST show an icon and a text label. NEVER rely on color alone.
- Every button and link MUST have a visible focus ring and a target at least 40 px high.
- Use semantic HTML: `nav`, `main`, `table` with `th scope`, `button` for actions, `a` for navigation. NEVER use a clickable `div`.
- Layouts MUST work at 360, 768 and 1280 px with no sideways page scroll. On narrow screens the table becomes stacked cards.
- Spacing MUST use the scale in the tokens file. Keep one page title (`h1`) per page.
- Motion MUST be minimal and MUST respect `prefers-reduced-motion`.
- NEVER add a component library or CSS framework. Icons are inline SVG.
- NEVER change `src/rules/` or `src/data/`. You may add new files under `src/storage/`, but do not change the existing `src/storage/reviews.ts`.
- After a UI change, run the app and check it in the browser with the Playwright tools. Save screenshots at 360, 768 and 1280 px under `docs/screenshots/`.
 