/**
 * Auth admin adapter interface.
 *
 * Covers ONLY the admin-side operations the application performs on behalf
 * of users — creating accounts, sending magic links, looking up users.
 * User session management (sign-in, sign-out, getSession) stays in
 * provider-specific code because:
 *   - Session storage (cookies, JWT format) doesn't have a clean shared
 *     abstraction across Supabase SSR and Cognito Hosted UI.
 *   - The session surface is small and rarely touched.
 *
 * Two implementations:
 *   - lib/adapters/auth/supabase.ts (current production)
 *   - lib/adapters/auth/cognito.ts  (AWS migration target — stubbed)
 *
 * Cognito mapping notes for Cole:
 *   - createUserWithMagicLink → AdminCreateUser + custom challenge with
 *     SES-delivered link (Cognito has no native magic link; you either
 *     build it via Custom Auth Flow + Lambda triggers, or send a one-time
 *     temporary password and require user to set their own on first
 *     login).
 *   - getUserByEmail → ListUsers with Filter="email = \"x@y.com\"".
 *   - updateUserMetadata → AdminUpdateUserAttributes (custom: prefix
 *     required for non-standard fields like client_id).
 */

export interface CreateUserParams {
  email: string;
  fullName?: string;
  /**
   * Application metadata stored with the user (Supabase: raw_user_meta_data,
   * Cognito: custom: attributes). Keys must be JSON-serializable scalars
   * or short strings — Cognito caps custom attribute size at 2KB.
   */
  metadata?: Record<string, string | number | boolean | undefined>;
  /** Where to land the user after they click the magic link. */
  redirectUrl: string;
}

export interface CreateUserResult {
  ok: true;
  userId: string;
  /**
   * The magic link the user clicks. The adapter is also expected to
   * trigger delivery (Supabase: project SMTP sends automatically;
   * Cognito: emit via SES). Returning the link lets callers audit-log
   * generation and (optionally) re-send.
   */
  magicLink: string;
  /** True if the user already existed and we re-sent a link. */
  preExisting: boolean;
}

export interface CreateUserError {
  ok: false;
  code: 'invalid_email' | 'forbidden' | 'rate_limited' | 'transient' | 'unknown';
  message: string;
}

export interface UserSummary {
  id: string;
  email: string;
  fullName: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Minimal session user shape returned to API routes.
 * Adapters MUST normalize provider-specific fields onto this contract.
 *
 * - `id` is the canonical user identifier (Supabase: auth.users.id;
 *   Cognito: sub).
 * - `email` is always lowercased and trimmed.
 * - `role` is the application-level role (e.g. 'admin', 'tpa', 'idr-attorney').
 *   Adapters read it from Supabase user_metadata.role OR Cognito custom:role,
 *   whichever is non-empty.
 */
export interface SessionUser {
  id: string;
  email: string;
  role?: string;
}

export interface AuthAdminAdapter {
  /**
   * Idempotently provisions a user and generates a magic link they can
   * click to sign in. If the user already exists, returns
   * `{ preExisting: true }` and a fresh link.
   */
  createUserWithMagicLink(
    params: CreateUserParams,
  ): Promise<CreateUserResult | CreateUserError>;

  /** Returns null when the email is not registered. */
  getUserByEmail(email: string): Promise<UserSummary | null>;

  /**
   * Returns the authenticated user for the current request based on cookies,
   * or null if unauthenticated. Adapters handle provider-specific cookie
   * verification (Supabase: sb-*-auth-token via @supabase/ssr; Cognito:
   * id_token cookie verified against JWKS).
   *
   * Pass either a `NextRequest` (preferred — cookies + headers available) or
   * a Headers object (server components). Most API routes pass the
   * NextRequest they already have.
   */
  getSessionUser(
    requestOrHeaders: Request | Headers,
  ): Promise<SessionUser | null>;
}
