import { describe, it, expect, vi } from 'vitest';
import { autoAssignDeliveryTeam, summarizeAssignment } from '@/lib/delivery/auto-assign';

/**
 * Pure unit tests for the auto-assign flow.
 *
 * Mocks `listConciergesWithLoad` to return controlled concierge pools,
 * and a thin Supabase-shaped client for the assignment insert + DL lookup.
 */

vi.mock('@/lib/delivery/assignment', async () => {
  return {
    listConciergesWithLoad: vi.fn(async () => []),
    pickLeastLoadedConcierge: (await vi.importActual<typeof import('@/lib/delivery/assignment')>('@/lib/delivery/assignment')).pickLeastLoadedConcierge,
  };
});

function makeSupabase(
  options: {
    dlName?: string | null;
    insertOk?: boolean;
    insertId?: string;
    insertError?: string;
  } = {},
): unknown {
  return {
    from(table: string) {
      if (table === 'delivery_leads') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: options.dlName ? { name: options.dlName } : null, error: null }),
            }),
          }),
        };
      }
      if (table === 'client_concierge_assignments') {
        return {
          insert: () => ({
            select: () => ({
              single: async () =>
                options.insertOk === false
                  ? { data: null, error: { message: options.insertError ?? 'insert failed' } }
                  : { data: { id: options.insertId ?? 'assignment-1' }, error: null },
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('autoAssignDeliveryTeam', () => {
  it('returns no_concierges when the pool is empty', async () => {
    const { listConciergesWithLoad } = await import('@/lib/delivery/assignment');
    (listConciergesWithLoad as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    const result = await autoAssignDeliveryTeam(makeSupabase() as never, {
      client_id: 'c-1',
      expected_weekly_auths: 100,
      assigned_by: 'admin@test',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('no_concierges');
  });

  it('returns no_capacity when every concierge is full', async () => {
    const { listConciergesWithLoad } = await import('@/lib/delivery/assignment');
    (listConciergesWithLoad as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 'a', name: 'A', email: 'a@x', weekly_auth_cap: 300,
        delivery_lead_id: 'dl-1', active: true,
        estimated_weekly_load: 290, active_client_count: 4, utilization: 0.97,
      },
    ]);
    const result = await autoAssignDeliveryTeam(makeSupabase() as never, {
      client_id: 'c-1',
      expected_weekly_auths: 100,
      assigned_by: 'admin@test',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('no_capacity');
      expect(result.candidate_pool_size).toBe(1);
    }
  });

  it('picks the concierge with most spare capacity and persists', async () => {
    const { listConciergesWithLoad } = await import('@/lib/delivery/assignment');
    (listConciergesWithLoad as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 'busy', name: 'Busy', email: 'b@x', weekly_auth_cap: 300,
        delivery_lead_id: 'dl-1', active: true,
        estimated_weekly_load: 250, active_client_count: 5, utilization: 0.83,
      },
      {
        id: 'open', name: 'Open', email: 'o@x', weekly_auth_cap: 300,
        delivery_lead_id: 'dl-2', active: true,
        estimated_weekly_load: 50, active_client_count: 1, utilization: 0.17,
      },
    ]);
    const supabase = makeSupabase({ dlName: 'Alex DL', insertId: 'assign-99' });
    const result = await autoAssignDeliveryTeam(supabase as never, {
      client_id: 'new-tpa',
      expected_weekly_auths: 100,
      assigned_by: 'admin@test',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.concierge_id).toBe('open');
      expect(result.delivery_lead_id).toBe('dl-2');
      expect(result.delivery_lead_name).toBe('Alex DL');
      expect(result.assignment_id).toBe('assign-99');
      expect(result.assigned_weekly_volume).toBe(100);
    }
  });

  it('surfaces insert failure as persist_failed', async () => {
    const { listConciergesWithLoad } = await import('@/lib/delivery/assignment');
    (listConciergesWithLoad as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 'a', name: 'A', email: 'a@x', weekly_auth_cap: 300,
        delivery_lead_id: 'dl-1', active: true,
        estimated_weekly_load: 50, active_client_count: 1, utilization: 0.17,
      },
    ]);
    const supabase = makeSupabase({ insertOk: false, insertError: 'unique violation' });
    const result = await autoAssignDeliveryTeam(supabase as never, {
      client_id: 'new-tpa',
      expected_weekly_auths: 100,
      assigned_by: 'admin@test',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('persist_failed');
      expect(result.message).toContain('unique violation');
    }
  });

  it('handles null DL gracefully', async () => {
    const { listConciergesWithLoad } = await import('@/lib/delivery/assignment');
    (listConciergesWithLoad as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 'a', name: 'Lonely', email: 'l@x', weekly_auth_cap: 300,
        delivery_lead_id: null, active: true,
        estimated_weekly_load: 0, active_client_count: 0, utilization: 0,
      },
    ]);
    const result = await autoAssignDeliveryTeam(makeSupabase() as never, {
      client_id: 'c-1',
      expected_weekly_auths: 50,
      assigned_by: 'admin@test',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.delivery_lead_id).toBeNull();
      expect(result.delivery_lead_name).toBeNull();
    }
  });
});

describe('summarizeAssignment', () => {
  it('renders a success line', () => {
    const line = summarizeAssignment({
      ok: true,
      concierge_id: 'a',
      concierge_name: 'Alex',
      concierge_email: 'alex@v.test',
      delivery_lead_id: 'dl',
      delivery_lead_name: 'Pat',
      assignment_id: 'x',
      assigned_weekly_volume: 75,
    });
    expect(line).toContain('Alex');
    expect(line).toContain('Pat');
    expect(line).toContain('75');
  });

  it('renders a failure line', () => {
    const line = summarizeAssignment({
      ok: false,
      code: 'no_concierges',
      message: 'No active concierges exist.',
    });
    expect(line).toContain('failed');
    expect(line).toContain('No active concierges');
  });
});
