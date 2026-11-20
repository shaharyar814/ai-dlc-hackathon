# Project Structure

## Layout
```
fulfillment-watch/
├── .kiro/steering/        # product.md, tech.md, structure.md, ui-style.md
├── docs/                  # brd-stalled-order.md, brd-ui-redesign.md, screenshots/
├── public/                # static assets (favicon.svg, icons.svg)
├── src/
│   ├── main.tsx           # React entry point
│   ├── App.tsx            # root: provider, routing, page composition
│   ├── App.css, index.css
│   ├── config.ts          # EVALUATION_TIME, DEFAULT_THRESHOLD_HOURS, RULE_ID
│   ├── types.ts           # Order, FlaggedOrder, SkippedRecord, Review types
│   ├── format.ts          # display formatting helpers
│   ├── assets/            # template images (hero.png, react.svg, vite.svg)
│   ├── data/orders.ts     # bundled synthetic dataset
│   ├── rules/             # pure evaluation functions (no React, DOM, or storage)
│   │   ├── paidUnfulfilled.ts, queue.ts, timestamps.ts, validateOrder.ts
│   ├── storage/reviews.ts # local storage wrapper for review records
│   ├── pages/             # route-level screens
│   │   ├── QueuePage.tsx, OrderPage.tsx (+ OrderPage.css), RulePage.tsx,
│   │   │   DataQualityPage.tsx, NotFoundPage.tsx
│   ├── view/              # pure view-model helpers (no React)
│   │   ├── age.ts, progress.ts, routes.ts, skipped.ts, summary.ts, title.ts
│   ├── state/             # shared workbench state
│   │   ├── WorkbenchProvider.tsx   # context provider
│   │   └── workbenchContext.ts     # context definition and hook types
│   ├── hooks/
│   │   └── useRouteEffects.ts      # route-driven side effects
│   ├── styles/
│   │   └── tokens.css     # design tokens (see ui-style.md)
│   └── components/        # shared UI pieces
│       ├── AgeChip.tsx, StatusChip.tsx, Icon.tsx
│       ├── Header.tsx, NavBar.tsx, QueueTabs.tsx
│       ├── SummaryCards.tsx, QueueTable.tsx
│       ├── EvidencePanel.tsx, NextCheckBox.tsx
│       ├── SkippedGroups.tsx
│       └── EmptyState.tsx
├── index.html
├── vite.config.ts
├── tsconfig.json, tsconfig.app.json, tsconfig.node.json
├── eslint.config.js
└── package.json
```
Tests sit next to the code as `*.test.ts(x)`.

## Removed components
`OrderDetail` and `SkippedList` no longer exist. `OrderPage` and `EvidencePanel` replace the order detail, and `SkippedGroups` (used by `DataQualityPage`) replaces the skipped list.

## Conventions
- Files: components in `PascalCase.tsx`, other modules in `camelCase.ts`.
- One component per file. Export components only from `.tsx` files.
- Keep logic out of components: pure rules in `rules/`, pure view-model code in `view/`, shared state in `state/`.
- Review records are keyed by `orderId` and `ruleId`.
- Product docs live in `docs/`. The Stage B brief is planned at `docs/brd-stalled-orders-aws.md` and does not exist yet.
- Do not edit `node_modules/` or `dist/`. `dist` is ignored by ESLint.
