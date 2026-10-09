import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

import { SYNTH_ADA_ID, SYNTH_CASE_REF, SYNTH_LUIS_ID, SYNTH_NIA_ID, SYNTH_SENTINELS, syntheticIroSnapshot } from '@/lib/iro/fixtures';
import { assessEligibility } from '@/lib/iro/eligibility';
import { getMemoryIroRepository, resetIroMemory } from '@/lib/iro/repository';
import { scanReminders } from '@/lib/iro/reminders';
import { evaluateTransition } from '@/lib/iro/status';
import {
  assignIroCase,
  completeIroCase,
  loadAssignmentPanel,
  recordAttestation,
  runReminderScan,
  transitionPhysician,
} from '@/lib/iro/service';
import { verificationGaps } from '@/lib/iro/verification';

const NOW = new Date('2026-10-09T12:00:00.000Z');
const hr = { id: 'hr', email: 'thelma@synthetic.invalid', role: 'credentialing_admin' as const };
const reviewer = { id: 'rev', email: 'reviewer@synthetic.invalid', role: 'reviewer' as const };
const md = { id: 'md', email: 'md@synthetic.invalid', role: 'clinical_approver' as const };

describe('IRO status machine', () => {
  it('names a responsible party for every status', () => {
    expect(evaluateTransition('applicant', 'in_verification', 'credentialing_admin', []).ok).toBe(true);
    expect(evaluateTransition('in_verification', 'pending_clinical_approval', 'credentialing_admin', ['license_psv']).ok).toBe(false);
    expect(evaluateTransition('in_verification', 'pending_clinical_approval', 'credentialing_admin', []).ok).toBe(true);
    expect(evaluateTransition('pending_clinical_approval', 'approved', 'credentialing_admin', []).code).toBe('wrong_actor');
    expect(evaluateTransition('pending_clinical_approval', 'approved', 'clinical_approver', []).ok).toBe(true);
    expect(evaluateTransition('pending_clinical_approval', 'denied', 'admin', []).code).toBe('wrong_actor');
    expect(evaluateTransition('approved', 'suspended', 'credentialing_admin', []).ok).toBe(true);
    expect(evaluateTransition('approved', 'expired', 'system', []).ok).toBe(true);
    expect(evaluateTransition('approved', 'expired', 'clinical_approver', []).code).toBe('wrong_actor');
  });

  it('blocks an incomplete file from clinical review', () => {
    const luis = syntheticIroSnapshot().physicians[1];
    expect(verificationGaps(luis, NOW)).toEqual(expect.arrayContaining([
      'license_psv',
      'sanction_oig_leie',
      'sanction_sam',
      'board_certification',
      'direct_patient_care_recency',
      'outstanding_items',
    ]));
  });
});

describe('assignment and attestation', () => {
  beforeEach(() => {
    process.env.IRO_STORE = 'memory';
    resetIroMemory();
  });

  it('refuses assignment until the reviewer attests, even when the panel is approved', async () => {
    const blocked = await assignIroCase(reviewer, SYNTH_CASE_REF, SYNTH_ADA_ID, NOW);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toBe('attestation_required');

    const attested = await recordAttestation(reviewer, {
      case_ref: SYNTH_CASE_REF,
      physician_id: SYNTH_ADA_ID,
      conflict_attested: true,
      conflict_free: true,
      conflict_note: 'SYN-CONFLICT-NOTE',
      qualification_attested: true,
      specialty_match: true,
      jurisdiction_match: true,
    }, NOW);
    expect(attested.ok).toBe(true);

    const assigned = await assignIroCase(reviewer, SYNTH_CASE_REF, SYNTH_ADA_ID, NOW);
    expect(assigned.ok).toBe(true);

    const panel = await loadAssignmentPanel(SYNTH_CASE_REF, NOW);
    const serialized = JSON.stringify(panel);
    expect(serialized).not.toContain('SYN-CONFLICT-NOTE');
    expect(serialized).not.toContain(SYNTH_SENTINELS.license_number);
    expect(serialized).not.toContain(SYNTH_SENTINELS.contract_ref);
    expect(panel.case?.case_checks_complete).toBe(true);
    expect(panel.physicians.map((row) => row.display_name)).toEqual(['Ada Okonkwo, MD']);

    const done = await completeIroCase(reviewer, SYNTH_CASE_REF, NOW);
    expect(done.ok).toBe(true);
  });

  it('blocks completion when attestation is missing', async () => {
    const memory = getMemoryIroRepository();
    const review = await memory.getCaseReview(SYNTH_CASE_REF);
    review!.assigned_physician_id = SYNTH_ADA_ID;
    review!.assignment_state = 'assigned';
    await memory.saveCaseReview(review!);
    const done = await completeIroCase(reviewer, SYNTH_CASE_REF, NOW);
    expect(done.ok).toBe(false);
    if (!done.ok) expect(done.error).toBe('attestation_required');
  });

  it('does not assign a physician outside the case jurisdiction', () => {
    const luis = syntheticIroSnapshot().physicians[1];
    luis.status = 'approved';
    luis.approved_expires_at = '2028-01-01';
    luis.availability = 'available';
    const result = assessEligibility(luis, { required_specialty: 'cardiology', required_jurisdiction: 'TX' }, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('jurisdiction');
  });

  it('does not let HR sign the panel approval', async () => {
    const result = await transitionPhysician(hr, SYNTH_NIA_ID, 'approved', NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('wrong_actor');
    const signed = await transitionPhysician(md, SYNTH_NIA_ID, 'approved', NOW);
    expect(signed.ok).toBe(true);
  });

  it('does not let HR hand off Luis while items are outstanding', async () => {
    const result = await transitionPhysician(hr, SYNTH_LUIS_ID, 'pending_clinical_approval', NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('verification_incomplete');
  });
});

describe('reminders', () => {
  it('lists expirations, recredentialing, and outstanding items', () => {
    const rows = scanReminders(syntheticIroSnapshot().physicians, NOW);
    const kinds = rows.map((row) => `${row.display_name}:${row.kind}`);
    expect(kinds).toContain('Luis Herrera, MD:license_expiry');
    expect(kinds).toContain('Luis Herrera, MD:outstanding_item');
    expect(kinds).toContain('Ada Okonkwo, MD:recredentialing');
    expect(JSON.stringify(rows)).not.toContain(SYNTH_SENTINELS.license_number);
  });

  it('stores the scan on the dashboard list', async () => {
    process.env.IRO_STORE = 'memory';
    resetIroMemory();
    const result = await runReminderScan(NOW);
    expect(result.stub).toBe(true);
    expect(result.open).toBeGreaterThan(0);
    const open = await getMemoryIroRepository().listReminders();
    expect(open.length).toBe(result.open);
  });
});
