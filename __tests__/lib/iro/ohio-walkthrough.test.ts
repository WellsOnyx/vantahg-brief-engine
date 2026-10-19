import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runSyntheticOhioWalkthrough, type OhioWalkthrough } from '@/lib/iro/synthetic-ohio';

let run: OhioWalkthrough;
let fetchSpy: { mockRestore: () => void; not: { toHaveBeenCalled: () => void } };

beforeAll(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
  run = runSyntheticOhioWalkthrough();
});

afterAll(() => {
  fetchSpy.mockRestore();
});

describe('synthetic Ohio IRO case', () => {
  it('walks every stage on one IRO case', () => {
    expect(run.case.company).toBe('VANTA_HG');
    expect(run.case.line_of_business).toBe('IRO');
    expect(run.case.synthetic).toBe(true);
    expect(run.case.step).toBe('billing');
    expect(run.case.status).toBe('active');
    expect(run.case.category).toBe('medical_necessity');
    expect(run.case.state_code).toBe('OH');
    expect(run.transcript.some((row) => row.action === 'log_intake' && row.ok)).toBe(true);
    expect(run.transcript.some((row) => row.action === 'complete_review' && row.ok)).toBe(true);
    expect(run.transcript.some((row) => row.action === 'md_signoff' && row.ok)).toBe(true);
    expect(run.transcript.some((row) => row.action === 'record_delivery' && row.ok)).toBe(true);
    expect(run.transcript.some((row) => row.action === 'close_case' && row.ok)).toBe(true);
    expect(run.transcript.some((row) => row.action === 'record_billing' && row.ok)).toBe(true);
  });

  it('fires STOP gates, including attestation, conflict clearance, and reviewer selection', () => {
    expect(run.stops).toEqual(
      expect.arrayContaining([
        'wrong_step',
        'deadline_pause_forbidden',
        'conflict_unresolved',
        'conflict_clearance_denied',
        'records_need_team_lead',
        'only_vanta_selects_reviewer',
        'credential_expires_before_due',
        'panel_not_activated',
        'attestation_required',
        'attestation_yes',
        'process_check_required',
        'backdate_forbidden',
      ]),
    );
    expect(run.case.conflict?.cleared_by_role).toBe('santana');
    expect(run.case.conflict?.prior_line_flags).toEqual(['MEDICAL_REVIEW']);
    expect(JSON.stringify(run.case.conflict)).not.toMatch(/case_body|patient_name/);
    expect(run.case.reviewer_selected_by).toBe('vanta');
    expect(run.case.notice?.reviewer_named).toBe(false);
    expect(run.case.notice && 'reviewer_name' in run.case.notice).toBe(false);
  });

  it('pins the Ohio standard deadline and does not move it when records are missing', () => {
    expect(run.dueAfterPathway).toBe('2026-10-31T14:00:00.000Z');
    expect(run.case.deadline?.due_at).toBe(run.dueAfterPathway);
    expect(run.case.deadline?.winner).toBe('state');
    expect(run.case.deadline?.missing_records_effect).toBe('none');
    expect(run.case.records.missing).toBe(true);
    expect(run.case.receipts).toEqual({
      carrier_receipt_at: '2026-10-01T14:00:00.000Z',
      state_receipt_at: '2026-10-02T16:00:00.000Z',
      vanta_receipt_at: '2026-10-01T18:30:00.000Z',
    });
  });

  it('tracks billing apart from closure, including the specialist total', () => {
    expect(run.case.closure.closed).toBe(true);
    expect(run.case.billing.quote?.display_total_cents).toBe(170_000);
    expect(run.case.billing.quote?.display_total).toBe('$1,700.00');
    expect(run.case.billing.events).toHaveLength(1);
    expect(run.case.billing.events[0].closes_case).toBe(false);
    expect(run.case.billing.events[0].amount_cents).toBe(170_000);
    const close = run.transcript.find((row) => row.action === 'close_case');
    const bill = run.transcript.find((row) => row.action === 'record_billing');
    expect(close && bill && run.transcript.indexOf(close) < run.transcript.indexOf(bill)).toBe(true);
  });

  it('uses adapter stubs and does not call a vendor', () => {
    expect(run.emrConfigured).toBe(false);
    expect(run.phoneCaseId).toBe(run.case.id);
    expect(run.mailingLiveCall).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
