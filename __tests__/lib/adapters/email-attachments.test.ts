import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for the EmailAdapter attachments support added in 71e5cb0.
 *
 * Focus: the new attachments field on SendEmailParams must (a) not
 * break the existing stub path when SMTP env is absent, and (b) get
 * forwarded to nodemailer when SMTP env is present.
 */

describe('SmtpEmailAdapter with attachments', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the stub messageId when SMTP env is absent, even with attachments', async () => {
    vi.stubEnv('SMTP_HOST', '');
    vi.stubEnv('SMTP_USER', '');
    vi.stubEnv('SMTP_PASS', '');

    const { SmtpEmailAdapter } = await import('@/lib/adapters/email/smtp');
    const adapter = new SmtpEmailAdapter();

    const result = await adapter.send({
      to: 'tpa@example.com',
      subject: 'Determination',
      text: 'See attached letter.',
      attachments: [
        {
          filename: 'determination-VUM-1234.pdf',
          content: Buffer.from('%PDF-1.4 fake bytes'),
          contentType: 'application/pdf',
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messageId).toMatch(/^stub-/);
    }
  });

  it('forwards attachments array to nodemailer.sendMail when SMTP is configured', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    vi.stubEnv('SMTP_PORT', '587');
    vi.stubEnv('SMTP_USER', 'user');
    vi.stubEnv('SMTP_PASS', 'pass');

    const sendMail = vi.fn().mockResolvedValue({ messageId: '<abc@smtp>' });
    vi.doMock('nodemailer', () => ({
      default: { createTransport: () => ({ sendMail }) },
      createTransport: () => ({ sendMail }),
    }));

    const { SmtpEmailAdapter } = await import('@/lib/adapters/email/smtp');
    const adapter = new SmtpEmailAdapter();

    const pdf = Buffer.from('%PDF-1.4 bytes');
    const result = await adapter.send({
      to: 'tpa@example.com',
      subject: 'Determination',
      text: 'See attached.',
      attachments: [
        { filename: 'letter.pdf', content: pdf, contentType: 'application/pdf' },
      ],
    });

    expect(result.ok).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const call = sendMail.mock.calls[0][0];
    expect(call.attachments).toEqual([
      { filename: 'letter.pdf', content: pdf, contentType: 'application/pdf' },
    ]);
  });

  it('omits attachments field when caller does not provide one', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    vi.stubEnv('SMTP_USER', 'user');
    vi.stubEnv('SMTP_PASS', 'pass');

    const sendMail = vi.fn().mockResolvedValue({ messageId: '<id>' });
    vi.doMock('nodemailer', () => ({
      default: { createTransport: () => ({ sendMail }) },
      createTransport: () => ({ sendMail }),
    }));

    const { SmtpEmailAdapter } = await import('@/lib/adapters/email/smtp');
    const adapter = new SmtpEmailAdapter();

    await adapter.send({ to: 'a@b.com', subject: 's', text: 't' });

    const call = sendMail.mock.calls[0][0];
    // .map() of undefined would throw — we explicitly coalesce to undefined.
    expect(call.attachments).toBeUndefined();
  });
});
