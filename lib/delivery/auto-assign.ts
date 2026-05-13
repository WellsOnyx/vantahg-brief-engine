import type { SupabaseClient } from '@supabase/supabase-js';
import { listConciergesWithLoad, pickLeastLoadedConcierge, type ConciergeWithLoad } from './assignment';

/**
 * Auto-assignment of Delivery Lead + Concierge to a freshly-approved client.
 *
 * Triggered from the signup approval flow. Goal: a newly approved TPA
 * lands in a concierge's queue automatically, no manual assignment needed
 * by the admin.
 *
 * Algorithm (V1):
 *   1. Pick the concierge with the most spare capacity that can absorb
 *      the new client's expected weekly volume.
 *   2. That concierge's `delivery_lead_id` becomes the assigned DL.
 *   3. Write a row to `client_concierge_assignments` linking them.
 *
 * Why this order: DLs manage concierges, not the other way around. The
 * concierge's existing load is the constraint; the DL is derived.
 *
 * Returns the assignment outcome. Caller is responsible for audit-logging
 * the result and surfacing any failure mode to the admin.
 *
 * V2 (later): per-physician-office routing. The `practice_id` column on
 * `client_concierge_assignments` is reserved for this. For V1 the
 * assignment is whole-client (practice_id = NULL).
 */

export type AssignmentOutcome =
  | {
      ok: true;
      concierge_id: string;
      concierge_name: string;
      concierge_email: string;
      delivery_lead_id: string | null;
      delivery_lead_name: string | null;
      assignment_id: string;
      assigned_weekly_volume: number;
    }
  | {
      ok: false;
      code: 'no_concierges' | 'no_capacity' | 'persist_failed' | 'unknown';
      message: string;
      candidate_pool_size?: number;
    };

export interface AutoAssignParams {
  /** UUID of the newly-created client (tenant). */
  client_id: string;
  /** From signup_requests.expected_weekly_auths. Used as the load proxy. */
  expected_weekly_auths: number;
  /** Email of the admin/operator triggering the assignment. */
  assigned_by: string;
}

export async function autoAssignDeliveryTeam(
  supabase: SupabaseClient,
  params: AutoAssignParams,
): Promise<AssignmentOutcome> {
  const concierges = await listConciergesWithLoad(supabase, { onlyActive: true });

  if (concierges.length === 0) {
    return {
      ok: false,
      code: 'no_concierges',
      message:
        'No active concierges exist. Provision at least one concierge before approving new TPAs.',
    };
  }

  const winner = pickLeastLoadedConcierge(concierges, params.expected_weekly_auths);

  if (!winner) {
    return {
      ok: false,
      code: 'no_capacity',
      message: `No active concierge has ${params.expected_weekly_auths} weekly auths of spare capacity. Add a concierge or revisit existing assignments.`,
      candidate_pool_size: concierges.length,
    };
  }

  // Get the DL name for the audit trail / UI.
  let delivery_lead_name: string | null = null;
  if (winner.delivery_lead_id) {
    const { data: dl } = await supabase
      .from('delivery_leads')
      .select('name')
      .eq('id', winner.delivery_lead_id)
      .maybeSingle();
    if (dl && typeof (dl as { name?: string }).name === 'string') {
      delivery_lead_name = (dl as { name: string }).name;
    }
  }

  // Persist the assignment. Per the schema's partial unique index, only
  // one active whole-client assignment can exist per client at a time -
  // if we hit it, surface a clean error rather than swallowing the
  // constraint violation.
  const { data: assignment, error: insertErr } = await supabase
    .from('client_concierge_assignments')
    .insert({
      client_id: params.client_id,
      concierge_id: winner.id,
      practice_id: null,
      assigned_by: params.assigned_by,
      active: true,
    })
    .select('id')
    .single();

  if (insertErr || !assignment) {
    return {
      ok: false,
      code: 'persist_failed',
      message: insertErr?.message ?? 'Assignment insert returned no row',
    };
  }

  return {
    ok: true,
    concierge_id: winner.id,
    concierge_name: winner.name,
    concierge_email: winner.email,
    delivery_lead_id: winner.delivery_lead_id,
    delivery_lead_name,
    assignment_id: (assignment as { id: string }).id,
    assigned_weekly_volume: params.expected_weekly_auths,
  };
}

/**
 * Convenience: returns the snapshot the admin UI shows on the signup
 * detail page after assignment completes. Same data the outcome carries,
 * shaped for display.
 */
export function summarizeAssignment(outcome: AssignmentOutcome): string {
  if (!outcome.ok) {
    return `Auto-assignment failed: ${outcome.message}`;
  }
  const dl = outcome.delivery_lead_name ?? '(no DL on record)';
  return `Assigned to ${outcome.concierge_name} (${outcome.concierge_email}). Delivery Lead: ${dl}. ${outcome.assigned_weekly_volume} weekly auths added to their load.`;
}

// Re-export for callers that want the underlying pool.
export type { ConciergeWithLoad };
