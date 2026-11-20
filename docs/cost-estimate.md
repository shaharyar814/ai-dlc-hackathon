# Cost estimate: Fulfillment Watch on AWS (Stage B)

Monthly cost in US dollars for the stack in `infra/`, region us-east-1, 30-day month. Pricing was read on 2026-11-20. All data is synthetic.

## Summary

| Service | Without Free Tier (USD/month) | With Free Tier (USD/month) |
| --- | --- | --- |
| Amazon Cognito (Essentials plan) | 0.15 | 0.00 |
| Amazon API Gateway (HTTP API) | 0.03 | 0.00 |
| AWS Lambda (arm64, 256 MB) | 0.02 | 0.00 |
| Amazon DynamoDB (on-demand) | 0.02 | 0.02 |
| Amazon S3 | 0.00 | 0.00 |
| Amazon CloudFront | 0.09 | 0.00 |
| Amazon CloudWatch (logs and alarms) | 0.21 | 0.00 |
| Data transfer out of the API | 0.01 | 0.00 |
| Total | 0.53 | 0.02 |

The totals are the sums of the rows above them. A service with no charge shows 0.00.

## Assumptions

- 10 signed-in users, each active in the month (10 monthly active users).
- 1,000 API requests per day, 30,000 per month. Of these, 100 per day (3,000 per month) are `POST /reviews` and 900 per day (27,000 per month) are `GET /queue`.
- 1 GB per month served through CloudFront, in about 9,000 HTTPS requests.
- A `GET /queue` response of about 4 KB. The queue has 6 flagged orders, so each `GET /queue` reads 6 items.
- Lambda duration of 150 ms per request on average, with 256 MB of memory.
- The "With Free Tier" column assumes an account in its first 12 months, so the 12-month API Gateway allowance applies. The other allowances shown (Cognito, Lambda, CloudFront, CloudWatch, data transfer) do not expire. Taxes and support plans are not included.

## Working per service

Rows are rounded to the cent after the sum of their parts. Unit prices are US East (N. Virginia).

### Amazon Cognito

- Unit price: Essentials plan, $0.015 per monthly active user, with the first 10,000 users free ([Cognito pricing](https://aws.amazon.com/cognito/pricing/)). The stack sets `featurePlan: ESSENTIALS`, which managed login needs.
- Without Free Tier: 10 users x $0.015 = $0.15.
- With Free Tier: 10 users are inside the 10,000 free users, so $0.00.

### Amazon API Gateway (HTTP API)

- Unit price: $1.00 per million requests for the first 300 million ([API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/)). The free tier is 1 million HTTP API calls per month for up to 12 months, for new customers.
- Without Free Tier: 30,000 requests x $1.00 / 1,000,000 = $0.03.
- With Free Tier: 30,000 requests are inside the 1,000,000 free calls, so $0.00.

### AWS Lambda

- Unit prices: $0.20 per million requests, and $0.0000133334 per GB-second on Arm. The free tier is 1 million requests and 400,000 GB-seconds per month ([Lambda pricing](https://aws.amazon.com/lambda/pricing/) for the request price and the free tier; the Arm duration price is from [a secondary summary](https://www.kindatechnical.com/aws-lambda/understanding-lambda-costs-billing.html), because the official price table did not load in the tool used).
- Requests: 30,000 x $0.20 / 1,000,000 = $0.0060.
- Duration: 30,000 x 0.15 s x 0.25 GB = 1,125 GB-seconds x $0.0000133334 = $0.0150.
- Without Free Tier: $0.0060 + $0.0150 = $0.0210, shown as $0.02.
- With Free Tier: 30,000 requests and 1,125 GB-seconds are far below the free amounts, so $0.00.

### Amazon DynamoDB (on-demand)

- Unit prices: $0.625 per million write request units, $0.125 per million read request units, and $0.25 per GB-month of storage with the first 25 GB free ([DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/on-demand/) for storage and the 25 GB allowance; the request prices are from [a secondary summary](https://dynobase.dev/dynamodb-pricing-calculator/), because the official price table did not load in the tool used). On-demand request charges have no free tier.
- Writes: 3,000 conditional puts x 1 write unit = 3,000 units x $0.625 / 1,000,000 = $0.0019.
- Reads: 27,000 `GET /queue` x 6 items x 1 consistent read unit = 162,000 units, plus 3,000 consistent reads for repeat reviews = 165,000 units x $0.125 / 1,000,000 = $0.0206.
- Storage: less than 1 MB (0.001 GB) x $0.25 = $0.0003 without the free tier, $0.00 with it.
- Without Free Tier: $0.0019 + $0.0206 + $0.0003 = $0.0228, shown as $0.02.
- With Free Tier: $0.0019 + $0.0206 = $0.0225, shown as $0.02.

### Amazon S3

- Unit prices: $0.023 per GB-month for S3 Standard, $0.0004 per 1,000 GET requests and $0.005 per 1,000 PUT requests ([S3 pricing](https://aws.amazon.com/s3/pricing/) is the official source; the figures are from [a 2026 summary](https://upstash.com/blog/aws-s3-pricing-explained-2026), because the official price table did not load in the tool used).
- Storage: the built site is under 1 MB (0.001 GB) x $0.023 = $0.00002.
- Requests: 3,000 origin GET requests (CloudFront cache misses) x $0.0004 / 1,000 = $0.0012. About 40 PUT requests for deploys x $0.005 / 1,000 = $0.0002.
- Without Free Tier: $0.00002 + $0.0012 + $0.0002 = $0.0014, shown as $0.00.
- With Free Tier: $0.00.

### Amazon CloudFront

- Unit prices: $0.085 per GB for the first 10 TB to viewers in North America, and $0.01 per 10,000 HTTPS requests. The free tier is 1 TB and 10 million requests per month, with no expiry ([CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/) is the official source; the figures are from [a secondary summary](https://blog.blazingcdn.com/en-us/understanding-cloudfront-request-and-data-transfer-costs) and [this free tier summary](https://blog.blazingcdn.com/en-us/cloudfront-pricing-tiers-and-free-usage)).
- Data: 1 GB x $0.085 = $0.0850.
- Requests: 9,000 x $0.01 / 10,000 = $0.0090.
- Without Free Tier: $0.0850 + $0.0090 = $0.0940, shown as $0.09.
- With Free Tier: 1 GB and 9,000 requests are inside the free amounts, so $0.00.

### Amazon CloudWatch

- Unit prices: $0.10 per alarm metric per month, $0.50 per GB of log ingestion, and $0.03 per GB-month of log storage. The free tier is 10 alarm metrics and 5 GB of log data per month ([CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/)).
- Alarms: 2 standard-resolution alarms x $0.10 = $0.2000.
- Log ingestion: Lambda writes about 0.4 KB per request (start, end and report lines), 30,000 x 0.4 KB = 12,000 KB = 0.0114 GB x $0.50 = $0.0057. The function logs its own lines only for a 5xx response.
- Log storage: 0.0114 GB x $0.03 = $0.0003 (14-day retention).
- Without Free Tier: $0.2000 + $0.0057 + $0.0003 = $0.2060, shown as $0.21.
- With Free Tier: 2 alarms are inside the 10 free alarm metrics and 0.0114 GB is inside the 5 GB free log data, so $0.00.

### Data transfer out of the API

- Unit price: $0.09 per GB to the internet after the first 100 GB per month, which is free ([S3 and EC2 data transfer summary](https://upstash.com/blog/aws-s3-pricing-explained-2026); API Gateway bills data out at the EC2 rate, see [API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/)).
- Volume: 27,000 `GET /queue` x 4 KB = 108,000 KB = 0.1030 GB.
- Without Free Tier: 0.1030 GB x $0.09 = $0.0093, shown as $0.01.
- With Free Tier: 0.1030 GB is inside the 100 GB free amount, so $0.00.

## What is not in the estimate

- A custom domain name, AWS WAF, a VPC, NAT gateways and CloudTrail data events are not part of the stack and are not priced.
- SMS or email sent by Cognito (for example password recovery) is billed separately through SNS and SES. Users are created by an administrator, so none is assumed.
- The CDK bootstrap bucket and the one-time Lambda for emptying the site bucket on `cdk destroy` cost less than one cent per month.

## Sources and date read

Read on 2026-11-20:

- [Amazon Cognito pricing](https://aws.amazon.com/cognito/pricing/)
- [Amazon API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/)
- [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/)
- [Amazon DynamoDB on-demand pricing](https://aws.amazon.com/dynamodb/pricing/on-demand/)
- [Amazon S3 pricing](https://aws.amazon.com/s3/pricing/)
- [Amazon CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/)
- [Amazon CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/)

The pricing pages load their price tables with scripts, so several unit prices above come from the secondary summaries linked in each section. Check them against the AWS Pricing Calculator before relying on the figures. The estimate is rounded and the real bill is expected to be well under one dollar at this volume.

Content was rephrased for compliance with licensing restrictions.
