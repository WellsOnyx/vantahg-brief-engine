import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('runtime-backend', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to demo db when no connection env is present', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', '');
    vi.stubEnv('ENABLE_AWS_DB', '');
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('DB_HOST', '');
    vi.stubEnv('DB_PASSWORD', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const { getDbBackend, getRuntimeBackends } = await import('@/lib/runtime-backend');
    expect(getDbBackend()).toBe('demo');
    expect(getRuntimeBackends().storage).toBe('supabase');
    expect(getRuntimeBackends().auth).toBe('supabase');
    expect(getRuntimeBackends().email).toBe('smtp');
  });

  it('selects RDS when ENABLE_AWS_DB and connection env are set', async () => {
    vi.stubEnv('ENABLE_AWS_DB', 'true');
    vi.stubEnv('DATABASE_URL', 'postgres://vantaum:localdev@127.0.0.1:5432/vantaum');
    const { getDbBackend } = await import('@/lib/runtime-backend');
    expect(getDbBackend()).toBe('rds');
  });

  it('NEXT_PUBLIC_DEMO_MODE forces demo even with RDS env', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');
    vi.stubEnv('ENABLE_AWS_DB', 'true');
    vi.stubEnv('DATABASE_URL', 'postgres://vantaum:localdev@127.0.0.1:5432/vantaum');
    const { getDbBackend } = await import('@/lib/runtime-backend');
    expect(getDbBackend()).toBe('demo');
  });

  it('flips storage/auth/email independently', async () => {
    vi.stubEnv('ENABLE_AWS_STORAGE', 'true');
    vi.stubEnv('ENABLE_AWS_AUTH', 'true');
    vi.stubEnv('ENABLE_AWS_EMAIL', 'true');
    const { getRuntimeBackends } = await import('@/lib/runtime-backend');
    expect(getRuntimeBackends()).toMatchObject({
      storage: 's3',
      auth: 'cognito',
      email: 'ses',
    });
  });

  it('exports integration ingress that does not mention supabase-only paths', async () => {
    const { INTEGRATION_INGRESS } = await import('@/lib/runtime-backend');
    expect(INTEGRATION_INGRESS.externalSubmit.path).toBe('/api/external/submit');
    expect(INTEGRATION_INGRESS.gravityRail.client).toBe('lib/gravity-rails.ts');
  });
});
