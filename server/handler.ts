import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { DATASET } from '../src/data/orders.ts'
import { createDynamoClient } from './dynamoClient.ts'
import { handleRequest, type ApiEvent, type HandlerDeps } from './handleRequest.ts'
import { DynamoReviewStore } from './reviewStore.ts'
import { internalError } from './responses.ts'

let deps: HandlerDeps | null = null

function buildDeps(): HandlerDeps {
  const tableName = process.env.REVIEWS_TABLE_NAME
  if (tableName === undefined || tableName === '') throw new Error('REVIEWS_TABLE_NAME is not set')
  return {
    store: new DynamoReviewStore(createDynamoClient(tableName)),
    env: process.env,
    clock: () => new Date().toISOString(),
    dataset: DATASET,
    log: (entry) => {
      console.log(JSON.stringify(entry))
    },
  }
}

/** Lambda entry. The only place that reads the real clock and process.env. */
export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    deps ??= buildDeps()
  } catch (error) {
    console.log(
      JSON.stringify({
        level: 'error',
        operation: 'init',
        errorName: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    )
    return internalError()
  }
  return handleRequest(event as ApiEvent, deps)
}
