import { describe, expect, it, vi } from 'vitest';
import { decideAssistTouch } from '@/lib/idr-assist';
import { evaluateUmBriefEngineAccess } from '@/lib/entitlements/um-brief-engine';
import { assertChecklistOperational } from '@/lib/onboarding/checklist';
import {
  assertNoLiveVendor,
  stubCredentialingService,
  stubEmrAdapter,
  stubMailingAdapter,
  stubPhoneAdapter,
  stubStorageAdapter,
} from '@/lib/iro/adapters/stubs';
import { CREDENTIAL_STATUS_FIELDS, isPanelActivated } from '@/lib/iro/credentialing';
import { DEFAULT_IRO_ACCESS_POLICY } from '@/lib/iro/config/access-policy';

describe('IRO adapters and untouched guards', () => {
  it('keeps IDR never-submit, Med Review packaging, and Phase 7 onboarding intact', () => {
    expect(decideAssistTouch({ label: 'Submit' })).toMatchObject({ mayTouch: false, submitted: false });
    expect(
      evaluateUmBriefEngineAccess({ vanta_med_review_contract: true, med_review_provider: 'third_party' }).allowed,
    ).toBe(false);
    expect(assertChecklistOperational().ok).toBe(true);
  });

  it('reads credential status only and blocks an inactive panel', () => {
    const service = stubCredentialingService({
      'syn-reviewer-1': {
        status: {
          physician_id: 'syn-reviewer-1',
          active: true,
          specialty_codes: ['SYN-SPEC-01'],
          licensed_states: ['OH'],
          board_certified: true,
          expires_at: '2027-01-01T00:00:00.000Z',
          lines_of_business: ['IRO'],
          license_number: 'DO-NOT-PROJECT',
          screening_packet: 'secret',
        },
        panel: {
          physician_id: 'syn-reviewer-1',
          approvals: [{ approver_role: 'santana', recorded_at: '2026-10-19T00:00:00.000Z', recorded: true }],
        },
      },
    });
    const status = service.readStatus('syn-reviewer-1');
    expect(status && Object.keys(status).sort()).toEqual([...CREDENTIAL_STATUS_FIELDS].sort());
    expect(JSON.stringify(status)).not.toMatch(/DO-NOT-PROJECT|secret/);
    const panel = service.readPanelActivation('syn-reviewer-1');
    expect(isPanelActivated(panel, DEFAULT_IRO_ACCESS_POLICY.panel_approvers)).toBe(false);
  });

  it('does not call a network from the unselected adapters', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const emr = stubEmrAdapter();
    const mail = stubMailingAdapter();
    const phone = stubPhoneAdapter();
    const storage = stubStorageAdapter();
    expect(assertNoLiveVendor(emr)).toBe(true);
    expect(emr.pull({ case_ref: 'iro-syn-oh-0001' }).configured).toBe(false);
    const sent = mail.send({ case_id: 'iro-syn-oh-0001', channel: 'certified', to_ref: 'SYN-RECIPIENT' });
    expect(sent.vendor).toBeNull();
    expect(sent.manual_fallback).toBe(true);
    expect(phone.logMessage({ case_id: 'iro-syn-oh-0001', urgent: false, token: 'SYN-CALL' }).case_id).toBe(
      'iro-syn-oh-0001',
    );
    const original = storage.putOriginal({
      key: 'iro-syn-oh-0001/syn-doc-1',
      case_id: 'iro-syn-oh-0001',
      line_of_business: 'IRO',
      bytes: 4,
    });
    expect(original.ok).toBe(true);
    expect(
      storage.putOriginal({
        key: 'iro-syn-oh-0001/syn-doc-1',
        case_id: 'iro-syn-oh-0001',
        line_of_business: 'IRO',
        bytes: 4,
      }).ok,
    ).toBe(false);
    const revision = storage.putRevision({
      key: 'iro-syn-oh-0001/syn-doc-1',
      case_id: 'iro-syn-oh-0001',
      line_of_business: 'IRO',
      bytes: 5,
    });
    expect(revision.ok).toBe(true);
    if (revision.ok) expect(revision.object.revision).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
