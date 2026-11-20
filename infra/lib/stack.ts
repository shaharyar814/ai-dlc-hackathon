import { RemovalPolicy, Stack } from 'aws-cdk-lib'
import type { StackProps } from 'aws-cdk-lib'
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
import { Duration } from 'aws-cdk-lib'
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
  }
}
