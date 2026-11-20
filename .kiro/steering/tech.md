# Tech Stack and Conventions

## Stack
- React 19 and TypeScript (~6.0) on Vite 8, from the `react-ts` template. ESM (`"type": "module"`).
- `@vitejs/plugin-react` for JSX.
- Storage: browser local storage in Stage A local mode. In API mode (build-time `VITE_API_URL` set), reviews live in DynamoDB behind an HTTP API. Stage A stays working when `VITE_API_URL` is empty.
- Tests: Vitest is installed. Four more dev dependencies were approved and installed with it: `fast-check` (property tests), `jsdom`, `@testing-library/react`, and `@testing-library/user-event` (component tests). Ask before adding any other dependency.
- Lint: ESLint 10 flat config with `typescript-eslint` recommended, `react-hooks`, and `react-refresh`.

## Commands
- `npm run dev`: start the dev server on port 5173. Run it manually in a terminal.
- `npm run build`: `tsc -b && vite build`.
- `npm run lint`: `eslint .`.
- `npm run preview`: serve the built app.
- `npm test -- --run`: run the tests once (not watch mode).

## Vite config notes (`vite.config.ts`)
- `base` is `/absproxy/5173/` because the IDE proxy serves the app under that prefix. Reference public assets with that base in mind.
- `server.allowedHosts` is restricted to the IDE's CloudFront host. `hmr` uses `wss` on client port 443. Do not loosen these without a reason.

## TypeScript settings (`tsconfig.app.json`)
- `verbatimModuleSyntax`: use `import type` for type-only imports.
- `erasableSyntaxOnly`: no enums, namespaces, or constructor parameter properties. Use union types and `as const` objects.
- `noUnusedLocals` and `noUnusedParameters` are on.
- `allowImportingTsExtensions` is on, `moduleResolution` is `bundler`, `jsx` is `react-jsx`.

## Coding rules
- The rule evaluation is a pure function with no React, DOM, or storage access. Pass the evaluation time and threshold in as arguments so tests can run it directly.
- Keep the evaluation time constant (`2026-11-20T12:00:00Z`) and the threshold (default 24) in one config module. Never call `Date.now()` in rule logic.
- Parse timestamps as UTC. Treat an unparsable date as an invalid record.
- Wrap local storage reads and writes in a small module. Handle missing, corrupt, or unavailable storage without crashing.
- Keep the app read-only toward order data. Network calls are allowed only in API mode, and only through the single `src/api` module. Local mode makes no network calls.
- Use synthetic data only. No secrets, tokens, or real customer data in code or the repo.
- Follow ESLint rules. Components in `.tsx` files should export only components (react-refresh).
- Use function components and hooks. No class components.

## Testing expectations
- Every success criterion in `docs/brd-stalled-order.md` has a test, including the 23h59m and exactly-24h boundaries and evaluating the same data twice.
- Test the pure rule function directly. Test persistence of review status across a reload.
