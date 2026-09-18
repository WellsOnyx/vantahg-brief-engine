import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'crypto';
import { INTAKE_TO_SPINE_SLA_MS, SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';

vi.mock('@/lib/supabase', () => ({
  hasSupabaseConfig: () => false,
  getSupabase: () => ({}),
  getServiceClient: () => ({}),
  supabase: {},
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
  }),
}));

vi.mock('@/lib/rate-limit-middleware', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

const COMPLETE = {
  client_id: SYNTHETIC_CLIENT_ID,
  external_id: 'ext-synth-intake-1',
  member_ref: 'memb_synth_001',
  requesting_provider: 'prov_synth_001',
  service_or_rx: 'CPT-73721',
  place_of_service: 'office',
  urgency: 'standard',
  clinicals_pointer: 's3://synth/packet/001.pdf',
  received_at: '2026-09-18T12:00:00.000Z',
  benefit_type: 'medical',
};

const INCOMPLETE = {
  client_id: SYNTHETIC_CLIENT_ID,
  member_ref: 'memb_synth_001',
  benefit_type: 'medical',
};

function hexHmac(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

function phaxioJsonSig(url: string, rawBody: string, token: string): string {
  return createHmac('sha256', token).update(url + rawBody).digest('hex');
}

async function listedCaseIds(): Promise<string[]> {
  const { GET } = await import('@/app/api/case-spine/route');
  const list = await GET(new Request('http://localhost:3000/api/case-spine') as never);
  const body = await list.json();
  return (body.cases as Array<{ case_id: string }>).map((c) => c.case_id);
}

describe('Phase 2 intake connectivity', () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    const { resetCaseSpineService } = await import('@/lib/case-spine');
    const { resetClientConfigService } = await import('@/lib/client-config');
    resetCaseSpineService();
    resetClientConfigService();
  });

  describe('2.1 Gravity Rail', () => {
    it('happy path: synthetic webhook creates a case-spine case in well under 2 min', async () => {
      const { POST } = await import('@/app/api/intake/gravity-rail/route');
      const raw = JSON.stringify({ synthetic: true, ...COMPLETE });
      const res = await POST(
        new Request('http://localhost:3000/api/intake/gravity-rail', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: raw,
        }) as never,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.case_id).toBeTruthy();
      expect(body.state).toBe('received');
      expect(body.sla_clock).toBe('running');
      expect(body.elapsed_ms).toBeLessThan(INTAKE_TO_SPINE_SLA_MS);
      expect(await listedCaseIds()).toContain(body.case_id);
    });

    it('HMAC failure: secret set + bad signature → 401 and no case', async () => {
      vi.stubEnv('GRAVITY_RAIL_WEBHOOK_SECRET', 'gr-test-secret');
      const { POST } = await import('@/app/api/intake/gravity-rail/route');
      const raw = JSON.stringify({ synthetic: true, ...COMPLETE, external_id: 'gr-hmac-fail' });
      const res = await POST(
        new Request('http://localhost:3000/api/intake/gravity-rail', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-gravity-rail-signature': 'deadbeef',
          },
          body: raw,
        }) as never,
      );
      expect(res.status).toBe(401);
      expect(await listedCaseIds()).toHaveLength(0);
    });

    it('R01: missing clinicals still pauses SLA', async () => {
      vi.stubEnv('GRAVITY_RAIL_WEBHOOK_SECRET', 'gr-test-secret');
      const { POST } = await import('@/app/api/intake/gravity-rail/route');
      const raw = JSON.stringify({ synthetic: true, ...INCOMPLETE });
      const sig = hexHmac(raw, 'gr-test-secret');
      const res = await POST(
        new Request('http://localhost:3000/api/intake/gravity-rail', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-gravity-rail-signature': sig,
          },
          body: raw,
        }) as never,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.state).toBe('intake_incomplete');
      expect(body.sla_clock).toBe('paused');
      const r01 = body.evaluations.find((e: { rule_id: string }) => e.rule_id === 'R01');
      expect(r01?.matched).toBe(true);
    });
  });

  describe('2.2 External submit', () => {
    it('happy path: HMAC + synthetic → case-spine queue', async () => {
      vi.stubEnv('EXTERNAL_API_SECRET', 'ext-test-secret');
      vi.stubEnv('EXTERNAL_API_KEYS', 'ext-key-1');
      const { POST } = await import('@/app/api/external/submit/route');
      const raw = JSON.stringify({ ...COMPLETE, external_id: 'api-synth-1' });
      const res = await POST(
        new Request('http://localhost:3000/api/external/submit', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': 'ext-key-1',
            'x-signature': hexHmac(raw, 'ext-test-secret'),
          },
          body: raw,
        }) as never,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.case_id).toBeTruthy();
      expect(body.state).toBe('received');
      expect(body.elapsed_ms).toBeLessThan(INTAKE_TO_SPINE_SLA_MS);
      expect(await listedCaseIds()).toContain(body.case_id);
    });

    it('HMAC failure → 401', async () => {
      vi.stubEnv('EXTERNAL_API_SECRET', 'ext-test-secret');
      const { POST } = await import('@/app/api/external/submit/route');
      const raw = JSON.stringify({ ...COMPLETE, external_id: 'api-hmac-fail' });
      const res = await POST(
        new Request('http://localhost:3000/api/external/submit', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-signature': 'nope',
          },
          body: raw,
        }) as never,
      );
      expect(res.status).toBe(401);
      expect(await listedCaseIds()).toHaveLength(0);
    });

    it('R01: missing clinicals still pauses SLA', async () => {
      const { POST } = await import('@/app/api/external/submit/route');
      const raw = JSON.stringify({
        ...INCOMPLETE,
        procedure_codes: ['CPT-73721'],
      });
      const res = await POST(
        new Request('http://localhost:3000/api/external/submit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: raw,
        }) as never,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.state).toBe('intake_incomplete');
      expect(body.sla_clock).toBe('paused');
    });
  });

  describe('2.3 Phaxio fax', () => {
    it('happy path: signed synthetic fax becomes a case-spine case', async () => {
      vi.stubEnv('PHAXIO_CALLBACK_TOKEN', 'phaxio-test-token');
      const { POST } = await import('@/app/api/intake/efax/phaxio/route');
      const url = 'http://localhost:3000/api/intake/efax/phaxio';
      const raw = JSON.stringify({
        synthetic: true,
        fax: {
          id: 'synth-fax-1',
          direction: 'received',
          from_number: '+15555550100',
          to_number: '+15555550199',
          num_pages: 2,
          status: 'success',
          media_url: 's3://synth/fax/001.pdf',
        },
        intake: COMPLETE,
      });
      const res = await POST(
        new Request(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-phaxio-signature': phaxioJsonSig(url, raw, 'phaxio-test-token'),
          },
          body: raw,
        }) as never,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.case_id).toBeTruthy();
      expect(body.state).toBe('received');
      expect(body.elapsed_ms).toBeLessThan(INTAKE_TO_SPINE_SLA_MS);
      expect(await listedCaseIds()).toContain(body.case_id);
    });

    it('HMAC failure → 401', async () => {
      vi.stubEnv('PHAXIO_CALLBACK_TOKEN', 'phaxio-test-token');
      const { POST } = await import('@/app/api/intake/efax/phaxio/route');
      const raw = JSON.stringify({
        synthetic: true,
        fax: {
          id: 'synth-fax-bad',
          direction: 'received',
          from_number: '+15555550100',
        },
        intake: COMPLETE,
      });
      const res = await POST(
        new Request('http://localhost:3000/api/intake/efax/phaxio', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-phaxio-signature': '00',
          },
          body: raw,
        }) as never,
      );
      expect(res.status).toBe(401);
      expect(await listedCaseIds()).toHaveLength(0);
    });

    it('R01: synthetic fax without clinicals pauses SLA', async () => {
      const { POST } = await import('@/app/api/intake/efax/phaxio/route');
      const raw = JSON.stringify({
        synthetic: true,
        fax: {
          id: 'synth-fax-incomplete',
          direction: 'received',
          from_number: '+15555550100',
          to_number: '+15555550199',
          num_pages: 1,
          status: 'success',
        },
        intake: INCOMPLETE,
      });
      const res = await POST(
        new Request('http://localhost:3000/api/intake/efax/phaxio', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: raw,
        }) as never,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.state).toBe('intake_incomplete');
      expect(body.sla_clock).toBe('paused');
    });
  });
});
