# Missing-scope verification

Requirement 1.4 expects HTTP 403 for a request that carries a valid access token without the scope `fulfillment-watch/api`. This page records what the deployed API returns.

## Result

Verified on 2026-11-20 against the deployed stack (us-east-1) with `scripts/verify-deployed-api.mjs`, 9 checks passed, 0 failed, 0 skipped.

| Check | Expected | Observed | Date read |
| --- | --- | --- | --- |
| `GET /queue` with no token | 401 | 401 | 2026-11-20 |
| `GET /queue` with a malformed token | 401 | 401 | 2026-11-20 |
| `GET /queue` with a valid token that lacks `fulfillment-watch/api` (lead1, scope `openid` only) | 403 (unverified) | **403** | 2026-11-20 |
| `GET /queue` with a valid token for a user outside `fulfillment-lead` (outsider1, scope `fulfillment-watch/api`) | 403 | 403 | 2026-11-20 |
| `GET /reviews` | 404 | 404 | 2026-11-20 |
| CORS `access-control-allow-origin` on the 401 and 403 responses | the site origin | the site origin (all four) | 2026-11-20 |

The missing-scope status is 403, as requirement 1.4 expected, so no requirement needs correcting.

Review flow, checked with the lead1 token on 2026-11-20 (a separate request check, not part of the script):

| Request | Observed |
| --- | --- |
| `GET /queue` | 200, 6 rows, 17 checked |
| `POST /reviews` for order 998 (first) | 201 with the review |
| `POST /reviews` for order 998 (repeat) | 200 with the same timestamp and reviewer `lead1` |
| `GET /queue` afterwards | row 998 carries that timestamp and reviewer |
| `POST /reviews` as outsider1 | 403 |
| `POST /reviews` for order 1044 (not in the queue) | 400 |

Order 998 stays reviewed in the deployed table.

## Procedure

You need a deployed stack (see the README) and two test users: one in the `fulfillment-lead` group and one that is not. Never put a password or a token in the repository.

1. Get the API URL and the app client ID from the stack outputs (`ApiUrl`, `AppClientId`, `CognitoDomainUrl`).
2. Get a token with only the `openid` scope. Open the authorize URL below in a browser, sign in as the lead user, and exchange the code at the token endpoint with the same PKCE verifier. The scope list leaves out `fulfillment-watch/api`, so the access token has no custom scope.
   `<CognitoDomainUrl>/oauth2/authorize?response_type=code&client_id=<AppClientId>&redirect_uri=<SiteUrl>&scope=openid&code_challenge=<challenge>&code_challenge_method=S256`
3. Get a second token for the user outside the group, this time with the scope `fulfillment-watch/api`.
4. Run the script from a shell, passing the tokens through the environment only:
   `API_URL=<ApiUrl> ORIGIN=<SiteUrl> TOKEN_NO_SCOPE=<token from step 2> TOKEN_NO_GROUP=<token from step 3> node scripts/verify-deployed-api.mjs`
   The script sends each token only in the `Authorization` header and never prints it.
5. Copy each observed status and today's date into the table above.

## If the observed status is not 403

If the missing-scope request returns a status other than 403, correct requirement 1.4 and every requirement, design and test line that states the missing-scope status to the observed code (requirement 1.11). Then rerun the affected tests.
