# Requirements Document

## Introduction

Stage B of the Order Exception Workbench (Fulfillment Watch) moves the stalled-order queue behind a Cognito sign-in and saves reviews on a server. A fulfillment lead signs in, sees the same queue that Stage A shows, and records reviews that every lead sees from any browser, stored with the reviewer's username.

Source of truth: `docs/brd-stalled-orders-aws.md`. AWS details come from `docs/aws-notes.md`. The Stage A success table in `docs/brd-stalled-order.md` must still pass, now through the API. The page layout from `docs/brd-ui-redesign.md` does not change, with one exception: a small "Sign out" link in the existing header, shown only in API_Mode.

The feature reuses the Stage A pure evaluator in `src/rules` (`evaluate`, `buildQueue`, `reviewKey`, `validateOrder`) and the constants in `src/config.ts`. It does not duplicate the rule. Stage A local mode stays available as the fallback demo.

Decisions confirmed by the user (these override the BRD where they differ):

- Hosted sign-in (managed login, authorization code grant with PKCE, public client with no client secret) is used with no fallback.
- The threshold and evaluation time are deploy-time Lambda environment variables. There is no query parameter.
- `GET /queue` returns review status, so there is no `GET /reviews`.
- `POST /reviews` returns 400 for a malformed body, a rule ID other than `paid-unfulfilled`, or an order ID not in the current queue. The first save of a review returns 201. A repeat review returns 200 and keeps the first timestamp and reviewer.
- Alarms exist in CloudWatch only (no SNS, no email).
- One build-time variable `VITE_API_URL` selects API mode (set) or Stage A local mode (empty).
- The reviewer is the `username` claim of the Cognito access token. The group check runs in the Lambda.
- The production build uses Vite `base` `/`. The dev server keeps `/absproxy/5173/`. Changing `vite.config.ts` for this is approved.
- A small sign-in callback runs before the router starts. Before redirecting to sign-in, the app saves the current hash route in `sessionStorage`. On return it exchanges the code using PKCE at the Cognito token endpoint, removes the query from the URL, and restores the saved route.
- The Cognito resource server identifier is `fulfillment-watch` and its scope is `api`, giving the scope `fulfillment-watch/api`.
- Tokens are kept in `sessionStorage`. There are no refresh tokens. When the token expires, the user goes back through hosted sign-in. A "Sign out" link in the existing header, shown only in API mode, is the one allowed layout exception.
- The reviewer name appears in the existing review status text (for example "Reviewed by lead1"), with no layout change.
- The steering files (`tech.md`, `product.md`, `ui-style.md`) are already updated: network calls are allowed only in API mode and only through one `src/api` module, new files under `src/storage/` are allowed, and `src/rules` and `src/data` are never changed.
- The existing synchronous `src/storage/reviews.ts` is not changed. An async `ReviewRepository` interface has a local implementation that wraps the synchronous store and an API implementation. The Lambda writes to DynamoDB through its own table-backed store with the same first-wins semantics.
- CORS allows the CloudFront domain only. A CDK context flag `allowLocalhost` (default false) adds `http://localhost:5173` for development. Deployment uses false.
- The Cognito domain prefix is `fulfillment-watch-690559`.
- A valid token that lacks the required scope is expected to produce 403, and a missing or invalid token 401. This is unverified and is covered by a verification requirement.
- The client request timeout is 10 seconds, after which the app shows the error state with a retry.
- The cost estimate lives in `docs/cost-estimate.md`.

## Glossary

- **Workbench_App**: The React single-page application in `fulfillment-watch/`, served with hash routes.
- **API**: The API Gateway HTTP API that exposes `GET /queue` and `POST /reviews`.
- **JWT_Authorizer**: The API Gateway JWT authorizer attached to the API routes, configured with the Cognito user pool issuer and the app client audience.
- **Queue_Function**: The single Node.js Lambda function behind the API.
- **User_Pool**: The Amazon Cognito user pool that holds the lead accounts.
- **App_Client**: The public Cognito app client (no client secret) used by the Workbench_App.
- **Resource_Server**: The Cognito resource server with identifier `fulfillment-watch` that defines the scope `api`.
- **Cognito_Domain**: The Cognito-owned hosted domain with the prefix `fulfillment-watch-690559`.
- **Managed_Login**: The Cognito hosted sign-in pages that run the OAuth 2.0 authorization code grant. The Workbench_App never handles passwords.
- **Sign_In_Callback**: The small code in the Workbench_App that runs before the router starts. It saves the current hash route before sign-in, and on return exchanges the authorization code with PKCE at the Cognito token endpoint, removes the query from the URL and restores the saved route.
- **Saved_Route**: The hash route that the Workbench_App stores in `sessionStorage` before it redirects to Managed_Login.
- **Access_Token**: The Cognito access token that the Workbench_App sends in the `Authorization` header and keeps in `sessionStorage`.
- **Sign_Out_Link**: The "Sign out" link in the existing header, shown only in API_Mode.
- **Lead_Group**: The Cognito group `fulfillment-lead`. Only members may use the API.
- **Required_Scope**: The authorization scope `fulfillment-watch/api` (Resource_Server `fulfillment-watch`, scope `api`) that every API route requires and that the App_Client requests.
- **Reviewer**: The `username` claim of the Access_Token.
- **Evaluator**: The Stage A pure function set in `src/rules` (`evaluate`, `buildQueue`, `reviewKey`, `validateOrder`).
- **Local_Review_Store**: The existing synchronous module `src/storage/reviews.ts`. It is not changed.
- **ReviewRepository**: The async interface for reading and saving reviews in the Workbench_App. It has two implementations: Local_Repository and API_Repository.
- **Local_Repository**: The ReviewRepository implementation that wraps the Local_Review_Store.
- **API_Repository**: The ReviewRepository implementation that calls the API through the API_Client.
- **API_Client**: The single module `src/api` through which the Workbench_App makes every network call in API_Mode.
- **Lambda_Review_Store**: The table-backed review store used inside the Queue_Function. It reads and writes the Reviews_Table and has the same first-wins semantics as the Local_Review_Store.
- **Reviews_Table**: The DynamoDB table of reviews with on-demand capacity, keyed by order ID and rule ID.
- **Evaluation_Time**: The fixed evaluation time. Default `2026-11-20T12:00:00Z`, set in the Queue_Function by the environment variable `EVALUATION_TIME`.
- **Threshold_Hours**: The rule threshold in hours. Default 24, set in the Queue_Function by the environment variable `FULFILLMENT_THRESHOLD_HOURS`.
- **API_Mode**: The Workbench_App mode used when `VITE_API_URL` is set at build time.
- **Local_Mode**: The Stage A mode used when `VITE_API_URL` is empty. The Workbench_App uses local storage and makes no network calls.
- **Queue_Response**: The JSON body of `GET /queue`: the Open and Reviewed rows, the checked count, the skipped records with reasons, the Evaluation_Time, the Threshold_Hours and the rule ID.
- **Review_Row**: A queue row that includes the review status, the review timestamp and the Reviewer when reviewed.
- **Stack**: The AWS CDK application that defines all infrastructure.
- **Allow_Localhost_Flag**: The CDK context flag `allowLocalhost`, default false.
- **CloudFront_Site**: The CloudFront distribution that serves the built Workbench_App from a private S3 bucket over HTTPS.
- **Stage_A_Success_Table**: The table of nine Given/Expected rows in `docs/brd-stalled-order.md`.
- **Cost_Estimate**: The monthly cost estimate by service in `docs/cost-estimate.md`.

## Requirements

### Requirement 1: Sign-in required

**User Story:** As a fulfillment lead, I want the queue behind a login, so that only authorized staff see order data.

#### Acceptance Criteria

1. IF a request to any API route has no Access_Token, THEN THE API SHALL reject the request with HTTP 401, SHALL NOT invoke the Queue_Function, and SHALL return no order data in the response body.
2. IF a request to any API route has an Access_Token that is malformed, has an invalid signature, has an issuer that does not match the User_Pool, or has an expiry time earlier than the current time, THEN THE API SHALL reject the request with HTTP 401, SHALL NOT invoke the Queue_Function, and SHALL return no order data in the response body.
3. THE JWT_Authorizer SHALL require the Required_Scope on every API route, with no route exempt.
4. IF a request carries a valid Access_Token that does not include the Required_Scope, THEN THE API SHALL reject the request, SHALL NOT invoke the Queue_Function, and SHALL return no order data in the response body. The expected status is HTTP 403 and is unverified (see criterion 10).
5. IF a request carries a valid Access_Token that includes the Required_Scope and the user is not a member of the Lead_Group, THEN THE Queue_Function SHALL respond with HTTP 403 and SHALL return no order data in the response body.
6. IF a request carries a valid Access_Token that includes the Required_Scope and the group claim is absent or empty, THEN THE Queue_Function SHALL treat the user as not a member of the Lead_Group and respond with HTTP 403.
7. WHEN a request carries a valid Access_Token that includes the Required_Scope and the user is a member of the Lead_Group, THE Queue_Function SHALL process the request and return the order data.
8. THE Queue_Function SHALL determine Lead_Group membership solely from the claims that the JWT_Authorizer passes to the function, and SHALL NOT make any call to the User_Pool to look up group membership.
9. THE Stack SHALL create exactly one Lead_Group in the User_Pool.
10. WHEN the Stack is deployed, THE project SHALL include a test of a request with a valid Access_Token that lacks the Required_Scope against the deployed API, and SHALL record the observed HTTP status code in the README or in `docs/`.
11. IF the observed status code from criterion 10 differs from 403, THEN THE project SHALL correct criterion 4 and every other requirement that states the status for a missing scope to the observed code.
12. THE Stack SHALL configure the User_Pool so that only an administrator can create users, and a self-service sign-up attempt by an unregistered user is rejected.

### Requirement 2: Hosted sign-in from the single-page app

**User Story:** As a fulfillment lead, I want to sign in on Cognito's hosted pages, so that the app never sees my password.

#### Acceptance Criteria

1. THE Stack SHALL create the App_Client as a public client with no client secret.
2. THE App_Client SHALL enable only the OAuth 2.0 authorization code grant through Managed_Login, and SHALL NOT enable the implicit grant.
3. THE App_Client SHALL list exactly two callback URLs: the CloudFront_Site URL and `http://localhost:5173`.
4. THE Stack SHALL create the Resource_Server with identifier `fulfillment-watch` and scope `api`, and THE App_Client SHALL be allowed to request the Required_Scope.
5. THE Stack SHALL create the Cognito_Domain with the prefix `fulfillment-watch-690559`.
6. WHILE the Workbench_App is in API_Mode and has no unexpired Access_Token, THE Workbench_App SHALL save the current hash route as the Saved_Route in `sessionStorage` and then redirect the user to Managed_Login before rendering any queue data.
7. WHEN the Workbench_App redirects to Managed_Login, THE Workbench_App SHALL request the Required_Scope and use PKCE with the authorization code grant.
8. WHEN Managed_Login redirects back with an authorization code, THE Sign_In_Callback SHALL run before the router starts, SHALL exchange the code for tokens using PKCE at the Cognito token endpoint, SHALL remove the query from the URL, and SHALL restore the Saved_Route.
9. WHEN the Workbench_App sends a request to the API, THE Workbench_App SHALL include the Access_Token in the `Authorization` header of that request.
10. THE Workbench_App SHALL keep the Access_Token in `sessionStorage` and SHALL NOT request or store a refresh token.
11. WHEN the stored Access_Token has expired, THE Workbench_App SHALL discard it and redirect the user to Managed_Login.
12. THE Workbench_App SHALL NOT render a password field or collect a password.
13. WHEN the Workbench_App completes sign-in, THE Workbench_App SHALL render the same page layout as defined in `docs/brd-ui-redesign.md`, with no layout element added or removed except the Sign_Out_Link.
14. WHILE the Workbench_App is in API_Mode and the user is signed in, THE Workbench_App SHALL show the Sign_Out_Link in the existing header.
15. WHILE the Workbench_App is in Local_Mode, THE Workbench_App SHALL NOT show the Sign_Out_Link.
16. WHEN the user selects the Sign_Out_Link, THE Workbench_App SHALL remove the Access_Token from `sessionStorage` and SHALL NOT show queue data until the user signs in again. Whether sign-out also ends the Cognito hosted session is open (OQ-15).
17. IF the user signs in successfully but the API responds with HTTP 403, THEN THE Workbench_App SHALL show a message stating that the account is not in the fulfillment-lead group, SHALL NOT show queue data, and SHALL NOT redirect the user back to Managed_Login automatically.
18. IF the token exchange fails or Managed_Login redirects back with an error, THEN THE Workbench_App SHALL show a message stating that sign-in failed, SHALL offer a control to restart sign-in, and SHALL NOT show queue data.
19. IF the API responds with HTTP 401, THEN THE Workbench_App SHALL discard the stored Access_Token and redirect the user to Managed_Login.

### Requirement 3: Same queue through the API

**User Story:** As a fulfillment lead, I want the signed-in queue to match what Stage A shows, so that I can trust it.

#### Acceptance Criteria

1. WHEN a signed-in lead requests `GET /queue`, THE Queue_Function SHALL evaluate the bundled synthetic orders with the Evaluator using the Evaluation_Time and the Threshold_Hours.
2. THE Queue_Function SHALL import the Evaluator from `src/rules` and SHALL NOT contain a second implementation of the rule.
3. WHEN the Queue_Function evaluates a dataset, THE Queue_Response SHALL contain rows, row order, checked count, and skipped records with reasons that are identical to the output of the Stage A Evaluator for the same dataset, Evaluation_Time and Threshold_Hours.
4. WHEN the Queue_Function builds the Queue_Response, THE Queue_Response SHALL include for each Review_Row the review status (reviewed or unreviewed), and, only when the row is reviewed, the review timestamp and the Reviewer.
5. WHEN the Queue_Function builds the Queue_Response, THE Queue_Response SHALL include the Evaluation_Time, the Threshold_Hours, the rule ID and the checked count.
6. WHEN a saved review exists for an order that no longer matches the rule, THE Queue_Function SHALL omit that order from the Queue_Response and SHALL leave the saved review unchanged.
7. WHEN the Queue_Function evaluates the same data with the same Evaluation_Time and Threshold_Hours twice, THE Queue_Response SHALL contain exactly one row per matching order and rule pair in each response, and the two responses SHALL be identical.
8. WHEN each row of the Stage_A_Success_Table is applied to the API as input, THE API SHALL return a Queue_Response that matches the expected result stated in that row, for every row of the table.
9. IF a client requests `GET /reviews`, THEN THE API SHALL reject the request as an unknown route and SHALL return no review data.
10. IF the evaluation or the retrieval of saved reviews fails, THEN THE Queue_Function SHALL return an error response indicating that the queue could not be produced, SHALL NOT return a partial queue, and SHALL leave saved reviews unchanged.
11. THE Queue_Function SHALL leave `src/rules` and `src/data` unchanged.

### Requirement 4: Deploy-time configuration

**User Story:** As an operator, I want the threshold and evaluation time set at deploy time, so that behavior is fixed and reproducible.

#### Acceptance Criteria

1. WHEN the Queue_Function handles a request, THE Queue_Function SHALL read the Threshold_Hours from the environment variable `FULFILLMENT_THRESHOLD_HOURS`.
2. WHERE `FULFILLMENT_THRESHOLD_HOURS` is not set, THE Queue_Function SHALL use 24 hours (`DEFAULT_THRESHOLD_HOURS` in `src/config.ts`).
3. WHEN the Queue_Function handles a request, THE Queue_Function SHALL read the Evaluation_Time from the environment variable `EVALUATION_TIME`.
4. WHERE `EVALUATION_TIME` is not set, THE Queue_Function SHALL use `2026-11-20T12:00:00Z` (`EVALUATION_TIME` in `src/config.ts`).
5. IF `FULFILLMENT_THRESHOLD_HOURS` is set and is not a finite decimal number greater than 0 (for example: empty string, whitespace only, non-numeric text, 0, a negative value, NaN or Infinity), THEN THE Queue_Function SHALL respond with HTTP 500 and a generic error body that does not contain the variable name, the rejected value, or any order data, and SHALL NOT return a partial queue.
6. IF `EVALUATION_TIME` is set and is not an ISO 8601 date-time with an explicit UTC designator (`Z`) that denotes a real calendar date and time (for example: empty string, a value without `Z`, a value with a non-UTC offset, or `2026-02-30T00:00:00Z`), THEN THE Queue_Function SHALL respond with HTTP 500 and a generic error body that does not contain the variable name, the rejected value, or any order data, and SHALL NOT return a partial queue.
7. IF a request includes a threshold or evaluation time in a query parameter or request body, THEN THE API SHALL ignore those values and evaluate the rule using only the configured Threshold_Hours and Evaluation_Time.
8. THE README SHALL describe the steps to change `FULFILLMENT_THRESHOLD_HOURS` and `EVALUATION_TIME`, to redeploy, and to confirm the new values took effect, and SHALL state the default values.
9. WHEN the Queue_Function evaluates the rule, THE Queue_Function SHALL compute order age only from the Evaluation_Time and SHALL NOT read the system clock.
10. WHEN the Queue_Function receives two requests under the same deployed configuration and the same order data, THE Queue_Function SHALL return identical queue results for both requests.

### Requirement 5: Server-side review

**User Story:** As a fulfillment lead, I want my review saved on the server under my name, so that every lead sees the same status.

#### Acceptance Criteria

1. WHEN a signed-in lead sends `POST /reviews` with an order ID and the rule ID `paid-unfulfilled` for an order in the current queue, THE Queue_Function SHALL save one review containing the order ID, rule ID, review timestamp and Reviewer.
2. WHEN the Queue_Function handles a `POST /reviews` request, THE Queue_Function SHALL read the system clock once at request time and pass the value into the Lambda_Review_Store as an argument, formatted as ISO 8601 UTC with millisecond precision and ending in `Z` (for example `2026-11-20T12:05:31.000Z`).
3. THE Reviews_Table SHALL hold at most one review for each order ID and rule ID pair.
4. IF a review already exists for the order ID and rule ID, THEN THE Queue_Function SHALL respond with HTTP 200, return the existing review in the response body, and leave the stored timestamp and Reviewer unchanged.
5. WHEN two or more requests review the same order ID and rule ID at the same time, THE Reviews_Table SHALL keep exactly one review, THE Queue_Function SHALL respond to every request with a success response (201 for the request that saved the review and 200 for the others), and every response body SHALL contain the same timestamp and Reviewer.
6. WHEN a review is newly saved, THE Queue_Function SHALL respond with HTTP 201 and return the saved review (order ID, rule ID, review timestamp, Reviewer) in the response body.
7. WHEN a lead signs in from a different browser after a review is saved, THE Workbench_App SHALL show the order as Reviewed with the saved review timestamp.
8. FOR ALL valid review requests, saving a review and then requesting `GET /queue` SHALL return the saved review timestamp and Reviewer on the matching queue row (round-trip property).
9. THE Queue_Function SHALL take the Reviewer from the `username` claim of the Access_Token and SHALL NOT take it from the request body, including when the request body contains a reviewer value.
10. IF the Access_Token has no `username` claim, THEN THE Queue_Function SHALL reject the request and SHALL NOT create or change any review.
11. IF the Lambda_Review_Store fails to save a review, THEN THE Queue_Function SHALL respond with an HTTP 5xx error response and SHALL NOT report the order as Reviewed in later `GET /queue` responses.
12. WHILE the Workbench_App is in API_Mode, WHEN an order is Reviewed, THE Workbench_App SHALL show the Reviewer in the existing review status text (for example "Reviewed by lead1"), with no element added to the layout.

### Requirement 6: Review request validation

**User Story:** As a fulfillment lead, I want clear errors for bad requests, so that I can tell what went wrong.

#### Acceptance Criteria

1. IF the `POST /reviews` body is missing, is empty, is not valid JSON, or lacks an order ID or a rule ID that is a non-empty string, THEN THE Queue_Function SHALL respond with HTTP 400 and an error message identifying which field or the body is invalid, and SHALL NOT write to the Reviews_Table.
2. IF the rule ID in a `POST /reviews` body is a valid string other than `paid-unfulfilled`, THEN THE Queue_Function SHALL respond with HTTP 400 and an error message indicating the rule ID is not supported, and SHALL NOT write to the Reviews_Table.
3. IF the order ID in a `POST /reviews` body is a valid string that is not in the current queue, THEN THE Queue_Function SHALL respond with HTTP 400 and an error message indicating the order is not in the queue, and SHALL NOT write to the Reviews_Table.
4. IF a call to the Reviews_Table fails, THEN THE Queue_Function SHALL respond with HTTP 500 and a generic error message that does not name the failing component, and SHALL NOT report the review as saved.
5. THE Queue_Function SHALL omit stack traces, resource names, and internal error details from every response body.
6. IF the Queue_Function responds with any HTTP 5xx status, THEN THE Queue_Function SHALL write a log entry to CloudWatch Logs containing the cause of the failure.
7. IF a request uses a method and path combination other than `GET /queue` or `POST /reviews`, THEN THE API SHALL respond with HTTP 404 and an error message indicating the route was not found.

### Requirement 7: Review repository

**User Story:** As a developer, I want one async review interface with a local and an API implementation, so that the Stage A tests keep passing and API mode shares the same app code.

#### Acceptance Criteria

1. THE ReviewRepository interface SHALL be asynchronous and SHALL have two implementations: the Local_Repository and the API_Repository.
2. THE Local_Repository SHALL wrap the Local_Review_Store and SHALL keep its behavior.
3. THE project SHALL leave `src/storage/reviews.ts` unchanged, and the existing tests for that module SHALL pass without modification.
4. THE API_Repository SHALL make every network call through the API_Client.
5. THE ReviewRepository SHALL identify each review by `reviewKey(orderId, ruleId)`, so that at most one review exists per unique combination of order ID and rule ID.
6. WHEN a save operation is called with an order ID and rule ID that already have a review, THE ReviewRepository SHALL keep the existing review, including its first timestamp and Reviewer, and SHALL return the existing review.
7. WHEN a get operation is called with an order ID and rule ID that have no saved review, THE ReviewRepository SHALL return an empty result and SHALL NOT raise an error.
8. THE Lambda_Review_Store SHALL use the same first-wins semantics as the Local_Review_Store: one review per order ID and rule ID, with the first timestamp and Reviewer kept.
9. THE Lambda_Review_Store SHALL require the review timestamp, as an ISO 8601 UTC string, as an argument to each save operation and SHALL NOT read the system clock.
10. IF the Lambda_Review_Store cannot complete a save or get operation because of a DynamoDB service error, THEN THE Lambda_Review_Store SHALL return an error to the caller that identifies the failed operation, and SHALL NOT modify or delete any previously saved review.
11. FOR ALL generated sequences of 1 to 50 save operations (each with an order ID, rule ID, timestamp and Reviewer), THE Local_Review_Store and the Lambda_Review_Store SHALL return identical reviews for every order ID and rule ID pair when queried after the sequence (model-based property, with the Lambda_Review_Store run against a DynamoDB test double).
12. THE Reviews_Table SHALL use on-demand (pay-per-request) capacity and SHALL NOT have provisioned read or write capacity units configured.

### Requirement 8: App mode selection

**User Story:** As a developer, I want one build-time switch between API mode and local mode, so that the Stage A demo keeps working.

#### Acceptance Criteria

1. WHERE `VITE_API_URL` is set at build time to a value containing at least one non-whitespace character, THE Workbench_App SHALL run in API_Mode.
2. WHERE `VITE_API_URL` is not set, is an empty string, or contains only whitespace at build time, THE Workbench_App SHALL run in Local_Mode.
3. WHILE the Workbench_App runs in Local_Mode, THE Workbench_App SHALL use the Local_Repository, SHALL require no sign-in, SHALL make no network requests to any API endpoint, and SHALL save and read reviews only in local storage.
4. WHILE the Workbench_App runs in API_Mode, THE Workbench_App SHALL use the API_Repository and SHALL make network calls only through the API_Client.
5. WHILE the Workbench_App runs in API_Mode, WHEN the queue view loads, THE Workbench_App SHALL read the queue with `GET /queue` against the `VITE_API_URL` base.
6. WHILE the Workbench_App runs in API_Mode, WHEN the user saves a review, THE Workbench_App SHALL send the review with `POST /reviews` against the `VITE_API_URL` base.
7. WHILE the Workbench_App runs in API_Mode, THE Workbench_App SHALL write no review entries to local storage. Tokens and the Saved_Route in `sessionStorage` are not review entries.
8. IF a `GET /queue` or `POST /reviews` request fails while the Workbench_App runs in API_Mode, THEN THE Workbench_App SHALL show an error message indicating the request failed and SHALL NOT fall back to Local_Mode.
9. THE Workbench_App SHALL show the same page layout, hash routes, empty-state text and label text in API_Mode and Local_Mode, except for values that come from the Queue_Response, the Reviewer in the review status text (see Requirement 5, criterion 12) and the Sign_Out_Link in API_Mode.
10. WHEN the Workbench_App receives a Queue_Response in API_Mode, THE Workbench_App SHALL show the Evaluation_Time and the checked count exactly as returned in that Queue_Response.

### Requirement 9: Error and retry behavior in the app

**User Story:** As a fulfillment lead, I want to see an error I can retry, so that a failed call does not leave me stuck.

#### Acceptance Criteria

1. IF a request from the API_Client receives no response within 10 seconds, THEN THE API_Client SHALL treat the request as failed with a timeout.
2. IF `GET /queue` fails due to a network error or timeout, or returns a non-2xx status other than 401 and 403, THEN THE Workbench_App SHALL replace the queue content with an error message that names the failed action (loading the queue) and SHALL show a Retry control.
3. WHEN the lead selects the Retry control, THE Workbench_App SHALL repeat the failed request once per selection, SHALL show the loading state until the request completes, and SHALL disable the Retry control while the request is in progress.
4. IF `POST /reviews` fails due to a network error or timeout, or returns a non-2xx status other than 401, THEN THE Workbench_App SHALL keep the order in Open, SHALL preserve the lead's current page and selected order, and SHALL show an inline error with a Retry control next to that order.
5. WHEN the lead selects Retry on a failed review request, THE Workbench_App SHALL send a `POST /reviews` request with the same order ID and rule ID as the failed request.
6. IF a retried request succeeds, THEN THE Workbench_App SHALL remove the error message and Retry control and SHALL display the result as it would after a first-attempt success.
7. IF the API responds with HTTP 401, THEN THE Workbench_App SHALL redirect the user to Managed_Login and SHALL NOT show an error message with a Retry control.
8. IF the API responds with HTTP 403, THEN THE Workbench_App SHALL show an error message indicating the lead lacks permission and SHALL NOT show a Retry control.
9. IF an error message is shown, THEN THE Workbench_App SHALL exclude stack traces and raw response bodies from that message.
10. WHILE a request is in progress, THE Workbench_App SHALL show a loading state on the affected page and SHALL remove it when the request completes or fails.

### Requirement 10: Infrastructure as code

**User Story:** As an operator, I want all infrastructure defined in CDK, so that I can deploy and remove it repeatably.

#### Acceptance Criteria

1. THE Stack SHALL define the User_Pool, Cognito_Domain, Resource_Server, Lead_Group, App_Client, API, JWT_Authorizer, Queue_Function, Reviews_Table, S3 bucket, CloudFront_Site, log groups and alarms.
2. THE Stack SHALL deploy to the us-east-1 region.
3. WHEN `cdk deploy` runs in a clean account in us-east-1 with bootstrapped CDK resources, THE Stack SHALL create all resources defined in criterion 1 and finish with exit code 0.
4. IF `cdk deploy` fails during resource creation, THEN THE Stack SHALL roll back to the state before the deploy and report the failing resource in the CloudFormation events.
5. WHEN the README teardown steps run, THE Stack SHALL remove all resources that it created, including the S3 bucket with its objects, the Reviews_Table and the log groups, and `cdk destroy` SHALL finish with exit code 0.
6. THE Stack SHALL use a Node.js Lambda runtime that is currently supported per `docs/aws-notes.md` section 5 (`nodejs24.x` or `nodejs26.x`).
7. THE Stack SHALL define the Queue_Function with `NodejsFunction`, with `projectRoot` set to the repository root, so that esbuild bundles the shared code in `src/rules`.
8. THE Stack SHALL list `esbuild` as a dev dependency.
9. THE Stack SHALL store the S3 bucket as private, with all four S3 Block Public Access settings enabled, and give CloudFront access through origin access control (OAC).
10. THE Stack SHALL configure the CloudFront_Site with `index.html` as the default root object.
11. THE Stack SHALL configure the CloudFront_Site to redirect HTTP requests to HTTPS.
12. THE Stack SHALL pass the Evaluation_Time and Threshold_Hours to the Queue_Function as environment variables.
13. THE Stack SHALL contain no secret values in source files, synthesized templates or Lambda environment variables.
14. WHEN `cdk synth` runs, THE Stack SHALL synthesize with no errors and exit code 0.

### Requirement 11: Least privilege, throttling and CORS

**User Story:** As an operator, I want narrow permissions and limits, so that the pilot has a small blast radius.

#### Acceptance Criteria

1. THE Stack SHALL give the Queue_Function its own IAM role that is not attached to any other function in the Stack.
2. THE Queue_Function role SHALL grant only the named DynamoDB actions that the Queue_Function code invokes, on the Reviews_Table ARN only, and SHALL grant no DynamoDB permissions on any other table or index ARN.
3. THE Queue_Function role SHALL NOT use a wildcard (`*`) in any DynamoDB action or in any DynamoDB resource ARN.
4. THE API SHALL throttle requests at a steady-state rate of 10 requests per second with a burst limit of 20 requests.
5. IF the request rate exceeds the throttle limit in criterion 4, THEN THE API SHALL reject the excess requests with a throttling error response and SHALL continue to serve requests within the limit.
6. THE Stack SHALL read the Allow_Localhost_Flag from CDK context with a default of false.
7. WHILE the Allow_Localhost_Flag is false, THE API SHALL allow cross-origin requests only from the CloudFront_Site origin.
8. WHERE the Allow_Localhost_Flag is true, THE API SHALL allow cross-origin requests from the CloudFront_Site origin and from `http://localhost:5173`.
9. IF a browser request carries an `Origin` that is not an allowed origin, THEN THE API SHALL omit the cross-origin allow header from the response so the browser blocks the response.
10. WHEN the Stack is deployed, THE deployment SHALL use the Allow_Localhost_Flag set to false.

### Requirement 12: Logging and alarms

**User Story:** As an operator, I want logs and alarms, so that I can see failures.

#### Acceptance Criteria

1. THE Stack SHALL set a log retention of 14 days on the Queue_Function log group.
2. THE Stack SHALL set a log retention of 14 days on every other log group that it creates.
3. THE Stack SHALL create a CloudWatch alarm on the Queue_Function Errors metric that goes into alarm WHEN the Sum is greater than or equal to 1 over one 5-minute period.
4. THE Stack SHALL create a CloudWatch alarm on the API 5XX metric that goes into alarm WHEN the Sum is greater than or equal to 1 over one 5-minute period.
5. THE Stack SHALL NOT create an SNS topic or an email subscription for the alarms.
6. THE Queue_Function SHALL NOT write Access_Tokens or other credentials to its logs, including when the request or an error contains one.

### Requirement 13: Hosting the front end

**User Story:** As an operator, I want the app served over HTTPS from S3 and CloudFront, so that the pilot runs the way production would.

#### Acceptance Criteria

1. WHEN a browser requests the CloudFront_Site root URL over HTTPS, THE CloudFront_Site SHALL serve the built Workbench_App from the S3 bucket and return `index.html` with a success response.
2. IF a browser requests the CloudFront_Site over HTTP, THEN THE CloudFront_Site SHALL redirect the request to the same URL over HTTPS.
3. WHEN a browser requests a hash-routed page such as `/#/orders/1042` from the CloudFront_Site, THE CloudFront_Site SHALL return `index.html` without a rewrite rule, and THE Workbench_App SHALL render the order 1042 page.
4. WHEN Managed_Login redirects to the CloudFront_Site with a `?code=` query before the hash route, THE Sign_In_Callback SHALL complete sign-in and THE Workbench_App SHALL show the Saved_Route.
5. IF sign-in completion fails after a `?code=` redirect, THEN THE Workbench_App SHALL show an error indicating that sign-in failed, offer a control to restart sign-in, and show no order data.
6. THE production build of the Workbench_App SHALL use the Vite `base` `/` and SHALL load every asset (scripts, styles, images) from the site root, so that each asset request returns a success response when the page is opened at `/` and at `/#/orders/1042`.
7. THE Vite dev server SHALL keep the `base` `/absproxy/5173/`.
8. THE Workbench_App build SHALL receive the API URL, the Cognito domain and the App_Client ID as build-time values and SHALL contain no secret, meaning the built output contains no client secret, access key or password.

### Requirement 14: Tests and verification

**User Story:** As a developer, I want automated checks, so that Stage A behavior and the new handlers stay correct.

#### Acceptance Criteria

1. THE project SHALL include Vitest tests for the `GET /queue` handler and the `POST /reviews` handler, with at least one passing success-path test for each handler, and the `POST /reviews` success-path test SHALL assert HTTP 201.
2. THE project SHALL include one Vitest test for each row of the Stage_A_Success_Table, and each test SHALL run through the `GET /queue` handler and assert that the returned row matches that table row's expected result.
3. THE handler tests SHALL include one separate test for each of the following cases, and each test SHALL assert the stated response and that no Reviews_Table write occurred, except for the repeat review case: a missing token (401), a user outside the Lead_Group (403), a malformed body (400), a wrong rule ID (400), an order ID not in the queue (400), a repeat review (200 with the first timestamp and Reviewer, and the stored record unchanged), and a Reviews_Table failure (500).
4. THE handler tests SHALL pass the evaluation time and the review timestamp as arguments and SHALL NOT call the real clock.
5. THE handler tests SHALL use synthetic data only, with no real customer, order or user values.
6. THE project SHALL include a property test that runs at least 100 generated datasets and asserts that the Queue_Response rows equal the Evaluator output for each dataset.
7. THE project SHALL include a property test that runs at least 100 generated cases and asserts that saving the same review N times, for N from 1 to 10, leaves the same stored record as saving it once, with the first timestamp and Reviewer kept.
8. WHEN the full test suite runs, THE project SHALL pass all existing Stage A tests and all existing UI redesign tests with 0 failures and 0 tests skipped or removed.
9. WHEN the test run executes `cdk synth`, THE Stack SHALL synthesize with exit code 0 and 0 errors.
10. WHEN `npm run lint` and `npm run build` run, THE project SHALL complete each with exit code 0.
11. THE project SHALL NOT contain the test user's password in any tracked file, and the password SHALL be set by hand outside the repository.

### Requirement 15: Documentation and cost

**User Story:** As an operator, I want a README and a cost estimate, so that I can deploy, run, change and remove the system.

#### Acceptance Criteria

1. THE README SHALL contain a separate section, in this order, for each of the following tasks: deploy the Stack, create the test user, add the test user to the Lead_Group, run the app in each of its two run modes, change the threshold, and tear down the Stack. Each section SHALL list the commands to run and the result the operator should see when the task has succeeded.
2. THE project SHALL contain the Cost_Estimate in `docs/cost-estimate.md`, and THE README SHALL link to it.
3. THE Cost_Estimate SHALL contain one table by service that lists every AWS service the Stack uses, with a monthly cost in USD rounded to the nearest cent both with the AWS Free Tier applied and without it, and a total for each of the two columns equal to the sum of the per-service costs. A service with no charge under the assumptions SHALL be listed with a cost of 0.00.
4. THE Cost_Estimate SHALL state the assumptions: 10 users, 1,000 API requests per day, 100 reviews per day, and 1 GB of data transfer per month through CloudFront.
5. THE Cost_Estimate SHALL show the working for each service in the same document: the usage quantity, the unit price, and the resulting monthly cost, so that a reader can recompute every figure.
6. THE Cost_Estimate SHALL name the pricing source and the date the prices were read, written as YYYY-MM-DD, and the prices SHALL come from current AWS pricing looked up when the estimate is written.
7. THE README SHALL state that all data in the system is synthetic and that the Stack is deployed in the us-east-1 region.

### Requirement 16: Scope limits

**User Story:** As a product owner, I want Stage B kept inside its brief, so that the pilot stays small.

#### Acceptance Criteria

1. THE Stack SHALL NOT include an SQS queue, a notification, or a connection to Shopify or commercetools.
2. THE Queue_Function SHALL NOT write to order data.
3. THE Stack SHALL NOT include self-sign-up, a role beyond the Lead_Group, a custom domain, or Amazon Bedrock at runtime.
4. THE project SHALL contain synthetic data only and no secrets.

## Constraints

- `src/rules` and `src/data` are never changed. The Evaluator is reused unchanged.
- `src/storage/reviews.ts` is not changed. New files under `src/storage/` are allowed.
- Network calls are allowed only in API_Mode and only through the single `src/api` module (steering files `tech.md`, `product.md` and `ui-style.md` are already updated to say this).
- `vite.config.ts` may be changed only to give the production build the `base` `/` while the dev server keeps `/absproxy/5173/`.
- The page layout, hash routes and component structure from the UI redesign stay unchanged (steering `ui-style.md`), except for the Sign_Out_Link in API_Mode. The Reviewer name appears inside the existing review status text only.
- Reviews are keyed by order ID and rule ID.
- Stage A stays working as the fallback demo.

## Open Questions

These items are not settled by the BRD or the confirmed decisions. They need an answer before or during design.

- **OQ-15: Sign-out scope.** The Sign_Out_Link removes the local tokens. It is not decided whether it also calls the Cognito logout endpoint to end the hosted session, which would need a logout URL on the App_Client. Without it, the next sign-in may complete without a password prompt.
- **OQ-16: ReviewRepository save signature.** The Local_Repository needs a timestamp passed in (no clock reads), while the API_Repository gets the timestamp and Reviewer from the server. The exact method signature that serves both is not decided.
- **OQ-17: Token lifetime and Saved_Route fallback.** The Access_Token validity period is not set (the Cognito default applies unless the user states one). The route to show when no Saved_Route exists in `sessionStorage` after sign-in is not stated.
- **OQ-18: Verification of the missing-scope status.** The 403 for a missing scope is unverified until the deployed API test in Requirement 1, criterion 10 is run. This question closes when the observed status is recorded.
