import type { AuthAdminAdapter } from './types';
import { SupabaseAuthAdapter } from './supabase';
import { CognitoAuthAdapter } from './cognito';

let cached: AuthAdminAdapter | null = null;
let override: AuthAdminAdapter | null = null;

export function getAuthAdapter(): AuthAdminAdapter {
  if (override) return override;
  if (cached) return cached;
  const useAws = process.env.ENABLE_AWS_AUTH === 'true';
  cached = useAws ? new CognitoAuthAdapter() : new SupabaseAuthAdapter();
  return cached;
}

export function setAuthAdapter(adapter: AuthAdminAdapter | null): void {
  override = adapter;
  if (!adapter) cached = null;
}

export type { AuthAdminAdapter, CreateUserParams, CreateUserResult, CreateUserError, UserSummary } from './types';
