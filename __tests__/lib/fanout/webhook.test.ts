import { describe, expect, it } from 'vitest';
import { signBodyHmacSha256 } from '@/lib/intake/hmac';
import {
  buildDeterminationSignedPayload,
  canonicalWebhookJson,
  signDeterminationWebhook,
  verifyDeterminationWebhook,
} from '@/lib/fanout/webhook';

describe('determination.signed HMAC payload', () => {
  const payload = buildDeterminationSignedPayload({
    case_id: 'case-synth-1',
    external_id: 'ext-synth-1',
    type: 'prior_auth',
    determination: 'approve',
    determined_at: '2026-09-18T12:00:00.000Z',
    sla_status: 'ok',
    download_url: 'http://localhost:3000/api/portal/determinations/case-synth-1/package',
    cm_flags: ['high_cost'],
  });

  it('has the 05 event shape', () => {
    expect(payload).toEqual({
      event: 'determination.signed',
      case_id: 'case-synth-1',
      external_id: 'ext-synth-1',
      type: 'prior_auth',
      determination: 'approve',
      determined_at: '2026-09-18T12:00:00.000Z',
      sla_status: 'ok',
      download_url: 'http://localhost:3000/api/portal/determinations/case-synth-1/package',
      cm_flags: ['high_cost'],
    });
  });

  it('HMAC-SHA256 signs the canonical unsigned JSON', () => {
    const signed = signDeterminationWebhook(payload, 'synth-secret-1234');
    const expected = signBodyHmacSha256(canonicalWebhookJson(payload), 'synth-secret-1234');
    expect(signed.signature).toBe(expected);
    expect(signed.signed.signature).toBe(expected);
    expect(signed.headers['X-VantaUM-Signature']).toBe(`sha256=${expected}`);
    expect(JSON.parse(signed.body).event).toBe('determination.signed');
    expect(JSON.parse(signed.body).signature).toBe(expected);
    expect(
      verifyDeterminationWebhook({
        canonicalBody: canonicalWebhookJson(payload),
        signature: signed.signature,
        secret: 'synth-secret-1234',
      }),
    ).toBe(true);
  });
});
