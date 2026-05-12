import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';

vi.mock('@/lib/supabase', () => ({
  hasSupabaseConfig: () => false,
  getSupabase: () => ({}),
  getServiceClient: () => ({}),
  supabase: {},
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: async () => undefined,
}));

const SUCCESS_BODY = 'Hello API Event Received';

function makeFormData(payload: object): FormData {
  const fd = new FormData();
  fd.append('json', JSON.stringify(payload));
  return fd;
}

function signEvent(apiKey: string, eventTime: string, eventType: string): string {
  return createHmac('sha256', apiKey).update(`${eventTime}${eventType}`).digest('hex');
}

describe('POST /api/webhooks/hellosign', () => {
  it('returns the magic success body on a valid callback_test event', async () => {
    const { POST } = await import('@/app/api/webhooks/hellosign/route');
    const fd = makeFormData({
      event: {
        event_time: '1715000000',
        event_type: 'callback_test',
        // callback_test doesn't require a valid HMAC — handler accepts it.
        event_hash: 'unused',
      },
    });
    const req = new Request('http://localhost:3000/api/webhooks/hellosign', { method: 'POST', body: fd });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(SUCCESS_BODY);
  });

  it('rejects with 400 when payload is missing the json field', async () => {
    const { POST } = await import('@/app/api/webhooks/hellosign/route');
    const fd = new FormData();
    const req = new Request('http://localhost:3000/api/webhooks/hellosign', { method: 'POST', body: fd });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it('rejects with 400 when event payload is unparseable', async () => {
    const { POST } = await import('@/app/api/webhooks/hellosign/route');
    const fd = new FormData();
    fd.append('json', '{not valid json');
    const req = new Request('http://localhost:3000/api/webhooks/hellosign', { method: 'POST', body: fd });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it('rejects with 400 when event is missing required fields', async () => {
    const { POST } = await import('@/app/api/webhooks/hellosign/route');
    const fd = makeFormData({ event: { event_time: 'x' } }); // missing event_type, event_hash
    const req = new Request('http://localhost:3000/api/webhooks/hellosign', { method: 'POST', body: fd });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it('ack 200 in demo mode without HMAC check (no API key needed)', async () => {
    const { POST } = await import('@/app/api/webhooks/hellosign/route');
    const fd = makeFormData({
      event: {
        event_time: '1715000000',
        event_type: 'signature_request_signed',
        event_hash: 'no-verify-needed-in-demo',
      },
      signature_request: { signature_request_id: 'sig-abc' },
    });
    const req = new Request('http://localhost:3000/api/webhooks/hellosign', { method: 'POST', body: fd });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(SUCCESS_BODY);
  });
});

describe('verifyHelloSignEventHash', () => {
  it('returns true for a correctly computed HMAC', async () => {
    const { verifyHelloSignEventHash } = await import('@/app/api/webhooks/hellosign/route');
    const apiKey = 'test-key';
    const eventTime = '1715000000';
    const eventType = 'signature_request_all_signed';
    const hash = signEvent(apiKey, eventTime, eventType);
    expect(verifyHelloSignEventHash(apiKey, eventTime, eventType, hash)).toBe(true);
  });

  it('returns false for a tampered hash', async () => {
    const { verifyHelloSignEventHash } = await import('@/app/api/webhooks/hellosign/route');
    const apiKey = 'test-key';
    const hash = signEvent(apiKey, '1', 'signature_request_signed');
    // Flip one character — different valid hex but wrong value.
    const tampered = hash.slice(0, -1) + (hash.endsWith('a') ? 'b' : 'a');
    expect(verifyHelloSignEventHash(apiKey, '1', 'signature_request_signed', tampered)).toBe(false);
  });

  it('returns false for the wrong api key', async () => {
    const { verifyHelloSignEventHash } = await import('@/app/api/webhooks/hellosign/route');
    const goodHash = signEvent('right-key', '1', 'x');
    expect(verifyHelloSignEventHash('wrong-key', '1', 'x', goodHash)).toBe(false);
  });

  it('returns false for malformed (wrong-length) hash without throwing', async () => {
    const { verifyHelloSignEventHash } = await import('@/app/api/webhooks/hellosign/route');
    expect(verifyHelloSignEventHash('k', '1', 'x', 'short')).toBe(false);
  });
});
