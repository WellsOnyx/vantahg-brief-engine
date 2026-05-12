import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Adapter factory selection tests.
 *
 * We verify three things per adapter:
 *   1. Default is the Supabase / SMTP implementation.
 *   2. ENABLE_AWS_* flag flips to the AWS implementation.
 *   3. setXxxAdapter() override wins regardless of env.
 *
 * The AWS impls throw "not implemented" — we assert on that instead of
 * exercising the surface, since they're stubs by design.
 */

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

describe('storage adapter factory', () => {
  it('defaults to SupabaseStorageAdapter', async () => {
    delete process.env.ENABLE_AWS_STORAGE;
    const mod = await import('@/lib/adapters/storage');
    mod.setStorageAdapter(null);
    const { SupabaseStorageAdapter } = await import('@/lib/adapters/storage/supabase');
    expect(mod.getStorageAdapter()).toBeInstanceOf(SupabaseStorageAdapter);
  });

  it('returns S3 stub adapter when ENABLE_AWS_STORAGE=true', async () => {
    process.env.ENABLE_AWS_STORAGE = 'true';
    const mod = await import('@/lib/adapters/storage');
    mod.setStorageAdapter(null);
    const { S3StorageAdapter } = await import('@/lib/adapters/storage/s3');
    expect(mod.getStorageAdapter()).toBeInstanceOf(S3StorageAdapter);
  });

  it('S3 stub throws on every operation', async () => {
    const { S3StorageAdapter } = await import('@/lib/adapters/storage/s3');
    const s3 = new S3StorageAdapter();
    await expect(s3.upload('signup-contracts', 'p', Buffer.from('x'), { contentType: 'x' }))
      .rejects.toThrow(/not implemented/);
    await expect(s3.download('signup-contracts', 'p')).rejects.toThrow(/not implemented/);
    await expect(s3.signedUrl('signup-contracts', 'p', 60)).rejects.toThrow(/not implemented/);
    await expect(s3.remove('signup-contracts', 'p')).rejects.toThrow(/not implemented/);
  });
});

describe('auth adapter factory', () => {
  it('defaults to SupabaseAuthAdapter', async () => {
    delete process.env.ENABLE_AWS_AUTH;
    const mod = await import('@/lib/adapters/auth');
    mod.setAuthAdapter(null);
    const { SupabaseAuthAdapter } = await import('@/lib/adapters/auth/supabase');
    expect(mod.getAuthAdapter()).toBeInstanceOf(SupabaseAuthAdapter);
  });

  it('returns Cognito stub when ENABLE_AWS_AUTH=true', async () => {
    process.env.ENABLE_AWS_AUTH = 'true';
    const mod = await import('@/lib/adapters/auth');
    mod.setAuthAdapter(null);
    const { CognitoAuthAdapter } = await import('@/lib/adapters/auth/cognito');
    expect(mod.getAuthAdapter()).toBeInstanceOf(CognitoAuthAdapter);
  });

  it('Cognito stub throws on createUserWithMagicLink', async () => {
    const { CognitoAuthAdapter } = await import('@/lib/adapters/auth/cognito');
    const c = new CognitoAuthAdapter();
    await expect(
      c.createUserWithMagicLink({ email: 'a@b.test', redirectUrl: 'https://x.test/' }),
    ).rejects.toThrow(/not implemented/);
  });
});

describe('email adapter factory', () => {
  it('defaults to SmtpEmailAdapter', async () => {
    delete process.env.ENABLE_AWS_EMAIL;
    const mod = await import('@/lib/adapters/email');
    mod.setEmailAdapter(null);
    const { SmtpEmailAdapter } = await import('@/lib/adapters/email/smtp');
    expect(mod.getEmailAdapter()).toBeInstanceOf(SmtpEmailAdapter);
  });

  it('returns SES stub when ENABLE_AWS_EMAIL=true', async () => {
    process.env.ENABLE_AWS_EMAIL = 'true';
    const mod = await import('@/lib/adapters/email');
    mod.setEmailAdapter(null);
    const { SesEmailAdapter } = await import('@/lib/adapters/email/ses');
    expect(mod.getEmailAdapter()).toBeInstanceOf(SesEmailAdapter);
  });

  it('SMTP adapter returns stub success when SMTP env is absent', async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
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
    process.env.ENABLE_AWS_STORAGE = 'true';
    const mod = await import('@/lib/adapters/storage');
    const fake = { upload: async () => ({ ok: true as const, path: 'x', bytes: 0 }) } as never;
    mod.setStorageAdapter(fake);
    expect(mod.getStorageAdapter()).toBe(fake);
    mod.setStorageAdapter(null);
  });
});
