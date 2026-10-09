import { randomUUID } from 'crypto';
import { logAuditEvent } from '@/lib/audit';
import { getStorageAdapter } from '@/lib/adapters/storage';
import { isDemoMode } from '@/lib/demo-mode';
import type { UserRole } from '@/lib/auth-guard';
import { toAssignmentCard, toClinicalPacket } from './access';
import { evaluateCutover, type CutoverChecklist } from './cutover';
import { assessEligibility, attestationSatisfiesCase } from './eligibility';
import { getIroRepository } from './repository';
import { scanReminders } from './reminders';
import { evaluateTransition, STEP_RESPONSIBILITY, type TransitionActor } from './status';
import type {
  AssignmentCard,
  EvidenceKind,
  IroAttestation,
  IroCaseReview,
  IroCredentialEvent,
  IroPhysician,
  IroReminder,
} from './types';
import { verificationGaps } from './verification';

export interface IroActor {
  id: string;
  email: string;
  role: TransitionActor;
}

export type IroResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; details?: Record<string, unknown> };

function fail(status: number, error: string, details?: Record<string, unknown>): IroResult<never> {
  return { ok: false, status, error, details };
}

function repo() {
  return getIroRepository();
}

export async function loadHrWorkspace(now = new Date()): Promise<{
  view: 'hr';
  responsibility_legend: typeof STEP_RESPONSIBILITY;
  cutover_gate: 'closed' | 'open';
  cutover_missing: string[];
  physicians: Array<IroPhysician & { responsibility: string; verification_gaps: string[] }>;
  reminders: IroReminder[];
}> {
  const settings = await repo().getSettings();
  const physicians = await repo().listPhysicians();
  const reminders = await repo().listReminders();
  const cutover = evaluateCutover(settings, false);
  return {
    view: 'hr',
    responsibility_legend: STEP_RESPONSIBILITY,
    cutover_gate: settings.cutover_gate,
    cutover_missing: settings.cutover_gate === 'open' ? [] : cutover.missing,
    physicians: physicians.map((physician) => ({
      ...physician,
      responsibility: STEP_RESPONSIBILITY[physician.status],
      verification_gaps: verificationGaps(physician, now),
    })),
    reminders,
  };
}

export async function loadPhysician(id: string, now = new Date()) {
  const physician = await repo().getPhysician(id);
  if (!physician) return fail(404, 'not_found');
  return {
    ok: true as const,
    data: {
      ...physician,
      responsibility: STEP_RESPONSIBILITY[physician.status],
      verification_gaps: verificationGaps(physician, now),
    },
  };
}

export async function transitionPhysician(
  actor: IroActor,
  physicianId: string,
  to: string,
  now = new Date(),
): Promise<IroResult<{ status: string; responsibility: string }>> {
  const physician = await repo().getPhysician(physicianId);
  if (!physician) return fail(404, 'not_found');
  const gaps = verificationGaps(physician, now);
  const decision = evaluateTransition(physician.status, to, actor.role, gaps);
  if (!decision.ok) {
    const status =
      decision.code === 'wrong_actor' || decision.code === 'forbidden_transition'
        ? 403
        : decision.code === 'unknown_status'
          ? 400
          : 409;
    return fail(status, decision.code ?? 'forbidden_transition', { gaps, responsibility: decision.responsibility });
  }
  const from = physician.status;
  physician.status = to as IroPhysician['status'];
  if (to === 'pending_clinical_approval') {
    physician.verification_completed_at = now.toISOString();
    physician.verification_completed_by = actor.email;
  }
  if (to === 'in_verification' && (from === 'suspended' || from === 'expired')) {
    physician.assignment_status = 'hold';
  }
  physician.events.push(event(physician.id, actor, 'status_transition', `${from} -> ${to}`));
  await repo().savePhysician(physician);
  await logAuditEvent(null, 'iro_status_transition', actor.email, {
    physician_id: physician.id,
    from,
    to,
    actor_role: actor.role,
  });
  return { ok: true, data: { status: to, responsibility: decision.responsibility } };
}

export async function recordCredentialEvent(
  actor: IroActor,
  physicianId: string,
  eventType: IroCredentialEvent['event_type'],
  summary: string,
): Promise<IroResult<{ id: string }>> {
  if (eventType === 'status_transition' || eventType === 'reminder') {
    return fail(400, 'event_type_reserved');
  }
  const physician = await repo().getPhysician(physicianId);
  if (!physician) return fail(404, 'not_found');
  const row = event(physician.id, actor, eventType, summary);
  physician.events.push(row);
  await repo().savePhysician(physician);
  await logAuditEvent(null, 'iro_credential_event', actor.email, {
    physician_id: physician.id,
    event_type: eventType,
    event_id: row.id,
  });
  return { ok: true, data: { id: row.id } };
}

export async function loadApprovalQueue(now = new Date()) {
  const physicians = await repo().listPhysicians();
  const pending = physicians.filter((row) => row.status === 'pending_clinical_approval');
  return {
    view: 'clinical_approval' as const,
    medical_director: 'clinical_approver',
    appointed: false,
    physicians: pending.map((row) => toClinicalPacket(row, STEP_RESPONSIBILITY[row.status])),
    clock: now.toISOString(),
  };
}

export async function decidePanel(
  actor: IroActor,
  physicianId: string,
  decision: 'approved' | 'conditional' | 'denied',
  note: string,
  expiresOn: string | null,
  now = new Date(),
): Promise<IroResult<{ status: string }>> {
  if (actor.role !== 'clinical_approver') {
    return fail(403, 'clinical_approver_required', {
      responsibility: STEP_RESPONSIBILITY.pending_clinical_approval,
    });
  }
  const result = await transitionPhysician(actor, physicianId, decision, now);
  if (!result.ok) return result;
  const physician = await repo().getPhysician(physicianId);
  if (!physician) return fail(404, 'not_found');
  physician.clinical_decision_at = now.toISOString();
  physician.clinical_decision_by = actor.email;
  physician.clinical_decision_note = note.slice(0, 500);
  if (decision === 'conditional') physician.conditional_terms = note.slice(0, 500);
  if (decision === 'approved' || decision === 'conditional') {
    physician.approved_at = now.toISOString();
    physician.approved_expires_at = expiresOn ?? plusMonths(now, 24);
    physician.assignment_status = physician.availability === 'unavailable' ? 'hold' : 'assignable';
    if (!physician.recredential_due_at) physician.recredential_due_at = physician.approved_expires_at;
  }
  await repo().savePhysician(physician);
  await logAuditEvent(null, 'iro_panel_decision', actor.email, {
    physician_id: physician.id,
    decision,
  });
  return { ok: true, data: { status: decision } };
}

export async function loadAssignmentPanel(caseRef: string | null, now = new Date()) {
  const rows = await repo().listAssignmentRows(now);
  const checks = caseRef ? await repo().listCaseChecks(caseRef) : [];
  const checkMap = new Map(checks.map((row) => [row.physician_id, row.case_checks_complete]));
  const physicians: AssignmentCard[] = rows.map((row) =>
    toAssignmentCard(row, checkMap.get(row.id) === true),
  );
  const review = caseRef ? await repo().getCaseReview(caseRef) : null;
  return {
    view: 'assignment' as const,
    physicians,
    case: review
      ? {
          case_ref: review.case_ref,
          required_specialty: review.required_specialty,
          required_jurisdiction: review.required_jurisdiction,
          assignment_state: review.assignment_state,
          assigned_physician_id: review.assigned_physician_id,
          case_checks_complete: review.assigned_physician_id
            ? checkMap.get(review.assigned_physician_id) === true
            : false,
        }
      : null,
  };
}

export async function recordAttestation(
  actor: IroActor,
  input: {
    case_ref: string;
    physician_id: string;
    conflict_attested: boolean;
    conflict_free: boolean;
    conflict_note: string | null;
    qualification_attested: boolean;
    specialty_match: boolean;
    jurisdiction_match: boolean;
  },
  now = new Date(),
): Promise<IroResult<{ case_checks_complete: boolean }>> {
  if (actor.role !== 'reviewer' && actor.role !== 'admin') {
    return fail(403, 'reviewer_attestation_required');
  }
  const review = await repo().getCaseReview(input.case_ref);
  if (!review) return fail(404, 'iro_case_not_found');
  const physician = await repo().getPhysician(input.physician_id);
  if (!physician) return fail(404, 'not_found');
  const existing = await repo().getAttestation(input.case_ref, input.physician_id);
  if (existing) {
    return {
      ok: true,
      data: { case_checks_complete: attestationSatisfiesCase(existing) },
    };
  }
  const attestation: IroAttestation = {
    id: randomUUID(),
    case_ref: input.case_ref,
    physician_id: physician.id,
    reviewer_user_id: actor.id,
    reviewer_email: actor.email,
    conflict_attested: input.conflict_attested,
    conflict_free: input.conflict_free,
    conflict_note: input.conflict_note,
    qualification_attested: input.qualification_attested,
    specialty_match: input.specialty_match,
    jurisdiction_match: input.jurisdiction_match,
    attested_at: now.toISOString(),
  };
  await repo().saveAttestation(attestation);
  await logAuditEvent(null, 'iro_attestation_recorded', actor.email, {
    case_ref: input.case_ref,
    physician_id: physician.id,
    case_checks_complete: attestationSatisfiesCase(attestation),
  });
  return { ok: true, data: { case_checks_complete: attestationSatisfiesCase(attestation) } };
}

export async function assignIroCase(
  actor: IroActor,
  caseRef: string,
  physicianId: string,
  now = new Date(),
): Promise<IroResult<{ assignment_state: string; physician_id: string }>> {
  const assigners = new Set<string>(['reviewer', 'concierge', 'delivery-lead', 'practice-lead', 'admin']);
  if (!assigners.has(actor.role)) {
    return fail(403, 'Forbidden');
  }
  const review = await repo().getCaseReview(caseRef);
  if (!review) return fail(404, 'iro_case_not_found');
  const physician = await repo().getPhysician(physicianId);
  if (!physician) return fail(404, 'not_found');
  if (review.assignment_state === 'completed') return fail(409, 'case_completed');
  if (review.assigned_physician_id && review.assigned_physician_id !== physician.id) {
    return fail(409, 'already_assigned');
  }
  const eligibility = assessEligibility(physician, review, now);
  if (!eligibility.ok) {
    await logAuditEvent(null, 'iro_assignment_blocked', actor.email, {
      case_ref: caseRef,
      physician_id: physician.id,
      code: eligibility.code,
    });
    return fail(409, eligibility.code);
  }
  const attestation = await repo().getAttestation(caseRef, physician.id);
  if (!attestation || !attestationSatisfiesCase(attestation)) {
    await logAuditEvent(null, 'iro_assignment_blocked', actor.email, {
      case_ref: caseRef,
      physician_id: physician.id,
      code: 'attestation_required',
    });
    return fail(409, 'attestation_required');
  }
  review.assigned_physician_id = physician.id;
  review.assignment_state = 'assigned';
  physician.assignment_status = 'on_case';
  await repo().saveCaseReview(review);
  await repo().savePhysician(physician);
  await logAuditEvent(null, 'iro_case_assigned', actor.email, {
    case_ref: caseRef,
    physician_id: physician.id,
  });
  return { ok: true, data: { assignment_state: 'assigned', physician_id: physician.id } };
}

export async function completeIroCase(
  actor: IroActor,
  caseRef: string,
  now = new Date(),
): Promise<IroResult<{ assignment_state: string }>> {
  if (actor.role !== 'reviewer' && actor.role !== 'admin') {
    return fail(403, 'Forbidden');
  }
  const review = await repo().getCaseReview(caseRef);
  if (!review) return fail(404, 'iro_case_not_found');
  if (!review.assigned_physician_id || review.assignment_state !== 'assigned') {
    return fail(409, 'not_assigned');
  }
  const physician = await repo().getPhysician(review.assigned_physician_id);
  if (!physician) return fail(404, 'not_found');
  const eligibility = assessEligibility(physician, review, now);
  if (!eligibility.ok) return fail(409, eligibility.code);
  const attestation = await repo().getAttestation(caseRef, physician.id);
  if (!attestation || !attestationSatisfiesCase(attestation)) {
    return fail(409, 'attestation_required');
  }
  review.assignment_state = 'completed';
  review.completed_at = now.toISOString();
  physician.assignment_status = 'assignable';
  await repo().saveCaseReview(review);
  await repo().savePhysician(physician);
  await logAuditEvent(null, 'iro_case_completed', actor.email, {
    case_ref: caseRef,
    physician_id: physician.id,
  });
  return { ok: true, data: { assignment_state: 'completed' } };
}

export async function runReminderScan(now = new Date()): Promise<{ open: number; stub: true }> {
  const physicians = await repo().listPhysicians();
  const reminders = scanReminders(physicians, now);
  await repo().replaceReminders(reminders);
  await logAuditEvent(null, 'iro_reminders_scanned', 'system', { open: reminders.length, stub: true });
  return { open: reminders.length, stub: true };
}

export async function applyCutover(
  actor: IroActor,
  checklist: CutoverChecklist,
  openRequested: boolean,
): Promise<IroResult<{ gate: 'closed' | 'open'; missing: string[] }>> {
  const decision = evaluateCutover(checklist, openRequested);
  const settings = await repo().getSettings();
  settings.workspace_tested = checklist.workspace_tested;
  settings.transferred_records_checked = checklist.transferred_records_checked;
  settings.access_permissions_confirmed = checklist.access_permissions_confirmed;
  settings.cutover_gate = decision.gate;
  await repo().saveSettings(settings);
  await logAuditEvent(null, 'iro_cutover_evaluated', actor.email, {
    gate: decision.gate,
    missing: decision.missing,
    actor_role: actor.role,
  });
  if (openRequested && !decision.ready) {
    return fail(409, 'cutover_incomplete', { missing: decision.missing });
  }
  return { ok: true, data: { gate: decision.gate, missing: decision.missing } };
}

const EVIDENCE_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export function evidencePathAllowed(physicianId: string, path: string): boolean {
  const prefix = `physicians/${physicianId}/`;
  return path.startsWith(prefix) && !path.includes('..') && !path.includes('\\');
}

export async function addEvidence(
  actor: IroActor,
  physicianId: string,
  input: { filename: string; content_type: string; bytes: Buffer; label: string; kind: EvidenceKind },
): Promise<IroResult<{ path: string }>> {
  if (!EVIDENCE_TYPES.has(input.content_type)) return fail(400, 'unsupported_type');
  if (input.bytes.byteLength > MAX_EVIDENCE_BYTES) return fail(400, 'too_large');
  const physician = await repo().getPhysician(physicianId);
  if (!physician) return fail(404, 'not_found');
  const safe = input.filename.split(/[/\\]/).pop()?.replace(/[^A-Za-z0-9._-]/g, '_') || 'evidence';
  const path = `physicians/${physician.id}/${Date.now()}-${safe}`;
  if (!isDemoMode()) {
    const adapter = await getStorageAdapter();
    const uploaded = await adapter.upload('iro-credentialing', path, input.bytes, {
      contentType: input.content_type,
    });
    if (!uploaded.ok) return fail(502, uploaded.code);
  }
  physician.evidence.push({
    id: randomUUID(),
    physician_id: physician.id,
    path,
    label: input.label.slice(0, 200),
    kind: input.kind,
    content_type: input.content_type,
    created_at: new Date().toISOString(),
    created_by: actor.email,
  });
  if (input.kind === 'cv') physician.cv_storage_key = path;
  await repo().savePhysician(physician);
  await logAuditEvent(null, 'iro_evidence_uploaded', actor.email, {
    physician_id: physician.id,
    kind: input.kind,
    path,
  });
  return { ok: true, data: { path } };
}

export async function signEvidence(
  actor: IroActor,
  physicianId: string,
  path: string,
): Promise<IroResult<{ url: string; expires_in: number; demo?: boolean }>> {
  if (!evidencePathAllowed(physicianId, path)) return fail(404, 'not_found');
  const physician = await repo().getPhysician(physicianId);
  if (!physician) return fail(404, 'not_found');
  const meta = physician.evidence.find((row) => row.path === path);
  if (!meta) return fail(404, 'not_found');
  if (actor.role === 'clinical_approver' && meta.kind === 'contract') {
    return fail(403, 'contract_restricted');
  }
  if (actor.role !== 'clinical_approver' && actor.role !== 'credentialing_admin' && actor.role !== 'admin') {
    return fail(403, 'Forbidden');
  }
  await logAuditEvent(null, 'iro_evidence_signed', actor.email, {
    physician_id: physician.id,
    kind: meta.kind,
  });
  if (isDemoMode() || process.env.IRO_STORE === 'memory') {
    return { ok: true, data: { url: `demo-signed://${path}`, expires_in: 300, demo: true } };
  }
  const adapter = await getStorageAdapter();
  const signed = await adapter.signedUrl('iro-credentialing', path, 300);
  if (!signed.ok) return fail(404, 'not_found');
  return { ok: true, data: { url: signed.url, expires_in: 300 } };
}

export async function registerIroCase(review: IroCaseReview): Promise<IroResult<{ case_ref: string }>> {
  if (!review.case_ref || !review.required_specialty || !review.required_jurisdiction) {
    return fail(400, 'invalid_case');
  }
  const existing = await repo().getCaseReview(review.case_ref);
  if (existing) return { ok: true, data: { case_ref: existing.case_ref } };
  await repo().saveCaseReview({
    case_ref: review.case_ref,
    required_specialty: review.required_specialty,
    required_jurisdiction: review.required_jurisdiction.toUpperCase(),
    assigned_physician_id: null,
    assignment_state: 'unassigned',
    completed_at: null,
  });
  return { ok: true, data: { case_ref: review.case_ref } };
}

export async function sectionOf(physicianId: string, section: 'licenses' | 'sanctions' | 'agreements' | 'experience' | 'evidence' | 'contracts' | 'events') {
  const loaded = await loadPhysician(physicianId);
  if (!loaded.ok) return loaded;
  const physician = loaded.data;
  switch (section) {
    case 'licenses':
      return { ok: true as const, data: { licenses: physician.licenses } };
    case 'sanctions':
      return { ok: true as const, data: { sanctions: physician.sanctions } };
    case 'agreements':
      return { ok: true as const, data: { agreements: physician.agreements } };
    case 'experience':
      return { ok: true as const, data: { clinical_experience: physician.clinical_experience } };
    case 'evidence':
      return { ok: true as const, data: { evidence: physician.evidence } };
    case 'contracts':
      return {
        ok: true as const,
        data: {
          contract_ref: physician.contract_ref,
          notes_hr: physician.notes_hr,
          evidence: physician.evidence.filter((row) => row.kind === 'contract'),
        },
      };
    case 'events':
      return { ok: true as const, data: { events: physician.events } };
    default:
      return fail(404, 'not_found');
  }
}

function event(
  physicianId: string,
  actor: IroActor,
  eventType: IroCredentialEvent['event_type'],
  summary: string,
): IroCredentialEvent {
  return {
    id: randomUUID(),
    physician_id: physicianId,
    event_type: eventType,
    summary,
    actor: actor.email,
    created_at: new Date().toISOString(),
  };
}

function plusMonths(now: Date, months: number): string {
  const copy = new Date(now.getTime());
  copy.setUTCMonth(copy.getUTCMonth() + months);
  return copy.toISOString().slice(0, 10);
}

export function actorFromUser(user: { id: string; email: string; role: UserRole }): IroActor {
  return { id: user.id, email: user.email, role: user.role };
}
