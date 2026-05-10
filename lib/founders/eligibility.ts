/**
 * Eligibility lookup for Founders intake.
 *
 * Per Santana's May 7 ops call: client IT pushes a monthly file (Excel or
 * system push) that updates `member_eligibility`. Active members show a
 * "green dot"; inactive show a "red dot". A red dot is a hard stop — the
 * concierge must verify with the TPA before any auth proceeds. The agent
 * never auto-resolves a red dot.
 *
 * MVP: this lookup reads from `member_eligibility` directly. Real
 * client-IT push parsing (CSV/Excel diff against last version) is a
 * follow-up — admins seed the table manually for now.
 */

import { getServiceClient, hasSupabaseConfig } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';

export type EligibilityStatus = 'green' | 'red' | 'unknown';

export interface EligibilityResult {
  status: EligibilityStatus;
  member_id: string;
  member_name?: string;
  plan_name?: string;
  effective_date?: string;
  termination_date?: string;
  source_file_version?: string;
  /** Caller-friendly message for the concierge UI. */
  message: string;
  /** When status is 'red', describes the next required action. */
  next_action?: string;
}

const DEMO_GREEN_MEMBERS = new Set(['M1001', 'M1002', 'M1003', 'M2001', 'GHP-100', 'GHP-101', 'GHP-102']);
const DEMO_RED_MEMBERS = new Set(['M9999', 'GHP-OLD']);

export async function checkEligibility(params: {
  client_id: string;
  member_id: string;
  date_of_service?: string;
}): Promise<EligibilityResult> {
  const { client_id, member_id, date_of_service } = params;

  if (isDemoMode() || !hasSupabaseConfig()) {
    return demoEligibility(member_id);
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('member_eligibility')
    .select('*')
    .eq('client_id', client_id)
    .eq('member_id', member_id)
    .maybeSingle();

  if (error) {
    return {
      status: 'unknown',
      member_id,
      message: 'Eligibility lookup failed. Verify with the TPA before proceeding.',
      next_action: 'Manager must call TPA to confirm member status.',
    };
  }

  if (!data) {
    return {
      status: 'red',
      member_id,
      message: 'No eligibility record on file for this member.',
      next_action: 'Manager must call TPA to confirm member status before any auth.',
    };
  }

  // Date-of-service window check
  const dos = date_of_service ? Date.parse(date_of_service) : NaN;
  const eff = data.effective_date ? Date.parse(data.effective_date) : NaN;
  const term = data.termination_date ? Date.parse(data.termination_date) : NaN;

  let withinDates = true;
  if (!Number.isNaN(dos)) {
    if (!Number.isNaN(eff) && dos < eff) withinDates = false;
    if (!Number.isNaN(term) && dos > term) withinDates = false;
  }

  if (data.status === 'active' && withinDates) {
    return {
      status: 'green',
      member_id,
      member_name: data.member_name,
      plan_name: data.plan_name,
      effective_date: data.effective_date,
      termination_date: data.termination_date,
      source_file_version: data.source_file_version,
      message: `Active coverage confirmed${data.plan_name ? ` (${data.plan_name})` : ''}.`,
    };
  }

  return {
    status: 'red',
    member_id,
    member_name: data.member_name,
    plan_name: data.plan_name,
    effective_date: data.effective_date,
    termination_date: data.termination_date,
    source_file_version: data.source_file_version,
    message: !withinDates
      ? 'Member coverage is not active for the requested date of service.'
      : 'Member is inactive in the eligibility file.',
    next_action: 'Manager must call TPA to confirm member status before any auth.',
  };
}

function demoEligibility(member_id: string): EligibilityResult {
  if (DEMO_RED_MEMBERS.has(member_id)) {
    return {
      status: 'red',
      member_id,
      message: 'Member inactive in demo eligibility file.',
      next_action: 'Manager must call TPA to confirm member status before any auth.',
    };
  }
  if (DEMO_GREEN_MEMBERS.has(member_id) || member_id.startsWith('M')) {
    return {
      status: 'green',
      member_id,
      member_name: 'Demo Member',
      plan_name: 'Gulf Health Partners — Standard PPO',
      effective_date: '2026-01-01',
      termination_date: '2026-12-31',
      source_file_version: 'demo-2026-05',
      message: 'Active coverage confirmed (demo).',
    };
  }
  return {
    status: 'red',
    member_id,
    message: 'No eligibility record on file (demo lookup).',
    next_action: 'Manager must call TPA to confirm member status before any auth.',
  };
}
