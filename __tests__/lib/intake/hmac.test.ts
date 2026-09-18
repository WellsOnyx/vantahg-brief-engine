import { describe, expect, it } from 'vitest';
import { signBodyHmacSha256, verifyBodyHmacSha256 } from '@/lib/intake/hmac';

const SECRET = 'test-intake-hmac';
const BODY = '{"synthetic":true,"member_ref":"memb_synth_001"}';

describe('verifyBodyHmacSha256', () => {
  it('allows when no secret is configured', () => {
    const result = verifyBodyHmacSha256({
      rawBody: BODY,
      signature: 'anything',
      secret: '',
    });
    expect(result.valid).toBe(true);
    expect(result.reason).toBe('no_secret_configured');
  });

  it('rejects a missing signature when a secret is set', () => {
    const result = verifyBodyHmacSha256({
      rawBody: BODY,
      signature: null,
      secret: SECRET,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('missing_signature');
  });

  it('accepts a valid hex digest and sha256= prefix', () => {
    const hex = signBodyHmacSha256(BODY, SECRET);
    expect(verifyBodyHmacSha256({ rawBody: BODY, signature: hex, secret: SECRET }).valid).toBe(true);
    expect(
      verifyBodyHmacSha256({ rawBody: BODY, signature: `sha256=${hex}`, secret: SECRET }).valid,
    ).toBe(true);
  });

  it('rejects a wrong secret', () => {
    const hex = signBodyHmacSha256(BODY, 'other');
    const result = verifyBodyHmacSha256({ rawBody: BODY, signature: hex, secret: SECRET });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('signature_mismatch');
  });
});
