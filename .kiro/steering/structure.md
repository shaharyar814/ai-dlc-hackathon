# Project Structure

## Current layout
```
fulfillment-watch/
├── .kiro/steering/        # product.md, tech.md, structure.md
├── docs/
│   └── brd-stalled-order.md   # Stage A business requirements
├── public/                # static assets (favicon.svg, icons.svg)
├── src/
│   ├── main.tsx           # React entry point
│   ├── App.tsx            # root component (still the Vite template placeholder)
│   ├── App.css, index.css
│   └── assets/            # template images (hero.png, react.svg, vite.svg)
├── index.html
├── vite.config.ts
├── tsconfig.json, tsconfig.app.json, tsconfig.node.json
├── eslint.config.js
└── package.json
```
`App.tsx` is still the template demo and should be replaced when building the feature.

## Target layout for new code
Put feature code under `src/`, keeping logic separate from screens:
```
src/
├── config.ts              # EVALUATION_TIME, DEFAULT_THRESHOLD_HOURS, RULE_ID
├── types.ts               # Order, FlaggedOrder, SkippedRecord, Review types
├── data/orders.ts         # bundled synthetic dataset
├── rules/                 # pure evaluation functions (no React, DOM, or storage)
│   └── paidUnfulfilled.ts
├── storage/reviews.ts     # local storage wrapper for review records
├── components/            # Queue, OrderDetail, SkippedList, empty states
└── App.tsx                # composes the view
```
Place tests next to the code as `*.test.ts(x)`.

## Conventions
- Files: components in `PascalCase.tsx`, other modules in `camelCase.ts`.
- One component per file. Export components only from `.tsx` files.
- Review records are keyed by `orderId` and `ruleId`.
- Product docs live in `docs/`. The Stage B brief is planned at `docs/brd-stalled-orders-aws.md` and does not exist yet.
- Do not edit `node_modules/` or `dist/`. `dist` is ignored by ESLint.
