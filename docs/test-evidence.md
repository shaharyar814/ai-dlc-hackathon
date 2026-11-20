# Test evidence

All results on this page come from runs on 2026-11-20 on branch `feature/aws-backend`. Anything we did not run is marked "not verified".

## Automated tests

Command: `npm test -- --run` (Vitest 5.1.1, a single run, not watch mode).

| Run | Test files | Tests | Failed | Skipped |
| --- | --- | --- | --- | --- |
| Stage A baseline, before Stage B work (`main` at `6540c67`) | 25 | 238 | 0 | 0 |
| Final, on `feature/aws-backend` and on `main` after the merge | 55 | 443 | 0 | 0 |

Tests by area, from the final run:

| Area | Files | Tests |
| --- | --- | --- |
| `src/rules` (pure rule, unchanged from Stage A) | 5 | 78 |
| `src/api` (mode, PKCE, auth, client, wire format) | 6 | 32 |
| `src/storage` (local store, repositories, Local vs Lambda store property) | 3 | 25 |
| `src/state` (provider in both modes) | 1 | 12 |
| `src/components`, `src/pages`, `src/view`, `src/hooks`, `src/styles`, `src/data` | 13 | 77 |
| `src/App*.test.tsx` (Local mode, routing, properties, API mode) | 4 | 67 |
| `src/config`, `src/format`, `src/semantics` | 3 | 18 |
| `server` (claims, runtime config, review store, handler) | 5 | 86 |
| `server/properties` (one property per file) | 11 | 12 |
| `infra/stack.test.ts` (CDK template assertions) | 1 | 21 |
| `scripts/verify-deployed-api.test.ts` | 1 | 7 |
| `docs/cost-estimate.test.ts` | 1 | 5 |
| `vite.config.test.ts` | 1 | 3 |
| Total | 55 | 443 |

What the tests cover:

- Every row of the Stage A success table in `docs/brd-stalled-order.md` has its own test against the pure rule (`src/rules/paidUnfulfilled.test.ts`). The same nine rows also run through the Lambda handler (`server/handleRequest.test.ts`, "GET /queue: Stage A success table through the API"). This includes the 23h59m and exactly-24h boundaries and evaluating the same data twice.
- Property tests use fast-check with at least 100 runs each. They cover queue equality with the evaluator, stale reviews, unknown routes, invalid configuration, ignored request parameters, repeated and concurrent saves, the save-then-queue round trip, the reviewer identity, invalid requests, leak-free failures, Local and Lambda store agreement, mode selection, the wire round trip, PKCE, route preservation, token expiry and the review status text.
- `src/rules`, `src/data` and `src/storage/reviews.ts` have no diff against `main` (`git diff --stat main -- src/rules src/data src/storage/reviews.ts` is empty). Existing Stage A test files only gained added tests.

## Other checks

| Command | Result |
| --- | --- |
| `npm run check` | Exit 0. ESLint clean, gitleaks found no leaks (directory and git history scans), semgrep found nothing. |
| `npm run build` | Exit 0. `dist/index.html` loads assets from `/`. |
| `npm run cdk -- synth` | Exit 0, bundled with local esbuild. |
| `npm run cdk -- deploy` (default context) | `CREATE_COMPLETE` in 212 seconds (CloudFormation progress 30/30). |

## Deployed API checks

`scripts/verify-deployed-api.mjs` ran against `https://gixj3zkww0.execute-api.us-east-1.amazonaws.com` with `ORIGIN=https://d1trzbqc0n3csz.cloudfront.net`. One token was lead1's with scope `openid` only. The other was outsider1's with scope `fulfillment-watch/api`. Output:

```
PASS  GET /queue with no token (CORS header): observed 401, expected 401 (access-control-allow-origin https://d1trzbqc0n3csz.cloudfront.net)
PASS  GET /queue with no token: observed 401, expected 401
PASS  GET /queue with a malformed token (CORS header): observed 401, expected 401 (access-control-allow-origin https://d1trzbqc0n3csz.cloudfront.net)
PASS  GET /queue with a malformed token: observed 401, expected 401
PASS  GET /queue with a valid token that lacks the scope (CORS header): observed 403, expected 403 (access-control-allow-origin https://d1trzbqc0n3csz.cloudfront.net)
PASS  GET /queue with a valid token that lacks the scope: observed 403, expected 403 (expected status is unverified)
PASS  GET /queue with a valid token for a user outside the group (CORS header): observed 403, expected 403 (access-control-allow-origin https://d1trzbqc0n3csz.cloudfront.net)
PASS  GET /queue with a valid token for a user outside the group: observed 403, expected 403
PASS  GET /reviews (unknown route): observed 404, expected 404
9 passed, 0 failed, 0 skipped.
```

The script prints "expected status is unverified" as a fixed note on the missing-scope check. The run itself verified that status as 403.

Review flow, checked with lead1's token (scope `openid fulfillment-watch/api`):

| Request | Observed |
| --- | --- |
| `GET /queue` | 200, 6 rows, 17 checked, CORS origin = site |
| `POST /reviews` for #998, first | 201, `reviewedAt` `2026-11-20T20:49:25.396Z`, reviewer `lead1` |
| `POST /reviews` for #998, repeat | 200, same timestamp and reviewer |
| `GET /queue` afterwards | Row #998 has that review |
| `POST /reviews` as outsider1 | 403 |
| `POST /reviews` for #1044 (not in the queue) | 400 |

Details: [docs/scope-verification.md](scope-verification.md).

## Deployed browser check

We ran these with Playwright on `https://d1trzbqc0n3csz.cloudfront.net`, signing in through the real Cognito page.

| Step | Observed |
| --- | --- |
| Open `#/orders/1042` signed out | Redirect to Cognito. The authorize request asks for `openid fulfillment-watch/api`. |
| Sign in as lead1 | Back on `#/orders/1042`. Header shows "Evaluated at 2026-11-20 12:00 UTC", "17 checked, 5 skipped" and Sign out. |
| Queue | 5 Open rows (#998 was already reviewed by the API check). No sideways scroll at 360, 768 or 1280 px. |
| Mark #1042 reviewed | `POST /reviews` 201. Text "Reviewed by lead1 2026-11-20 20:55 UTC". |
| Reload | Still "Reviewed by lead1 2026-11-20 20:55 UTC". |
| Reviewed view | #998 and #1042, each "Reviewed by lead1". |
| Browser storage | `localStorage` empty. `sessionStorage` holds only `fw.token`. |
| Sign out (lead1) | Token cleared, back on the Cognito sign-in page. |
| Sign in as outsider1 | "No access" heading, the not-in-group message, no table, no Retry, no order IDs. |
| Sign out (outsider1) | Cognito sign-in page with the password field, so the Cognito session ended. |

The first browser run found a defect: lead1 got "No access", because the app asked for scope `fulfillment-watch/api` only and Cognito then left out `cognito:groups`. We fixed it in commit "Request openid so access tokens carry cognito:groups" and re-ran the steps above.

## Screenshots

### Deployed site (API mode), 2026-11-20

| Screen | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Queue, lead1 | [aws-queue-360](screenshots/aws-queue-360.png) | [aws-queue-768](screenshots/aws-queue-768.png) | [aws-queue-1280](screenshots/aws-queue-1280.png) |
| Order #1042 after Mark reviewed | [aws-order-reviewed-360](screenshots/aws-order-reviewed-360.png) | [aws-order-reviewed-768](screenshots/aws-order-reviewed-768.png) | [aws-order-reviewed-1280](screenshots/aws-order-reviewed-1280.png) |
| Reviewed view | [aws-reviewed-360](screenshots/aws-reviewed-360.png) | [aws-reviewed-768](screenshots/aws-reviewed-768.png) | [aws-reviewed-1280](screenshots/aws-reviewed-1280.png) |
| outsider1 "No access" with Sign out | [aws-no-access-360](screenshots/aws-no-access-360.png) | [aws-no-access-768](screenshots/aws-no-access-768.png) | [aws-no-access-1280](screenshots/aws-no-access-1280.png) |

### Local mode, from earlier stages (already in the repo)

- UI redesign at 320, 768 and 1280 px: `queue-*.png`, `order-*.png`, `data-quality-*.png`, `rule-*.png`, `notfound-*.png`.
- Stage A flow: `01-load.png`, `02-detail.png`, `03-reviewed.png`, `04-reload.png`, `05-rerun.png`, `06-skipped.png`, `07-empty.png`, `08-keyboard.png`.

There is no screenshot of the Cognito sign-in page itself, and none of the deployed Data quality page.

## Not verified

- Alarms going into ALARM state.
- Throttling: a live 429.
- Requests from `http://localhost:5173` (`allowLocalhost=true` was never deployed).
- A deployed threshold or evaluation-time change.
- The 10-second client timeout and the token-expiry redirect, against the live API. Both are tested with fakes.
- `cdk destroy`.
- Direct S3 access to the bucket being refused.
- The real monthly bill.
