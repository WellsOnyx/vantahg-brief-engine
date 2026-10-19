import { describe, expect, it } from 'vitest';
import { applyIroAction, createIroCase, previousStep } from '@/lib/iro/workflow';
import { runSyntheticOhioWalkthrough } from '@/lib/iro/synthetic-ohio';
import { IRO_FEE_SCHEDULES } from '@/lib/iro/config/fee-schedule';
import { DEFAULT_IRO_ACCESS_POLICY } from '@/lib/iro/config/access-policy';
import { STATE_SETTINGS_REGISTRY } from '@/lib/iro/config/state-settings';
import { URAC_IRO_BASELINE } from '@/lib/iro/config/urac-baseline';
import { stubCredentialingService, stubMailingAdapter, stubStorageAdapter } from '@/lib/iro/adapters/stubs';
import type { IroActor, IroDeps } from '@/lib/iro';

const NOW = '2026-10-19T15:00:00.000Z';

function deps(): IroDeps {
  return {
    now: () => NOW,
    settings: STATE_SETTINGS_REGISTRY.versions,
    fees: IRO_FEE_SCHEDULES,
    urac: URAC_IRO_BASELINE,
    policy: DEFAULT_IRO_ACCESS_POLICY,
    credentials: stubCredentialingService({}),
    mailing: stubMailingAdapter(() => NOW),
    storage: stubStorageAdapter(),
    audit: [],
  };
}

const coordinator: IroActor = {
  id: 'syn-coord',
  role: 'iro_coordinator',
  companies: ['VANTA_HG'],
  lines: ['IRO'],
  case_restricted: false,
  assigned_case_ids: [],
  line_wide: false,
  selector: 'vanta',
  clearance_role: null,
};

describe('IRO versioning', () => {
  it('refuses to skip ahead and refuses to step back from intake', () => {
    const created = createIroCase(
      {
        id: 'iro-syn-version',
        state_code: 'OH',
        receipts: { carrier_receipt_at: NOW, state_receipt_at: null, vanta_receipt_at: NOW },
      },
      coordinator,
      deps(),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const skipped = applyIroAction(created.case, { type: 'set_pathway_deadline' }, coordinator, deps());
    expect(skipped.ok).toBe(false);
    if (!skipped.ok) expect(skipped.code).toBe('wrong_step');
    expect(skipped.case.step).toBe('intake');
    const backed = applyIroAction(created.case, { type: 'fail_check', detail: 'no prior step' }, coordinator, deps());
    expect(backed.ok).toBe(false);
    if (!backed.ok) expect(backed.code).toBe('cannot_step_back');
    expect(previousStep('classification')).toBe('intake');
  });

  it('seals the failed check and reopens the previous step on a new version', () => {
    const run = runSyntheticOhioWalkthrough();
    expect(run.case.version).toBe(2);
    expect(run.case.versions).toHaveLength(1);
    const sealed = run.case.versions[0];
    expect(sealed.reason).toBe('failed_check');
    expect(sealed.snapshot.version).toBe(1);
    expect(sealed.snapshot.review_outcome).toBe('upheld');
    expect(sealed.snapshot.original_request_ref).toBe('SYN-REQ-OH-0001');
    expect(run.case.review?.outcome).toBe('overturned');
    expect(run.case.review?.completed_on_version).toBe(2);
    expect(run.case.md_signoff?.version).toBe(2);
    expect(run.stops).toContain('process_check_required');
    expect(run.case.original_request_ref).toBe('SYN-REQ-OH-0001');
  });
});
