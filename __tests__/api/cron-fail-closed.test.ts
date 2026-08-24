import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

function clearSupabaseEnv() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
}

describe('cron routes — production requires CRON_SECRET', () => {
  beforeEach(() => {
    vi.resetModules();
    clearSupabaseEnv();
    vi.stubEnv('CRON_SECRET', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('GET /api/cron/meow-invoice-sync 401s in production demo without CRON_SECRET', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { GET } = await import('@/app/api/cron/meow-invoice-sync/route');
    const res = await GET(
      new Request('https://app.vantaum.com/api/cron/meow-invoice-sync') as never,
    );
    expect(res.status).toBe(401);
  });

  it('GET /api/cron/meow-invoice-sync still no-ops in local/dev demo', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { GET } = await import('@/app/api/cron/meow-invoice-sync/route');
    const res = await GET(
      new Request('http://localhost:3000/api/cron/meow-invoice-sync') as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.demo).toBe(true);
  });
});
