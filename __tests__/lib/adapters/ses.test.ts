import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRawMime } from '@/lib/adapters/email/mime';

describe('buildRawMime', () => {
  it('emits multipart/alternative without attachments', () => {
    const buf = buildRawMime({
      from: 'VantaUM <noreply@vantaum.com>',
      to: 'ops@example.com',
      subject: 'Hello',
      text: 'plain body',
      html: '<p>html body</p>',
    });
    const raw = buf.toString('utf8');
    expect(raw).toContain('Content-Type: multipart/alternative');
    expect(raw).toContain('plain body');
    expect(raw).toContain('<p>html body</p>');
    expect(raw).not.toContain('Content-Disposition: attachment');
  });

  it('base64-encodes attachments under multipart/mixed', () => {
    const pdf = Buffer.from('%PDF-1.4 bytes');
    const buf = buildRawMime({
      from: 'noreply@vantaum.com',
      to: 'tpa@example.com',
      subject: 'Determination',
      text: 'See attached.',
      attachments: [{ filename: 'letter.pdf', content: pdf, contentType: 'application/pdf' }],
    });
    const raw = buf.toString('utf8');
    expect(raw).toContain('Content-Type: multipart/mixed');
    expect(raw).toContain('filename="letter.pdf"');
    expect(raw).toContain(pdf.toString('base64').slice(0, 12));
  });
});

describe('SesEmailAdapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });
  afterEach(async () => {
    const { _resetSesClientForTests } = await import('@/lib/adapters/email/ses');
    _resetSesClientForTests();
    vi.unstubAllEnvs();
    vi.doUnmock('@aws-sdk/client-sesv2');
  });

  it('returns a structured error when SES_FROM_ADDRESS is missing', async () => {
    vi.stubEnv('SES_FROM_ADDRESS', '');
    vi.stubEnv('SMTP_FROM', '');
    const { SesEmailAdapter } = await import('@/lib/adapters/email/ses');
    const adapter = new SesEmailAdapter();
    const result = await adapter.send({
      to: 'a@b.test',
      subject: 's',
      text: 't',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('unknown');
      expect(result.message).toMatch(/SES_FROM_ADDRESS/);
    }
  });

  it('sends Simple content when there are no attachments', async () => {
    vi.stubEnv('SES_FROM_ADDRESS', 'noreply@vantaum.com');
    vi.stubEnv('SES_CONFIGURATION_SET', 'vantaum-prod');

    const send = vi.fn().mockResolvedValue({ MessageId: 'ses-abc' });
    const { SesEmailAdapter, _setSesClientForTests } = await import('@/lib/adapters/email/ses');
    _setSesClientForTests({ send } as never);

    const adapter = new SesEmailAdapter();
    const result = await adapter.send({
      to: 'ops@example.com',
      subject: 'Ping',
      text: 'hello',
    });

    expect(result).toEqual({ ok: true, messageId: 'ses-abc' });
    expect(send).toHaveBeenCalledTimes(1);
    const cmd = send.mock.calls[0][0];
    expect(cmd.input.FromEmailAddress).toBe('noreply@vantaum.com');
    expect(cmd.input.ConfigurationSetName).toBe('vantaum-prod');
    expect(cmd.input.Content.Simple.Subject.Data).toBe('Ping');
    expect(cmd.input.Content.Raw).toBeUndefined();
  });

  it('sends Raw MIME when attachments are present', async () => {
    vi.stubEnv('SES_FROM_ADDRESS', 'noreply@vantaum.com');
    const send = vi.fn().mockResolvedValue({ MessageId: 'ses-raw' });
    const { SesEmailAdapter, _setSesClientForTests } = await import('@/lib/adapters/email/ses');
    _setSesClientForTests({ send } as never);

    const adapter = new SesEmailAdapter();
    const result = await adapter.send({
      to: 'tpa@example.com',
      subject: 'Letter',
      text: 'attached',
      attachments: [
        { filename: 'd.pdf', content: Buffer.from('%PDF'), contentType: 'application/pdf' },
      ],
    });

    expect(result.ok).toBe(true);
    const cmd = send.mock.calls[0][0];
    const raw = Buffer.from(cmd.input.Content.Raw.Data).toString('utf8');
    expect(raw).toContain('filename="d.pdf"');
    expect(cmd.input.Content.Simple).toBeUndefined();
  });

  it('maps SES rejection to invalid_recipient', async () => {
    vi.stubEnv('SES_FROM_ADDRESS', 'noreply@vantaum.com');
    const err = Object.assign(new Error('bad dest'), { name: 'MessageRejected' });
    const send = vi.fn().mockRejectedValue(err);
    const { SesEmailAdapter, _setSesClientForTests } = await import('@/lib/adapters/email/ses');
    _setSesClientForTests({ send } as never);

    const result = await new SesEmailAdapter().send({
      to: 'nobody@example.com',
      subject: 'x',
      text: 'y',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_recipient');
  });
});
