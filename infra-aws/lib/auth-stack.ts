import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'node:path';

export interface AuthStackProps extends cdk.StackProps {
  envName: string;
  /** Where the magic link should send the user back. e.g. https://app.vantaum.com */
  appUrl?: string;
  /** SES configuration set name from EmailStack. */
  sesConfigSet?: string;
  /** SES verified sender. Must be verified in SES before deploy works. */
  sesFromAddress?: string;
}

/**
 * Cognito User Pool + magic-link custom-auth Lambdas.
 *
 * Three Lambdas (in lib/lambdas/auth/):
 *   - define-auth-challenge.ts  -> issues a single CUSTOM_CHALLENGE
 *   - create-auth-challenge.ts  -> generates OTP, stashes in DDB, emails link
 *   - verify-auth-challenge.ts  -> checks submitted OTP against DDB
 *
 * Plus a DynamoDB table for OTP codes with TTL.
 *
 * Custom attributes — declared exhaustively now (they're IMMUTABLE once
 * the pool is created):
 *   signup_id, client_id, provisioned_by, org_role, product_line, practice_id
 */
export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly otpTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { envName } = props;
    // Defaults that let the stack deploy even when EmailStack outputs
    // aren't wired (placeholder/test mode).
    const appUrl = props.appUrl ?? 'https://app.vantaum.com';
    const sesConfigSet = props.sesConfigSet ?? `vantaum-${envName}`;
    const sesFromAddress = props.sesFromAddress ?? 'noreply@vantaum.com';

    // ── DynamoDB OTP table ──────────────────────────────────────────────
    this.otpTable = new dynamodb.Table(this, 'OtpTable', {
      tableName: `vantaum-${envName}-magic-link-otps`,
      partitionKey: { name: 'sub', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expires_at',
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── User pool ───────────────────────────────────────────────────────
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `vantaum-${envName}-users`,
      selfSignUpEnabled: false,
      signInAliases: { email: true, username: false },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: false },
        fullname: { required: false, mutable: true },
      },
      customAttributes: {
        signup_id: new cognito.StringAttribute({ minLen: 1, maxLen: 64, mutable: true }),
        client_id: new cognito.StringAttribute({ minLen: 1, maxLen: 64, mutable: true }),
        provisioned_by: new cognito.StringAttribute({ minLen: 1, maxLen: 64, mutable: false }),
        org_role: new cognito.StringAttribute({ minLen: 1, maxLen: 32, mutable: true }),
        product_line: new cognito.StringAttribute({ minLen: 1, maxLen: 32, mutable: true }),
        practice_id: new cognito.StringAttribute({ minLen: 1, maxLen: 64, mutable: true }),
      },
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
    });

    // ── Lambda triggers ─────────────────────────────────────────────────
    const lambdasDir = path.join(__dirname, 'lambdas', 'auth');

    const defineAuthChallengeFn = new nodejs.NodejsFunction(this, 'DefineAuthChallengeFn', {
      functionName: `vantaum-${envName}-define-auth-challenge`,
      entry: path.join(lambdasDir, 'define-auth-challenge.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'handler',
      timeout: cdk.Duration.seconds(10),
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    const createAuthChallengeFn = new nodejs.NodejsFunction(this, 'CreateAuthChallengeFn', {
      functionName: `vantaum-${envName}-create-auth-challenge`,
      entry: path.join(lambdasDir, 'create-auth-challenge.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'handler',
      timeout: cdk.Duration.seconds(15),
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        OTP_TABLE_NAME: this.otpTable.tableName,
        SES_FROM_ADDRESS: sesFromAddress,
        SES_CONFIG_SET: sesConfigSet,
        APP_URL: appUrl,
      },
    });

    const verifyAuthChallengeFn = new nodejs.NodejsFunction(this, 'VerifyAuthChallengeFn', {
      functionName: `vantaum-${envName}-verify-auth-challenge`,
      entry: path.join(lambdasDir, 'verify-auth-challenge.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'handler',
      timeout: cdk.Duration.seconds(10),
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        OTP_TABLE_NAME: this.otpTable.tableName,
      },
    });

    // ── Grant Lambdas access to DDB + SES ───────────────────────────────
    this.otpTable.grantReadWriteData(createAuthChallengeFn);
    this.otpTable.grantReadWriteData(verifyAuthChallengeFn);

    createAuthChallengeFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail'],
        resources: ['*'],
        // Scope to the SES configuration set + verified domain.
        conditions: {
          StringEquals: {
            'ses:FromAddress': sesFromAddress,
          },
        },
      }),
    );

    // ── Attach Lambdas to user pool triggers ────────────────────────────
    this.userPool.addTrigger(cognito.UserPoolOperation.DEFINE_AUTH_CHALLENGE, defineAuthChallengeFn);
    this.userPool.addTrigger(cognito.UserPoolOperation.CREATE_AUTH_CHALLENGE, createAuthChallengeFn);
    this.userPool.addTrigger(cognito.UserPoolOperation.VERIFY_AUTH_CHALLENGE_RESPONSE, verifyAuthChallengeFn);

    // ── User pool client ────────────────────────────────────────────────
    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: `vantaum-${envName}-app`,
      generateSecret: false,
      authFlows: {
        userSrp: true,
        custom: true,
        userPassword: false,
        adminUserPassword: true,
      },
      preventUserExistenceErrors: true,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // ── Outputs ─────────────────────────────────────────────────────────
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
    new cdk.CfnOutput(this, 'OtpTableName', {
      value: this.otpTable.tableName,
      exportName: `vantaum-${envName}-otp-table`,
    });
  }
}
