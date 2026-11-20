# Implementation Plan: Stalled Orders on AWS (Stage B)

## Overview

Implement Stage B in TypeScript, following `design.md`. Work proceeds in this order: approval and tooling, backend building blocks, the Lambda handler, the browser API module, the repository and UI changes, the Vite base change, the CDK stack, the verification script and documentation, and a final verification. The backend and the CDK stack do not depend on the UI work, so they can run in parallel (see the dependency graph).

Hard constraints for every task:

- Do not change `src/rules/`, `src/data/` or `src/storage/reviews.ts` (Req 3.11, 7.3). Reuse `evaluate`, `buildQueue`, `reviewKey`, `validateOrder`, `DATASET`, and the constants in `src/config.ts`. Do not copy the rule.
- Keep the Stage A suite green after every task. Run `npm test -- --run`, `npm run lint` and `npm run build` at the end of each task. Do not edit, skip, weaken or delete an existing test or assertion (Req 14.8). New tests go in new files, or are appended to an existing test file without changing what is already there.
- Run tests with `npm test -- --run`. Never start a dev server or any watcher from the agent.
- Network calls are allowed only in API mode and only through `src/api`. Local mode makes no network call and never imports a path that calls `fetch`.
- Use synthetic data only. Tests pass the evaluation time and review timestamp as arguments and never read the real clock. No secret, token or password in any file.
- Follow `code-style.md` and `tech.md`: `import type`, no enums, namespaces or constructor parameter properties, no `any`, no unused locals, one component per `.tsx` file, components only exported from `.tsx` files.
- Do not install a dependency or edit `package.json`, `eslint.config.js`, `tsconfig.json`, `.gitignore` or `vite.config.ts` before task 1.2 is approved, and then only as approved.
- Git: check `git status` and `git branch --show-current` before any git write, stage by explicit path, commit only if the user asks, and leave changes made by someone else untouched and unstaged (`git-workflow.md`).

## Tasks

- [ ] 1. Baseline, approval and tooling
  - [ ] 1.1 Record the Stage A baseline
    - Run `npm test -- --run`, `npm run lint` and `npm run build` before any change, and write down the test file count, the test count and the result of each command (these numbers are the baseline for task 12.1)
    - Run `git status` and `git branch --show-current`; if `vite.config.ts` or another file listed in task 1.2 already has uncommitted changes that you did not make, stop and ask the user before editing it
    - Make no file changes
    - _Requirements: 14.8, 14.10_

  - [ ] 1.2 Ask the user for approval before adding dependencies and touching config files
    - **NEEDS USER APPROVAL.** Use `user_input` (reason `general-question`) and wait for the answer. Do not install or edit anything until the user approves; if the user declines or changes the list, adjust the plan and stop any task that depends on the declined item
    - Dev dependencies to add (none is installed yet, `tech.md` requires asking): `aws-cdk-lib`, `constructs`, `aws-cdk` (CLI), `esbuild` (Req 10.8), `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`. Ask which exact versions to pin, and propose the latest stable version of each, checked at install time
    - Config files to change: `package.json` (dependencies and a `cdk` script), `eslint.config.js` (lint `server`, `infra` and `scripts` with Node globals), `tsconfig.json` (a reference to the new `tsconfig.server.json`), `.gitignore` (`cdk.out`), and `vite.config.ts` (the `base` by command, already approved in the requirements, listed here for confirmation)
    - New config files: `tsconfig.server.json` and `infra/cdk.json`
    - Say that no other dependency will be added and that no change is made to `allowedHosts` or `hmr`
    - _Requirements: 10.8, 13.6, 13.7 (design: "New dependencies needing approval"; `tech.md`, `verify-first.md`)_

  - [ ] 1.3 Apply the approved dependencies and tooling configuration
    - Install the approved packages as exact-version dev dependencies; confirm in `package.json` that only the approved packages were added
    - Create `tsconfig.server.json` (covers `server`, `infra`, `scripts` and the shared `src` files they import; `types: ["node"]`; same strictness flags as `tsconfig.app.json`) and add it to the `tsconfig.json` references
    - Extend `eslint.config.js` so `server`, `infra` and `scripts` are linted with Node globals; add `cdk.out` to `.gitignore`; add the `cdk` script to `package.json`
    - Create `infra/cdk.json` with `"app": "node infra/bin/app.ts"`
    - Do not edit `vite.config.ts` here (task 7.1 does it)
    - Run `npm test -- --run`, `npm run lint` and `npm run build`; results must match the baseline from task 1.1
    - _Requirements: 10.7, 10.8, 14.8, 14.10_

- [ ] 2. Backend building blocks in `server/`
  - [ ] 2.1 Implement `server/responses.ts` and `server/claims.ts`
    - `responses.ts`: JSON response builders and the error body `{"error":{"code","message"}}` with codes `invalid_request`, `forbidden`, `not_found`, `internal_error`; one fixed 500 message "The request could not be completed."
    - `claims.ts`: `readUsername` (non-empty string only), `readGroups` (accepts an array, a bracketed string such as `[a b]` or `[a, b]`, a JSON array string, or a single name; absent, empty or unparsable gives an empty list) and `isLead` (true only when the groups contain `fulfillment-lead`)
    - No call to Cognito and no other source for group membership
    - _Requirements: 1.5, 1.6, 1.7, 1.8, 5.9, 5.10, 6.5_

  - [ ]* 2.2 Write unit tests for responses and claims
    - Create `server/claims.test.ts` with examples of every claim shape, including the bracketed string form, an absent claim, an empty claim and a non-string username
    - _Requirements: 1.5, 1.6, 1.7, 5.10_

  - [ ]* 2.3 Write property test for group membership
    - Create `server/claims.properties.test.ts` with fast-check, at least 100 runs, tagged `// Feature: stalled-orders-aws, Property 3: Group membership decides access`
    - **Property 3: Group membership decides access**
    - Generate claim objects with group claims as a list, bracketed string, JSON array string, single name, empty or absent, plus unrelated claims; assert `isLead` is true if and only if the groups contain `fulfillment-lead`
    - **Validates: Requirements 1.5, 1.6, 1.7**

  - [ ] 2.4 Implement `server/runtimeConfig.ts`
    - `readRuntimeConfig(env)` returns `{ ok: true, config: { evaluationTime, thresholdHours } }` or `{ ok: false }` with no detail
    - `FULFILLMENT_THRESHOLD_HOURS`: unset gives `DEFAULT_THRESHOLD_HOURS` from `src/config.ts`; if set it must match `^\d+(\.\d+)?$`, be finite and be greater than 0
    - `EVALUATION_TIME`: unset gives the `EVALUATION_TIME` constant from `src/config.ts`; if set it must be accepted by `parseUtcTimestamp` from `src/rules/timestamps.ts` (use it, do not reimplement it)
    - Never read the system clock
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.9_

  - [ ]* 2.5 Write property test for valid configuration
    - Create `server/runtimeConfig.test.ts` with fast-check, at least 100 runs, tagged `// Feature: stalled-orders-aws, Property 5: Valid configuration is used as given`
    - **Property 5: Valid configuration is used as given**
    - Also add examples for each invalid value class (empty, whitespace, non-numeric, 0, negative, `NaN`, `Infinity`, exponent, padded, no `Z`, non-UTC offset, `2026-02-30T00:00:00Z`) asserting `{ ok: false }`
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

  - [ ] 2.6 Implement `server/reviewStore.ts` and the test support file
    - `ReviewStore` interface (`getMany`, `save`), `StoredReview`, `ReviewStoreError` (field `operation: 'save' | 'get'`, no constructor parameter property), `DynamoLike` (`putIfAbsent`, `get`, `batchGet`) and `DynamoReviewStore`
    - `save`: conditional put with `attribute_not_exists(orderId)`; on a conditional-check failure do a consistent get and return `{ created: false, review }`; any other failure throws `ReviewStoreError('save')` and writes nothing else
    - `getMany`: chunks of 100, consistent reads, bounded retry of unprocessed keys, then `ReviewStoreError('get')`; results keyed by `reviewKey`; never mutates the table
    - Never read the clock; `reviewedAt` is an argument
    - Create `server/testSupport.ts` with an in-memory `DynamoLike` fake: atomic conditional put, a write counter, a failure switch per operation, and a `batchGet` that can return unprocessed keys
    - _Requirements: 5.3, 5.4, 5.5, 7.8, 7.9, 7.10, 7.12_

  - [ ]* 2.7 Write unit tests for the review store
    - Create `server/reviewStore.test.ts`: conditional put, existing item read, failure leaves earlier reviews unchanged, over 100 keys, unprocessed keys retried then failed
    - _Requirements: 7.8, 7.9, 7.10_

  - [ ]* 2.8 Write property test for Local and Lambda store agreement
    - Create `src/storage/repository.properties.test.ts` with fast-check, at least 100 runs, tagged `// Feature: stalled-orders-aws, Property 14: Local and Lambda stores agree`
    - **Property 14: Local and Lambda stores agree**
    - Run generated sequences of 1 to 50 saves against the unchanged `src/storage/reviews.ts` (with an in-memory `StorageLike`) and against `DynamoReviewStore` with the fake; compare every pair, and assert an empty result and no error for a pair never saved
    - **Validates: Requirements 7.7, 7.8, 7.11**

- [ ] 3. Wire format and the Lambda handler
  - [ ] 3.1 Add the optional reviewer field and the wire format
    - `src/types.ts`: add an optional `reviewer` field to `ReviewRecord` (the existing `reviews.ts` ignores unknown fields, so Stage A is unaffected)
    - Create `src/api/wire.ts`: `WireReview`, `WireRow`, `QueueResponse`, `encodeQueueResponse` (used by the Lambda) and `decodeQueueResponse` (used by the client); the decoder checks the shape and throws a typed error for a malformed body instead of returning partial data; decoded rows map to `FlaggedOrder` and a `ReviewMap` keyed by `reviewKey`
    - Run the full Stage A suite to confirm the type change breaks nothing
    - _Requirements: 3.3, 3.4, 3.5, 5.12, 8.10_

  - [ ]* 3.2 Write property test for the wire format round trip
    - Create `src/api/wire.test.ts` with fast-check, at least 100 runs, tagged `// Feature: stalled-orders-aws, Property 16: Wire format round trip`
    - **Property 16: Wire format round trip**
    - Assert that decoding the JSON text of an encoded valid response equals the original, and that any invalid value fails with a typed error
    - **Validates: Requirements 3.3, 8.10**

  - [ ] 3.3 Implement `server/handleRequest.ts`: routing, authorization, configuration and `GET /queue`
    - Export `handleRequest(event, deps)` with the `ApiEvent`, `ApiResult` and `HandlerDeps` types from the design (`store`, `env`, `clock`, `dataset`, `log`)
    - Route on method and path; any other combination returns 404 `not_found` (including `GET /reviews`); check `isLead` and return 403 with no data when false; parse the runtime configuration and return the generic 500 on failure
    - `GET /queue`: call `evaluate(dataset, evaluationTime, thresholdHours)` imported from `src/rules`; fetch reviews with `store.getMany` for the flagged orders only; build `rows` in evaluator order with `review: null` or `{ reviewedAt, reviewer }`; return the `QueueResponse` through `encodeQueueResponse`; never read query parameters or the body; any evaluation or store error returns the generic 500 and no partial queue
    - Catch every error at the top and map it to the fixed 500 body; on 5xx write one JSON log line with `operation`, `errorName` and `message`, and never log the event, headers or claims
    - _Requirements: 1.5, 1.6, 1.7, 1.8, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.9, 3.10, 4.5, 4.6, 4.7, 4.9, 4.10, 6.5, 6.6, 6.7, 12.6_

  - [ ] 3.4 Add `POST /reviews` to `server/handleRequest.ts`
    - Require a `username` claim, else 403 and no write; decode the body (handle `isBase64Encoded`), parse JSON, require `orderId` and `ruleId` as non-empty strings (400 naming the field or the body); `ruleId` must equal `RULE_ID` (400 "rule ID is not supported"); the order must be in the evaluated flagged set (400 "order is not in the queue")
    - Read `deps.clock()` once, call `store.save(orderId, ruleId, reviewedAt, username)`, and return 201 with the saved review when created or 200 with the existing review when not; ignore every other body field, including `reviewer`
    - A store failure returns the generic 500, logs the cause, and does not report the order as reviewed
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.9, 5.10, 5.11, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 16.2_

  - [ ] 3.5 Create the Lambda entry `server/handler.ts` and the DynamoDB adapter
    - `server/dynamoClient.ts`: the production `DynamoLike` over `@aws-sdk/lib-dynamodb` `DynamoDBDocumentClient`, using only `PutItem`, `GetItem` and `BatchGetItem` on the table named by `REVIEWS_TABLE_NAME`
    - `server/handler.ts`: wire the real clock (ISO 8601 UTC with milliseconds and `Z`, called once per `POST`), `process.env`, `DATASET` from `src/data` and `console` logging into `handleRequest`; mark the AWS SDK packages external for the bundle
    - _Requirements: 3.1, 4.9, 5.2, 7.9, 10.7, 11.2_

  - [ ] 3.6 Create `server/handlerTestSupport.ts`
    - Event builders for `GET /queue` and `POST /reviews` with a claims argument, a fixed evaluation time, a counting fake clock that returns a fixed timestamp and records how many times it was called, an in-memory `ReviewStore` over the fake from `testSupport.ts` with a write counter and failure switches, and fast-check arbitraries for raw order datasets (valid and invalid records), claims and review requests
    - Use synthetic data only
    - _Requirements: 14.4, 14.5_

  - [ ] 3.7 Write the handler tests required by the requirements
    - Create `server/handleRequest.test.ts`
    - Success paths: `GET /queue`, and `POST /reviews` asserting HTTP 201
    - One test per row of the Stage A success table in `docs/brd-stalled-order.md` (nine rows), each through the `GET /queue` handler and named after its row, including the 23h59m and exactly-24h boundaries and evaluating the same data twice
    - One separate test each for: no authorizer claims (no order data, no write; the handler returns 403 because it fails closed, and the real 401 is covered by tasks 9.4 and 10.1), user outside the Lead_Group (403), malformed body (400), wrong rule ID (400), order not in queue (400), repeat review (200 with the first timestamp and reviewer, stored record unchanged), store failure (500); each asserts the status and that no write occurred, except the repeat case
    - Pass the evaluation time and review timestamp as arguments; never call the real clock
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 3.8, 1.5, 6.1, 6.2, 6.3, 5.4, 6.4_

  - [ ]* 3.8 Write property test for queue equality with the evaluator
    - Create `server/properties/queueMatchesEvaluator.test.ts`, at least 100 runs, tagged `// Feature: stalled-orders-aws, Property 1: Queue response equals the Stage A evaluator`
    - **Property 1: Queue response equals the Stage A evaluator**
    - **Validates: Requirements 3.1, 3.3, 3.4, 3.5, 3.7, 4.9, 4.10, 14.6**

  - [ ]* 3.9 Write property test for stale reviews
    - Create `server/properties/staleReviewsKept.test.ts`, at least 100 runs, tagged `// Feature: stalled-orders-aws, Property 2: Stale reviews are omitted and kept`
    - **Property 2: Stale reviews are omitted and kept**
    - **Validates: Requirements 3.6**

  - [ ]* 3.10 Write property test for unknown routes
    - Create `server/properties/unknownRoutes.test.ts`, at least 100 runs, tagged `// Feature: stalled-orders-aws, Property 4: Unknown routes return 404`
    - **Property 4: Unknown routes return 404**
    - **Validates: Requirements 3.9, 6.7**

  - [ ]* 3.11 Write property test for invalid configuration
    - Create `server/properties/invalidConfig.test.ts`, at least 100 runs, tagged `// Feature: stalled-orders-aws, Property 6: Invalid configuration returns a generic 500`
    - **Property 6: Invalid configuration returns a generic 500**
    - Assert the 500 body equals the fixed generic body and contains neither the variable name, the rejected value nor any order data
    - **Validates: Requirements 4.5, 4.6**

  - [ ]* 3.12 Write property test for ignored request parameters
    - Create `server/properties/ignoredParameters.test.ts`, at least 100 runs, tagged `// Feature: stalled-orders-aws, Property 7: Request parameters do not change the result`
    - **Property 7: Request parameters do not change the result**
    - **Validates: Requirements 4.7**

  - [ ]* 3.13 Write property test for repeated saves
    - Create `server/properties/repeatSaves.test.ts`, at least 100 runs, N from 1 to 10, tagged `// Feature: stalled-orders-aws, Property 8: Saving a review repeatedly keeps the first record`
    - **Property 8: Saving a review repeatedly keeps the first record**
    - **Validates: Requirements 5.3, 5.4, 5.6, 7.6, 7.8, 14.7**

  - [ ]* 3.14 Write property test for concurrent saves
    - Create `server/properties/concurrentSaves.test.ts`, at least 100 runs, K from 2 to 10, tagged `// Feature: stalled-orders-aws, Property 9: Concurrent saves keep exactly one review`
    - **Property 9: Concurrent saves keep exactly one review**
    - **Validates: Requirements 5.5**

  - [ ]* 3.15 Write property test for the save and queue round trip
    - Create `server/properties/saveQueueRoundTrip.test.ts`, at least 100 runs, tagged `// Feature: stalled-orders-aws, Property 10: Save then queue round trip`
    - **Property 10: Save then queue round trip**
    - Include a fresh handler instance that shares only the store
    - **Validates: Requirements 5.7, 5.8**

  - [ ]* 3.16 Write property test for the reviewer identity
    - Create `server/properties/reviewerIsUsername.test.ts`, at least 100 runs, tagged `// Feature: stalled-orders-aws, Property 11: The reviewer is the token username`
    - **Property 11: The reviewer is the token username**
    - **Validates: Requirements 5.9, 5.10**

  - [ ]* 3.17 Write property test for invalid review requests
    - Create `server/properties/invalidReviewRequests.test.ts`, at least 100 runs, tagged `// Feature: stalled-orders-aws, Property 12: Invalid review requests return 400 and write nothing`
    - **Property 12: Invalid review requests return 400 and write nothing**
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [ ]* 3.18 Write property test for leak-free failures
    - Create `server/properties/noLeaks.test.ts`, at least 100 runs, tagged `// Feature: stalled-orders-aws, Property 13: Failures do not leak internals or credentials`
    - **Property 13: Failures do not leak internals or credentials**
    - Inject error text, stack text and an `Authorization` value; assert the body equals the fixed generic body, the log has the cause, and the log has no `Authorization` value
    - **Validates: Requirements 6.4, 6.5, 6.6, 12.6**

- [ ] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Browser API module in `src/api`
  - [ ] 5.1 Implement `src/api/config.ts`
    - `isApiMode(value)` is true if and only if the value has at least one non-whitespace character
    - Read `VITE_API_URL`, `VITE_COGNITO_DOMAIN` and `VITE_COGNITO_CLIENT_ID` at build time; no secret, no default value that points at a real resource
    - _Requirements: 8.1, 8.2, 13.8_

  - [ ]* 5.2 Write property test for mode selection
    - Create `src/api/config.test.ts` with fast-check, at least 100 runs, tagged `// Feature: stalled-orders-aws, Property 15: Mode selection follows the build value`
    - **Property 15: Mode selection follows the build value**
    - **Validates: Requirements 8.1, 8.2**

  - [ ] 5.3 Implement `src/api/pkce.ts`
    - Verifier of 64 characters from the unreserved set using `crypto.getRandomValues`, challenge `base64url(SHA-256(verifier))` without padding, and a random `state`; the crypto object is a parameter so tests can supply Node's
    - _Requirements: 2.7_

  - [ ]* 5.4 Write property test for PKCE
    - Create `src/api/pkce.test.ts` with fast-check, at least 100 runs, tagged `// Feature: stalled-orders-aws, Property 17: PKCE challenge matches the verifier`
    - **Property 17: PKCE challenge matches the verifier**
    - **Validates: Requirements 2.7**

  - [ ] 5.5 Implement `src/api/auth.ts`
    - `getValidToken(now)`, `startSignIn()`, `completeSignIn()`, `signOutUrl()` and `clearTokens()` with `fetch`, `sessionStorage`, `location`, `history` and crypto injected
    - Keys `fw.token`, `fw.pkce`, `fw.route` in `sessionStorage` only; no refresh token requested or stored; token expiry is `expires_in` from the exchange minus a 30-second skew
    - `startSignIn` saves the current hash route, the state and the verifier, then redirects to the authorize endpoint with `response_type=code`, `client_id`, `redirect_uri=window.location.origin`, `scope=fulfillment-watch/api`, `state`, `code_challenge` and `code_challenge_method=S256`
    - `completeSignIn` handles `?code=` and `?error=`: validate `state`, form-encoded `POST` to `<domain>/oauth2/token` without a client secret, `history.replaceState` to remove the query, set the hash to the Saved_Route (or `#/` when none); a failed exchange, an error redirect or a state mismatch returns `'failed'` and leaves no token
    - `signOutUrl` builds the Cognito logout URL with `client_id` and `logout_uri` (OQ-15 proposal in the design); this proposal is not confirmed, so record in the PR notes that the user must confirm it
    - Wrap storage access in `try/catch`
    - _Requirements: 2.6, 2.7, 2.8, 2.10, 2.11, 2.16, 2.18, 8.7, 13.4, 13.5_

  - [ ]* 5.6 Write property test for route preservation
    - Create `src/api/auth.route.test.ts` with fast-check, at least 100 runs, tagged `// Feature: stalled-orders-aws, Property 18: Sign-in preserves the route`
    - **Property 18: Sign-in preserves the route**
    - **Validates: Requirements 2.6, 2.7, 2.8, 13.4**

  - [ ]* 5.7 Write property test for token expiry
    - Create `src/api/auth.token.test.ts` with fast-check, at least 100 runs, tagged `// Feature: stalled-orders-aws, Property 19: Expired tokens are discarded`
    - **Property 19: Expired tokens are discarded**
    - **Validates: Requirements 2.11**

  - [ ] 5.8 Implement `src/api/client.ts` and `src/api/index.ts`
    - `getQueue()` and `postReview(orderId, ruleId)` with `Authorization: Bearer <access token>`, an `AbortController` with a 10 000 ms timeout, and `ApiError` with `kind` `'unauthorized' | 'forbidden' | 'timeout' | 'network' | 'http'` and an optional `status`; 401 maps to `unauthorized`, 403 to `forbidden`, other non-2xx to `http`, a `TypeError` to `network`
    - Error messages never include a raw response body; a malformed success body becomes `ApiError('http')` through `decodeQueueResponse`
    - `fetch`, timers and token access are injected; `index.ts` re-exports the public API
    - _Requirements: 2.9, 2.19, 8.4, 8.5, 8.6, 9.1, 9.9_

  - [ ]* 5.9 Write unit tests for the API client
    - Create `src/api/client.test.ts` with a fake `fetch` and fake timers: timeout after 10 s, 401, 403, other statuses, network error, `Authorization` header present, no raw body in messages, no refresh token stored
    - _Requirements: 2.9, 2.10, 9.1, 9.9_

- [ ] 6. Repository, state and UI changes
  - [ ] 6.1 Create the review repositories in `src/storage/`
    - `reviewRepository.ts`: the async `ReviewRepository` interface with `get`, `list` and `save(orderId, ruleId, requestedAt)` returning `{ ok, created, review }` or `{ ok: false, error }`, as proposed under OQ-16 (the proposal is not confirmed, so record in the PR notes that the user must confirm it)
    - `localRepository.ts`: wraps `loadReviews` and `saveReview` from `reviews.ts` with a `StorageLike`, uses `requestedAt` as the timestamp, and exposes a synchronous fast path so the Local-mode provider can keep its first render and click handling synchronous
    - `apiRepository.ts`: every call goes through the `src/api` client; `save` ignores `requestedAt`; `loadQueue()` returns the `QueueResponse`; `get` and `list` derive from the latest load
    - Both identify reviews with `reviewKey(orderId, ruleId)`; `get` of an absent review returns `null` and does not raise
    - Do not change `src/storage/reviews.ts`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [ ]* 6.2 Write unit tests for the repositories
    - Create `src/storage/repositories.test.ts`: the Local repository wraps the unchanged store and keeps first-wins; the API repository delegates to a fake client and writes nothing to local storage; `get` of an absent review is empty
    - _Requirements: 7.2, 7.4, 7.6, 7.7, 8.7_

  - [ ] 6.3 Add `formatReviewStatus` to `src/format.ts`
    - Pure function: with a non-empty reviewer return text such as `Reviewed by lead1 2026-11-20 12:05 UTC` using the existing `formatUtc`; with no reviewer return exactly the current Stage A text
    - Do not change any existing export
    - _Requirements: 5.12, 8.9_

  - [ ]* 6.4 Write property test for review status text
    - Append to `src/format.test.ts` without changing existing tests, at least 100 runs, tagged `// Feature: stalled-orders-aws, Property 20: Review status text names the reviewer`
    - **Property 20: Review status text names the reviewer**
    - **Validates: Requirements 5.12, 8.9**

  - [ ] 6.5 Update the state provider
    - `src/state/WorkbenchProvider.tsx` takes a `repository` prop; Local mode keeps the synchronous first render (`evaluate` and `loadReviews`) and applies the `markReviewed` result through the synchronous fast path; API mode starts as `loading`, calls `loadQueue()` on mount and on Re-run, builds `result`, `reviews`, `evaluationTime` and `thresholdHours` from the response, and ends as `ready`, `error` (retryable) or `forbidden` (no retry); a 401 calls `startSignIn()`
    - `src/state/workbenchContext.ts` gains the optional fields `mode`, `status`, `errorKind`, `evaluationTime`, `reload`, with Local-mode defaults `'local'` and `'ready'`, so existing consumers and tests compile unchanged
    - A failed save keeps the order Open, keeps the current page and selection, and exposes the retry action for the same order ID and rule ID
    - API mode writes no review entry to `localStorage`
    - Run the unchanged Stage A and UI redesign tests; if one fails, fix the code, not the test
    - _Requirements: 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.10, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.10, 2.17, 2.19, 14.8_

  - [ ]* 6.6 Write unit tests for the provider
    - Create `src/state/WorkbenchProvider.test.tsx`: API mode loading, success, error with Retry, 403 without Retry, 401 starts sign-in, Retry disabled while loading; Local mode makes no `fetch` call and requires no sign-in; API mode writes no `localStorage` review entry
    - _Requirements: 8.3, 8.4, 8.7, 8.8, 9.2, 9.3, 9.7, 9.8_

  - [ ] 6.7 Create `src/components/LoadStatus.tsx` and `src/components/SignInMessage.tsx`
    - `LoadStatus`: loading text, and an error message "Could not load the queue." with a Retry button that is disabled while loading; no stack trace or raw body
    - `SignInMessage` with `kind: 'failed' | 'not-in-group'`: `failed` shows a sign-in failed message with a "Sign in again" button; `not-in-group` states that the account is not in the fulfillment-lead group, with no Retry and no redirect; neither shows queue data
    - Follow `ui-style.md` (tokens only, no hard-coded colors or `px`)
    - _Requirements: 2.17, 2.18, 9.2, 9.3, 9.8, 9.9, 9.10, 13.5_

  - [ ] 6.8 Add the optional Sign out link to `src/components/Header.tsx`
    - New optional prop (for example `signOutHref` and `onSignOut`); when set, render an `<a>` "Sign out" inside the existing `<header>`; when not set, render nothing extra so Local mode is unchanged
    - Selecting it clears the tokens and then follows the Cognito logout URL
    - _Requirements: 2.14, 2.15, 2.16, 2.13_

  - [ ] 6.9 Use the reviewer text and the inline Retry in the lists and the order page
    - `src/components/QueueTable.tsx` and `src/pages/OrderPage.tsx` call `formatReviewStatus` in place of the inline status text, and show a Retry button next to the failed order in API mode that calls `markReviewed` again for the same order; add no other element
    - `src/pages/QueuePage.tsx` keeps its existing order; change it only if the save error placement needs it
    - Existing component tests must pass unchanged
    - _Requirements: 5.12, 9.4, 9.5, 9.6, 8.9_

  - [ ] 6.10 Update the shell in `src/App.tsx`
    - In API mode: `loading` renders `LoadStatus`; `error` renders `LoadStatus` with Retry; `forbidden` renders `SignInMessage kind="not-in-group"`; otherwise the page renders as today; the header shows the Evaluation_Time and checked count from the response and the Sign out link
    - In Local mode: no change in behavior or layout
    - _Requirements: 2.13, 2.17, 8.9, 8.10, 9.2, 9.8_

  - [ ] 6.11 Make `src/main.tsx` an async bootstrap
    - Local mode renders exactly as today with the local repository and no network import path executed
    - API mode: `completeSignIn()`; on `'failed'` render `SignInMessage kind="failed"` with `startSignIn` as the restart action; if `getValidToken(Date.now())` is null, call `startSignIn()` and render nothing; otherwise render the app with the API repository so `HashRouter` starts on the restored hash route
    - _Requirements: 2.6, 2.7, 2.8, 2.11, 2.12, 2.18, 8.1, 8.2, 8.3, 13.4_

  - [ ]* 6.12 Extend the Header tests
    - Append tests to `src/components/Header.test.tsx` without changing existing assertions: the Sign out link is present only when the prop is set, and the header has no other new element
    - _Requirements: 2.14, 2.15_

  - [ ]* 6.13 Write API-mode app tests
    - Create `src/App.api.test.tsx` with a fake client: sign-in message screens, loading and error states with Retry, 403 message, reviewer text "Reviewed by lead1" in the existing status text, Evaluation_Time and checked count shown as returned, same layout and labels as Local mode except the Sign out link, review error with inline Retry that repeats the same order and rule
    - _Requirements: 2.13, 2.17, 5.7, 5.12, 8.9, 8.10, 9.4, 9.5, 9.6_

- [ ] 7. Vite base for the production build
  - [ ] 7.1 Change `vite.config.ts` to `defineConfig(({ command }) => ...)`
    - `base: command === 'build' ? '/' : '/absproxy/5173/'`; change nothing else (`allowedHosts`, `hmr` and the port stay as they are)
    - Run `npm run build` and confirm the built `dist/index.html` references assets from `/`
    - _Requirements: 13.6, 13.7_

  - [ ]* 7.2 Write a unit test for the base setting
    - Create `vite.config.test.ts` that calls the exported config function with `command: 'build'` and `command: 'serve'` and asserts the two `base` values; add the file to the right tsconfig include only if needed (covered by the approval in task 1.2)
    - _Requirements: 13.6, 13.7_

- [ ] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Infrastructure in `infra/`
  - [ ] 9.1 Create the CDK app and the authentication resources
    - `infra/bin/app.ts`: read the context flag `allowLocalhost` (default false) and create `FulfillmentWatchStack` with `env.region` `us-east-1`
    - `infra/lib/stack.ts`: user pool (no self sign-up, username sign-in, Essentials feature plan, removal policy `DESTROY`), one group `fulfillment-lead`, resource server `fulfillment-watch` with scope `api`, domain prefix `fulfillment-watch-690559` with managed login, app client (no secret, authorization code grant only, scopes `fulfillment-watch/api` and `openid`, exactly two callback URLs and the same two logout URLs, access token validity 1 hour), and a `CfnManagedLoginBranding` resource with Cognito default values
    - The callback URL for the CloudFront site uses a token for the distribution domain; add the distribution in task 9.3 and wire the URL there to avoid a circular dependency
    - No secret value anywhere
    - _Requirements: 1.9, 1.12, 2.1, 2.2, 2.3, 2.4, 2.5, 10.1, 10.2, 10.13, 16.3_

  - [ ] 9.2 Add the table, the function and the API
    - Reviews table: keys `orderId` and `ruleId` (strings), `PAY_PER_REQUEST`, removal policy `DESTROY`
    - Function log group with 14-day retention; `NodejsFunction` with `entry: server/handler.ts`, `projectRoot` set to the repository root, `depsLockFilePath: package-lock.json`, runtime `NODEJS_24_X`, arm64, 256 MB, 10 s timeout, its own role, and the environment variables `REVIEWS_TABLE_NAME`, `EVALUATION_TIME` and `FULFILLMENT_THRESHOLD_HOURS`
    - An explicit `PolicyStatement` with only `dynamodb:PutItem`, `dynamodb:GetItem` and `dynamodb:BatchGetItem` on the table ARN (no `*`, no `grantReadWriteData`)
    - HTTP API with exactly the routes `GET /queue` and `POST /reviews`, each with the JWT authorizer (issuer `https://cognito-idp.us-east-1.amazonaws.com/<poolId>`, audience the client ID) and `authorizationScopes: ['fulfillment-watch/api']`; CORS allows the CloudFront origin, plus `http://localhost:5173` only when `allowLocalhost` is true; methods `GET`, `POST`, `OPTIONS`; headers `Authorization`, `Content-Type`; default stage throttling rate 10 and burst 20
    - _Requirements: 1.3, 7.12, 10.1, 10.6, 10.7, 10.12, 11.1, 11.2, 11.3, 11.4, 11.6, 11.7, 11.8, 11.9, 12.1_

  - [ ] 9.3 Add hosting, alarms and outputs
    - Private S3 bucket (all four Block Public Access settings, S3-managed encryption, `enforceSSL`, removal policy `DESTROY`, `autoDeleteObjects: true`); CloudFront distribution with OAC through `S3BucketOrigin.withOriginAccessControl`, `defaultRootObject: 'index.html'`, redirect HTTP to HTTPS, price class 100, and no error-page rewrite
    - Complete the callback and logout URL wiring and the API CORS origin from the distribution domain
    - Two alarms with Sum >= 1 over one 5-minute period, with no actions: function `Errors`, and API `5xx` (explicit `Metric` in `AWS/ApiGateway`, dimension `ApiId`, `treatMissingData: NOT_BREACHING`); no SNS topic, no SQS queue, no Bedrock
    - Outputs: API URL, user pool ID, app client ID, Cognito domain URL, site URL, bucket name, distribution ID (none is secret)
    - _Requirements: 10.1, 10.3, 10.4, 10.5, 10.9, 10.10, 10.11, 11.7, 12.2, 12.3, 12.4, 12.5, 13.1, 13.2, 13.3, 16.1_

  - [ ] 9.4 Write the stack tests
    - Create `infra/stack.test.ts` with `aws-cdk-lib/assertions`; build the stack with `aws:cdk:bundling-stacks` set to an empty list so no esbuild run is needed
    - Assert that synth succeeds, and each of: region us-east-1; runtime `nodejs24.x`; the function has its own role and the policy has exactly the three DynamoDB actions on the table ARN with no `*`; table is `PAY_PER_REQUEST` with the two keys; self sign-up off; exactly one group; resource server and scope; domain prefix; client has no secret, only the code grant, exactly two callback URLs and a managed-login branding resource; exactly two routes, each with the JWT authorizer and scope `fulfillment-watch/api`; throttling 10 and 20; CORS one origin by default and two when `allowLocalhost` is true; bucket Block Public Access, OAC, root object, HTTP to HTTPS; log retention 14 days; two alarms; no SNS, SQS or Bedrock resource; no secret in resources or environment
    - Also run `npx cdk synth` once from the repository (exit code 0, no errors) and report the result
    - _Requirements: 14.9, 10.14, 1.3, 1.9, 1.12, 2.1, 2.2, 2.3, 2.4, 2.5, 7.12, 10.1, 10.2, 10.6, 10.9, 10.10, 10.11, 10.13, 11.1, 11.2, 11.3, 11.4, 11.6, 11.7, 11.8, 12.1, 12.2, 12.3, 12.4, 12.5, 16.1, 16.3_

- [ ] 10. Verification script, documentation and cost
  - [ ] 10.1 Create `scripts/verify-deployed-api.mjs`
    - Node script with no dependencies, built-in `fetch`; reads `API_URL` and, optionally, `TOKEN_NO_SCOPE` and `TOKEN_NO_GROUP` from the environment; never stores or prints a token
    - Checks and prints the observed status for: no token on `GET /queue` (expect 401), malformed token (expect 401), valid token without the Required_Scope (expect 403, unverified), valid token for a user outside the group (expect 403), `GET /reviews` (expect 404), and the CORS headers on the 401 and 403 responses
    - Exit code 0 only when every executed check matches its expectation; clearly mark a check that was skipped because its token is missing
    - Do not run it against AWS from the agent; it needs a deployed stack and tokens supplied by the operator
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.10, 3.9_

  - [ ]* 10.2 Write a test for the verification script
    - Create `scripts/verify-deployed-api.test.ts` that starts a local `node:http` stub server returning the expected statuses, runs the script with `child_process`, and asserts the output and exit code; assert that a token passed in the environment never appears in the output
    - _Requirements: 1.10, 12.6_

  - [ ] 10.3 Create `docs/scope-verification.md`
    - Describe the procedure: get a token for the `openid`-only scope, run the script, record the observed status and the date
    - Leave the result as "not yet verified" with placeholders; never invent an observed status
    - State that if the observed status is not 403, requirement 1.4 and every requirement and design line that states the missing-scope status must be corrected to the observed code
    - _Requirements: 1.4, 1.10, 1.11_

  - [ ] 10.4 Update `README.md`
    - Read the existing README first and keep its content that still applies
    - Add one section per task, in this order, each with the commands and the expected result: deploy the stack (`npm run cdk -- deploy -c allowLocalhost=false`, then the build with `VITE_API_URL`, `VITE_COGNITO_DOMAIN` and `VITE_COGNITO_CLIENT_ID`, `aws s3 sync`, CloudFront invalidation), create the test user (password set by hand, never in the repo), add the user to `fulfillment-lead`, run the app in each run mode (Local mode, and API mode with `npx vite --base /` and `allowLocalhost=true`), change the threshold (steps for `FULFILLMENT_THRESHOLD_HOURS` and `EVALUATION_TIME`, redeploy, confirm, and the defaults 24 and `2026-11-20T12:00:00Z`), and tear down (`cdk destroy`)
    - State that all data is synthetic and that the stack is in us-east-1; link to `docs/cost-estimate.md` and `docs/scope-verification.md`
    - _Requirements: 4.8, 15.1, 15.2, 15.7, 10.5, 14.11_

  - [ ] 10.5 Create `docs/cost-estimate.md`
    - Look up current AWS pricing (web search or the pricing pages) for every service in the stack: Cognito (including the Essentials feature plan price per user), API Gateway HTTP API, Lambda, DynamoDB on-demand, S3, CloudFront, CloudWatch Logs and alarms
    - One table by service with the monthly cost in USD to the cent, both with the Free Tier and without it, and a total per column equal to the sum of the rows; a service with no charge shows 0.00
    - State the assumptions (10 users, 1,000 API requests per day, 100 reviews per day, 1 GB per month through CloudFront), show the working per service (quantity, unit price, result), and name the pricing source and the date read as `YYYY-MM-DD`
    - Cite sources and paraphrase them; do not paste long passages
    - _Requirements: 15.2, 15.3, 15.4, 15.5, 15.6_

  - [ ]* 10.6 Write a test for the cost table totals
    - Create `docs/cost-estimate.test.ts` that parses the markdown table and asserts each total equals the sum of its column, that every value has two decimals, and that a `YYYY-MM-DD` date is present
    - _Requirements: 15.3, 15.6_

  - [ ] 10.7 Update `.kiro/steering/structure.md`
    - Document the new `server/`, `infra/`, `scripts/` and `src/api/` folders, the new files in `src/storage/`, `src/state/` and `src/components/`, and that the Lambda imports `src/rules` and `src/data` unchanged
    - Change no other steering file
    - _Requirements: 16.4_

- [ ] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Final verification
  - [ ] 12.1 Run the full local checks and the Stage A guard
    - Run `npm test -- --run`, `npm run lint`, `npm run build` and `npx cdk synth`; fix any failure
    - Run `npm run check`; if `gitleaks` or `semgrep` is not installed, report that instead of skipping silently
    - Run `git diff --stat -- src/rules src/data src/storage/reviews.ts` and confirm it is empty
    - Run `git diff --stat` on the existing `*.test.ts` and `*.test.tsx` files and confirm only appended tests changed (no removed or altered assertion); compare the test count with the baseline from task 1.1: 0 failures, 0 skipped, none removed
    - Confirm local mode makes no network call (the Local-mode test from task 6.6 passes) and that no secret, token or password is in any tracked file; confirm the data is synthetic
    - _Requirements: 3.11, 7.3, 14.8, 14.9, 14.10, 14.11, 16.4_

  - [ ] 12.2 Record the deployed-API verification result
    - This needs a deployed stack, which the user deploys by following the README. Use `user_input` (reason `general-question`) to ask whether the stack is deployed and to ask for the output of `scripts/verify-deployed-api.mjs`; never ask for a token or a password
    - Write the observed status for each check and the date into `docs/scope-verification.md`
    - If the missing-scope status is not 403, correct requirement 1.4 and every requirement, design and test line that states it to the observed code (requirement 1.11), then rerun the affected tests
    - If the user has not deployed yet, leave the document as "not yet verified" and say so in the final report
    - _Requirements: 1.4, 1.10, 1.11, 10.3_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. Tests that the requirements make mandatory are not optional: the handler tests in 3.7 (Req 14.1 to 14.5), the stack tests in 9.4 (Req 14.9) and the unchanged Stage A suite (Req 14.8).
- Each task references specific requirements for traceability. Properties are numbered as in `design.md`.
- Property tests use fast-check (already installed) with at least 100 runs and a tag comment. Each property has its own file under `server/properties/` where the design lists one shared file, so parallel tasks never write the same file.
- Stage A stays green by construction: `src/rules`, `src/data` and `src/storage/reviews.ts` are untouched, the `types.ts` and context changes are optional fields, and Local mode keeps its synchronous first render. Every task ends with the full suite.
- Tasks 1.2, 5.5 (sign-out URL, OQ-15), 6.1 (repository signature, OQ-16) and 12.2 need the user. The open questions OQ-15 to OQ-17 are design proposals, not decisions, until the user confirms them.
- Requirement 14.3 asks for a handler test of a missing token with status 401, but API Gateway produces the 401 before the function runs. Task 3.7 tests the fail-closed behavior of the handler, and the 401 itself is covered by the stack test (9.4) and the deployed script (10.1).
- Deployment, `cdk deploy` and running against AWS are operator steps documented in the README. No task deploys.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["2.1", "2.4", "2.6", "3.1", "5.1", "5.3", "7.1", "9.1", "10.1", "10.3"] },
    { "id": 4, "tasks": ["2.2", "2.3", "2.5", "2.7", "2.8", "3.2", "3.3", "5.2", "5.4", "5.5", "6.3", "7.2", "10.2"] },
    { "id": 5, "tasks": ["3.4", "3.6", "5.6", "5.7", "5.8", "6.4"] },
    { "id": 6, "tasks": ["3.5", "3.7", "3.8", "3.9", "3.10", "3.11", "3.12", "3.13", "3.14", "3.15", "3.16", "3.17", "3.18", "5.9", "6.1"] },
    { "id": 7, "tasks": ["6.2", "6.5", "6.7", "6.8", "9.2"] },
    { "id": 8, "tasks": ["6.6", "6.9", "6.10", "6.12", "9.3"] },
    { "id": 9, "tasks": ["6.11", "6.13", "9.4", "10.5"] },
    { "id": 10, "tasks": ["10.4", "10.6", "10.7"] },
    { "id": 11, "tasks": ["12.1"] },
    { "id": 12, "tasks": ["12.2"] }
  ]
}
```
