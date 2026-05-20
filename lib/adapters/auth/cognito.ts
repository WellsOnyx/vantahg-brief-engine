import type {
  AuthAdminAdapter,
  CreateUserParams,
  CreateUserResult,
  CreateUserError,
  UserSummary,
  SessionUser,
} from './types';

/**
 * AWS Cognito implementation of the AuthAdminAdapter.
 *
 * STATUS: stubbed for Cole.
 *
 * Cognito does not have a built-in magic link flow. Two viable approaches:
 *
 *  Approach A — Custom Auth Flow (recommended)
 *    - AdminCreateUser with MessageAction='SUPPRESS' to avoid the default
 *      temporary password email.
 *    - InitiateAuth with AuthFlow=CUSTOM_AUTH triggers your
 *      DefineAuthChallenge + CreateAuthChallenge Lambda functions.
 *    - CreateAuthChallenge generates a one-time code, stashes it in
 *      DynamoDB keyed by user_sub, and sends a SES email with the link
 *      `${redirectUrl}?code=...&user=...`.
 *    - The /auth/callback page on the Next.js side calls
 *      RespondToAuthChallenge with the code, gets back tokens, and
 *      drops them in HttpOnly cookies.
 *
 *  Approach B — Pre-signed Cognito Hosted UI link
 *    - Skip magic links entirely. Use Cognito Hosted UI with
 *      email-based passwordless OTP. UX is slightly worse (user
 *      types a 6-digit code instead of clicking) but no Lambdas.
 *
 * For the migration, Approach A keeps the TPA experience identical to
 * what Supabase delivers today. Estimated effort: ~3 days of focused work
 * including the Lambdas, the SES template, the callback page, and the
 * DynamoDB OTP table.
 *
 * Dependencies (add when implementing):
 *   npm install @aws-sdk/client-cognito-identity-provider
 *               @aws-sdk/client-ses
 *               @aws-sdk/client-dynamodb
 *
 * Env vars required:
 *   COGNITO_USER_POOL_ID
 *   COGNITO_CLIENT_ID
 *   COGNITO_REGION
 *   SES_FROM_ADDRESS (must be verified in SES)
 *   OTP_TABLE_NAME (DynamoDB table for magic-link codes)
 *
 * Cognito attribute mapping (CreateUserParams.metadata):
 *   - signup_id → custom:signup_id
 *   - client_id → custom:client_id
 *   - full_name → name (standard attribute)
 *   All custom attributes must be declared on the user pool at creation
 *   time and cannot be added retroactively without recreating the pool.
 *   Define every metadata key you expect to use up-front in the CDK stack.
 */

const NOT_IMPLEMENTED = (op: string) =>
  new Error(
    `CognitoAuthAdapter.${op} is not implemented yet. See lib/adapters/auth/cognito.ts for the migration plan. The Supabase adapter is the source of truth until ENABLE_AWS_AUTH=true is set.`,
  );

export class CognitoAuthAdapter implements AuthAdminAdapter {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async createUserWithMagicLink(
    _params: CreateUserParams,
  ): Promise<CreateUserResult | CreateUserError> {
    throw NOT_IMPLEMENTED('createUserWithMagicLink');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getUserByEmail(_email: string): Promise<UserSummary | null> {
    throw NOT_IMPLEMENTED('getUserByEmail');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getSessionUser(_requestOrHeaders: Request | Headers): Promise<SessionUser | null> {
    throw NOT_IMPLEMENTED('getSessionUser');
  }
}
