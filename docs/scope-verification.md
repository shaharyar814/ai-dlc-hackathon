# Missing-scope verification

Requirement 1.4 expects HTTP 403 for a request that carries a valid access token without the scope `fulfillment-watch/api`. That status is **unverified**. This page records what the deployed API returns.

## Result

| Check | Expected | Observed | Date read |
| --- | --- | --- | --- |
| `GET /queue` with no token | 401 | not yet verified | not yet verified |
| `GET /queue` with a malformed token | 401 | not yet verified | not yet verified |
| `GET /queue` with a valid token that lacks `fulfillment-watch/api` | 403 (unverified) | not yet verified | not yet verified |
| `GET /queue` with a valid token for a user outside `fulfillment-lead` | 403 | not yet verified | not yet verified |
| `GET /reviews` | 404 | not yet verified | not yet verified |
| CORS headers on the 401 and 403 responses | present | not yet verified | not yet verified |

Nothing has been run against a deployed stack yet. Replace each "not yet verified" with the observed status and the date (`YYYY-MM-DD`) after the procedure below. Do not fill in a value that was not observed.

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
