import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib'
import type { StackProps } from 'aws-cdk-lib'
import { CorsHttpMethod, HttpApi, HttpMethod, CfnStage } from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import { Alarm, ComparisonOperator, Metric, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch'
import {
  Distribution,
  PriceClass,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront'
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins'
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb'
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam'
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs'
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3'
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

    // Hosting: a private bucket behind CloudFront with origin access control. The site uses hash
    // routes, so no 403/404 page rewrite is needed.
    const siteBucket = new Bucket(this, 'SiteBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })
    const distribution = new Distribution(this, 'SiteDistribution', {
      defaultRootObject: 'index.html',
      priceClass: PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
    })
    const siteOrigin = `https://${distribution.distributionDomainName}`

    // Callback and logout URLs: exactly the CloudFront URL and the local dev server.
    const redirectUrls = [siteOrigin, LOCALHOST_ORIGIN]
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

    const corsOrigins: string[] = [siteOrigin]
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

    const fiveMinutes = Duration.minutes(5)
    new Alarm(this, 'FunctionErrorsAlarm', {
      alarmDescription: 'The queue function reported an error',
      metric: queueFunction.metricErrors({ period: fiveMinutes, statistic: 'Sum' }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    })
    new Alarm(this, 'Api5xxAlarm', {
      alarmDescription: 'The API returned a 5xx response',
      metric: new Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5xx',
        dimensionsMap: { ApiId: httpApi.apiId },
        statistic: 'Sum',
        period: fiveMinutes,
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    })

    // None of these values is a secret.
    new CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint })
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId })
    new CfnOutput(this, 'AppClientId', { value: appClient.userPoolClientId })
    new CfnOutput(this, 'CognitoDomainUrl', {
      value: `https://${COGNITO_DOMAIN_PREFIX}.auth.${this.region}.amazoncognito.com`,
    })
    new CfnOutput(this, 'SiteUrl', { value: siteOrigin })
    new CfnOutput(this, 'SiteBucketName', { value: siteBucket.bucketName })
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId })
  }
}
