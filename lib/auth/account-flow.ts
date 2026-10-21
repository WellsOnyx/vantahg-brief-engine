/**
 * Cognito account flow decisions.
 *
 * Pure: no AWS SDK, no PHI. Routes and the Cognito adapter share these
 * so a challenge, an unconfirmed email, or an expired code never collapses
 * into a dead-end "invalid credentials".
 */

export const AUTH_CHALLENGES = [
  'SOFTWARE_TOKEN_MFA',
  'SMS_MFA',
  'NEW_PASSWORD_REQUIRED',
] as const;

export type AuthChallengeKind = (typeof AUTH_CHALLENGES)[number];

export type SignInFailureCode =
  | 'invalid_credentials'
  | 'unconfirmed'
  | 'password_reset_required'
  | 'unavailable'
  | 'rate_limited'
  | 'unknown';

export type AccountFailureCode =
  | 'invalid_code'
  | 'expired_code'
  | 'weak_password'
  | 'rate_limited'
  | 'invalid_email'
  | 'unavailable'
  | 'unknown';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Matches the live pool policy in infra-aws/lib/auth-stack.ts. */
export function passwordPolicyError(password: string): AccountFailureCode | null {
  if (typeof password !== 'string') return 'weak_password';
  if (password.length < 12 || password.length > 256) return 'weak_password';
  if (!/[a-z]/.test(password)) return 'weak_password';
  if (!/[A-Z]/.test(password)) return 'weak_password';
  if (!/[0-9]/.test(password)) return 'weak_password';
  if (!/[^A-Za-z0-9]/.test(password)) return 'weak_password';
  return null;
}

export function isAuthChallenge(name: string | null | undefined): name is AuthChallengeKind {
  return !!name && (AUTH_CHALLENGES as readonly string[]).includes(name);
}

export function classifySignInException(name: string): SignInFailureCode {
  switch (name) {
    case 'NotAuthorizedException':
    case 'UserNotFoundException':
      return 'invalid_credentials';
    case 'UserNotConfirmedException':
      return 'unconfirmed';
    case 'PasswordResetRequiredException':
      return 'password_reset_required';
    case 'TooManyRequestsException':
    case 'LimitExceededException':
      return 'rate_limited';
    default:
      if (name.includes('Timeout') || name.includes('Throttling')) return 'rate_limited';
      return 'unknown';
  }
}

export function classifyAccountException(name: string): AccountFailureCode {
  switch (name) {
    case 'CodeMismatchException':
    case 'ExpiredCodeException':
      return name === 'ExpiredCodeException' ? 'expired_code' : 'invalid_code';
    case 'InvalidPasswordException':
      return 'weak_password';
    case 'InvalidParameterException':
    case 'UsernameExistsException':
      return 'invalid_email';
    case 'TooManyRequestsException':
    case 'LimitExceededException':
      return 'rate_limited';
    case 'UserNotFoundException':
      return 'invalid_code';
    default:
      if (name.includes('Timeout') || name.includes('Throttling')) return 'rate_limited';
      return 'unknown';
  }
}

export function challengePrompt(kind: AuthChallengeKind): string {
  switch (kind) {
    case 'SOFTWARE_TOKEN_MFA':
      return 'Enter the code from your authenticator app.';
    case 'SMS_MFA':
      return 'Enter the code we texted to your phone.';
    case 'NEW_PASSWORD_REQUIRED':
      return 'Choose a new password to finish signing in.';
  }
}

export function authMessage(code: string): string {
  switch (code) {
    case 'invalid_credentials':
      return "That email and password don't match our records.";
    case 'unconfirmed':
      return 'Confirm your email with the code we sent, then sign in.';
    case 'password_reset_required':
      return 'Reset your password to continue.';
    case 'weak_password':
      return 'Use at least 12 characters with upper and lower case, a number, and a symbol.';
    case 'invalid_code':
      return 'That code is not valid. Request a new one and try again.';
    case 'expired_code':
      return 'That code expired. Request a new one and try again.';
    case 'rate_limited':
      return 'Too many attempts. Wait a minute and try again.';
    case 'invalid_email':
      return 'Enter a valid work email.';
    case 'unavailable':
      return 'Authentication is not configured on this deployment.';
    case 'session_expired':
      return 'Your session expired. Sign in again.';
    case 'role_unassigned':
      return 'This account is not linked to a workspace yet. Ask your admin to finish provisioning.';
    default:
      return "That didn't work. Try again, or use the reset link.";
  }
}

/** Same-origin relative paths only. Blocks protocol-relative and header injection. */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith('/')) return null;
  if (next.startsWith('//')) return null;
  if (next.includes('\\')) return null;
  if (next.includes('\n') || next.includes('\r')) return null;
  return next;
}

export interface InviteBinding {
  clientId: string | null;
  /** Med Review invites stay on this line. IDR attorneys are not tagged as Med Review. */
  productLine: 'med_review' | null;
}

export function inviteBinding(input: {
  role: string;
  clientId?: unknown;
}): { ok: true } & InviteBinding | { ok: false; message: string } {
  if (input.role === 'idr-attorney') {
    return { ok: true, clientId: null, productLine: null };
  }
  if (input.role === 'client') {
    if (typeof input.clientId !== 'string' || !UUID_RE.test(input.clientId)) {
      return {
        ok: false,
        message: 'Client invites require the client_id for that organization.',
      };
    }
    return { ok: true, clientId: input.clientId, productLine: 'med_review' };
  }
  return { ok: true, clientId: null, productLine: 'med_review' };
}

export interface SessionClock {
  /** Id token expiry, epoch ms. */
  expiresAt?: number;
  /** Absolute session cap, epoch ms. Missing on cookies issued before this field. */
  absoluteExpiresAt?: number;
  hasRefresh: boolean;
  now: number;
}

/**
 * Id tokens last about an hour. The cookie may still hold a refresh token
 * inside the absolute cap (8h). Past the cap, the user signs in again.
 */
export function sessionClockDecision(clock: SessionClock): 'valid' | 'refresh' | 'expired' {
  if (clock.absoluteExpiresAt !== undefined && clock.now >= clock.absoluteExpiresAt) {
    return 'expired';
  }
  if (clock.expiresAt !== undefined && clock.now >= clock.expiresAt - 60_000) {
    return clock.hasRefresh ? 'refresh' : 'expired';
  }
  return 'valid';
}

export function stampSessionCap<T extends { absolute_expires_at?: number }>(
  cookie: T,
  now: number,
  maxAgeSec: number,
  previousAbsolute?: number,
): { cookie: T; maxAgeSec: number } | { expired: true } {
  const absolute = previousAbsolute ?? cookie.absolute_expires_at ?? now + maxAgeSec * 1000;
  if (now >= absolute) return { expired: true };
  const remaining = Math.max(1, Math.floor((absolute - now) / 1000));
  return {
    cookie: { ...cookie, absolute_expires_at: absolute },
    maxAgeSec: remaining,
  };
}
