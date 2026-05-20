import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Concierge assignment + load-balancing helpers.
 *
 * Pure data-layer logic — no UI, no auth checks. Callers (API routes,
 * admin scripts) are responsible for gating access. Each function takes
 * a Supabase client so tests can inject a fake.
 *
 * Capacity model:
 *   - Each concierge has weekly_auth_cap (default 300).
 *   - Weekly load = count of cases assigned via this concierge's clients
 *     that were created in the last 7 days. Approximate; we don't track
 *     per-concierge case ownership directly yet (that's a V2 column).
 *   - For V1 we use # of client_concierge_assignments × estimated
 *     weekly auths per client as the load proxy. Simple, predictable,
 *     and recomputes cheaply on every assign.
 */

export interface ConciergeWithLoad {
  id: string;
  name: string;
  email: string;
  weekly_auth_cap: number;
  delivery_lead_id: string | null;
  active: boolean;
  /** Sum of expected_weekly_auths across active client assignments. */
  estimated_weekly_load: number;
  /** Number of distinct clients currently assigned. */
  active_client_count: number;
  /** estimated_weekly_load / weekly_auth_cap, clamped 0..1. */
  utilization: number;
}

/**
 * Returns concierges (optionally filtered by delivery_lead_id) along with
 * their current estimated weekly load. Used by the DL dashboard to render
 * load bars and by `pickLeastLoadedConcierge` for routing.
 *
 * V1: load is computed from signup_requests.expected_weekly_auths summed
 * over active client_concierge_assignments. When a TPA is assigned the
 * concierge inherits that TPA's weekly volume estimate.
 */
export async function listConciergesWithLoad(
  supabase: SupabaseClient,
  filters: { deliveryLeadId?: string | null; onlyActive?: boolean } = {},
): Promise<ConciergeWithLoad[]> {
  let query = supabase
    .from('concierges')
    .select('id, name, email, weekly_auth_cap, delivery_lead_id, active');
  if (filters.onlyActive ?? true) {
    query = query.eq('active', true);
  }
  if (filters.deliveryLeadId !== undefined && filters.deliveryLeadId !== null) {
    query = query.eq('delivery_lead_id', filters.deliveryLeadId);
  }
  const { data: concierges, error } = await query;
  if (error || !concierges) {
    throw new Error(`Failed to load concierges: ${error?.message ?? 'unknown'}`);
  }
  if (concierges.length === 0) return [];

  // Pull active assignments + linked signup expected volume in one round-trip.
  const conciergeIds = concierges.map((c) => c.id);
  const { data: assignments, error: aErr } = await supabase
    .from('client_concierge_assignments')
    .select('concierge_id, client_id, clients!inner(id, signup_requests(expected_weekly_auths))')
    .in('concierge_id', conciergeIds)
    .eq('active', true);
  if (aErr) {
    throw new Error(`Failed to load assignments: ${aErr.message}`);
  }

  // Aggregate per concierge.
  const loadByConcierge = new Map<string, { load: number; clients: Set<string> }>();
  for (const row of assignments ?? []) {
    const cId = (row as { concierge_id: string }).concierge_id;
    const clientId = (row as { client_id: string }).client_id;
    const expected = extractExpectedWeeklyAuths(row);
    const acc = loadByConcierge.get(cId) ?? { load: 0, clients: new Set<string>() };
    acc.load += expected;
    acc.clients.add(clientId);
    loadByConcierge.set(cId, acc);
  }

  return concierges.map((c) => {
    const agg = loadByConcierge.get(c.id) ?? { load: 0, clients: new Set<string>() };
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      weekly_auth_cap: c.weekly_auth_cap,
      delivery_lead_id: c.delivery_lead_id,
      active: c.active,
      estimated_weekly_load: agg.load,
      active_client_count: agg.clients.size,
      utilization: Math.min(1, c.weekly_auth_cap > 0 ? agg.load / c.weekly_auth_cap : 0),
    };
  });
}

/**
 * Picks the concierge with the most spare capacity from the candidate pool.
 * Used when auto-assigning a newly-signed TPA. Returns null when no
 * candidate has remaining capacity (caller should surface a capacity
 * warning to the DL).
 *
 * Tie-breaker: fewer active clients wins (prefer concentration on
 * already-loaded concierges only when capacity is equal).
 */
export function pickLeastLoadedConcierge(
  concierges: ConciergeWithLoad[],
  incomingExpectedWeeklyAuths: number,
): ConciergeWithLoad | null {
  const candidates = concierges.filter((c) => c.active);
  // Find the one with the most spare capacity that can still fit the new client.
  let best: ConciergeWithLoad | null = null;
  for (const c of candidates) {
    const spare = c.weekly_auth_cap - c.estimated_weekly_load;
    if (spare < incomingExpectedWeeklyAuths) continue;
    if (
      !best ||
      spare > best.weekly_auth_cap - best.estimated_weekly_load ||
      (spare === best.weekly_auth_cap - best.estimated_weekly_load && c.active_client_count < best.active_client_count)
    ) {
      best = c;
    }
  }
  return best;
}

/**
 * Local helper — extracts a number from the nested join shape Supabase
 * returns. signup_requests can be null (client not linked to a signup),
 * a single object, or an array depending on how PostgREST renders the join.
 * We treat any of those as best-effort and default to 0.
 */
function extractExpectedWeeklyAuths(row: unknown): number {
  if (!row || typeof row !== 'object') return 0;
  const clients = (row as { clients?: unknown }).clients;
  if (!clients || typeof clients !== 'object') return 0;
  const sr = (clients as { signup_requests?: unknown }).signup_requests;
  if (!sr) return 0;
  const obj = Array.isArray(sr) ? sr[0] : sr;
  if (!obj || typeof obj !== 'object') return 0;
  const v = (obj as { expected_weekly_auths?: unknown }).expected_weekly_auths;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

// ============================================================================
// Reassignment tooling (for Delivery Leads)
// ============================================================================

export interface ReassignResult {
  ok: boolean;
  message: string;
  new_assignment_id?: string;
  cases_updated?: number;
}

export interface ReassignParams {
  client_id: string;
  to_concierge_id: string;
  assigned_by: string;
  reason?: string;
  /** If provided, only affect this specific case (future V2 per-case override) */
  case_id?: string;
}

/**
 * Reassign a client (or specific case) from its current concierge to a new one.
 * 
 * - Deactivates the prior active client_concierge_assignment for the scope.
 * - Creates a fresh active assignment to the target concierge.
 * - For open cases belonging to the client, updates assigned_concierge_id (and concierge_assigned_at).
 * - Always writes an audit_log entry for traceability (DL authority action).
 *
 * This is the control surface that lets Delivery Leads correct load without
 * waiting for the next auto-assign cycle. Low-friction by design.
 */
export async function reassignClientToConcierge(
  supabase: SupabaseClient,
  params: ReassignParams,
): Promise<ReassignResult> {
  const { client_id, to_concierge_id, assigned_by, reason, case_id } = params;

  // 1. Find and deactivate any active assignment for this client (whole-client V1)
  const { data: currentAssignments } = await supabase
    .from('client_concierge_assignments')
    .select('id, concierge_id')
    .eq('client_id', client_id)
    .eq('active', true)
    .limit(5);

  const current = (currentAssignments ?? [])[0] as { id: string; concierge_id: string } | undefined;

  if (current && current.concierge_id === to_concierge_id) {
    return { ok: true, message: 'Client is already assigned to the target concierge.' };
  }

  if (current) {
    const { error: deactErr } = await supabase
      .from('client_concierge_assignments')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', current.id);
    if (deactErr) {
      return { ok: false, message: `Failed to deactivate prior assignment: ${deactErr.message}` };
    }
  }

  // 2. Create the new active assignment
  const { data: newAssign, error: insErr } = await supabase
    .from('client_concierge_assignments')
    .insert({
      client_id,
      concierge_id: to_concierge_id,
      practice_id: null,
      assigned_by,
      active: true,
    })
    .select('id')
    .single();

  if (insErr || !newAssign) {
    return { ok: false, message: `Failed to create new assignment: ${insErr?.message ?? 'unknown'}` };
  }

  // 3. Update open cases for the client to point to new concierge (unless a specific case_id is targeted)
  let casesUpdated = 0;
  const openStatuses = ['intake', 'processing', 'brief_ready', 'lpn_review', 'rn_review', 'md_review', 'pend_missing_info'];
  let caseQuery = supabase
    .from('cases')
    .update({
      assigned_concierge_id: to_concierge_id,
      concierge_assigned_at: new Date().toISOString(),
    })
    .eq('client_id', client_id)
    .in('status', openStatuses);

  if (case_id) {
    caseQuery = caseQuery.eq('id', case_id);
  }

  const { data: updatedCases, error: caseErr } = await caseQuery.select('id');
  if (!caseErr && updatedCases) {
    casesUpdated = updatedCases.length;
  }

  // 4. Audit the action (defensible trail) — fire-and-forget, never block the reassignment UX
  supabase.from('audit_log').insert({
    case_id: case_id || null,
    action: 'dl_client_reassigned',
    actor: assigned_by,
    details: {
      client_id,
      from_concierge_id: current?.concierge_id ?? null,
      to_concierge_id,
      reason: reason || 'Manual rebalance by Delivery Lead',
      cases_updated: casesUpdated,
    },
  }).then(() => {}, () => {/* non-fatal audit failure */});

  return {
    ok: true,
    message: `Reassigned. ${casesUpdated} open case(s) updated to new concierge.`,
    new_assignment_id: (newAssign as { id: string }).id,
    cases_updated: casesUpdated,
  };
}
