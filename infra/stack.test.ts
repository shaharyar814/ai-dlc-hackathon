import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'
import { DEFAULT_THRESHOLD_HOURS, EVALUATION_TIME } from '../src/config.ts'
import { FulfillmentWatchStack } from './lib/stack.ts'

function build(allowLocalhost = false) {
  // An empty bundling list skips esbuild, so the test needs no bundling step.
  const app = new App({ context: { 'aws:cdk:bundling-stacks': [] } })
  const stack = new FulfillmentWatchStack(app, 'Test', {
    env: { region: 'us-east-1' },
    allowLocalhost,
    thresholdHours: String(DEFAULT_THRESHOLD_HOURS),
    evaluationTime: EVALUATION_TIME,
  })
  return { stack, template: Template.fromStack(stack) }
}

const { stack, template } = build()
const resources = template.toJSON().Resources as Record<string, { Type: string; Properties?: Record<string, unknown> }>

function ofType(type: string) {
  return Object.entries(resources).filter(([, r]) => r.Type === type)
}

/** The queue function. The stack also has a CDK-managed function for deleting bucket objects. */
function queueFunction() {
  const found = ofType('AWS::Lambda::Function').find(([id]) => id.startsWith('QueueFunction'))
  if (!found) throw new Error('Queue function not found')
  return found
}

describe('FulfillmentWatchStack', () => {
  it('synthesizes in us-east-1', () => {
    expect(stack.region).toBe('us-east-1')
    expect(Object.keys(resources).length).toBeGreaterThan(10)
  })

  describe('function and permissions', () => {
    it('uses the nodejs24.x runtime, arm64, with the three environment values and no others', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Handler: 'index.handler',
        Runtime: 'nodejs24.x',
        Architectures: ['arm64'],
        MemorySize: 256,
        Timeout: 10,
        Environment: {
          Variables: {
            REVIEWS_TABLE_NAME: Match.anyValue(),
            EVALUATION_TIME: '2026-11-20T12:00:00Z',
            FULFILLMENT_THRESHOLD_HOURS: '24',
          },
        },
      })
      const fn = queueFunction()
      const vars = (fn[1].Properties?.Environment as { Variables: Record<string, unknown> }).Variables
      expect(Object.keys(vars).sort()).toEqual(['EVALUATION_TIME', 'FULFILLMENT_THRESHOLD_HOURS', 'REVIEWS_TABLE_NAME'])
    })

    it('gives the function its own role with exactly three DynamoDB actions on the table ARN and no wildcard', () => {
      const fn = queueFunction()
      const roleRef = (fn[1].Properties?.Role as { 'Fn::GetAtt': string[] })['Fn::GetAtt'][0]
      expect(ofType('AWS::IAM::Role').some(([id]) => id === roleRef)).toBe(true)
      const policies = ofType('AWS::IAM::Policy').filter(([, r]) =>
        JSON.stringify(r.Properties).includes(roleRef),
      )
      expect(policies).toHaveLength(1)
      const statements = (policies[0][1].Properties?.PolicyDocument as { Statement: { Action: string | string[]; Resource: unknown }[] }).Statement
      const dynamo = statements.filter((s) => JSON.stringify(s.Action).includes('dynamodb'))
      expect(dynamo).toHaveLength(1)
      expect(dynamo[0].Action).toEqual(['dynamodb:PutItem', 'dynamodb:GetItem', 'dynamodb:BatchGetItem'])
      expect(dynamo[0].Resource).toEqual({ 'Fn::GetAtt': [Object.keys(resources).find((k) => resources[k].Type === 'AWS::DynamoDB::Table'), 'Arn'] })
      for (const s of statements) {
        const actions = Array.isArray(s.Action) ? s.Action : [s.Action]
        expect(actions.some((a) => a.includes('*'))).toBe(false)
        expect(JSON.stringify(s.Resource)).not.toContain('"*"')
      }
    })

    it('retains function logs for 14 days', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 14 })
    })
  })

  describe('table', () => {
    it('is on-demand with orderId and ruleId keys', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        BillingMode: 'PAY_PER_REQUEST',
        KeySchema: [
          { AttributeName: 'orderId', KeyType: 'HASH' },
          { AttributeName: 'ruleId', KeyType: 'RANGE' },
        ],
        AttributeDefinitions: Match.arrayWith([
          { AttributeName: 'orderId', AttributeType: 'S' },
          { AttributeName: 'ruleId', AttributeType: 'S' },
        ]),
      })
      const table = ofType('AWS::DynamoDB::Table')[0][1].Properties ?? {}
      expect(table).not.toHaveProperty('ProvisionedThroughput')
    })
  })

  describe('authentication', () => {
    it('allows only administrators to create users, on the Essentials plan', () => {
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
        UserPoolTier: 'ESSENTIALS',
      })
    })

    it('creates exactly one group, fulfillment-lead', () => {
      template.resourceCountIs('AWS::Cognito::UserPoolGroup', 1)
      template.hasResourceProperties('AWS::Cognito::UserPoolGroup', { GroupName: 'fulfillment-lead' })
    })

    it('creates the resource server and the api scope', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolResourceServer', {
        Identifier: 'fulfillment-watch',
        Scopes: [Match.objectLike({ ScopeName: 'api' })],
      })
    })

    it('uses the domain prefix with managed login', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
        Domain: 'fulfillment-watch-690559',
        ManagedLoginVersion: 2,
      })
    })

    it('creates a public client with only the code grant and exactly two callback URLs', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        GenerateSecret: false,
        AllowedOAuthFlows: ['code'],
        AllowedOAuthFlowsUserPoolClient: true,
        AccessTokenValidity: 60,
        AllowedOAuthScopes: [Match.anyValue(), 'openid'],
      })
      const client = ofType('AWS::Cognito::UserPoolClient')[0][1].Properties as {
        CallbackURLs: unknown[]
        LogoutURLs: unknown[]
        AllowedOAuthFlows: string[]
      }
      expect(client.CallbackURLs).toHaveLength(2)
      expect(client.CallbackURLs[1]).toBe('http://localhost:5173')
      expect(JSON.stringify(client.CallbackURLs[0])).toContain('DomainName')
      expect(client.LogoutURLs).toEqual(client.CallbackURLs)
      expect(client.AllowedOAuthFlows).not.toContain('implicit')
    })

    it('creates a managed login branding style for the client', () => {
      template.hasResourceProperties('AWS::Cognito::ManagedLoginBranding', { UseCognitoProvidedValues: true })
    })
  })

  describe('API', () => {
    it('has exactly the two routes, each with the JWT authorizer and the required scope', () => {
      const routes = ofType('AWS::ApiGatewayV2::Route')
      expect(routes.map(([, r]) => r.Properties?.RouteKey).sort()).toEqual(['GET /queue', 'POST /reviews'])
      for (const [, r] of routes) {
        expect(r.Properties).toMatchObject({
          AuthorizationType: 'JWT',
          AuthorizationScopes: ['fulfillment-watch/api'],
        })
        expect(r.Properties?.AuthorizerId).toBeDefined()
      }
      template.resourceCountIs('AWS::ApiGatewayV2::Authorizer', 1)
      template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
        AuthorizerType: 'JWT',
        JwtConfiguration: { Audience: [Match.anyValue()], Issuer: Match.anyValue() },
      })
      const issuer = JSON.stringify(ofType('AWS::ApiGatewayV2::Authorizer')[0][1].Properties)
      expect(issuer).toContain('https://cognito-idp.us-east-1.amazonaws.com/')
    })

    it('throttles the default stage at 10 per second with a burst of 20', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
        DefaultRouteSettings: { ThrottlingRateLimit: 10, ThrottlingBurstLimit: 20 },
      })
    })

    it('allows one CORS origin (the CloudFront site) by default', () => {
      const cors = ofType('AWS::ApiGatewayV2::Api')[0][1].Properties?.CorsConfiguration as {
        AllowOrigins: unknown[]
        AllowMethods: string[]
        AllowHeaders: string[]
      }
      expect(cors.AllowOrigins).toHaveLength(1)
      expect(JSON.stringify(cors.AllowOrigins)).toContain('DomainName')
      expect(JSON.stringify(cors.AllowOrigins)).not.toContain('localhost')
      expect(cors.AllowMethods).toEqual(['GET', 'POST', 'OPTIONS'])
      expect(cors.AllowHeaders).toEqual(['Authorization', 'Content-Type'])
    })

    it('adds http://localhost:5173 to CORS only when allowLocalhost is true', () => {
      const { template: withLocalhost } = build(true)
      const api = Object.values(withLocalhost.toJSON().Resources as typeof resources).find(
        (r) => r.Type === 'AWS::ApiGatewayV2::Api',
      )
      const origins = (api?.Properties?.CorsConfiguration as { AllowOrigins: unknown[] }).AllowOrigins
      expect(origins).toHaveLength(2)
      expect(origins).toContain('http://localhost:5173')
    })
  })

  describe('hosting', () => {
    it('blocks all public access, encrypts and requires TLS on the bucket', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
        BucketEncryption: Match.anyValue(),
      })
      template.hasResourceProperties('AWS::S3::BucketPolicy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({ Effect: 'Deny', Condition: { Bool: { 'aws:SecureTransport': 'false' } } }),
          ]),
        },
      })
    })

    it('serves the site through CloudFront with OAC, a root object and HTTPS redirect', () => {
      template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1)
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: Match.objectLike({
          DefaultRootObject: 'index.html',
          PriceClass: 'PriceClass_100',
          DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: 'redirect-to-https' }),
        }),
      })
      const distribution = ofType('AWS::CloudFront::Distribution')[0][1].Properties as {
        DistributionConfig: { CustomErrorResponses?: unknown }
      }
      expect(distribution.DistributionConfig.CustomErrorResponses).toBeUndefined()
    })
  })

  describe('alarms and scope', () => {
    it('has two alarms with Sum >= 1 over five minutes and no actions', () => {
      template.resourceCountIs('AWS::CloudWatch::Alarm', 2)
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        MetricName: 'Errors',
        Namespace: 'AWS/Lambda',
        Statistic: 'Sum',
        Period: 300,
        Threshold: 1,
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      })
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        MetricName: '5xx',
        Namespace: 'AWS/ApiGateway',
        Statistic: 'Sum',
        Period: 300,
        Threshold: 1,
        TreatMissingData: 'notBreaching',
        Dimensions: [Match.objectLike({ Name: 'ApiId' })],
      })
      for (const [, alarm] of ofType('AWS::CloudWatch::Alarm')) {
        expect(alarm.Properties).not.toHaveProperty('AlarmActions')
        expect(alarm.Properties).not.toHaveProperty('OKActions')
      }
    })

    it('has no SNS, SQS or Bedrock resource', () => {
      for (const r of Object.values(resources)) {
        expect(r.Type).not.toMatch(/^AWS::(SNS|SQS|Bedrock)/)
      }
    })

    it('contains no secret or password value', () => {
      const text = JSON.stringify(template.toJSON())
      expect(text).not.toMatch(/password|client_?secret|BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}/i)
    })

    it('outputs the values the front-end build needs', () => {
      const outputs = Object.keys(template.toJSON().Outputs as Record<string, unknown>)
      expect(outputs.sort()).toEqual([
        'ApiUrl',
        'AppClientId',
        'CognitoDomainUrl',
        'DistributionId',
        'SiteBucketName',
        'SiteUrl',
        'UserPoolId',
      ])
    })
  })
})
