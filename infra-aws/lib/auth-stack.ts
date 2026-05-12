import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface AuthStackProps extends cdk.StackProps {
  envName: string;
}

/**
 * Cognito User Pool for VantaUM.
 *
 * V1 scope: pool + app client + custom attributes only. The magic-link
 * Lambdas (defineAuthChallenge, createAuthChallenge, verifyAuthChallenge)
 * land in a follow-up deploy because:
 *   1. Custom attributes are IMMUTABLE once the pool is created. If we
 *      need to add a new one later, the entire pool has to be recreated,
 *      losing all users. So get the attribute list right NOW; iterate
 *      on Lambda behavior later.
 *   2. The Lambdas need real code, not stubs. We add them piece by piece.
 *
 * Until the Lambdas land, the pool supports:
 *   - Standard password-based sign-in (admin/staff access)
 *   - AdminCreateUser flow (we can provision users via API)
 *   - The Supabase adapter still handles TPA magic-link logins
 *
 * Custom attributes — declared exhaustively now:
 *   - signup_id   : TPA's signup_requests row id (string)
 *   - client_id   : tenant id once approved (string)
 *   - provisioned_by : who/what created the account (string)
 *   - org_role    : VantaUM internal role (admin/delivery-lead/concierge/etc)
 *
 * Anything we might need later (especially for the IRO/IDR product) goes
 * in too — better to have 8 attributes you don't use than to have to
 * recreate the pool.
 */
export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { envName } = props;

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `vantaum-${envName}-users`,
      // Sign-up disabled — only admin can create users (TPA flow goes
      // through our app's API, which calls AdminCreateUser).
      selfSignUpEnabled: false,
      signInAliases: { email: true, username: false },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      // Standard attributes that must be present.
      standardAttributes: {
        email: { required: true, mutable: false },
        fullname: { required: false, mutable: true },
      },
      // Custom attributes — declared up-front because Cognito does NOT
      // allow adding new ones to an existing pool.
      customAttributes: {
        signup_id: new cognito.StringAttribute({ minLen: 1, maxLen: 64, mutable: true }),
        client_id: new cognito.StringAttribute({ minLen: 1, maxLen: 64, mutable: true }),
        provisioned_by: new cognito.StringAttribute({ minLen: 1, maxLen: 64, mutable: false }),
        org_role: new cognito.StringAttribute({ minLen: 1, maxLen: 32, mutable: true }),
        // Reserved for IRO/IDR product line — sticking them here so we
        // don't have to recreate the pool when that product ships.
        product_line: new cognito.StringAttribute({ minLen: 1, maxLen: 32, mutable: true }),
        practice_id: new cognito.StringAttribute({ minLen: 1, maxLen: 64, mutable: true }),
      },
      // Password policy — required even though we want magic links.
      // Admin/staff still use passwords; TPAs get magic links from our
      // Lambdas later. 12-char min, mixed case, numbers, symbols.
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: cdk.Duration.days(3),
      },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: true, otp: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      deletionProtection: true,
      // Advanced security — paid tier ($0.05/MAU). Worth it for the
      // adaptive auth + compromised-credential checks on a healthcare app.
      // Commenting out until first paying customer; flip on then.
      // featurePlan: cognito.FeaturePlan.PLUS,
    });

    // App client — what the Next.js app authenticates against.
    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: `vantaum-${envName}-app`,
      generateSecret: false, // public client (browser-side flows)
      authFlows: {
        userSrp: true,
        // CUSTOM_AUTH enables the magic-link Lambdas we add next.
        custom: true,
        // Disable password-based auth from the browser; passwords are
        // for admin-created accounts and they reset via email flow.
        userPassword: false,
        adminUserPassword: true, // for AdminInitiateAuth from our server
      },
      preventUserExistenceErrors: true,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      // No OAuth (no Hosted UI) — the Next.js app does the signin UI.
    });

    // Outputs — the app needs these as env vars.
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      exportName: `vantaum-${envName}-user-pool-id`,
    });
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      exportName: `vantaum-${envName}-user-pool-client-id`,
    });
    new cdk.CfnOutput(this, 'UserPoolArn', {
      value: this.userPool.userPoolArn,
      exportName: `vantaum-${envName}-user-pool-arn`,
    });
  }
}
