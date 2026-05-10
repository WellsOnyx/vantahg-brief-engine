import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifySignature } from '@/app/api/firstmover/agent/webhook/route';

const SECRET = 'test-secret-12345';

function sign(body: string, secret: string = SECRET): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

describe('verifySignature (webhook HMAC)', () => {
  it('accepts a valid sha256-prefixed signature', () => {
    const body = JSON.stringify({ conversation_id: 'c1' });
    const sig = sign(body);
    expect(verifySignature(body, sig, SECRET)).toBe(true);
  });

  it('accepts a raw hex signature without sha256= prefix', () => {
    const body = JSON.stringify({ conversation_id: 'c2' });
    const hex = createHmac('sha256', SECRET).update(body).digest('hex');
    expect(verifySignature(body, hex, SECRET)).toBe(true);
  });

  it('rejects when the body has been tampered with', () => {
    const body = JSON.stringify({ conversation_id: 'c3' });
    const sig = sign(body);
    expect(verifySignature(body + ' ', sig, SECRET)).toBe(false);
  });

  it('rejects when the secret is wrong', () => {
    const body = JSON.stringify({ conversation_id: 'c4' });
    const sig = sign(body, 'wrong-secret');
    expect(verifySignature(body, sig, SECRET)).toBe(false);
  });

  it('rejects an empty signature header', () => {
    const body = JSON.stringify({ conversation_id: 'c5' });
    expect(verifySignature(body, '', SECRET)).toBe(false);
  });

  it('rejects a signature of wrong length without throwing', () => {
    const body = JSON.stringify({ conversation_id: 'c6' });
    expect(verifySignature(body, 'sha256=abcd', SECRET)).toBe(false);
  });

  it('handles non-hex signatures without throwing', () => {
    const body = JSON.stringify({ conversation_id: 'c7' });
    const sameLengthGarbage = 'z'.repeat(64);
    expect(verifySignature(body, `sha256=${sameLengthGarbage}`, SECRET)).toBe(false);
  });
});
