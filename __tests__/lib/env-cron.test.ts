import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

function clearSupabaseEnv() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
}

describe('requireCronSecret', () => {
  beforeEach(() => {
    vi.resetModules();
    clearSupabaseEnv();
    vi.stubEnv('CRON_SECRET', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('no-ops in local/dev demo so curl still works', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { requireCronSecret } = await import('@/lib/env');
    expect(() => requireCronSecret(null)).not.toThrow();
  });

  it('throws in production demo mode when CRON_SECRET is unset', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { requireCronSecret } = await import('@/lib/env');
    expect(() => requireCronSecret(null)).toThrow(/CRON_SECRET/);
  });

  it('throws in production when the bearer token does not match', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CRON_SECRET', 'correct-secret');
    const { requireCronSecret } = await import('@/lib/env');
    expect(() => requireCronSecret('Bearer wrong')).toThrow(/Invalid CRON_SECRET/);
  });

  it('accepts a matching bearer token in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CRON_SECRET', 'correct-secret');
    const { requireCronSecret } = await import('@/lib/env');
    expect(() => requireCronSecret('Bearer correct-secret')).not.toThrow();
  });
});
