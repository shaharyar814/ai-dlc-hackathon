# Fulfillment Watch

Order Exception Workbench for stalled paid orders. A fulfillment lead sees paid orders that have not shipped after a threshold (default 24 hours) and marks them reviewed.

All data is synthetic. Stage A runs in the browser with local storage. Stage B (this branch) adds a Cognito sign-in and an AWS backend (API Gateway HTTP API, one Lambda, DynamoDB, S3 and CloudFront) in **us-east-1**. One build-time setting chooses between them.

- Cost: [docs/cost-estimate.md](docs/cost-estimate.md)
- Missing-scope check: [docs/scope-verification.md](docs/scope-verification.md)

## Run modes

| Mode | When | What it does |
| --- | --- | --- |
| Local mode | `VITE_API_URL` is empty or unset | Stage A. No sign-in, no network calls, reviews in local storage. |
| API mode | `VITE_API_URL` is set to the API URL at build time | Hosted Cognito sign-in, queue and reviews from the API. |

### Run Local mode

```sh
npm run dev
```

Run it in your own terminal. The dev server uses port 5173 and the base `/absproxy/5173/`. Expected result: the queue opens with no sign-in and no network request.

### Run API mode against a deployed stack

1. Deploy with `allowLocalhost=true` so the API allows `http://localhost:5173` (see "Deploy the stack").
2. Start the dev server with the values from the stack outputs, using the root base path:

```sh
VITE_API_URL=<ApiUrl> VITE_COGNITO_DOMAIN=<CognitoDomainUrl> VITE_COGNITO_CLIENT_ID=<AppClientId> npx vite --base /
```

3. Open `http://localhost:5173/`. Expected result: the browser goes to the Cognito sign-in page, and after sign-in returns to the page you opened.

## Deploy the stack

You need AWS credentials for the target account and a CDK-bootstrapped environment in us-east-1 (`cdk bootstrap` is a one-time step you run yourself). Nothing in this repository deploys by itself.

1. Check the stack builds: `npm run cdk -- synth`. Expected result: exit code 0 and a `cdk.out/` folder.
2. Deploy: `npm run cdk -- deploy -c allowLocalhost=false`. Expected result: the stack reaches `CREATE_COMPLETE` and prints these outputs: `ApiUrl`, `UserPoolId`, `AppClientId`, `CognitoDomainUrl`, `SiteUrl`, `SiteBucketName`, `DistributionId`. Use `-c allowLocalhost=true` only for local API-mode development.
3. Build the front end with the outputs (replace the values):

```sh
VITE_API_URL=<ApiUrl> VITE_COGNITO_DOMAIN=<CognitoDomainUrl> VITE_COGNITO_CLIENT_ID=<AppClientId> npm run build
```

Expected result: `dist/index.html` references assets from `/`.

4. Upload and invalidate the cache:

```sh
aws s3 sync dist s3://<SiteBucketName> --delete
aws cloudfront create-invalidation --distribution-id <DistributionId> --paths "/*"
```

5. Open `<SiteUrl>`. Expected result: sign-in page, then the queue.

## Create the test user and add it to the group

Sign-up is off. An administrator creates users. Set the password yourself and never write it in the repository.

```sh
aws cognito-idp admin-create-user --region us-east-1 --user-pool-id <UserPoolId> --username lead1 --message-action SUPPRESS
aws cognito-idp admin-set-user-password --region us-east-1 --user-pool-id <UserPoolId> --username lead1 --password '<choose a password>' --permanent
aws cognito-idp admin-add-user-to-group --region us-east-1 --user-pool-id <UserPoolId> --username lead1 --group-name fulfillment-lead
```

Expected result: `lead1` can sign in and sees the queue. A user who is not in `fulfillment-lead` sees "Your account is not in the fulfillment-lead group". The reviewer name shown on a reviewed order is the Cognito username.

## Change the threshold or the evaluation time

The Lambda reads two environment variables, set at deploy time through CDK context.

| Setting | Variable | CDK context | Default |
| --- | --- | --- | --- |
| Threshold in hours | `FULFILLMENT_THRESHOLD_HOURS` | `thresholdHours` | `24` |
| Evaluation time | `EVALUATION_TIME` | `evaluationTime` | `2026-11-20T12:00:00Z` |

1. Redeploy with the new value, for example: `npm run cdk -- deploy -c allowLocalhost=false -c thresholdHours=48`. A threshold must be a decimal number above 0. An evaluation time must be ISO 8601 UTC ending in `Z`. A bad value stops `cdk synth` with an error.
2. Confirm it took effect: sign in and check that the header shows the new evaluation time and that the "Reason" text of a row shows the new threshold (for example "threshold 48 h"). A request cannot override either value.

Known limitation: the Rule page still shows the evaluation time and threshold from `src/config.ts`, not the deployed values. After you change `evaluationTime` or `thresholdHours`, read them from the header and the "Reason" column instead.

If a bad value reaches the Lambda another way, `GET /queue` returns HTTP 500 with a generic message and the cause is in the function's CloudWatch log.

## Check the deployed API

`scripts/verify-deployed-api.mjs` checks the 401, 403 and 404 responses of a deployed API. See [docs/scope-verification.md](docs/scope-verification.md) for the tokens it needs.

## Tear down

```sh
npm run cdk -- destroy
```

Expected result: the stack is deleted, including the table, the site bucket and its objects, and the Cognito user pool. The CDK bootstrap stack is not removed.

## Test and check

```sh
npm test -- --run
npm run check
npm run build
```

`npm run check` runs lint, a secret scan (gitleaks) and a static scan (semgrep). Each of the two scanners must be installed.

---

## Original Vite template notes

### React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
