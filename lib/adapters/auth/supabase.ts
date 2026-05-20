import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient as _createSsrClient } from '@supabase/ssr';
import { getServiceClient } from '@/lib/supabase';
import type {
  AuthAdminAdapter,
  CreateUserParams,
  CreateUserResult,
  CreateUserError,
  UserSummary,
  SessionUser,
} from './types';

/**
 * Supabase Auth implementation.
 *
 * `auth.admin.generateLink({ type: 'magiclink' })` is idempotent: if the
 * user doesn't exist, it creates one and returns a link; if they do,
 * it returns a fresh link for the existing user. We use that fact to
 * implement `createUserWithMagicLink` in one round-trip.
 */

function parseCookieHeader(header: string): { name: string; value: string }[] {
  if (!header) return [];
  return header
    .split(';')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const eq = c.indexOf('=');
      if (eq < 0) return { name: c, value: '' };
      return { name: c.slice(0, eq), value: decodeURIComponent(c.slice(eq + 1)) };
    });
}

export class SupabaseAuthAdapter implements AuthAdminAdapter {
  private readonly _client: SupabaseClient | null;

  constructor(client?: SupabaseClient) {
    this._client = client ?? null;
  }

  private get client(): SupabaseClient {
    return this._client ?? getServiceClient();
  }

  async createUserWithMagicLink(
    params: CreateUserParams,
  ): Promise<CreateUserResult | CreateUserError> {
    if (!params.email) {
      return { ok: false, code: 'invalid_email', message: 'Email required' };
    }
    try {
      const { data, error } = await this.client.auth.admin.generateLink({
        type: 'magiclink',
        email: params.email,
        options: {
          redirectTo: params.redirectUrl,
          data: {
            full_name: params.fullName,
            ...params.metadata,
          },
        },
      });

      if (error) {
        const msg = error.message.toLowerCase();
        const code: CreateUserError['code'] =
          msg.includes('rate limit') ? 'rate_limited' :
          msg.includes('invalid email') ? 'invalid_email' :
          msg.includes('forbidden') || msg.includes('not authorized') ? 'forbidden' :
          msg.includes('timeout') || msg.includes('econn') ? 'transient' :
          'unknown';
        return { ok: false, code, message: error.message };
      }

      const userId = data?.user?.id;
      const link = data?.properties?.action_link;
      if (!userId || !link) {
        return { ok: false, code: 'unknown', message: 'Supabase returned an empty user or link' };
      }

      // generateLink doesn't tell us if the user was newly created. Do
      // one extra check by looking at created_at — within the last 5
      // seconds means we just made them.
      const preExisting = data.user?.created_at
        ? Date.now() - new Date(data.user.created_at).getTime() > 5000
        : false;

      return { ok: true, userId, magicLink: link, preExisting };
    } catch (err) {
      return {
        ok: false,
        code: 'unknown',
        message: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  async getSessionUser(requestOrHeaders: Request | Headers): Promise<SessionUser | null> {
    const url =
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
    if (!url || !anonKey) return null;

    const cookieHeader =
      requestOrHeaders instanceof Headers
        ? requestOrHeaders.get('cookie') ?? ''
        : requestOrHeaders.headers.get('cookie') ?? '';
    const cookies = parseCookieHeader(cookieHeader);

    const ssr = _createSsrClient(url, anonKey, {
      cookies: {
        getAll() {
          return cookies;
        },
        setAll() {
          // In API route context we cannot mutate request cookies on the way
          // back. Session refresh, if needed, is handled by the middleware.
        },
      },
    });

    const { data, error } = await ssr.auth.getUser();
    if (error || !data?.user) return null;
    const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
    const roleRaw = meta.role;
    return {
      id: data.user.id,
      email: (data.user.email ?? '').toLowerCase().trim(),
      role: typeof roleRaw === 'string' && roleRaw.length > 0 ? roleRaw : undefined,
    };
  }

  async getUserByEmail(email: string): Promise<UserSummary | null> {
    // Supabase doesn't have a direct getUserByEmail; listUsers with a
    // search filter is the closest equivalent.
    const { data, error } = await this.client.auth.admin.listUsers();
    if (error) return null;
    const user = data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) return null;
    return {
      id: user.id,
      email: user.email ?? email,
      fullName: (user.user_metadata?.full_name as string | undefined) ?? null,
      metadata: (user.user_metadata ?? {}) as Record<string, unknown>,
      createdAt: new Date(user.created_at),
    };
  }
}
