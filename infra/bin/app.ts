import { App } from 'aws-cdk-lib'
import { DEFAULT_THRESHOLD_HOURS, EVALUATION_TIME } from '../../src/config.ts'
import { readRuntimeConfig } from '../../server/runtimeConfig.ts'
import { FulfillmentWatchStack } from '../lib/stack.ts'

const app = new App()

// Context flags: -c allowLocalhost=true adds http://localhost:5173 to the API CORS list.
// -c thresholdHours=48 and -c evaluationTime=... set the Lambda environment variables.
const allowLocalhost = String(app.node.tryGetContext('allowLocalhost') ?? 'false') === 'true'
const thresholdHours = String(app.node.tryGetContext('thresholdHours') ?? DEFAULT_THRESHOLD_HOURS)
const evaluationTime = String(app.node.tryGetContext('evaluationTime') ?? EVALUATION_TIME)

// Reject a bad value at synth time, with the same rules the Lambda applies at run time.
const checked = readRuntimeConfig({
  FULFILLMENT_THRESHOLD_HOURS: thresholdHours,
  EVALUATION_TIME: evaluationTime,
})
if (!checked.ok) {
  throw new Error('Invalid context: thresholdHours must be a decimal number above 0 and evaluationTime an ISO 8601 UTC time ending in Z')
}

new FulfillmentWatchStack(app, 'FulfillmentWatch', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
  allowLocalhost,
  thresholdHours,
  evaluationTime,
})
