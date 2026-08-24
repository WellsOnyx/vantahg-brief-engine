import { describe, it, expect, vi } from 'vitest';
import type { Staff } from '@/lib/types';
import {
  GravityRailProvisioner,
  GravityRailProvisionError,
  isPlaceholderGrWorkspaceId,
} from '@/lib/gravity-rails/provisioner';
import type { GravityRailClient } from '@/lib/gravity-rails';

function staff(overrides: Partial<Staff> = {}): Staff {
  return {
    id: 'staff-1',
    created_at: '2026-08-24T00:00:00.000Z',
    name: 'Casey Concierge',
    role: 'lpn',
    email: 'casey@vantaum.com',
    phone: null,
    license_number: null,
    license_state: null,
    certifications: [],
    max_cases_per_day: 20,
    avg_turnaround_hours: null,
    status: 'active',
    cases_completed: 0,
    quality_score: null,
    gr_workspace_id: null,
    gr_workflow_id: null,
    gr_provisioned_at: null,
    ...overrides,
  };
}

function mockClient(overrides: Partial<GravityRailClient> = {}): GravityRailClient {
  return {
    createWorkspace: vi.fn(),
    createWorkflow: vi.fn(),
    ...overrides,
  } as unknown as GravityRailClient;
}

describe('isPlaceholderGrWorkspaceId', () => {
  it('flags the old invented ws-<timestamp> pattern', () => {
    expect(isPlaceholderGrWorkspaceId('ws-1710000000000')).toBe(true);
    expect(isPlaceholderGrWorkspaceId('ws-1')).toBe(true);
  });

  it('accepts a real GR workspace id', () => {
    expect(isPlaceholderGrWorkspaceId('ws_abc123')).toBe(false);
    expect(isPlaceholderGrWorkspaceId('8f3c2a1e-1111-2222-3333-444444444444')).toBe(false);
  });
});

describe('GravityRailProvisioner', () => {
  it('returns existing ids without calling GR', async () => {
    const client = mockClient();
    const provisioner = new GravityRailProvisioner(client);
    const result = await provisioner.provisionForStaff(
      staff({
        gr_workspace_id: 'ws_already',
        gr_workflow_id: 12,
        gr_provisioned_at: '2026-01-01T00:00:00.000Z',
      }),
    );
    expect(result).toMatchObject({
      workspaceId: 'ws_already',
      workflowId: 12,
      wasCreated: false,
    });
    expect(client.createWorkspace).not.toHaveBeenCalled();
  });

  it('throws and does not invent a ws-* id when createWorkspace fails', async () => {
    const client = mockClient({
      createWorkspace: vi.fn().mockRejectedValue(new Error('forbidden')),
    });
    const provisioner = new GravityRailProvisioner(client);
    await expect(provisioner.provisionForStaff(staff())).rejects.toMatchObject({
      name: 'GravityRailProvisionError',
      code: 'create_workspace_failed',
    });
    expect(client.createWorkflow).not.toHaveBeenCalled();
  });

  it('refuses a placeholder id returned by createWorkspace', async () => {
    const client = mockClient({
      createWorkspace: vi.fn().mockResolvedValue({
        id: `ws-${Date.now()}`,
        name: 'x',
        slug: 'x',
        createdAt: new Date().toISOString(),
      }),
    });
    const provisioner = new GravityRailProvisioner(client);
    await expect(provisioner.provisionForStaff(staff())).rejects.toMatchObject({
      code: 'placeholder_id_refused',
    });
    expect(client.createWorkflow).not.toHaveBeenCalled();
  });

  it('persists real ids and refuses placeholder ids', async () => {
    const updates: unknown[] = [];
    const supabase = {
      from: () => ({
        update: (row: unknown) => ({
          eq: async () => {
            updates.push(row);
            return { error: null };
          },
        }),
      }),
    };
    const provisioner = new GravityRailProvisioner(mockClient());

    await provisioner.persistToStaff(
      'staff-1',
      {
        staffId: 'staff-1',
        workspaceId: 'ws_real',
        workflowId: 9,
        provisionedAt: '2026-08-24T00:00:00.000Z',
        wasCreated: true,
      },
      supabase,
    );
    expect(updates).toEqual([
      {
        gr_workspace_id: 'ws_real',
        gr_workflow_id: 9,
        gr_provisioned_at: '2026-08-24T00:00:00.000Z',
      },
    ]);

    await expect(
      provisioner.persistToStaff(
        'staff-1',
        {
          staffId: 'staff-1',
          workspaceId: `ws-${Date.now()}`,
          workflowId: 9,
          provisionedAt: '2026-08-24T00:00:00.000Z',
          wasCreated: true,
        },
        supabase,
      ),
    ).rejects.toBeInstanceOf(GravityRailProvisionError);
    expect(updates).toHaveLength(1);
  });
});
