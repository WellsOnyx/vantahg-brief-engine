import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Adapter factory selection tests.
 *
 * We verify three things per adapter:
 *   1. Default is the Supabase / SMTP implementation.
 *   2. ENABLE_AWS_* flag flips to the AWS implementation.
 *   3. setXxxAdapter() override wins regardless of env.
 */

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('storage adapter factory', () => {
  it('defaults to SupabaseStorageAdapter', async () => {
    vi.stubEnv('ENABLE_AWS_STORAGE', '');
    const mod = await import('@/lib/adapters/storage');
    mod.setStorageAdapter(null);
    const adapter = await mod.getStorageAdapter();
    const { SupabaseStorageAdapter } = await import('@/lib/adapters/storage/supabase');
    expect(adapter).toBeInstanceOf(SupabaseStorageAdapter);
  });

  it('returns S3StorageAdapter when ENABLE_AWS_STORAGE=true', async () => {
    vi.stubEnv('ENABLE_AWS_STORAGE', 'true');
    const mod = await import('@/lib/adapters/storage');
    mod.setStorageAdapter(null);
    const adapter = await mod.getStorageAdapter();
    const { S3StorageAdapter } = await import('@/lib/adapters/storage/s3');
    expect(adapter).toBeInstanceOf(S3StorageAdapter);
  });

  it('S3 adapter instantiates without throwing', async () => {
    const { S3StorageAdapter } = await import('@/lib/adapters/storage/s3');
    expect(() => new S3StorageAdapter()).not.toThrow();
  });

  it('getStorageAdapterSync refuses to silently pick Supabase when S3 is flagged', async () => {
    vi.stubEnv('ENABLE_AWS_STORAGE', 'true');
    const mod = await import('@/lib/adapters/storage');
    mod.setStorageAdapter(null);
    expect(() => mod.getStorageAdapterSync()).toThrow(/getStorageAdapter\(\)/);
  });
});

describe('auth adapter factory', () => {
  it('defaults to SupabaseAuthAdapter', async () => {
    vi.stubEnv('ENABLE_AWS_AUTH', '');
    const mod = await import('@/lib/adapters/auth');
    mod.setAuthAdapter(null);
    const { SupabaseAuthAdapter } = await import('@/lib/adapters/auth/supabase');
    expect(mod.getAuthAdapter()).toBeInstanceOf(SupabaseAuthAdapter);
  });

  it('returns CognitoAuthAdapter when ENABLE_AWS_AUTH=true', async () => {
    vi.stubEnv('ENABLE_AWS_AUTH', 'true');
    const mod = await import('@/lib/adapters/auth');
    mod.setAuthAdapter(null);
    const { CognitoAuthAdapter } = await import('@/lib/adapters/auth/cognito');
    expect(mod.getAuthAdapter()).toBeInstanceOf(CognitoAuthAdapter);
  });

  it('Cognito adapter returns a structured error when pool env is missing', async () => {
    vi.stubEnv('COGNITO_USER_POOL_ID', '');
    vi.stubEnv('COGNITO_CLIENT_ID', '');
    const { CognitoAuthAdapter } = await import('@/lib/adapters/auth/cognito');
    const c = new CognitoAuthAdapter();
    const result = await c.createUserWithMagicLink({
      email: 'a@b.test',
      redirectUrl: 'https://x.test/',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('unknown');
      expect(result.message).toMatch(/COGNITO_USER_POOL_ID/);
    }
  });

  it('Cognito signInWithPassword is unavailable without pool env', async () => {
    vi.stubEnv('COGNITO_USER_POOL_ID', '');
    vi.stubEnv('COGNITO_CLIENT_ID', '');
    const { CognitoAuthAdapter } = await import('@/lib/adapters/auth/cognito');
    const c = new CognitoAuthAdapter();
    const result = await c.signInWithPassword({ email: 'a@b.test', password: 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('unavailable');
  });

  it('Supabase signInWithPassword stays on the browser client', async () => {
    const { SupabaseAuthAdapter } = await import('@/lib/adapters/auth/supabase');
    const s = new SupabaseAuthAdapter();
    const result = await s.signInWithPassword({ email: 'a@b.test', password: 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('unavailable');
  });
});

describe('email adapter factory', () => {
  it('defaults to SmtpEmailAdapter', async () => {
    vi.stubEnv('ENABLE_AWS_EMAIL', '');
    const mod = await import('@/lib/adapters/email');
    mod.setEmailAdapter(null);
    const { SmtpEmailAdapter } = await import('@/lib/adapters/email/smtp');
    expect(mod.getEmailAdapter()).toBeInstanceOf(SmtpEmailAdapter);
  });

  it('returns SesEmailAdapter when ENABLE_AWS_EMAIL=true', async () => {
    vi.stubEnv('ENABLE_AWS_EMAIL', 'true');
    const mod = await import('@/lib/adapters/email');
    mod.setEmailAdapter(null);
    const { SesEmailAdapter } = await import('@/lib/adapters/email/ses');
    expect(mod.getEmailAdapter()).toBeInstanceOf(SesEmailAdapter);
  });

  it('SMTP adapter returns stub success when SMTP env is absent', async () => {
    vi.stubEnv('SMTP_HOST', '');
    vi.stubEnv('SMTP_USER', '');
    vi.stubEnv('SMTP_PASS', '');
    const { SmtpEmailAdapter } = await import('@/lib/adapters/email/smtp');
    const adapter = new SmtpEmailAdapter();
    const result = await adapter.send({
      to: 'a@b.test',
      subject: 's',
      text: 't',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messageId).toMatch(/^stub-/);
    }
  });
});

describe('override seam', () => {
  it('setStorageAdapter override wins over env', async () => {
    vi.stubEnv('ENABLE_AWS_STORAGE', 'true');
    const mod = await import('@/lib/adapters/storage');
    const fake = { upload: async () => ({ ok: true as const, path: 'x', bytes: 0 }) } as never;
    mod.setStorageAdapter(fake);
    expect(await mod.getStorageAdapter()).toBe(fake);
    mod.setStorageAdapter(null);
  });
});
