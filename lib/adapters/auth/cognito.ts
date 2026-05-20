import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  ListUsersCommand,
  RespondToAuthChallengeCommand,
  type AttributeType,
} from '@aws-sdk/client-cognito-identity-provider';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
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
 * Pairs with the three custom-auth Lambdas already deployed against the
 * `vantaum-prod-users` pool (us-east-1_CjZbn5TD4):
 *   - define-auth-challenge:  state machine (first call → CUSTOM_CHALLENGE,
 *     verified → issueTokens, 3 strikes → fail)
 *   - create-auth-challenge:  generates 32-char hex OTP, stores in
 *     vantaum-prod-magic-link-otps, emails `${APP_URL}/api/auth/callback?code=…&user=…`
 *   - verify-auth-challenge:  compares challengeAnswer against DDB row,
 *     single-use delete on success.
 *
 * The application owns:
 *   - createUserWithMagicLink → AdminCreateUser (suppressed email) +
 *     AdminInitiateAuth(CUSTOM_AUTH) which triggers create-auth-challenge.
 *   - /api/auth/callback page → POSTs `{code, session, username}` here as
 *     RespondToAuthChallenge, receives AuthenticationResult, sets the
 *     `vantaum_session` cookie containing the IdToken + AccessToken.
 *   - getSessionUser → reads the `vantaum_session` cookie, verifies the
 *     IdToken against the Cognito JWKS, returns SessionUser.
 */

const REGION = process.env.COGNITO_REGION || process.env.AWS_REGION || 'us-east-1';
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';
const CLIENT_ID = process.env.COGNITO_CLIENT_ID || '';

let cachedClient: CognitoIdentityProviderClient | null = null;
function client(): CognitoIdentityProviderClient {
  if (!cachedClient) cachedClient = new CognitoIdentityProviderClient({ region: REGION });
  return cachedClient;
}

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function jwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!cachedJwks) {
    const url = new URL(
      `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`,
    );
    cachedJwks = createRemoteJWKSet(url);
  }
  return cachedJwks;
}

export const SESSION_COOKIE_NAME = 'vantaum_session';

interface SessionCookiePayload {
  id_token: string;
  access_token: string;
  refresh_token?: string;
  expires_at: number; // epoch ms
}

function readSessionCookie(requestOrHeaders: Request | Headers): SessionCookiePayload | null {
  const cookieHeader =
    requestOrHeaders instanceof Headers
      ? requestOrHeaders.get('cookie') ?? ''
      : requestOrHeaders.headers.get('cookie') ?? '';
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';').map((s) => s.trim())) {
    if (!part.startsWith(`${SESSION_COOKIE_NAME}=`)) continue;
    const raw = decodeURIComponent(part.slice(SESSION_COOKIE_NAME.length + 1));
    try {
      const parsed = JSON.parse(raw) as SessionCookiePayload;
      if (!parsed?.id_token) return null;
      return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

function classifyError(err: unknown): CreateUserError['code'] {
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
  if (name === 'UsernameExistsException') return 'forbidden'; // caller uses preExisting path
  if (name === 'InvalidParameterException') return 'invalid_email';
  if (name === 'TooManyRequestsException' || name === 'LimitExceededException') return 'rate_limited';
  if (name.includes('Timeout') || name.includes('Throttling')) return 'transient';
  return 'unknown';
}

export class CognitoAuthAdapter implements AuthAdminAdapter {
  async createUserWithMagicLink(
    params: CreateUserParams,
  ): Promise<CreateUserResult | CreateUserError> {
    if (!params.email) return { ok: false, code: 'invalid_email', message: 'Email required' };
    if (!USER_POOL_ID || !CLIENT_ID) {
      return {
        ok: false,
        code: 'unknown',
        message: 'COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID must be set in the runtime environment.',
      };
    }
    const email = params.email.toLowerCase().trim();
    const attributes: AttributeType[] = [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' },
    ];
    if (params.fullName) attributes.push({ Name: 'name', Value: params.fullName });
    for (const [k, v] of Object.entries(params.metadata ?? {})) {
      if (v === undefined || v === null) continue;
      attributes.push({ Name: `custom:${k}`, Value: String(v) });
    }

    let preExisting = false;
    try {
      await client().send(
        new AdminCreateUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: email,
          UserAttributes: attributes,
          MessageAction: 'SUPPRESS',
        }),
      );
    } catch (err) {
      const name =
        err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
      if (name === 'UsernameExistsException') {
        preExisting = true;
      } else {
        return {
          ok: false,
          code: classifyError(err),
          message: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }

    // Kick off the custom auth flow — create-auth-challenge Lambda will email
    // the link `${APP_URL}/api/auth/callback?code=…&user=…`. We don't have
    // access to the OTP, so we return a placeholder magicLink string; callers
    // who need the link itself should pull from the user's inbox.
    try {
      await client().send(
        new AdminInitiateAuthCommand({
          UserPoolId: USER_POOL_ID,
          ClientId: CLIENT_ID,
          AuthFlow: 'CUSTOM_AUTH',
          AuthParameters: { USERNAME: email },
        }),
      );
    } catch (err) {
      return {
        ok: false,
        code: classifyError(err),
        message: err instanceof Error ? err.message : 'Unknown error',
      };
    }

    // Look up sub for the userId field. AdminCreateUser response usually
    // returns it but we conservatively re-fetch.
    const sub = await this.subForEmail(email);
    return {
      ok: true,
      userId: sub ?? email,
      magicLink: `(delivered via SES to ${email})`,
      preExisting,
    };
  }

  async getUserByEmail(email: string): Promise<UserSummary | null> {
    if (!USER_POOL_ID) return null;
    const normalized = email.toLowerCase().trim();
    const res = await client().send(
      new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        Filter: `email = "${normalized.replace(/"/g, '')}"`,
        Limit: 1,
      }),
    );
    const u = res.Users?.[0];
    if (!u) return null;
    const attrs = Object.fromEntries((u.Attributes ?? []).map((a) => [a.Name ?? '', a.Value ?? '']));
    const sub = attrs.sub;
    if (!sub) return null;
    const metadata: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith('custom:')) metadata[k.slice('custom:'.length)] = v;
    }
    return {
      id: sub,
      email: attrs.email ?? normalized,
      fullName: attrs.name || null,
      metadata,
      createdAt: u.UserCreateDate ?? new Date(),
    };
  }

  async getSessionUser(requestOrHeaders: Request | Headers): Promise<SessionUser | null> {
    if (!USER_POOL_ID || !CLIENT_ID) return null;
    const session = readSessionCookie(requestOrHeaders);
    if (!session?.id_token) return null;
    if (session.expires_at && Date.now() > session.expires_at) return null;

    let payload: JWTPayload;
    try {
      const verified = await jwtVerify(session.id_token, jwks(), {
        issuer: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`,
        audience: CLIENT_ID,
      });
      payload = verified.payload;
    } catch {
      return null;
    }

    if (payload.token_use !== undefined && payload.token_use !== 'id') return null;

    const sub = typeof payload.sub === 'string' ? payload.sub : null;
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase().trim() : '';
    if (!sub || !email) return null;

    const customRole = payload['custom:role'];
    const role = typeof customRole === 'string' && customRole.length > 0 ? customRole : undefined;
    return { id: sub, email, role };
  }

  /**
   * Caller-facing helper used by /api/auth/callback to redeem a challenge
   * code from the magic-link email. Returns the session payload that
   * should be set as the `vantaum_session` cookie, or an error.
   */
  async respondToChallenge(params: {
    username: string;
    session: string;
    code: string;
  }): Promise<{ ok: true; cookie: SessionCookiePayload } | { ok: false; message: string }> {
    if (!CLIENT_ID) return { ok: false, message: 'COGNITO_CLIENT_ID not configured' };
    try {
      const res = await client().send(
        new RespondToAuthChallengeCommand({
          ClientId: CLIENT_ID,
          ChallengeName: 'CUSTOM_CHALLENGE',
          Session: params.session,
          ChallengeResponses: {
            USERNAME: params.username,
            ANSWER: params.code,
          },
        }),
      );
      const r = res.AuthenticationResult;
      if (!r?.IdToken || !r.AccessToken) return { ok: false, message: 'Cognito did not return tokens' };
      const expiresAt = Date.now() + (r.ExpiresIn ?? 3600) * 1000;
      return {
        ok: true,
        cookie: {
          id_token: r.IdToken,
          access_token: r.AccessToken,
          refresh_token: r.RefreshToken,
          expires_at: expiresAt,
        },
      };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  private async subForEmail(email: string): Promise<string | null> {
    try {
      const res = await client().send(
        new ListUsersCommand({
          UserPoolId: USER_POOL_ID,
          Filter: `email = "${email.replace(/"/g, '')}"`,
          Limit: 1,
        }),
      );
      const u = res.Users?.[0];
      const sub = u?.Attributes?.find((a) => a.Name === 'sub')?.Value;
      return sub ?? null;
    } catch {
      return null;
    }
  }
}
