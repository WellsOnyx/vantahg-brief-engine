import { DEFAULT_IRO_ACCESS_POLICY } from '@/lib/iro/config/access-policy';
import type { PartAAnswer, PartAQuestion } from '@/lib/iro/types';
import { createMemoryDocumentStorage } from './documents';
import type { LivePhiDecision } from './live-phi';
import type { PortalUser } from './roles';
import {
  actOnIroCase,
  attachIroDocument,
  openIroCase,
  readIroCase,
  recordSharedActivation,
  recordSharedCredential,
  type PortalCaseView,
} from './service';
import { createMemoryIroPortalStore, type IroPortalStore } from './store';

export const OHIO_LIVE_NOW = '2026-10-20T15:00:00.000Z';
export const OHIO_LIVE_CASE_ID = 'iro-oh-live-0001';

const NO: Record<PartAQuestion, PartAAnswer> = {
  financial_conflict: 'no',
  familial_conflict: 'no',
  treating_relationship: 'no',
  credential_concern: 'no',
};

const GATE: LivePhiDecision = {
  allowed: true,
  code: 'ok',
  message: 'test gate',
  baa: 'signed',
};

function user(partial: Pick<PortalUser, 'id' | 'role'> & Partial<PortalUser>): PortalUser {
  return { email: `${partial.id}@staff.invalid`, clearance_role: null, portal_role: null, ...partial };
}

/**
 * Ohio SOP on a non-synthetic case record.
 * Assignment goes through the shared credentialing module.
 * Mailing stays on the in-memory adapter (live_call false). No seed data.
 */
export async function runOhioLivePath(options?: {
  store?: IroPortalStore;
  gate?: LivePhiDecision;
}): Promise<{ case: PortalCaseView; audit_count: number; live_mail: false; storage_key: string }> {
  const store = options?.store ?? createMemoryIroPortalStore();
  const documents = createMemoryDocumentStorage();
  const ctx = {
    store,
    now: () => OHIO_LIVE_NOW,
    requestId: 'ohio-live',
    gate: options?.gate ?? GATE,
    documents,
  };
  const intake = user({ id: 'staff-intake', role: 'concierge' });
  const manager = user({ id: 'staff-cm', role: 'delivery-lead', clearance_role: 'santana' });
  const reviewer = user({ id: 'syn-reviewer-oh', role: 'reviewer' });
  const approver = user({ id: 'staff-approver', role: 'slt' });
  const admin = user({ id: 'staff-admin', role: 'admin' });

  const opened = await openIroCase(
    intake,
    {
      id: OHIO_LIVE_CASE_ID,
      state_code: 'OH',
      receipts: {
        carrier_receipt_at: '2026-10-01T14:00:00.000Z',
        state_receipt_at: '2026-10-02T16:00:00.000Z',
        vanta_receipt_at: '2026-10-01T18:30:00.000Z',
      },
    },
    ctx,
  );
  if (!opened.ok) throw new Error(`open failed: ${opened.code}`);

  const take = async (who: PortalUser, action: Parameters<typeof actOnIroCase>[2]) => {
    const result = await actOnIroCase(who, OHIO_LIVE_CASE_ID, action, ctx);
    if (!result.ok) throw new Error(`${action.type} failed: ${result.code} ${result.message}`);
    return result.data.case;
  };

  await take(intake, {
    type: 'log_intake',
    timezone: 'America/New_York',
    arrival_channel: 'portal_upload',
    referring_entity_ref: 'SYN-PLAN-OH',
    original_request_ref: 'SYN-REQ-OH-LIVE',
  });
  await take(intake, {
    type: 'classify',
    category: 'medical_necessity',
    expedited: false,
    review_question: 'SYN-Q-OH-LIVE',
  });
  await take(intake, { type: 'set_pathway_deadline' });
  const conflict = await actOnIroCase(
    manager,
    OHIO_LIVE_CASE_ID,
    {
      type: 'record_conflict_check',
      possible: true,
      parties: ['SYN-PLAN-OH', 'SYN-PROV-001'],
      prior_line_flags: [],
    },
    ctx,
  );
  if (conflict.ok || conflict.code !== 'conflict_unresolved') {
    throw new Error(`conflict check did not stop: ${conflict.ok ? 'ok' : conflict.code}`);
  }
  await take(manager, { type: 'clear_conflict' });
  await take(manager, { type: 'accept_case', benefit_exclusion: false });

  const attached = await attachIroDocument(
    manager,
    OHIO_LIVE_CASE_ID,
    { bytes: Buffer.from('%PDF-1.4 synthetic'), contentType: 'application/pdf' },
    ctx,
  );
  if (!attached.ok) throw new Error(`document failed: ${attached.code}`);

  await take(manager, {
    type: 'log_records',
    documents: [{ ref: attached.data.document_id, pages: 4, readable: true }],
    missing: false,
  });
  await take(manager, { type: 'generate_referral' });

  const credential = await recordSharedCredential(
    manager,
    {
      reviewer_id: 'syn-reviewer-oh',
      display_token: 'SYN-REV-OH',
      item_id: 'syn-lic-oh',
      kind: 'license',
      label: 'SYN-LIC-OH',
      state_code: 'OH',
      specialty_code: null,
      status: 'active',
      expires_at: '2027-06-01T00:00:00.000Z',
      source: 'vanta_verified',
      vendor_ref: null,
    },
    ctx,
  );
  if (!credential.ok) throw new Error(`credential failed: ${credential.code}`);
  for (const approverId of DEFAULT_IRO_ACCESS_POLICY.panel_approvers) {
    const activation = await recordSharedActivation(
      admin,
      { reviewer_id: 'syn-reviewer-oh', approver_id: approverId },
      ctx,
    );
    if (!activation.ok) throw new Error(`activation failed: ${activation.code} ${activation.message}`);
  }

  await take(manager, { type: 'assign_reviewer', reviewer_id: 'syn-reviewer-oh' });
  await take(reviewer, { type: 'submit_attestation', signed: true, answers: NO });
  await take(manager, { type: 'release_records' });
  await take(reviewer, { type: 'complete_review', outcome: 'overturned' });
  await take(admin, { type: 'team_lead_process_check' });
  await take(approver, { type: 'md_signoff' });
  await take(approver, { type: 'issue_notice' });
  const closed = await take(manager, { type: 'record_delivery', channel: 'certified', to_ref: 'SYN-RECIPIENT-OH' });
  const finished = await take(manager, { type: 'close_case' });
  const read = await readIroCase(admin, OHIO_LIVE_CASE_ID, ctx);
  if (!read.ok) throw new Error(`read failed: ${read.code}`);
  if (!finished.closed || closed.delivery_state !== 'delivered') {
    throw new Error('Ohio path did not close after notice.');
  }
  return {
    case: finished,
    audit_count: read.data.audit_count,
    live_mail: false,
    storage_key: attached.data.storage_key,
  };
}
