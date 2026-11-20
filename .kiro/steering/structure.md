# Project Structure

## Layout
```
fulfillment-watch/
├── .kiro/steering/        # product.md, tech.md, structure.md, ui-style.md
├── docs/                  # brd-stalled-order.md, brd-ui-redesign.md, brd-stalled-orders-aws.md,
│                          # aws-notes.md, cost-estimate.md, scope-verification.md, screenshots/
├── server/                # Lambda code (imports ../src/rules, ../src/data and ../src/config.ts unchanged)
│   ├── handler.ts         # Lambda entry: real clock, process.env, DynamoDB client
│   ├── handleRequest.ts   # pure router, GET /queue, POST /reviews
│   ├── claims.ts, runtimeConfig.ts, responses.ts
│   ├── reviewStore.ts, dynamoClient.ts   # ReviewStore, DynamoLike and the production adapter
│   └── properties/        # one property test per file
├── infra/                 # CDK app: bin/app.ts, lib/stack.ts, stack.test.ts (cdk.json is at the repo root)
├── scripts/               # verify-deployed-api.mjs (operator-run, needs a deployed stack)
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
│   ├── api/               # the only module that makes network calls (API mode only)
│   │   ├── config.ts, pkce.ts, auth.ts, browserAuth.ts, client.ts, wire.ts, index.ts
│   ├── storage/           # reviews.ts (unchanged local store), reviewRepository.ts (async interface),
│   │   │                  # localRepository.ts (wraps reviews.ts), apiRepository.ts (wraps src/api)
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
│       ├── Header.tsx (optional Sign out link), NavBar.tsx, QueueTabs.tsx
│       ├── LoadStatus.tsx, SignInMessage.tsx   # API-mode loading, error and sign-in screens
│       ├── SummaryCards.tsx, QueueTable.tsx
│       ├── EvidencePanel.tsx, NextCheckBox.tsx
│       ├── SkippedGroups.tsx
│       └── EmptyState.tsx
├── index.html
├── vite.config.ts
├── cdk.json               # CDK app entry (node infra/bin/app.ts)
├── tsconfig.json, tsconfig.app.json, tsconfig.node.json, tsconfig.server.json
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
- Product docs live in `docs/`. The Stage B brief is `docs/brd-stalled-orders-aws.md`.
- `src/rules`, `src/data` and `src/storage/reviews.ts` are never changed by Stage B. The Lambda imports `src/rules` and `src/data` as they are.
- `src/api` is the only place that calls `fetch`. Local mode never loads it.
- Do not edit `node_modules/` or `dist/`. `dist` is ignored by ESLint.
