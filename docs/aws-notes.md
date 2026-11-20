# AWS notes

Gathered 2026-11-20 from the AWS documentation search and read tools. Each section lists its sources. Items marked "not confirmed" were not found in the pages retrieved.

## 1. Cognito sign-in from a single-page app

**Recommendation: use managed login (hosted pages, authorization code grant) unless you need a fully custom flow.**

- Managed login supplies sign-up, sign-in, MFA, password management and passwordless/passkey sign-in. It acts as an OAuth 2.0 authorization server and handles user flows through the authorization code grant. It also supports social and SAML/OIDC federation.
- A custom UI (SDK calls) is the better fit for custom authentication flows (custom auth challenge Lambda triggers), custom input forms, session expiry under 1 hour, and trusted-device sign-in. In the comparison table, OAuth 2.0 flows are "Not available" for a custom UI.
- If you skip the hosted UI, you must write code to call the public and authenticated Cognito API requests yourself. Social providers (Google, Amazon, Facebook, Apple) require the hosted UI.
- SPA app client: a public client runs in a browser and has no client secret.
- Not confirmed: the retrieved pages did not explicitly state PKCE as the SPA requirement. Check the Cognito app client and authorize-endpoint pages before relying on it.

Sources:
- [Should I use managed login or create a custom UI in Amazon Cognito? (AWS Security Blog)](https://aws.amazon.com/blogs/security/use-the-hosted-ui-or-create-a-custom-ui-in-amazon-cognito/)
- [Use the Cognito hosted UI for sign-up and sign-in pages](https://docs.aws.amazon.com/help-panel/cognito/latest/console/hp-use-the-cognito-hosted-ui-for-sign-up-and-sign-in-pages.html)
- [Application-specific settings with app clients](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-client-apps.html)

## 2. JWT authorizer on an API Gateway HTTP API in front of Lambda

- Create a JWT authorizer (type `JWT`) with an identity source (for example `$request.header.Authorization`), an `Issuer` and an `Audience`. For Cognito the issuer is `https://cognito-idp.<region>.amazonaws.com/<userPoolId>`. Attach it to the route.
- API Gateway checks the token signature against the issuer's `jwks_uri` (RSA only), then validates `kid`, `iss`, `aud` or `client_id`, `exp`, `nbf`, `iat`, and `scope`/`scp` against the route's authorization scopes.
- Claims reach the Lambda integration at `requestContext.authorizer.jwt.claims`.
- AWS recommends requiring authorization scopes on routes, because nothing in a JWT reliably distinguishes access tokens from ID tokens. Alternatively, pin the issuer and audience to values used only for access tokens.
- Public keys are cached for up to two hours, so allow a grace period when rotating keys.

Sources:
- [Control access to HTTP APIs with JWT authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html)
- [Set up an Amazon Cognito user pool as an authorizer (re:Post)](https://repost.aws/knowledge-center/api-gateway-cognito-user-pool-authorizer)

## 3. Vite static site on a private S3 bucket behind CloudFront with OAC

- Use origin access control (OAC), not origin access identity (OAI). AWS calls OAC the best practice, and the console labels it "recommended". Leave the signing behavior at the default, "Sign requests (recommended)".
- CDK: `origins.S3BucketOrigin.withOriginAccessControl(bucket)` with `new cloudfront.Distribution(...)`. Set `defaultRootObject: 'index.html'`. Without it, the root path returns a listing of object keys.
- By default a missing object returns 403 from an OAC origin. Add `originAccessLevels: [AccessLevel.READ, AccessLevel.LIST]` to get 404 instead.
- SPA client-side routing: refreshing a deep link returns 403 or 404 from S3. Add custom error responses for both 403 and 404 with response page `/index.html` and HTTP status 200.
- If the bucket previously used OAI, manually remove the OAI policy statement after switching to OAC.

Sources:
- [Restrict access to an Amazon S3 origin](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
- [CDK aws_cloudfront_origins README](https://constructs.dev/packages/aws-cdk-lib/v/2.277.0?submodule=aws_cloudfront_origins&lang=typescript)
- [How do I optimize CloudFront to serve my single-page application? (re:Post)](https://repost.aws/knowledge-center/cloudfront-single-page-application)
- [Specify a default root object](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DefaultRootObject.html)

## 4. Bundling a TypeScript Lambda that imports shared repo code (CDK)

- Use `NodejsFunction` from `aws-cdk-lib/aws-lambda-nodejs`. It bundles with esbuild, which follows imports, so shared code in the repo is included.
- `entry` must sit under `projectRoot`, which defaults to the directory containing the package manager lock file. If the shared code lies outside that directory, set `projectRoot` (and `depsLockFilePath` if needed) so that the path covers `entry` and every module the function uses. Otherwise bundling fails.
- If esbuild is installed locally it is used. Otherwise CDK bundles in a Lambda-compatible Docker container. Install `esbuild` as a dev dependency. In a monorepo, install it in the root `package.json`.
- Not confirmed: the retrieved pages did not describe a specific tsconfig or path-alias setup for shared code.

Sources:
- [CDK aws_lambda_nodejs README](https://constructs.dev/packages/aws-cdk-lib/v/2.277.0?submodule=aws_lambda_nodejs&lang=typescript)
- [NodejsFunctionProps API](https://constructs.dev/packages/aws-cdk-lib/v/2.277.0/api/NodejsFunctionProps?lang=typescript&submodule=aws_lambda_nodejs)

## 5. Supported Lambda Node.js runtimes (as of 2026-11-20)

| Runtime | Identifier | Deprecation date |
| --- | --- | --- |
| Node.js 26 | `nodejs26.x` | Apr 30, 2029 |
| Node.js 24 | `nodejs24.x` | Apr 30, 2028 |
| Node.js 22 | `nodejs22.x` | May 30, 2027 |

- All three run on Amazon Linux 2023. Dates are forecasts and can change.
- Already deprecated: Node.js 20 (`nodejs20.x`, Apr 30, 2026), Node.js 18 (Sep 1, 2025), and Node.js 16 (Jun 12, 2024).
- For new work, pick `nodejs24.x` or `nodejs26.x`. The CDK `aws_lambda_nodejs` README links to a `nodejs24.x` build image.

Sources:
- [Lambda Event Function runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html)
- [Runtime deprecation](https://docs.aws.amazon.com/lambda/latest/dg/runtime-support-policy.html)

Content was rephrased for compliance with licensing restrictions.
