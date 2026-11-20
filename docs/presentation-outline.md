# Presentation outline (10 slides)

Every number below comes from the repo or from the runs on 2026-11-20. See [test-evidence.md](test-evidence.md).

| # | Slide | One line of content | Facts and numbers to show |
| --- | --- | --- | --- |
| 1 | Fulfillment Watch | A workbench that catches paid orders stuck in the warehouse before the customer asks. | Order Exception Workbench. Synthetic data only. Region us-east-1. |
| 2 | The problem and the rule | Flag paid orders with nothing shipped after the threshold. | Rule "Paid and unfulfilled": paid, at least 24 h since payment (exactly 24 h counts), 0 units fulfilled, not canceled, not fully refunded. Evaluation time fixed at 2026-11-20T12:00:00Z. Suggested action: "Confirm pick status with the warehouse." |
| 3 | What a lead sees | Queue, evidence, mark reviewed, invalid records listed. | 17 records checked, 6 flagged, 5 skipped. Oldest first: #1051 (93 h), #1049 (50 h), #1050 (29 h), #998 and #1042 (27 h), #1043 (24 h). Skipped: invalid timestamp, future timestamp, negative quantity, missing timestamp, duplicate ID. |
| 4 | Two modes, one codebase | One build setting switches between the browser-only demo and the AWS backend. | `VITE_API_URL` empty means Local mode: no sign-in, no network, local storage. Set means API mode: Cognito, API, DynamoDB. Same layout. The only additions are Sign out and "Reviewed by <user>". |
| 5 | Architecture | One CDK stack, all serverless. | CloudFront + private S3 (OAC), Cognito managed login (PKCE), API Gateway HTTP API (JWT authorizer, 2 routes), Lambda Node.js 24 arm64 256 MB, DynamoDB on-demand. Deploy 212 s. |
| 6 | Security | Signed in, in the right group, least privilege. | Scope `fulfillment-watch/api` on every route. Group `fulfillment-lead` checked in the Lambda. IAM: 3 DynamoDB actions on 1 table ARN. Bucket fully private and HTTPS-only. CORS: CloudFront origin only. Throttle 10 per second, burst 20. No secrets (gitleaks and semgrep clean). |
| 7 | Proven on the live API | We checked the deployed stack, not just the code. | verify script 9/9 PASS: 401 no token, 401 bad token, 403 missing scope, 403 not in group, 404 `GET /reviews`, CORS on all. Reviews: 201 first, 200 repeat with the same timestamp. 400 for an order not in the queue. |
| 8 | What deployment taught us | A live test caught a bug that unit tests could not. | Cognito adds `cognito:groups` only when `openid` is requested. lead1 was blocked until the app asked for `openid fulfillment-watch/api`. Fixed, redeployed and re-checked in the browser. |
| 9 | Quality and cost | Tested end to end, and costs about nothing. | Tests: 238 (Stage A) grew to 443, in 55 files, 0 failing. Every Stage A success row is tested on both the rule and the API. 21 CDK assertions. Cost: $0.53 a month without the Free Tier, $0.02 with it (10 users, 1,000 requests a day). |
| 10 | Limits and next steps | What we'd do before production. | Alarms have no notification target. No CSP or HSTS headers. Localhost is always a Cognito callback. No 401-loop guard. No point-in-time recovery on the table. The Rule page shows the config constant. Not verified: alarms firing, live throttling, `cdk destroy`. |
