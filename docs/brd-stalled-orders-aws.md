# Order Exception Workbench: AWS Backend (Stage B)

Start only after Stage A is merged. Stage A stays working as the fallback demo.

## Why

In Stage A, reviews live in one browser, with no sign-in and nothing shared or auditable. A fulfillment team needs the queue behind a login, with reviews saved on a server so every lead sees the same status. This stage also shows the app deployed on AWS the way a pilot would run.

## Who it is for

The same fulfillment lead, now signed in. They want the same queue and the same review actions, available from any browser, with their reviews recorded under their name.

## In scope

- Sign-in with Amazon Cognito. One group, `fulfillment-lead`, may use the app.

- An HTTP API with a JWT authorizer, in front of a Lambda function.

- `GET /queue`: runs the Stage A rule evaluator on the bundled synthetic orders at the fixed evaluation time.

- `POST /reviews`: records a review for an order and rule.

- A DynamoDB table of reviews keyed by order ID and rule ID, with review timestamp and reviewer.

- The front end served from S3 through CloudFront over HTTPS.

- All infrastructure defined in AWS CDK.

- CloudWatch logs with retention set, and alarms on Lambda errors and API 5xx.

- A README to deploy, run, change the threshold, and tear down, and a monthly cost estimate by service.

## Out of scope

- SQS or any queue, notifications, live Shopify or commercetools, refunds, and any write to an order.

- Self-sign-up, multiple roles beyond one group, custom domains, and Amazon Bedrock at runtime.

- Real or sensitive data. Synthetic data only, in us-east-1.

## Requirements

1. **Sign-in required.** WHEN a request has no valid token, THE SYSTEM SHALL reject it with 401. WHEN the user is signed in but not in the `fulfillment-lead` group, THE SYSTEM SHALL reject it with 403.

2. **Same queue.** WHEN a signed-in lead requests the queue, THE SYSTEM SHALL return the same rows, order, counts and skipped-record reasons that Stage A shows for the same data and evaluation time.

3. **Server-side review.** WHEN the lead marks an order reviewed, THE SYSTEM SHALL save one review per order ID and rule ID with the timestamp and the reviewer's identity. A repeat request SHALL not create a duplicate or change the first timestamp, and the review SHALL be visible after reload and in another browser.

4. **Infrastructure and operations.** THE SYSTEM SHALL be deployable from CDK with one role per function granting only named actions on the one table, log retention set, API throttling on, and CORS limited to the CloudFront domain.

5. **Errors.** WHEN an input is invalid or a call fails, THE SYSTEM SHALL return a clear 400 or 5xx without a stack trace, and the screen SHALL show an error the lead can retry.

## Success criteria

- Every row of the Stage A success table still passes, now through the API.

- A review made in one browser appears after sign-in in another.

- A request with no token gets 401, and a signed-in user outside the group gets 403.

- `cdk deploy` creates the stack from a clean account, and the README teardown removes it.

- CloudWatch shows the function logs, and the alarms exist.

## Constraints

- Storage adapter with two implementations, local storage for Stage A tests and DynamoDB when deployed.

- Reuse the Stage A pure rule function. Do not duplicate the rule.

- Node.js Lambda on a currently supported runtime. Check AWS documentation before choosing services or versions.

- No secrets in code, prompts, steering or the repo. The test user's password is set by hand and never committed.

- Tests for the handlers, and `cdk synth` passes.

- Keep running cost near zero by using serverless services and on-demand capacity.

## Decisions made in this brief

- The first review timestamp is kept on repeat requests.

- Reviewer identity is the Cognito username.

- Check the sign-in method (Cognito hosted sign-in or a custom form) with the AWS docs tools before the design is approved. Prefer hosted sign-in, so the app never handles passwords.

