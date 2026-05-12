import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthAdapter } from '@/lib/adapters/auth';

/**
 * Composable "TPA signed → create their account → send magic link" path.
 *
 * Routes through the AuthAdminAdapter so swapping Supabase Auth for
 * Cognito later is a one-line change in the adapter factory, not a
 * rewrite of this function.
 *
 * `SupabaseClient` is kept in the signature for backwards compatibility
 * with existing call sites; future callers can pass null and let the
 * adapter pick its own client from env.
 */

export interface ProvisionTpaUserParams {
  email: string;
  fullName: string | null;
  clientId: string | null;
  signupId: string;
  /**
   * Where the magic link should land the user after they click. Should
   * be a path under our domain so the signed-in session gets persisted
   * by middleware. Defaults to /client/cases.
   */
  redirectPath?: string;
}

export interface ProvisionTpaUserResult {
  /** Auth user id if newly created or already existed. Null only on failure paths. */
  userId: string | null;
  /**
   * The full magic-link URL. Use this if you're sending the email yourself
   * (e.g. via Resend/SES). On Supabase, the project-configured SMTP also
   * delivers this same link automatically — but having it returned lets us
   * audit, retry, or override delivery.
   */
  magicLink: string | null;
  /**
   * True when nothing was actually provisioned (demo mode, dry-run, etc.).
   * The caller can use this to decide whether to log an audit event for
   * the "real" path or the "stub" path.
   */
  demo: boolean;
  /** Surface-level error message (already-safe-to-display, no PHI). */
  error?: string;
}

/**
 * Provisions a Supabase auth user (idempotent — re-runs on the same email
 * succeed) and returns a magic link the user can click to sign in.
 *
 * IMPORTANT: this function does NOT send email itself. The Supabase
 * project SMTP setting controls whether the magic link is auto-delivered.
 * When we move to AWS we'll send via SES inside this function explicitly.
 */
export async function provisionTpaUserAndMagicLink(
  _supabase: SupabaseClient | null,
  params: ProvisionTpaUserParams,
  siteUrl: string,
): Promise<ProvisionTpaUserResult> {
  if (!params.email) {
    return { userId: null, magicLink: null, demo: false, error: 'Email required' };
  }

  const redirectPath = params.redirectPath ?? '/client/cases';
  const redirectTo = `${siteUrl.replace(/\/$/, '')}${redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`}`;

  const adapter = getAuthAdapter();
  const result = await adapter.createUserWithMagicLink({
    email: params.email,
    fullName: params.fullName ?? undefined,
    metadata: {
      client_id: params.clientId ?? undefined,
      signup_id: params.signupId,
      provisioned_by: 'contract_signed_webhook',
    },
    redirectUrl: redirectTo,
  });

  if (!result.ok) {
    return { userId: null, magicLink: null, demo: false, error: result.message };
  }

  return {
    userId: result.userId,
    magicLink: result.magicLink,
    demo: false,
  };
}
