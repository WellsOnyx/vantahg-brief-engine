/**
 * Gravity Rail Provisioner — per-concierge / per-operator workspaces.
 *
 * Each operator (concierge, arbiter, clinician, IDR attorney) gets their own
 * GR workspace so Gravity Rail can power their personal AI copilot / intake
 * workflows while handing off structured cases to the VantaUM brief engine.
 *
 * Fail closed: if createWorkspace / createWorkflow fails, this throws.
 * It never invents placeholder `ws-*` IDs. persistToStaff refuses any
 * placeholder id so a caller cannot write invented ids onto staff.
 *
 * Wired from POST /api/staff after a successful staff insert. Not a new
 * product surface. Not live-keyed — Cole/Jonah own the real GR workspace.
 *
 * Idempotent: if gr_workspace_id + gr_workflow_id are already set, returns
 * the existing ids without calling GR.
 */

import type { Staff } from '../types';
import {
  GravityRailClient,
  getGravityRailClient,
  type GRWorkspace,
  type GRWorkflow,
} from '../gravity-rails';

export interface ProvisionResult {
  staffId: string;
  workspaceId: string;
  workflowId: number;
  provisionedAt: string;
  wasCreated: boolean; // false if already had one
}

/**
 * The pre-integration bug invented `ws-${Date.now()}` when GR create
 * failed. Anything matching that pattern is not a real Gravity Rail id
 * and must never be persisted.
 */
export function isPlaceholderGrWorkspaceId(id: string | null | undefined): boolean {
  if (!id) return true;
  return /^ws-\d+$/.test(id);
}

export class GravityRailProvisionError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'create_workspace_failed'
      | 'create_workflow_failed'
      | 'placeholder_id_refused'
      | 'persist_failed',
  ) {
    super(message);
    this.name = 'GravityRailProvisionError';
  }
}

/** Minimal staff-table writer. Matches the Supabase/shim client surface we use. */
type StaffPersistClient = {
  from: (table: string) => {
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => PromiseLike<{ error: { message?: string } | null }>;
    };
  };
};

export class GravityRailProvisioner {
  constructor(private client: GravityRailClient = getGravityRailClient()) {}

  /**
   * Provision (or return existing) GR workspace + "intake → handoff" workflow
   * for a staff member. Throws GravityRailProvisionError on GR failure.
   * Never returns a placeholder workspace id.
   */
  async provisionForStaff(staff: Staff): Promise<ProvisionResult> {
    if (staff.gr_workspace_id && staff.gr_workflow_id && !isPlaceholderGrWorkspaceId(staff.gr_workspace_id)) {
      return {
        staffId: staff.id,
        workspaceId: staff.gr_workspace_id,
        workflowId: staff.gr_workflow_id,
        provisionedAt: staff.gr_provisioned_at || new Date().toISOString(),
        wasCreated: false,
      };
    }

    const workspaceName = `VantaUM - ${staff.name || staff.email || staff.id}`;
    const workspaceSlug = `vantaum-${(staff.name || staff.id).toLowerCase().replace(/\s+/g, '-')}`;

    let workspace: GRWorkspace;
    try {
      workspace = await this.client.createWorkspace(workspaceName, workspaceSlug);
    } catch (e) {
      const kind = e instanceof Error ? e.name : 'error';
      console.error('[gravity-rails] createWorkspace failed', kind);
      throw new GravityRailProvisionError(
        'Gravity Rail createWorkspace failed',
        'create_workspace_failed',
      );
    }

    if (!workspace?.id || isPlaceholderGrWorkspaceId(workspace.id)) {
      throw new GravityRailProvisionError(
        'Gravity Rail createWorkspace did not return a real workspace id',
        'placeholder_id_refused',
      );
    }

    let workflow: GRWorkflow;
    try {
      workflow = await this.client.createWorkflow(workspace.id, {
        name: 'VantaUM Intake → Handoff',
        slug: 'vantaum-intake-handoff',
      });
    } catch (e) {
      const kind = e instanceof Error ? e.name : 'error';
      console.error('[gravity-rails] createWorkflow failed', kind);
      throw new GravityRailProvisionError(
        'Gravity Rail createWorkflow failed',
        'create_workflow_failed',
      );
    }

    if (workflow?.id == null || !Number.isFinite(Number(workflow.id))) {
      throw new GravityRailProvisionError(
        'Gravity Rail createWorkflow did not return a real workflow id',
        'create_workflow_failed',
      );
    }

    return {
      staffId: staff.id,
      workspaceId: workspace.id,
      workflowId: workflow.id,
      provisionedAt: new Date().toISOString(),
      wasCreated: true,
    };
  }

  /**
   * Persist provisioned IDs onto the staff row. Refuses placeholder ids
   * so a caller cannot write invented `ws-*` values even if they try.
   */
  async persistToStaff(staffId: string, result: ProvisionResult, supabase: StaffPersistClient) {
    if (isPlaceholderGrWorkspaceId(result.workspaceId)) {
      throw new GravityRailProvisionError(
        'Refusing to persist a placeholder Gravity Rail workspace id',
        'placeholder_id_refused',
      );
    }

    const { error } = await supabase
      .from('staff')
      .update({
        gr_workspace_id: result.workspaceId,
        gr_workflow_id: result.workflowId,
        gr_provisioned_at: result.provisionedAt,
      })
      .eq('id', staffId);

    if (error) {
      throw new GravityRailProvisionError(
        'Failed to persist Gravity Rail ids on staff',
        'persist_failed',
      );
    }
  }
}
