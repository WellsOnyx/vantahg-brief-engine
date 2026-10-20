import { randomBytes } from 'crypto';
import {
  emptyCredentialing,
  evaluateAssignment,
  iroCredentialingFromShared,
  putCredentialItem,
  recordIroApproval,
} from '@/lib/credentialing';
import type { CredentialItemInput, CredentialingState } from '@/lib/credentialing';
import { authorizeLineAccess } from '@/lib/lines';
import type { FirewallAuditEvent } from '@/lib/lines';
import { stubMailingAdapter, stubStorageAdapter } from '@/lib/iro/adapters/stubs';
import type { StoredOriginal } from '@/lib/iro/adapters/types';
import { DEFAULT_IRO_ACCESS_POLICY } from '@/lib/iro/config/access-policy';
import { IRO_FEE_SCHEDULES } from '@/lib/iro/config/fee-schedule';
import { STATE_SETTINGS_REGISTRY } from '@/lib/iro/config/state-settings';
import { URAC_IRO_BASELINE } from '@/lib/iro/config/urac-baseline';
import type { IroAction, IroDeps } from '@/lib/iro/workflow';
import { applyIroAction, createIroCase } from '@/lib/iro/workflow';
import type { IroCase, IroStateCode, Receipts } from '@/lib/iro/types';
import { IRO_STATE_CODES } from '@/lib/iro/types';
import {
  IRO_DOCUMENT_MAX_BYTES,
  IRO_DOCUMENT_TTL_SECONDS,
  getIroDocumentStorage,
  iroDocumentKey,
  newDocumentId,
} from './documents';
import { evaluateLivePhiGate, type LivePhiDecision } from './live-phi';
import { portalStageLabel, portalStageNumber } from './stages';
import type { IroPortalStore, IroStaffGrant, IroStoredCase } from './store';
import { isPortalRole, resolvePortalRole, toIroActor, type PortalUser } from './roles';

const CASE_ID = /^iro-[a-z0-9-]{6,80}$/;
const PHI_KEYS = new Set([
  'patient_name',
  'patient',
  'dob',
  'date_of_birth',
  'member_id',
  'ssn',
  'address',
  'phone',
  'email',
  'npi',
]);

export interface PortalFailure {
  ok: false;
  status: number;
  code: string;
  message: string;
}

export interface PortalSuccess<T> {
  ok: true;
  status: 200;
  data: T;
}

export type PortalResult<T> = PortalSuccess<T> | PortalFailure;

export interface PortalCaseView {
  id: string;
  company: 'VANTA_HG';
  line_of_business: 'IRO';
  synthetic: boolean;
  version: number;
  step: IroCase['step'];
  stage: number;
  stage_label: string;
  status: IroCase['status'];
  stop: IroCase['stop'];
  state_code: IroStateCode;
  expedited: boolean;
  category: IroCase['category'];
  deadline_due_at: string | null;
  reviewer_id: string | null;
  review_outcome: 'upheld' | 'overturned' | 'partially_overturned' | null;
  md_signed: boolean;
  closed: boolean;
  delivery_state: IroCase['delivery']['state'];
  delivery_channel: IroCase['delivery']['channel'];
  live_mail: false;
  conflict_cleared: boolean | null;
  record_count: number;
}

export interface PortalContext {
  store: IroPortalStore;
  now?: () => string;
  requestId?: string | null;
  gate?: LivePhiDecision;
  /** When set, document bytes use this adapter instead of the process default. */
  documents?: Awaited<ReturnType<typeof getIroDocumentStorage>>;
}

function fail(status: number, code: string, message: string): PortalFailure {
  return { ok: false, status, code, message };
}

function portalNow(ctx: PortalContext): string {
  return (ctx.now ?? (() => new Date().toISOString()))();
}

export function toPortalCaseView(kase: IroCase): PortalCaseView {
  return {
    id: kase.id,
    company: kase.company,
    line_of_business: kase.line_of_business,
    synthetic: kase.synthetic,
    version: kase.version,
    step: kase.step,
    stage: portalStageNumber(kase.step),
    stage_label: portalStageLabel(kase.step),
    status: kase.status,
    stop: kase.stop,
    state_code: kase.state_code,
    expedited: kase.expedited,
    category: kase.category,
    deadline_due_at: kase.deadline?.due_at ?? null,
    reviewer_id: kase.reviewer_id,
    review_outcome: kase.review?.outcome ?? null,
    md_signed: Boolean(kase.md_signoff),
    closed: kase.closure.closed,
    delivery_state: kase.delivery.state,
    delivery_channel: kase.delivery.channel,
    live_mail: false,
    conflict_cleared: kase.conflict ? kase.conflict.cleared : null,
    record_count: kase.records.documents.length,
  };
}

function isStateCode(value: string): value is IroStateCode {
  return (IRO_STATE_CODES as readonly string[]).includes(value);
}

export function refusePhiKeys(body: Record<string, unknown>): string | null {
  for (const key of Object.keys(body)) {
    if (PHI_KEYS.has(key)) return 'phi_field_refused';
  }
  return null;
}

async function actorFor(store: IroPortalStore, user: PortalUser) {
  const grant = await store.getGrant(user.id);
  const merged: PortalUser = {
    ...user,
    portal_role: grant?.portal_role ?? user.portal_role ?? null,
    clearance_role: grant?.clearance_role ?? user.clearance_role ?? null,
  };
  if (!resolvePortalRole(merged)) return null;
  const assigned = await store.reviewerCaseIds(merged.id);
  return toIroActor(merged, assigned);
}

function depsFor(
  ctx: PortalContext,
  objects: StoredOriginal[],
  credentials: CredentialingState,
  firewall: FirewallAuditEvent[],
): IroDeps {
  const storage = stubStorageAdapter();
  storage.objects.push(...objects.map((row) => ({ ...row })));
  return {
    now: () => portalNow(ctx),
    settings: STATE_SETTINGS_REGISTRY.versions,
    fees: IRO_FEE_SCHEDULES,
    urac: URAC_IRO_BASELINE,
    policy: DEFAULT_IRO_ACCESS_POLICY,
    credentials: iroCredentialingFromShared(credentials, portalNow(ctx)),
    mailing: stubMailingAdapter(() => portalNow(ctx)),
    storage,
    audit: firewall,
    contract: null,
  };
}

async function audit(
  ctx: PortalContext,
  kase: IroCase,
  actorId: string,
  action: string,
  code: string,
): Promise<void> {
  await ctx.store.appendAudit({
    case_id: kase.id,
    at: portalNow(ctx),
    actor_id: actorId,
    action,
    code,
    step: kase.step,
    version: kase.version,
    request_id: ctx.requestId ?? null,
  });
}

function persistObjects(deps: IroDeps): StoredOriginal[] {
  return deps.storage && 'objects' in deps.storage
    ? (deps.storage as { objects: StoredOriginal[] }).objects.map((row) => ({ ...row }))
    : [];
}

export async function openIroCase(
  user: PortalUser,
  input: { id?: string; state_code: string; receipts: Receipts },
  ctx: PortalContext,
): Promise<PortalResult<{ case: PortalCaseView; idempotent: boolean }>> {
  const gate = ctx.gate ?? evaluateLivePhiGate();
  if (!gate.allowed) return fail(403, gate.code, gate.message);
  if (!isStateCode(input.state_code)) return fail(400, 'state_not_configured', 'State code is not in the IRO registry.');
  const id = input.id ?? `iro-${randomBytes(8).toString('hex')}`;
  if (!CASE_ID.test(id)) return fail(400, 'case_id_invalid', 'Case ids use the iro- prefix.');
  const actor = await actorFor(ctx.store, user);
  if (!actor) return fail(403, 'role_denied', 'This role cannot open an IRO case.');
  if (actor.role !== 'iro_coordinator' && actor.role !== 'iro_team_lead') {
    return fail(403, 'role_denied', 'Intake and case managers open cases.');
  }

  const existing = await ctx.store.getCase(id);
  if (existing) {
    const firewall: FirewallAuditEvent[] = [];
    const gateRead = authorizeLineAccess(
      { ...actor, case_restricted: actor.case_restricted, assigned_case_ids: actor.assigned_case_ids, line_wide: actor.line_wide },
      { id: existing.case.id, case_id: existing.case.id, company: existing.case.company, line_of_business: 'IRO', kind: 'workflow' },
      'read',
      { now: () => portalNow(ctx), audit: firewall },
    );
    if (!gateRead.allowed) {
      await audit(ctx, existing.case, actor.id, 'read', gateRead.code);
      return fail(403, gateRead.code, gateRead.message);
    }
    await audit(ctx, existing.case, actor.id, 'read', 'idempotent');
    return { ok: true, status: 200, data: { case: toPortalCaseView(existing.case), idempotent: true } };
  }

  const firewall: FirewallAuditEvent[] = [];
  const credentials = await ctx.store.getCredentialing();
  const deps = depsFor(ctx, [], credentials, firewall);
  const created = createIroCase(
    { id, state_code: input.state_code, receipts: input.receipts, synthetic: false },
    actor,
    deps,
  );
  if (!created.ok) {
    await ctx.store.saveCase({ case: created.case, storage_objects: [] });
    await audit(ctx, created.case, actor.id, 'create', created.code);
    return fail(403, created.code, created.message);
  }
  await ctx.store.saveCase({ case: created.case, storage_objects: [] });
  await audit(ctx, created.case, actor.id, 'create', 'ok');
  return { ok: true, status: 200, data: { case: toPortalCaseView(created.case), idempotent: false } };
}

export async function readIroCase(
  user: PortalUser,
  caseId: string,
  ctx: PortalContext,
): Promise<PortalResult<{ case: PortalCaseView; audit_count: number }>> {
  const actor = await actorFor(ctx.store, user);
  if (!actor) return fail(403, 'role_denied', 'This role cannot read IRO cases.');
  const stored = await ctx.store.getCase(caseId);
  if (!stored) return fail(404, 'not_found', 'Case not found.');
  const firewall: FirewallAuditEvent[] = [];
  const decision = authorizeLineAccess(
    actor,
    { id: stored.case.id, case_id: stored.case.id, company: stored.case.company, line_of_business: stored.case.line_of_business, kind: 'workflow' },
    'read',
    { now: () => portalNow(ctx), audit: firewall },
  );
  await audit(ctx, stored.case, actor.id, 'read', decision.allowed ? 'ok' : decision.code);
  if (!decision.allowed) return fail(403, decision.code, decision.message);
  const trail = await ctx.store.listAudit(caseId);
  return { ok: true, status: 200, data: { case: toPortalCaseView(stored.case), audit_count: trail.length } };
}

export async function listIroCases(
  user: PortalUser,
  ctx: PortalContext,
): Promise<PortalResult<{ cases: PortalCaseView[] }>> {
  const actor = await actorFor(ctx.store, user);
  if (!actor) return fail(403, 'role_denied', 'This role cannot list IRO cases.');
  const rows = await ctx.store.listCases();
  const visible: PortalCaseView[] = [];
  for (const kase of rows) {
    if (kase.line_of_business !== 'IRO') continue;
    const firewall: FirewallAuditEvent[] = [];
    const decision = authorizeLineAccess(
      actor,
      { id: kase.id, case_id: kase.id, company: kase.company, line_of_business: kase.line_of_business, kind: 'workflow' },
      'read',
      { now: () => portalNow(ctx), audit: firewall },
    );
    if (!decision.allowed) {
      await audit(ctx, kase, actor.id, 'list', decision.code);
      continue;
    }
    await audit(ctx, kase, actor.id, 'list', 'ok');
    visible.push(toPortalCaseView(kase));
  }
  return { ok: true, status: 200, data: { cases: visible } };
}

export async function actOnIroCase(
  user: PortalUser,
  caseId: string,
  action: IroAction,
  ctx: PortalContext,
): Promise<PortalResult<{ case: PortalCaseView; code: string }>> {
  const actor = await actorFor(ctx.store, user);
  if (!actor) return fail(403, 'role_denied', 'This role cannot update an IRO case.');
  const stored = await ctx.store.getCase(caseId);
  if (!stored) return fail(404, 'not_found', 'Case not found.');
  if (stored.case.synthetic) return fail(409, 'synthetic_case', 'The production portal does not mutate synthetic cases.');

  let credentials = await ctx.store.getCredentialing();
  if (action.type === 'assign_reviewer') {
    if (!stored.case.deadline) return fail(409, 'wrong_step', 'Deadline is not pinned yet.');
    const evaluation = evaluateAssignment(
      credentials,
      {
        line: 'IRO',
        reviewer_id: action.reviewer_id,
        due_at: stored.case.deadline.due_at,
        state_code: stored.case.state_code,
      },
      portalNow(ctx),
    );
    credentials = evaluation.state;
    await ctx.store.saveCredentialing(credentials);
    if (!evaluation.ok) {
      await audit(ctx, stored.case, actor.id, 'assign_reviewer', evaluation.code);
      return fail(409, evaluation.code, evaluation.message);
    }
  }

  const firewall: FirewallAuditEvent[] = [];
  const deps = depsFor(ctx, stored.storage_objects, credentials, firewall);
  const result = applyIroAction(stored.case, action, actor, deps);
  const next: IroStoredCase = { case: result.case, storage_objects: persistObjects(deps) };
  await ctx.store.saveCase(next);
  await audit(ctx, result.case, actor.id, action.type, result.ok ? 'ok' : result.code);
  if (!result.ok) return fail(409, result.code, result.message);
  return { ok: true, status: 200, data: { case: toPortalCaseView(result.case), code: 'ok' } };
}

export async function recordSharedCredential(
  user: PortalUser,
  input: CredentialItemInput,
  ctx: PortalContext,
): Promise<PortalResult<{ reviewer_id: string }>> {
  const actor = await actorFor(ctx.store, user);
  if (!actor || (actor.role !== 'iro_coordinator' && actor.role !== 'iro_team_lead')) {
    return fail(403, 'role_denied', 'Case managers record shared credential status.');
  }
  const at = portalNow(ctx);
  const current = await ctx.store.getCredentialing();
  const saved = putCredentialItem(current, input, at);
  await ctx.store.saveCredentialing(saved.state);
  if (!saved.ok) return fail(400, saved.code, saved.message);
  return { ok: true, status: 200, data: { reviewer_id: input.reviewer_id } };
}

export async function recordSharedActivation(
  user: PortalUser,
  input: { reviewer_id: string; approver_id: string },
  ctx: PortalContext,
): Promise<PortalResult<{ reviewer_id: string; complete: boolean }>> {
  const actor = await actorFor(ctx.store, user);
  if (!actor || actor.role !== 'iro_team_lead') {
    return fail(403, 'role_denied', 'An admin records IRO panel activation.');
  }
  const at = portalNow(ctx);
  const current = await ctx.store.getCredentialing();
  const saved = recordIroApproval(current, input, at);
  await ctx.store.saveCredentialing(saved.state);
  if (!saved.ok) return fail(400, saved.code, saved.message);
  const complete = saved.value.approvals.length >= DEFAULT_IRO_ACCESS_POLICY.panel_approvers.length;
  return { ok: true, status: 200, data: { reviewer_id: input.reviewer_id, complete } };
}

export async function saveStaffGrant(
  user: PortalUser,
  grant: IroStaffGrant,
  ctx: PortalContext,
): Promise<PortalResult<{ grant: IroStaffGrant }>> {
  const actor = await actorFor(ctx.store, user);
  if (!actor || actor.role !== 'iro_team_lead') {
    return fail(403, 'role_denied', 'An admin records staff grants.');
  }
  if (grant.portal_role && !isPortalRole(grant.portal_role)) {
    return fail(400, 'role_denied', 'Portal role is not recognized.');
  }
  if (
    grant.clearance_role &&
    !DEFAULT_IRO_ACCESS_POLICY.conflict_clearance_roles.some(
      (role) => role.toLowerCase() === grant.clearance_role!.toLowerCase(),
    )
  ) {
    return fail(400, 'conflict_clearance_denied', 'Clearance role is not on the configured list.');
  }
  await ctx.store.saveGrant(grant);
  return { ok: true, status: 200, data: { grant } };
}

export async function attachIroDocument(
  user: PortalUser,
  caseId: string,
  file: { bytes: Buffer; contentType: string },
  ctx: PortalContext,
): Promise<PortalResult<{ document_id: string; storage_key: string }>> {
  const gate = ctx.gate ?? evaluateLivePhiGate();
  if (!gate.allowed) return fail(403, gate.code, gate.message);
  if (file.contentType !== 'application/pdf') return fail(400, 'pdf_only', 'Documents must be PDF.');
  if (file.bytes.length === 0 || file.bytes.length > IRO_DOCUMENT_MAX_BYTES) {
    return fail(400, 'file_size', 'PDF must be under 10 MB.');
  }
  const actor = await actorFor(ctx.store, user);
  if (!actor || (actor.role !== 'iro_coordinator' && actor.role !== 'iro_team_lead')) {
    return fail(403, 'role_denied', 'Intake and case managers attach documents.');
  }
  const stored = await ctx.store.getCase(caseId);
  if (!stored) return fail(404, 'not_found', 'Case not found.');
  const documentId = newDocumentId();
  const storage_key = iroDocumentKey(caseId, documentId);
  const storage = ctx.documents ?? (await getIroDocumentStorage());
  const uploaded = await storage.upload(IRO_BUCKET, storage_key, file.bytes, {
    contentType: 'application/pdf',
    upsert: false,
  });
  if (!uploaded.ok) return fail(502, uploaded.code, uploaded.message);
  const at = portalNow(ctx);
  await ctx.store.saveDocument({
    id: documentId,
    case_id: caseId,
    storage_key,
    bucket: 'efax-documents',
    content_type: 'application/pdf',
    byte_size: file.bytes.length,
    created_at: at,
  });
  await audit(ctx, stored.case, actor.id, 'document_write', 'ok');
  return { ok: true, status: 200, data: { document_id: documentId, storage_key } };
}

const IRO_BUCKET = 'efax-documents' as const;

export async function signIroDocument(
  user: PortalUser,
  caseId: string,
  documentId: string,
  ctx: PortalContext,
): Promise<PortalResult<{ url: string; expires_at: string; live_mail: false }>> {
  const actor = await actorFor(ctx.store, user);
  if (!actor) return fail(403, 'role_denied', 'This role cannot read IRO documents.');
  const stored = await ctx.store.getCase(caseId);
  if (!stored) return fail(404, 'not_found', 'Case not found.');
  const firewall: FirewallAuditEvent[] = [];
  const decision = authorizeLineAccess(
    actor,
    { id: stored.case.id, case_id: stored.case.id, company: stored.case.company, line_of_business: 'IRO', kind: 'record' },
    'read',
    { now: () => portalNow(ctx), audit: firewall },
  );
  if (!decision.allowed) {
    await audit(ctx, stored.case, actor.id, 'document_read', decision.code);
    return fail(403, decision.code, decision.message);
  }
  const doc = await ctx.store.getDocument(caseId, documentId);
  if (!doc || !doc.storage_key.startsWith(`iro/${caseId}/`)) {
    await audit(ctx, stored.case, actor.id, 'document_read', 'not_found');
    return fail(404, 'not_found', 'Document not found.');
  }
  const storage = ctx.documents ?? (await getIroDocumentStorage());
  const signed = await storage.signedUrl(doc.bucket, doc.storage_key, IRO_DOCUMENT_TTL_SECONDS);
  await audit(ctx, stored.case, actor.id, 'document_read', signed.ok ? 'ok' : signed.code);
  if (!signed.ok) return fail(502, signed.code, signed.message);
  return {
    ok: true,
    status: 200,
    data: { url: signed.url, expires_at: signed.expiresAt.toISOString(), live_mail: false },
  };
}

export function blankCredentialing(): CredentialingState {
  return emptyCredentialing();
}
