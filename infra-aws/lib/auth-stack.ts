import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface AuthStackProps extends cdk.StackProps {
  envName: string;
}

/**
 * Cognito User Pool + custom-auth Lambdas replacing Supabase Auth.
 *
 * Stack contents:
 *   - UserPool with email-only sign-up, MFA optional, password policy
 *     enforced (12+ chars, mixed case, numbers, symbols) — even though
 *     we ship magic links, allow password fallback for support workflows.
 *   - UserPoolClient with allowed auth flows: USER_SRP_AUTH +
 *     CUSTOM_AUTH (the magic-link flow).
 *   - Custom Auth Lambdas (three of them):
 *       defineAuthChallenge.ts    — decides which challenge to present
 *       createAuthChallenge.ts    — generates the OTP, sends the SES email
 *       verifyAuthChallenge.ts    — checks the user's submitted code
 *   - DynamoDB table for OTP codes (TTL 15 min on the GSI).
 *   - Custom user attributes declared up-front:
 *       custom:signup_id (mutable, varchar 64)
 *       custom:client_id (mutable, varchar 64)
 *       custom:provisioned_by (immutable, varchar 64)
 *     IMPORTANT: custom attributes cannot be added to an existing pool —
 *     declare every attribute we plan to use BEFORE first deploy.
 *
 * Hosted UI:
 *   - Off for V1. Magic links + a custom Next.js sign-in page is the UX.
 *   - The /api/auth/callback endpoint (app side, not in this stack)
 *     handles the code exchange and sets HttpOnly cookies.
 *
 * Migration from Supabase Auth:
 *   - Cognito has no password-hash import. Existing users must reset.
 *   - Plan: at cutover, send every active user a one-time "VantaUM is
 *     upgrading our login system — click here to set your new password"
 *     email. Their session lives on the old system until they click.
 *   - For magic-link-only users (the post-signature TPA flow): they
 *     never had a password, so cutover is just a redirect to the new
 *     Cognito-issued link the next time the webhook fires.
 *
 * SES dependency:
 *   - createAuthChallenge.ts uses SES to send the magic link.
 *   - EmailStack must be deployed first.
 */
export class AuthStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);
    // TODO: Cognito UserPool with custom attributes
    // TODO: UserPoolClient (no Hosted UI; auth callback at /api/auth/callback)
    // TODO: DynamoDB table for OTP codes with TTL
    // TODO: defineAuthChallenge Lambda
    // TODO: createAuthChallenge Lambda (reads SES_FROM_ADDRESS from secrets)
    // TODO: verifyAuthChallenge Lambda
    // TODO: wire Lambdas to UserPool triggers
    // TODO: export UserPoolId + ClientId via cdk.CfnOutput
  }
}
