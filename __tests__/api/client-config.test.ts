import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';

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

const FIELDS = {
  client_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  legal_name: 'Beta Staging TPA',
  lob: ['medical', 'pharmacy'],
  sla_hours_standard: 60,
  sla_hours_urgent: 8,
  auto_vs_md_policy: 'always_md',
  notify_channels: ['portal', 'webhook'],
  determination_recipients: ['client_admin'],
  cm_handoff_enabled: false,
  intake_modes: ['gravity_rail', 'api'],
  timezone: 'America/Chicago',
  business_hours: { start: '09:00', end: '17:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
  escalation_contacts: [{ name: 'CX', role: 'cx_owner', email: 'cx@example.com' }],
  cx_owner: 'cx_beta',
  reviewer_queue: 'med_review_beta',
};

describe('client-config API', () => {
  beforeEach(async () => {
    const { resetClientConfigService } = await import('@/lib/client-config');
    resetClientConfigService();
  });

  it('returns the seeded synthetic latest config', async () => {
    const { GET } = await import('@/app/api/client-config/route');
    const res = await GET(
      new Request(`http://localhost:3000/api/client-config?client_id=${SYNTHETIC_CLIENT_ID}`) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.latest.version).toBe(1);
    expect(body.latest.config.client_id).toBe(SYNTHETIC_CLIENT_ID);
  });

  it('POST then PUT creates immutable v1 / v2 history', async () => {
    const { POST, GET } = await import('@/app/api/client-config/route');
    const created = await POST(
      new Request('http://localhost:3000/api/client-config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(FIELDS),
      }) as never,
    );
    expect(created.status).toBe(201);
    const v1 = await created.json();
    expect(v1.version.version).toBe(1);
    expect(v1.immutable).toBe(true);

    const { PUT, PATCH, DELETE } = await import('@/app/api/client-config/[clientId]/route');
    const updated = await PUT(
      new Request(`http://localhost:3000/api/client-config/${FIELDS.client_id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...FIELDS, sla_hours_standard: 40 }),
      }) as never,
      { params: Promise.resolve({ clientId: FIELDS.client_id }) },
    );
    expect(updated.status).toBe(201);
    const v2 = await updated.json();
    expect(v2.version.version).toBe(2);
    expect(v2.version.config.sla_hours_standard).toBe(40);

    const history = await GET(
      new Request(
        `http://localhost:3000/api/client-config?client_id=${FIELDS.client_id}&history=1`,
      ) as never,
    );
    const listed = await history.json();
    expect(listed.versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(listed.versions.find((v: { version: number }) => v.version === 1).config.sla_hours_standard).toBe(60);

    const patch = await PATCH();
    expect(patch.status).toBe(409);
    const del = await DELETE();
    expect(del.status).toBe(409);
  });
});
