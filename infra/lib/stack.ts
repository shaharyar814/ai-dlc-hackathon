import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib'
import type { StackProps } from 'aws-cdk-lib'
import { CorsHttpMethod, HttpApi, HttpMethod, CfnStage } from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb'
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam'
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs'
import { fileURLToPath } from 'node:url'
import {
  CfnManagedLoginBranding,
  CfnUserPoolGroup,
  FeaturePlan,
  ManagedLoginVersion,
  OAuthScope,
  ResourceServerScope,
  UserPool,
  UserPoolClientIdentityProvider,
} from 'aws-cdk-lib/aws-cognito'
import type { Construct } from 'constructs'

export interface FulfillmentWatchStackProps extends StackProps {
  /** Adds http://localhost:5173 to the API CORS origins. Deployment uses false. */
  readonly allowLocalhost: boolean
  /** Lambda environment value FULFILLMENT_THRESHOLD_HOURS. */
  readonly thresholdHours: string
  /** Lambda environment value EVALUATION_TIME. */
  readonly evaluationTime: string
}

export const LEAD_GROUP_NAME = 'fulfillment-lead'
export const RESOURCE_SERVER_ID = 'fulfillment-watch'
export const API_SCOPE_NAME = 'api'
export const REQUIRED_SCOPE = `${RESOURCE_SERVER_ID}/${API_SCOPE_NAME}`
export const COGNITO_DOMAIN_PREFIX = 'fulfillment-watch-690559'
export const LOCALHOST_ORIGIN = 'http://localhost:5173'

export class FulfillmentWatchStack extends Stack {
  constructor(scope: Construct, id: string, props: FulfillmentWatchStackProps) {
    super(scope, id, props)

    const userPool = new UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      signInAliases: { username: true },
      featurePlan: FeaturePlan.ESSENTIALS,
      removalPolicy: RemovalPolicy.DESTROY,
    })

    new CfnUserPoolGroup(this, 'LeadGroup', {
      userPoolId: userPool.userPoolId,
      groupName: LEAD_GROUP_NAME,
      description: 'Fulfillment leads who may use the queue',
    })

    const apiScope = new ResourceServerScope({
      scopeName: API_SCOPE_NAME,
      scopeDescription: 'Call the Fulfillment Watch API',
    })
    const resourceServer = userPool.addResourceServer('ResourceServer', {
      identifier: RESOURCE_SERVER_ID,
      userPoolResourceServerName: 'Fulfillment Watch API',
      scopes: [apiScope],
    })

    const domain = userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: COGNITO_DOMAIN_PREFIX },
      managedLoginVersion: ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    })

    // Callback and logout URLs: the CloudFront URL is added with the hosting resources.
    const redirectUrls = [LOCALHOST_ORIGIN]
    const appClient = userPool.addClient('AppClient', {
      generateSecret: false,
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
      oAuth: {
        flows: { authorizationCodeGrant: true, implicitCodeGrant: false, clientCredentials: false },
        scopes: [OAuthScope.resourceServer(resourceServer, apiScope), OAuthScope.OPENID],
        callbackUrls: redirectUrls,
        logoutUrls: redirectUrls,
      },
      accessTokenValidity: Duration.hours(1),
      preventUserExistenceErrors: true,
    })

    // Managed login pages need a branding style on the app client. Cognito's defaults are enough.
    const branding = new CfnManagedLoginBranding(this, 'ManagedLoginBranding', {
      userPoolId: userPool.userPoolId,
      clientId: appClient.userPoolClientId,
      useCognitoProvidedValues: true,
    })
    branding.node.addDependency(domain)

    const reviewsTable = new Table(this, 'ReviewsTable', {
      partitionKey: { name: 'orderId', type: AttributeType.STRING },
      sortKey: { name: 'ruleId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    })

    const functionLogs = new LogGroup(this, 'QueueFunctionLogs', {
      retention: RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    })

    // The function's own role: log writes to its log group, and three DynamoDB actions on one table.
    const functionRole = new Role(this, 'QueueFunctionRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    })
    functionLogs.grantWrite(functionRole)
    functionRole.addToPolicy(
      new PolicyStatement({
        actions: ['dynamodb:PutItem', 'dynamodb:GetItem', 'dynamodb:BatchGetItem'],
        resources: [reviewsTable.tableArn],
      }),
    )

    const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
    const queueFunction = new NodejsFunction(this, 'QueueFunction', {
      entry: fileURLToPath(new URL('../../server/handler.ts', import.meta.url)),
      handler: 'handler',
      projectRoot: repoRoot,
      depsLockFilePath: fileURLToPath(new URL('../../package-lock.json', import.meta.url)),
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      role: functionRole,
      logGroup: functionLogs,
      environment: {
        REVIEWS_TABLE_NAME: reviewsTable.tableName,
        EVALUATION_TIME: props.evaluationTime,
        FULFILLMENT_THRESHOLD_HOURS: props.thresholdHours,
      },
      bundling: {
        // The Lambda runtime provides the AWS SDK v3.
        externalModules: ['@aws-sdk/*'],
        target: 'node24',
      },
    })

    const issuer = `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`
    const authorizer = new HttpJwtAuthorizer('JwtAuthorizer', issuer, {
      jwtAudience: [appClient.userPoolClientId],
    })
    const integration = new HttpLambdaIntegration('QueueIntegration', queueFunction)

    const corsOrigins: string[] = []
    if (props.allowLocalhost) corsOrigins.push(LOCALHOST_ORIGIN)
    const httpApi = new HttpApi(this, 'HttpApi', {
      apiName: 'fulfillment-watch',
      corsPreflight: {
        allowOrigins: corsOrigins,
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.OPTIONS],
        allowHeaders: ['Authorization', 'Content-Type'],
      },
    })
    for (const [path, method] of [
      ['/queue', HttpMethod.GET],
      ['/reviews', HttpMethod.POST],
    ] as const) {
      httpApi.addRoutes({
        path,
        methods: [method],
        integration,
        authorizer,
        authorizationScopes: [REQUIRED_SCOPE],
      })
    }
    const defaultStage = httpApi.defaultStage?.node.defaultChild as CfnStage
    defaultStage.defaultRouteSettings = { throttlingRateLimit: 10, throttlingBurstLimit: 20 }
  }
}
