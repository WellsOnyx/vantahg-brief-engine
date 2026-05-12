import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase';
import type {
  AuthAdminAdapter,
  CreateUserParams,
  CreateUserResult,
  CreateUserError,
  UserSummary,
} from './types';

/**
 * Supabase Auth implementation.
 *
 * `auth.admin.generateLink({ type: 'magiclink' })` is idempotent: if the
 * user doesn't exist, it creates one and returns a link; if they do,
 * it returns a fresh link for the existing user. We use that fact to
 * implement `createUserWithMagicLink` in one round-trip.
 */

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
