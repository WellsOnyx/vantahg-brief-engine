import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminUpdateUserAttributesCommand,
  ConfirmForgotPasswordCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  GlobalSignOutCommand,
  ListUsersCommand,
  ResendConfirmationCodeCommand,
  RespondToAuthChallengeCommand,
  SignUpCommand,
  type AttributeType,
  type ChallengeNameType,
} from '@aws-sdk/client-cognito-identity-provider';
import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload } from 'jose';
import { stashSession, consumeSession } from './session-stash';
import {
  challengePrompt,
  classifyAccountException,
  classifySignInException,
  isAuthChallenge,
  passwordPolicyError,
  type AuthChallengeKind,
} from '@/lib/auth/account-flow';
import type {
  AuthAdminAdapter,
  AccountStepResult,
  CreateUserParams,
  CreateUserResult,
  CreateUserError,
  UserSummary,
  SessionUser,
  SessionCookiePayload,
  SignInResult,
} from './types';

/**
 * Custom attributes declared on the live pool (AuthStack). Cognito
 * rejects unknown `custom:` names — AdminCreateUser fails closed.
 * `role` from callers is mapped to `org_role` (the attribute that
 * actually exists on the pool).
 */
export const COGNITO_CUSTOM_ATTRIBUTE_KEYS = [
  'signup_id',
  'client_id',
  'provisioned_by',
  'org_role',
  'product_line',
  'practice_id',
] as const;

const CUSTOM_ATTR_SET = new Set<string>(COGNITO_CUSTOM_ATTRIBUTE_KEYS);

export function mapMetadataToCognitoAttributes(
  metadata?: Record<string, string | number | boolean | undefined>,
): AttributeType[] {
  if (!metadata) return [];
  const out: AttributeType[] = [];
  for (const [rawKey, v] of Object.entries(metadata)) {
    if (v === undefined || v === null) continue;
    const key = rawKey === 'role' ? 'org_role' : rawKey;
    if (!CUSTOM_ATTR_SET.has(key)) continue;
    out.push({ Name: `custom:${key}`, Value: String(v) });
  }
  return out;
}

export function roleFromCognitoClaims(payload: Record<string, unknown>): string | undefined {
  const orgRole = payload['custom:org_role'];
  const legacy = payload['custom:role'];
  const role = typeof orgRole === 'string' && orgRole.length > 0
    ? orgRole
    : typeof legacy === 'string' && legacy.length > 0
      ? legacy
      : undefined;
  return role;
}

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
export const AUTH_SESSION_MAX_AGE_SEC = 3600 * 8;

export function sessionCookieOptions(maxAgeSec: number = AUTH_SESSION_MAX_AGE_SEC) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSec,
  };
}

export function peekSessionCookie(requestOrHeaders: Request | Headers): SessionCookiePayload | null {
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

function errorName(err: unknown): string {
  return err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
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
    attributes.push(...mapMetadataToCognitoAttributes(params.metadata));

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
    // the link `${APP_URL}/api/auth/callback?code=…&user=…`. AdminInitiateAuth
    // returns an opaque `Session` token that we must hand back to Cognito
    // along with the user's code at RespondToAuthChallenge time. We stash
    // it now keyed by sub so /api/auth/callback can retrieve it.
    let cognitoSession: string | undefined;
    try {
      const initRes = await client().send(
        new AdminInitiateAuthCommand({
          UserPoolId: USER_POOL_ID,
          ClientId: CLIENT_ID,
          AuthFlow: 'CUSTOM_AUTH',
          AuthParameters: { USERNAME: email },
        }),
      );
      cognitoSession = initRes.Session;
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

    if (cognitoSession && sub) {
      try {
        await stashSession(sub, cognitoSession, email);
      } catch {
        // Non-fatal: the user will get the email but redemption may fail.
        // The next AdminInitiateAuth retry (or magic link re-send) will overwrite.
      }
    }
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
    const session = peekSessionCookie(requestOrHeaders);
    if (!session?.id_token) return null;
    const now = Date.now();
    if (session.absolute_expires_at && now >= session.absolute_expires_at) return null;
    if (session.expires_at && now >= session.expires_at) return null;

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

    const claims = payload as Record<string, unknown>;
    const role = roleFromCognitoClaims(claims);
    const clientRaw = claims['custom:client_id'];
    const clientId = typeof clientRaw === 'string' && clientRaw.length > 0 ? clientRaw : undefined;
    return { id: sub, email, role, clientId };
  }

  async signInWithPassword(params: {
    email: string;
    password: string;
  }): Promise<SignInResult> {
    if (!USER_POOL_ID || !CLIENT_ID) {
      return {
        ok: false,
        code: 'unavailable',
        message: 'COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID must be set in the runtime environment.',
      };
    }
    const email = params.email.toLowerCase().trim();
    try {
      const auth = await client().send(
        new AdminInitiateAuthCommand({
          UserPoolId: USER_POOL_ID,
          ClientId: CLIENT_ID,
          AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
          AuthParameters: {
            USERNAME: email,
            PASSWORD: params.password,
          },
        }),
      );
      if (isAuthChallenge(auth.ChallengeName) && auth.Session) {
        return {
          ok: false,
          code: 'challenge',
          challenge: auth.ChallengeName,
          session: auth.Session,
          username: email,
          message: challengePrompt(auth.ChallengeName),
        };
      }
      const tokens = auth.AuthenticationResult;
      if (!tokens?.IdToken || !tokens?.AccessToken) {
        return { ok: false, code: 'invalid_credentials', message: 'Cognito did not return tokens' };
      }
      return this.tokensToSignIn(tokens);
    } catch (err) {
      const name = errorName(err);
      const code = classifySignInException(name);
      return {
        ok: false,
        code,
        message: code === 'unknown' && err instanceof Error ? err.message : name || 'sign_in_failed',
      };
    }
  }

  async signUp(params: { email: string; password: string; fullName?: string }): Promise<AccountStepResult> {
    const policy = passwordPolicyError(params.password);
    if (policy) return { ok: false, code: policy, message: 'weak_password' };
    if (!CLIENT_ID) return { ok: false, code: 'unavailable', message: 'COGNITO_CLIENT_ID not configured' };
    const email = params.email.toLowerCase().trim();
    if (!email.includes('@')) return { ok: false, code: 'invalid_email', message: 'invalid_email' };
    try {
      const attributes: AttributeType[] = [{ Name: 'email', Value: email }];
      if (params.fullName) attributes.push({ Name: 'name', Value: params.fullName });
      await client().send(
        new SignUpCommand({
          ClientId: CLIENT_ID,
          Username: email,
          Password: params.password,
          UserAttributes: attributes,
        }),
      );
      return { ok: true, next: 'confirm_email' };
    } catch (err) {
      const name = errorName(err);
      // Do not reveal whether the address is already registered.
      if (name === 'UsernameExistsException') return { ok: true, next: 'confirm_email' };
      const code = classifyAccountException(name);
      return { ok: false, code, message: name || 'sign_up_failed' };
    }
  }

  async confirmSignUp(params: { email: string; code: string }): Promise<AccountStepResult> {
    if (!CLIENT_ID || !USER_POOL_ID) {
      return { ok: false, code: 'unavailable', message: 'COGNITO_CLIENT_ID not configured' };
    }
    const email = params.email.toLowerCase().trim();
    try {
      await client().send(
        new ConfirmSignUpCommand({
          ClientId: CLIENT_ID,
          Username: email,
          ConfirmationCode: params.code.trim(),
        }),
      );
    } catch (err) {
      const name = errorName(err);
      // Already confirmed: still stamp the client role below.
      if (name !== 'NotAuthorizedException' && name !== 'AliasExistsException') {
        const code = classifyAccountException(name);
        return { ok: false, code, message: name || 'confirm_failed' };
      }
    }
    try {
      await client().send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: USER_POOL_ID,
          Username: email,
          UserAttributes: [
            { Name: 'custom:org_role', Value: 'client' },
            { Name: 'custom:product_line', Value: 'med_review' },
          ],
        }),
      );
    } catch (err) {
      return {
        ok: false,
        code: 'unknown',
        message: err instanceof Error ? err.message : 'role_stamp_failed',
      };
    }
    return { ok: true, next: 'confirmed' };
  }

  async resendConfirmation(email: string): Promise<AccountStepResult> {
    if (!CLIENT_ID) return { ok: false, code: 'unavailable', message: 'COGNITO_CLIENT_ID not configured' };
    try {
      await client().send(
        new ResendConfirmationCodeCommand({
          ClientId: CLIENT_ID,
          Username: email.toLowerCase().trim(),
        }),
      );
      return { ok: true, next: 'code_resent' };
    } catch (err) {
      const name = errorName(err);
      if (name === 'UserNotFoundException') return { ok: true, next: 'code_resent' };
      return { ok: false, code: classifyAccountException(name), message: name || 'resend_failed' };
    }
  }

  async forgotPassword(email: string): Promise<AccountStepResult> {
    if (!CLIENT_ID) return { ok: false, code: 'unavailable', message: 'COGNITO_CLIENT_ID not configured' };
    try {
      await client().send(
        new ForgotPasswordCommand({
          ClientId: CLIENT_ID,
          Username: email.toLowerCase().trim(),
        }),
      );
      return { ok: true, next: 'reset_sent' };
    } catch (err) {
      const name = errorName(err);
      if (name === 'UserNotFoundException') return { ok: true, next: 'reset_sent' };
      return { ok: false, code: classifyAccountException(name), message: name || 'forgot_failed' };
    }
  }

  async confirmForgotPassword(params: {
    email: string;
    code: string;
    password: string;
  }): Promise<AccountStepResult> {
    const policy = passwordPolicyError(params.password);
    if (policy) return { ok: false, code: policy, message: 'weak_password' };
    if (!CLIENT_ID) return { ok: false, code: 'unavailable', message: 'COGNITO_CLIENT_ID not configured' };
    try {
      await client().send(
        new ConfirmForgotPasswordCommand({
          ClientId: CLIENT_ID,
          Username: params.email.toLowerCase().trim(),
          ConfirmationCode: params.code.trim(),
          Password: params.password,
        }),
      );
      return { ok: true, next: 'password_reset' };
    } catch (err) {
      const name = errorName(err);
      return { ok: false, code: classifyAccountException(name), message: name || 'reset_failed' };
    }
  }

  async continueSignInChallenge(params: {
    username: string;
    session: string;
    challenge: AuthChallengeKind;
    code?: string;
    newPassword?: string;
  }): Promise<SignInResult> {
    if (!CLIENT_ID) {
      return { ok: false, code: 'unavailable', message: 'COGNITO_CLIENT_ID not configured' };
    }
    if (params.challenge === 'NEW_PASSWORD_REQUIRED') {
      const policy = passwordPolicyError(params.newPassword ?? '');
      if (policy) return { ok: false, code: 'unknown', message: 'weak_password' };
    } else if (!params.code?.trim()) {
      return { ok: false, code: 'invalid_credentials', message: 'code_required' };
    }
    const responses: Record<string, string> = { USERNAME: params.username };
    if (params.challenge === 'SOFTWARE_TOKEN_MFA') responses.SOFTWARE_TOKEN_MFA_CODE = params.code!.trim();
    if (params.challenge === 'SMS_MFA') responses.SMS_MFA_CODE = params.code!.trim();
    if (params.challenge === 'NEW_PASSWORD_REQUIRED') responses.NEW_PASSWORD = params.newPassword ?? '';
    try {
      const res = await client().send(
        new RespondToAuthChallengeCommand({
          ClientId: CLIENT_ID,
          ChallengeName: params.challenge as ChallengeNameType,
          Session: params.session,
          ChallengeResponses: responses,
        }),
      );
      if (isAuthChallenge(res.ChallengeName) && res.Session) {
        return {
          ok: false,
          code: 'challenge',
          challenge: res.ChallengeName,
          session: res.Session,
          username: params.username,
          message: challengePrompt(res.ChallengeName),
        };
      }
      const tokens = res.AuthenticationResult;
      if (!tokens?.IdToken || !tokens.AccessToken) {
        return { ok: false, code: 'invalid_credentials', message: 'Cognito did not return tokens' };
      }
      return this.tokensToSignIn(tokens);
    } catch (err) {
      const name = errorName(err);
      const code = name === 'CodeMismatchException' || name === 'ExpiredCodeException'
        ? 'invalid_credentials'
        : classifySignInException(name);
      return { ok: false, code, message: name || 'challenge_failed' };
    }
  }

  async refreshSession(refreshToken: string): Promise<SignInResult> {
    if (!USER_POOL_ID || !CLIENT_ID) {
      return { ok: false, code: 'unavailable', message: 'COGNITO_USER_POOL_ID not configured' };
    }
    try {
      const auth = await client().send(
        new AdminInitiateAuthCommand({
          UserPoolId: USER_POOL_ID,
          ClientId: CLIENT_ID,
          AuthFlow: 'REFRESH_TOKEN_AUTH',
          AuthParameters: { REFRESH_TOKEN: refreshToken },
        }),
      );
      const tokens = auth.AuthenticationResult;
      if (!tokens?.IdToken || !tokens.AccessToken) {
        return { ok: false, code: 'invalid_credentials', message: 'refresh_failed' };
      }
      const signed = this.tokensToSignIn(tokens);
      if (signed.ok && !signed.cookie.refresh_token) {
        signed.cookie.refresh_token = refreshToken;
      }
      return signed;
    } catch (err) {
      return { ok: false, code: classifySignInException(errorName(err)), message: 'refresh_failed' };
    }
  }

  async revokeSession(accessToken: string): Promise<void> {
    if (!accessToken) return;
    await client().send(new GlobalSignOutCommand({ AccessToken: accessToken }));
  }

  private tokensToSignIn(tokens: {
    IdToken?: string;
    AccessToken?: string;
    RefreshToken?: string;
    ExpiresIn?: number;
  }): SignInResult {
    if (!tokens.IdToken || !tokens.AccessToken) {
      return { ok: false, code: 'invalid_credentials', message: 'Cognito did not return tokens' };
    }
    let role: string | undefined;
    let clientId: string | undefined;
    try {
      const claims = decodeJwt(tokens.IdToken) as Record<string, unknown>;
      role = roleFromCognitoClaims(claims);
      const raw = claims['custom:client_id'];
      if (typeof raw === 'string' && raw.length > 0) clientId = raw;
    } catch {
      role = undefined;
    }
    return {
      ok: true,
      role,
      clientId,
      cookie: {
        id_token: tokens.IdToken,
        access_token: tokens.AccessToken,
        refresh_token: tokens.RefreshToken,
        expires_at: Date.now() + (tokens.ExpiresIn ?? 3600) * 1000,
      },
    };
  }

  /**
   * Caller-facing helper used by /api/auth/callback to redeem a magic-link
   * click. Given the `sub` and `code` from the URL, we retrieve the stashed
   * Cognito Session, hand it to RespondToAuthChallenge with the code as
   * the ANSWER, and return the session payload to set as the
   * `vantaum_session` cookie.
   */
  async redeemMagicLink(params: {
    sub: string;
    code: string;
  }): Promise<{ ok: true; cookie: SessionCookiePayload } | { ok: false; message: string }> {
    if (!CLIENT_ID) return { ok: false, message: 'COGNITO_CLIENT_ID not configured' };
    const stashed = await consumeSession(params.sub);
    if (!stashed?.session) {
      return { ok: false, message: 'No active challenge for this user. Request a new magic link.' };
    }
    return this.respondToChallenge({
      username: stashed.username,
      session: stashed.session,
      code: params.code,
    });
  }

  /**
   * Lower-level helper that wraps RespondToAuthChallenge directly. Most
   * callers should use redeemMagicLink, which sources the Session token
   * from the server-side stash.
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
