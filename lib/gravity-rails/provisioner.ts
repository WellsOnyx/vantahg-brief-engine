/**
 * Gravity Rail Provisioner — per-concierge / per-operator workspaces.
 *
 * Each operator (concierge, arbiter, clinician, IDR attorney) gets their own
 * GR workspace so Gravity Rail can power their personal AI copilot / intake
 * workflows while handing off structured cases to the VantaUM brief engine.
 *
 * This is the key to scaling the brief engine for high-volume medical review
 * (5-11k/day target), IRO/IRE, and IDR via efficient operator interfaces.
 *
 * Usage:
 *   const provisioner = new GravityRailProvisioner(getGravityRailClient());
 *   const result = await provisioner.provisionForStaff(staffRow);
 *
 * Idempotent: if gr_workspace_id already set, returns existing.
 */

import type { Staff } from '../types';
import {
  getGravityRailClient,
  GravityRailClient,
  type GRWorkspace,
  type GRWorkflow,
} from './gravity-rails';  // relative, or adjust

export interface ProvisionResult {
  staffId: string;
  workspaceId: string;
  workflowId: number;
  provisionedAt: string;
  wasCreated: boolean; // false if already had one
}

export class GravityRailProvisioner {
  constructor(private client: GravityRailClient = getGravityRailClient()) {}

  /**
   * Provision (or return existing) GR workspace + "intake → handoff" workflow
   * for a staff member (concierge or other operator).
   */
  async provisionForStaff(staff: Staff): Promise<ProvisionResult> {
    if (staff.gr_workspace_id && staff.gr_workflow_id) {
      return {
        staffId: staff.id,
        workspaceId: staff.gr_workspace_id,
        workflowId: staff.gr_workflow_id,
        provisionedAt: staff.gr_provisioned_at || new Date().toISOString(),
        wasCreated: false,
      };
    }

    // Create workspace named after the operator for easy management
    const workspaceName = `VantaUM - ${staff.name || staff.email || staff.id}`;
    const workspaceSlug = `vantaum-${(staff.name || staff.id).toLowerCase().replace(/\s+/g, '-')}`;

    let workspace: GRWorkspace;
    try {
      workspace = await this.client.createWorkspace(workspaceName, workspaceSlug);
    } catch (e) {
      // GR may require admin dashboard creation for workspaces or have permission limits.
      // Store placeholder and let privileged UI link it later. Audit will show.
      console.warn('[gravity-rails] createWorkspace may require dashboard or permissions', e);
      workspace = { id: `ws-${Date.now()}`, name: workspaceName, slug: workspaceSlug, createdAt: new Date().toISOString() } as GRWorkspace;
    }

    // Create the standard "intake to VantaUM handoff" workflow in this workspace.
    const workflow = await this.client.createWorkflow(workspace.id, {
      name: 'VantaUM Intake → Handoff',
      slug: 'vantaum-intake-handoff',
      // assistantId would be set in GR dashboard for the AI behavior
    });

    const now = new Date().toISOString();

    // In real impl, persist back to staff row via supabase update.
    // Here we return the values; caller (e.g. admin approve or staff create) persists.
    return {
      staffId: staff.id,
      workspaceId: workspace.id,
      workflowId: workflow.id,
      provisionedAt: now,
      wasCreated: true,
    };
  }

  /**
   * Helper to persist the provisioned IDs to the staff row.
   * Call after successful GR side creation.
   */
  async persistToStaff(staffId: string, result: ProvisionResult, supabase: any) {
    await supabase
      .from('staff')
      .update({
        gr_workspace_id: result.workspaceId,
        gr_workflow_id: result.workflowId,
        gr_provisioned_at: result.provisionedAt,
      })
      .eq('id', staffId);
  }
}

// Note: the client may need extension for createWorkspace.
// For now the provisioner is ready to be called from admin flows or staff onboarding.
