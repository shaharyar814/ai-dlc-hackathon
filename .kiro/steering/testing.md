# Testing

- Test runner: Vitest. It is not installed yet. Ask before adding it to `package.json`.
- Run tests as a single pass: `npx vitest --run`. Never use watch mode.
- Test the rule as a pure function with the fixed evaluation time passed in. Never read the real clock in tests.
- Use synthetic data only.
- Tests live next to the code as `*.test.ts` or `*.test.tsx`.
- **Every acceptance row in the success table of `docs/brd-stalled-order.md` MUST have its own test.** This includes the 23h59m and exactly-24h boundaries, and evaluating the same data twice. Name each test after its row.
