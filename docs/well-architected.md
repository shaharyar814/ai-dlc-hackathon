# Well-Architected summary

This page covers three pillars of the AWS Well-Architected Framework for the `FulfillmentWatch` stack. It is a short self-assessment, not a formal review.

"Tested" means a stack assertion in `infra/stack.test.ts` or a unit or property test. "Verified live" means we checked it on the deployed stack on 2026-11-20. "Not verified" means neither was done.

| Pillar | What we did | Where in the repo | Status |
| --- | --- | --- | --- |
| Operational Excellence | Two CloudWatch alarms: Lambda `Errors` and API Gateway `5xx`, each Sum >= 1 over one 5-minute period. They have no actions (no SNS, no email). | `infra/lib/stack.ts` (`FunctionErrorsAlarm`, `Api5xxAlarm`) | Tested in the template. The alarms firing is not verified. |
| Operational Excellence | The function log group keeps logs for 14 days. Every 5xx writes one JSON log line with the cause. Logs never include the event, headers, claims or `Authorization`. | `infra/lib/stack.ts` (`QueueFunctionLogs`), `server/handleRequest.ts` (`logFailure`) | Tested (`server/properties/noLeaks.test.ts`). The log contents in CloudWatch are not verified. |
| Operational Excellence | All infrastructure is in CDK. Deploy, threshold change and teardown are documented. `scripts/verify-deployed-api.mjs` checks a deployed API. | `infra/`, `README.md`, `scripts/` | Deploy verified live (212 s, `CREATE_COMPLETE`). Teardown is not verified. |
| Operational Excellence | The threshold and evaluation time are deploy-time settings. A bad value is rejected at synth and returns a generic 500 at run time. | `infra/bin/app.ts`, `server/runtimeConfig.ts` | Tested. Changing them on the deployed stack is not verified. |
| Security | The API Gateway default stage throttles at 10 requests per second with a burst of 20. | `infra/lib/stack.ts` (`defaultRouteSettings`) | Tested in the template. A live 429 is not verified. |
| Security | Sign-in uses Cognito managed login, the authorization code grant with PKCE, a public client with no secret and no implicit grant. Self sign-up is off. The token is kept in `sessionStorage` with no refresh token. | `infra/lib/stack.ts`, `src/api/auth.ts`, `src/api/pkce.ts` | Tested. Verified live with lead1 and outsider1 in the browser. |
| Security | Every route has the JWT authorizer and requires scope `fulfillment-watch/api`. There are no other routes. | `infra/lib/stack.ts` | Verified live: no token 401, malformed token 401, token without the scope 403, `GET /reviews` 404. |
| Security | The group check runs in the Lambda, from the token claims only. A user outside `fulfillment-lead` gets 403 and no data. The reviewer comes from the token, never from the body. | `server/claims.ts`, `server/handleRequest.ts` | Tested, including properties 3 and 11. Verified live: outsider1 gets 403 and the "No access" screen. |
| Security | Least-privilege role: the function has its own role with `dynamodb:PutItem`, `GetItem` and `BatchGetItem` on the table ARN only, plus writes to its own log group. No wildcards and no `grantReadWriteData`. | `infra/lib/stack.ts` (`QueueFunctionRole`) | Tested in the template. |
| Security | Private bucket, HTTPS only: all four Block Public Access settings, S3-managed encryption, `enforceSSL`, CloudFront origin access control, viewer protocol `redirect-to-https`. | `infra/lib/stack.ts` (`SiteBucket`, `SiteDistribution`) | Tested in the template. Verified live: the site loads over HTTPS from CloudFront. Direct S3 access refused is not verified. |
| Security | CORS allows only the CloudFront origin. `http://localhost:5173` is added only with `allowLocalhost=true`. | `infra/lib/stack.ts` | Tested. Verified live: `access-control-allow-origin` is the site origin on 401 and 403. |
| Security | No secrets in the repo. gitleaks and semgrep run in `npm run check`. Test passwords live outside the repo with mode 600. | `.gitleaks.toml`, `package.json` (`check`) | `npm run check` passed on 2026-11-20: gitleaks found no leaks in the directory or git scans, and semgrep had no findings. |
| Cost | Serverless, pay-per-use services only: on-demand DynamoDB, an HTTP API (cheaper than a REST API), an arm64 Lambda at 256 MB, CloudFront price class 100. There is no NAT, VPC or always-on compute. | `infra/lib/stack.ts` | Tested in the template. |
| Cost | Monthly estimate for 10 users and 1,000 requests per day: $0.53 without the Free Tier and $0.02 with it. Several unit prices come from secondary sources. | `docs/cost-estimate.md`, checked by `docs/cost-estimate.test.ts` | The estimate is a calculation. The real bill is not verified. |
| Cost | `cdk destroy` removes everything (`RemovalPolicy.DESTROY`, `autoDeleteObjects`), so a demo stack leaves no cost behind. | `infra/lib/stack.ts`, `README.md` | Not verified (the stack is still deployed). |

## Gaps

- The alarms notify no one.
- CloudFront sends no security headers (CSP, HSTS).
- `localhost` is always a registered Cognito callback URL.
- There is no guard against a sign-in loop after repeated 401s.
- The table has no point-in-time recovery, and `cdk destroy` deletes it.

See "Known limits" in the [README](../README.md).
