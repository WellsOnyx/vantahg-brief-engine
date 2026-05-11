/**
 * AWS Cognito auth client for VantaUM.
 *
 * Replaces Supabase Auth. Uses a passwordless email magic-link flow on top
 * of Cognito custom auth challenges:
 *
 *   1. `startMagicLinkLogin(email)` calls `InitiateAuth` with
 *      `AuthFlow: CUSTOM_AUTH`. Cognito invokes our CreateAuthChallenge
 *      Lambda which emits a one-time token to the user's email via SES.
 *   2. The user clicks the link, the callback route calls
 *      `verifyMagicLinkToken(session, token)` → `RespondToAuthChallenge`.
 *   3. On success Cognito returns access/ID/refresh tokens. We mint a
 *      signed session cookie containing the access token + Cognito `sub`.
 *
 * For dev / demo we expose a flag `hasCognitoConfig()` and the rest of
 * the app falls back to the existing Supabase Auth path until the
 * Lambda triggers + user pool are provisioned.
 *
 * Required env:
 *   - AWS_REGION
 *   - COGNITO_USER_POOL_ID
 *   - COGNITO_CLIENT_ID
 *
 * Cognito User Pool setup (one-time, in console):
 *   - Sign-in option: email
 *   - Passwordless options: no SMS, custom auth flow only
 *   - Lambda triggers: DefineAuthChallenge, CreateAuthChallenge, VerifyAuthChallengeResponse
 *   - App client: no client secret, CUSTOM_AUTH enabled
 *
 * The Lambda implementations live in `infra/cognito-lambdas/` (created in
 * the AWS setup step) and the templates are scaffolded in the
 * AWS-MIGRATION.md doc.
 */

import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  AdminGetUserCommand,
  AdminCreateUserCommand,
  AuthFlowType,
  ChallengeNameType,
} from '@aws-sdk/client-cognito-identity-provider';

export interface StartMagicLinkResult {
  /** Cognito session string to pass back on verification. */
  session: string;
  /** Email address the link was sent to (echoed for the UI). */
  email: string;
}

export interface VerifyMagicLinkResult {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  /** Cognito `sub` — stable user identifier across token refreshes. */
  sub: string;
  /** Email from the ID token (verified). */
  email: string;
}

function client(): CognitoIdentityProviderClient {
  return new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION || 'us-east-1',
  });
}

function userPoolId(): string {
  const v = process.env.COGNITO_USER_POOL_ID;
  if (!v) throw new Error('COGNITO_USER_POOL_ID env var is required');
  return v;
}

function clientId(): string {
  const v = process.env.COGNITO_CLIENT_ID;
  if (!v) throw new Error('COGNITO_CLIENT_ID env var is required');
  return v;
}

/**
 * True when Cognito is fully configured. Callers branch on this to either
 * use Cognito or fall back to the legacy Supabase Auth path during the
 * migration window.
 */
export function hasCognitoConfig(): boolean {
  return !!(process.env.AWS_REGION && process.env.COGNITO_USER_POOL_ID && process.env.COGNITO_CLIENT_ID);
}

/**
 * Begin a magic-link login. Returns a Cognito session string the caller
 * stashes (typically in an encrypted cookie) so it can be paired with the
 * one-time token when the user clicks the email link.
 *
 * For new users, Cognito's "users must exist" rule normally blocks
 * CUSTOM_AUTH for emails that aren't already in the pool. We work around
 * this by upserting the user before InitiateAuth — passwordless flow
 * doesn't need a temporary password to be sent.
 */
export async function startMagicLinkLogin(email: string): Promise<StartMagicLinkResult> {
  const c = client();
  const lowerEmail = email.trim().toLowerCase();

  // Ensure the user exists (idempotent for HIPAA-friendly logging — we never
  // surface "user not found" so enumeration is mitigated).
  try {
    await c.send(new AdminGetUserCommand({
      UserPoolId: userPoolId(),
      Username: lowerEmail,
    }));
  } catch (err) {
    const code = (err as { name?: string })?.name;
    if (code === 'UserNotFoundException') {
      await c.send(new AdminCreateUserCommand({
        UserPoolId: userPoolId(),
        Username: lowerEmail,
        UserAttributes: [
          { Name: 'email', Value: lowerEmail },
          { Name: 'email_verified', Value: 'true' },
        ],
        MessageAction: 'SUPPRESS', // we send our own magic link via SES
      }));
    } else {
      throw err;
    }
  }

  const initiate = await c.send(new InitiateAuthCommand({
    AuthFlow: AuthFlowType.CUSTOM_AUTH,
    ClientId: clientId(),
    AuthParameters: { USERNAME: lowerEmail },
  }));

  if (!initiate.Session) {
    throw new Error('Cognito did not return a session for CUSTOM_AUTH');
  }
  return { session: initiate.Session, email: lowerEmail };
}

/**
 * Complete a magic-link login. The caller passes the session string from
 * `startMagicLinkLogin` plus the one-time token from the email URL.
 * On success returns the user's tokens + identifiers.
 */
export async function verifyMagicLinkToken(params: {
  email: string;
  session: string;
  token: string;
}): Promise<VerifyMagicLinkResult> {
  const c = client();
  const result = await c.send(new RespondToAuthChallengeCommand({
    ChallengeName: ChallengeNameType.CUSTOM_CHALLENGE,
    ClientId: clientId(),
    Session: params.session,
    ChallengeResponses: {
      USERNAME: params.email.trim().toLowerCase(),
      ANSWER: params.token,
    },
  }));

  const auth = result.AuthenticationResult;
  if (!auth?.AccessToken || !auth.IdToken || !auth.RefreshToken) {
    throw new Error('Cognito challenge succeeded but tokens were missing');
  }

  const claims = decodeJwtPayload(auth.IdToken);
  const sub = String(claims.sub || '');
  const emailClaim = String(claims.email || params.email);

  return {
    accessToken: auth.AccessToken,
    idToken: auth.IdToken,
    refreshToken: auth.RefreshToken,
    sub,
    email: emailClaim,
  };
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.');
  if (parts.length !== 3) return {};
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf-8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}
