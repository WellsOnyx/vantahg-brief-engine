// Tests for the Phaxio webhook verifier, parser, and auth helper.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import {
  verifyPhaxioSignature,
  parsePhaxioWebhook,
  getPhaxioAuth,
} from '@/lib/intake/efax/providers/phaxio';

const TOKEN = 'test-token';
const URL = 'https://example.com/api/intake/efax/phaxio';

function formSig(rawBody: string): string {
  const params = new URLSearchParams(rawBody);
  const pairs: Array<[string, string]> = [];
  params.forEach((v, k) => pairs.push([k, v]));
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const concatenated = pairs.map(([k, v]) => `${k}{${v}}`).join('');
  return crypto
    .createHmac('sha256', TOKEN)
    .update(URL + concatenated)
    .digest('hex');
}

function jsonSig(rawBody: string): string {
  return crypto
    .createHmac('sha256', TOKEN)
    .update(URL + rawBody)
    .digest('hex');
}

describe('verifyPhaxioSignature', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return valid with reason no_token_configured when unset', () => {
    const result = verifyPhaxioSignature({
      contentType: 'application/x-www-form-urlencoded',
      rawBody: 'fax%5Bid%5D=1',
      signatureHeader: 'abc',
      webhookUrl: URL,
    });
    expect(result.valid).toBe(true);
    expect(result.reason).toBe('no_token_configured');
  });

  it('should verify a valid form-encoded signature', () => {
    vi.stubEnv('PHAXIO_CALLBACK_TOKEN', TOKEN);
    const rawBody = 'fax%5Bid%5D=1234567&fax%5Bnum_pages%5D=2';
    const signature = formSig(rawBody);
    const result = verifyPhaxioSignature({
      contentType: 'application/x-www-form-urlencoded',
      rawBody,
      signatureHeader: signature,
      webhookUrl: URL,
    });
    expect(result.valid).toBe(true);
  });

  it('should reject invalid form-encoded signature', () => {
    vi.stubEnv('PHAXIO_CALLBACK_TOKEN', TOKEN);
    const rawBody = 'fax%5Bid%5D=1234567&fax%5Bnum_pages%5D=2';
    const bad = crypto.createHmac('sha256', 'wrong').update(URL + rawBody).digest('hex');
    const result = verifyPhaxioSignature({
      contentType: 'application/x-www-form-urlencoded',
      rawBody,
      signatureHeader: bad,
      webhookUrl: URL,
    });
    expect(result.valid).toBe(false);
  });

  it('should verify a valid JSON signature', () => {
    vi.stubEnv('PHAXIO_CALLBACK_TOKEN', TOKEN);
    const rawBody = JSON.stringify({ fax: { id: '1', direction: 'received' } });
    const signature = jsonSig(rawBody);
    const result = verifyPhaxioSignature({
      contentType: 'application/json',
      rawBody,
      signatureHeader: signature,
      webhookUrl: URL,
    });
    expect(result.valid).toBe(true);
  });

  it('should reject when signature length differs from expected', () => {
    vi.stubEnv('PHAXIO_CALLBACK_TOKEN', TOKEN);
    const result = verifyPhaxioSignature({
      contentType: 'application/x-www-form-urlencoded',
      rawBody: 'fax%5Bid%5D=1',
      signatureHeader: 'short',
      webhookUrl: URL,
    });
    expect(result.valid).toBe(false);
  });
});

describe('parsePhaxioWebhook', () => {
  it('should parse form-encoded received fax', () => {
    const body =
      'fax%5Bid%5D=123&fax%5Bnum_pages%5D=3&fax%5Bfrom_number%5D=%2B14155551234' +
      '&fax%5Bto_number%5D=%2B18005551111&fax%5Bcompleted_at%5D=1717430400' +
      '&fax%5Bmedia_url%5D=https%3A%2F%2Fapi.phaxio.com%2Fmedia%2F123' +
      '&fax%5Bdirection%5D=received&fax%5Bstatus%5D=success';
    const p = parsePhaxioWebhook(body, 'application/x-www-form-urlencoded');
    expect(p.fax_id).toBe('123');
    expect(p.from_number).toBe('+14155551234');
    expect(p.page_count).toBe(3);
    expect(p.provider).toBe('phaxio');
    expect(typeof p.received_at).toBe('string');
    expect(p.document_url).toBe('https://api.phaxio.com/media/123');
  });

  it('should parse JSON body', () => {
    const body = JSON.stringify({
      fax: {
        id: '999',
        direction: 'received',
        from_number: '+19995551212',
        to_number: '+18005551111',
        num_pages: 1,
        completed_at: 1717430400,
        media_url: 'https://x',
        status: 'success',
      },
    });
    const p = parsePhaxioWebhook(body, 'application/json');
    expect(p.fax_id).toBe('999');
    expect(p.from_number).toBe('+19995551212');
    expect(p.page_count).toBe(1);
    expect(p.provider).toBe('phaxio');
  });

  it('should throw on non-received direction', () => {
    const body = 'fax%5Bid%5D=1&fax%5Bfrom_number%5D=%2B15551234567&fax%5Bdirection%5D=sent';
    expect(() =>
      parsePhaxioWebhook(body, 'application/x-www-form-urlencoded'),
    ).toThrow(/not a received fax event/);
  });

  it('should throw on missing fax.id', () => {
    const body = 'fax%5Bfrom_number%5D=%2B15551234567';
    expect(() =>
      parsePhaxioWebhook(body, 'application/x-www-form-urlencoded'),
    ).toThrow(/fax\.id|missing/);
  });

  it('should preserve original payload in metadata', () => {
    const body = JSON.stringify({
      fax: { id: '42', direction: 'received', from_number: '+15550000000' },
      extra: 'value',
    });
    const p = parsePhaxioWebhook(body, 'application/json');
    expect(p.metadata).toBeDefined();
    expect((p.metadata as Record<string, unknown>).extra).toBe('value');
    expect((p.metadata as Record<string, unknown>).fax).toBeDefined();
  });
});

describe('getPhaxioAuth', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return credentials when both env vars set', () => {
    vi.stubEnv('PHAXIO_API_KEY', 'k');
    vi.stubEnv('PHAXIO_API_SECRET', 's');
    expect(getPhaxioAuth()).toEqual({ apiKey: 'k', apiSecret: 's' });
  });

  it('should return null when secret is missing', () => {
    vi.stubEnv('PHAXIO_API_KEY', 'k');
    expect(getPhaxioAuth()).toBeNull();
  });

  it('should return null when key is missing', () => {
    vi.stubEnv('PHAXIO_API_SECRET', 's');
    expect(getPhaxioAuth()).toBeNull();
  });
});
