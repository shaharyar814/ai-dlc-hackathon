import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { BatchGetCommand, DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import type { DynamoLike, ReviewKey, StoredReview } from './reviewStore.ts'

function toStored(item: Record<string, unknown> | undefined): StoredReview | null {
  if (!item) return null
  const { orderId, ruleId, reviewedAt, reviewer } = item
  if (
    typeof orderId !== 'string' ||
    typeof ruleId !== 'string' ||
    typeof reviewedAt !== 'string' ||
    typeof reviewer !== 'string'
  ) {
    return null
  }
  return { orderId, ruleId, reviewedAt, reviewer }
}

/** Production DynamoLike. Uses only PutItem, GetItem and BatchGetItem on one table. */
export function createDynamoClient(tableName: string): DynamoLike {
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}))
  return {
    async putIfAbsent(item) {
      try {
        await doc.send(
          new PutCommand({
            TableName: tableName,
            Item: item,
            ConditionExpression: 'attribute_not_exists(orderId)',
          }),
        )
        return true
      } catch (error) {
        if (error instanceof ConditionalCheckFailedException) return false
        throw error
      }
    },
    async get(key: ReviewKey) {
      const out = await doc.send(
        new GetCommand({
          TableName: tableName,
          Key: { orderId: key.orderId, ruleId: key.ruleId },
          ConsistentRead: true,
        }),
      )
      return toStored(out.Item)
    },
    async batchGet(keys) {
      const out = await doc.send(
        new BatchGetCommand({
          RequestItems: {
            [tableName]: {
              Keys: keys.map((k) => ({ orderId: k.orderId, ruleId: k.ruleId })),
              ConsistentRead: true,
            },
          },
        }),
      )
      const items: StoredReview[] = []
      for (const raw of out.Responses?.[tableName] ?? []) {
        const stored = toStored(raw)
        if (stored) items.push(stored)
      }
      const unprocessed: ReviewKey[] = []
      for (const k of out.UnprocessedKeys?.[tableName]?.Keys ?? []) {
        if (typeof k.orderId === 'string' && typeof k.ruleId === 'string') {
          unprocessed.push({ orderId: k.orderId, ruleId: k.ruleId })
        }
      }
      return { items, unprocessed }
    },
  }
}
