# Demo script (5 minutes)

Site: `https://d1trzbqc0n3csz.cloudfront.net`. Users: `lead1` (in `fulfillment-lead`) and `outsider1` (no group). The passwords are in `~/.hackathon-test-users` on the deploy machine. Never show them on screen.

## Before you start

- Sign out of any earlier session. Open a fresh browser window.
- Orders #998 and #1042 are already reviewed in the deployed table, from the 2026-11-20 checks. Mark **#1043** in the demo. If #1043 is already reviewed when you start, use #1050, #1049 or #1051.
- Keep a second tab open on the AWS console in us-east-1, stack `FulfillmentWatch`.

## Script

| Time | Step | Do | Say |
| --- | --- | --- | --- |
| 0:00 | Problem | Show the title slide or the empty browser. | "A paid order can sit unshipped for a day before anyone notices. Fulfillment Watch flags those orders early." |
| 0:20 | Sign in and queue | Open the site. Sign in as `lead1` on the Cognito page. | "Sign-in is Cognito's hosted page. The app never sees the password." Point to the header: "17 checked, 5 skipped" and "Evaluated at 2026-11-20 12:00 UTC". "The rule flags paid orders with nothing shipped after 24 hours. Canceled and fully refunded orders are excluded. The oldest payment comes first." |
| 1:00 | Evidence and suggested action | Click **#1043**. | Show Paid at, Elapsed (24 h 0 min), Fulfilled "0 of 1 units fulfilled" and Rule "Paid and unfulfilled". "Exactly 24 hours counts as stalled." Read the suggested action: "Confirm pick status with the warehouse." |
| 1:40 | Mark reviewed | Click **Mark reviewed**. | "The review is saved on the server under my Cognito username." Point to "Reviewed by lead1 ...". |
| 2:00 | Reload | Press F5 or reload the page. Then open the **Reviewed** tab. | "It's still reviewed after a reload. It's stored in DynamoDB, not in this browser, so any lead sees the same status." Point to #998, #1042 and #1043 with "Reviewed by lead1". |
| 2:30 | Invalid records skipped | Open **Data quality**. | "5 records were skipped, each with a reason: an invalid timestamp, a timestamp after the evaluation time, a negative quantity, a missing timestamp and a duplicate order ID. The other 12 still evaluated." |
| 3:00 | outsider1 blocked | Click **Sign out**. Sign in as `outsider1`. | "outsider1 has a valid login but is not in the fulfillment-lead group." Show "No access". "There's no queue data and no Retry. The API returned 403." Click **Sign out**. |
| 3:30 | AWS side | Switch to the console tab, or show the architecture slide. | "Everything is one CDK stack in us-east-1: CloudFront in front of a private S3 bucket, Cognito, an HTTP API with a JWT authorizer, one Lambda on Node 24 and a DynamoDB table." |
| 3:50 | Security | Show `docs/scope-verification.md` or the slide. | "We checked the live API: no token 401, a bad token 401, a token without the API scope 403, a user outside the group 403, an unknown route 404. A first review is 201 and a repeat is 200 with the first timestamp kept." |
| 4:20 | Same rule | Show `src/rules/` or the slide. | "The Lambda imports the same pure rule the browser uses. There's no second copy. The Stage A code in `src/rules` and `src/data` is unchanged. 443 tests pass." |
| 4:40 | Cost and close | Show `docs/cost-estimate.md`. | "For 10 users and 1,000 requests a day, the estimate is $0.53 a month without the Free Tier and $0.02 with it. Teardown is one command, `cdk destroy`." |
| 5:00 | End | | |

## If something goes wrong

| Problem | What to do |
| --- | --- |
| The Cognito page appears again right after sign-in | Close the tab, open a new window and sign in again. |
| "No access" for lead1 | The deployed build may predate the scope fix. Rebuild with the `VITE_*` values and upload (see the README, "Deploy"). |
| "Could not load the queue." | Click Retry once. If it fails again, switch to the screenshots in `docs/screenshots/aws-*.png`. |
| #1043 is already reviewed | Use #1050, #1049 or #1051. |
