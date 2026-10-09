import { isDemoMode } from '@/lib/demo-mode';
import { getServiceClient } from '@/lib/supabase';
import { assignmentQuerySpec, toAssignmentIdentity } from './access';
import { attestationSatisfiesCase, isApprovalCurrent } from './eligibility';
import { syntheticIroSnapshot, type IroMemorySnapshot } from './fixtures';
import type {
  AssignmentIdentity,
  CaseCheckRow,
  IroAttestation,
  IroCaseReview,
  IroEvidence,
  IroPhysician,
  IroReminder,
  IroSettings,
} from './types';

export interface IroRepository {
  getSettings(): Promise<IroSettings>;
  saveSettings(settings: IroSettings): Promise<void>;
  listPhysicians(): Promise<IroPhysician[]>;
  getPhysician(id: string): Promise<IroPhysician | null>;
  savePhysician(physician: IroPhysician): Promise<void>;
  listAssignmentRows(now: Date): Promise<AssignmentIdentity[]>;
  listCaseChecks(caseRef: string): Promise<CaseCheckRow[]>;
  getAttestation(caseRef: string, physicianId: string): Promise<IroAttestation | null>;
  saveAttestation(attestation: IroAttestation): Promise<void>;
  getCaseReview(caseRef: string): Promise<IroCaseReview | null>;
  saveCaseReview(review: IroCaseReview): Promise<void>;
  listReminders(): Promise<IroReminder[]>;
  replaceReminders(reminders: IroReminder[]): Promise<void>;
}

class MemoryIroRepository implements IroRepository {
  private state: IroMemorySnapshot = syntheticIroSnapshot();

  reset(): void {
    this.state = syntheticIroSnapshot();
  }

  snapshot(): IroMemorySnapshot {
    return this.state;
  }

  async getSettings(): Promise<IroSettings> {
    return { ...this.state.settings };
  }

  async saveSettings(settings: IroSettings): Promise<void> {
    this.state.settings = { ...settings };
  }

  async listPhysicians(): Promise<IroPhysician[]> {
    return this.state.physicians.map((row) => structuredClone(row));
  }

  async getPhysician(id: string): Promise<IroPhysician | null> {
    const found = this.state.physicians.find((row) => row.id === id || row.external_key === id);
    return found ? structuredClone(found) : null;
  }

  async savePhysician(physician: IroPhysician): Promise<void> {
    const index = this.state.physicians.findIndex((row) => row.id === physician.id);
    const copy = structuredClone(physician);
    if (index === -1) this.state.physicians.push(copy);
    else this.state.physicians[index] = copy;
  }

  async listAssignmentRows(now: Date): Promise<AssignmentIdentity[]> {
    return this.state.physicians
      .filter((row) => isApprovalCurrent(row, now))
      .map((row) => toAssignmentIdentity(row));
  }

  async listCaseChecks(caseRef: string): Promise<CaseCheckRow[]> {
    return this.state.attestations
      .filter((row) => row.case_ref === caseRef)
      .map((row) => ({
        physician_id: row.physician_id,
        case_checks_complete: attestationSatisfiesCase(row),
      }));
  }

  async getAttestation(caseRef: string, physicianId: string): Promise<IroAttestation | null> {
    const found = this.state.attestations.find(
      (row) => row.case_ref === caseRef && row.physician_id === physicianId,
    );
    return found ? { ...found } : null;
  }

  async saveAttestation(attestation: IroAttestation): Promise<void> {
    const exists = this.state.attestations.some(
      (row) => row.case_ref === attestation.case_ref && row.physician_id === attestation.physician_id,
    );
    if (exists) throw new Error('attestation_exists');
    this.state.attestations.push({ ...attestation });
  }

  async getCaseReview(caseRef: string): Promise<IroCaseReview | null> {
    const found = this.state.cases.find((row) => row.case_ref === caseRef);
    return found ? { ...found } : null;
  }

  async saveCaseReview(review: IroCaseReview): Promise<void> {
    const index = this.state.cases.findIndex((row) => row.case_ref === review.case_ref);
    if (index === -1) this.state.cases.push({ ...review });
    else this.state.cases[index] = { ...review };
  }

  async listReminders(): Promise<IroReminder[]> {
    return this.state.reminders.map((row) => ({ ...row }));
  }

  async replaceReminders(reminders: IroReminder[]): Promise<void> {
    this.state.reminders = reminders.map((row) => ({ ...row }));
  }
}

const memory = new MemoryIroRepository();

export function resetIroMemory(): void {
  memory.reset();
}

export function getMemoryIroRepository(): MemoryIroRepository {
  return memory;
}

function asDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function asIso(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function physicianScalars(physician: IroPhysician): Record<string, unknown> {
  return {
    id: physician.id,
    external_key: physician.external_key,
    display_name: physician.display_name,
    legal_name: physician.legal_name,
    email: physician.email,
    phone: physician.phone,
    npi: physician.npi,
    status: physician.status,
    specialties: physician.specialties,
    jurisdictions: physician.jurisdictions,
    availability: physician.availability,
    assignment_status: physician.assignment_status,
    cv_storage_key: physician.cv_storage_key,
    contract_ref: physician.contract_ref,
    notes_hr: physician.notes_hr,
    board_cert_waiver: physician.board_cert_waiver,
    application_received_at: physician.application_received_at,
    recredential_due_at: physician.recredential_due_at,
    approved_at: physician.approved_at,
    approved_expires_at: physician.approved_expires_at,
    verification_completed_at: physician.verification_completed_at,
    verification_completed_by: physician.verification_completed_by,
    clinical_decision_at: physician.clinical_decision_at,
    clinical_decision_by: physician.clinical_decision_by,
    clinical_decision_note: physician.clinical_decision_note,
    conditional_terms: physician.conditional_terms,
  };
}

type Row = Record<string, unknown>;

function emptyPhysician(row: Row): IroPhysician {
  return {
    id: String(row.id),
    external_key: String(row.external_key ?? ''),
    display_name: String(row.display_name ?? ''),
    legal_name: String(row.legal_name ?? ''),
    email: String(row.email ?? ''),
    phone: String(row.phone ?? ''),
    npi: String(row.npi ?? ''),
    status: row.status as IroPhysician['status'],
    specialties: (row.specialties as string[]) ?? [],
    jurisdictions: (row.jurisdictions as string[]) ?? [],
    availability: row.availability as IroPhysician['availability'],
    assignment_status: row.assignment_status as IroPhysician['assignment_status'],
    cv_storage_key: (row.cv_storage_key as string | null) ?? null,
    contract_ref: (row.contract_ref as string | null) ?? null,
    notes_hr: (row.notes_hr as string | null) ?? null,
    board_cert_waiver: (row.board_cert_waiver as string | null) ?? null,
    application_received_at: asDate(row.application_received_at) ?? '',
    recredential_due_at: asDate(row.recredential_due_at),
    approved_at: asIso(row.approved_at),
    approved_expires_at: asDate(row.approved_expires_at),
    verification_completed_at: asIso(row.verification_completed_at),
    verification_completed_by: (row.verification_completed_by as string | null) ?? null,
    clinical_decision_at: asIso(row.clinical_decision_at),
    clinical_decision_by: (row.clinical_decision_by as string | null) ?? null,
    clinical_decision_note: (row.clinical_decision_note as string | null) ?? null,
    conditional_terms: (row.conditional_terms as string | null) ?? null,
    licenses: [],
    board_certifications: [],
    sanctions: [],
    clinical_experience: [],
    agreements: [],
    outstanding_items: [],
    events: [],
    evidence: [],
  };
}

class DbIroRepository implements IroRepository {
  private client() {
    return getServiceClient();
  }

  async getSettings(): Promise<IroSettings> {
    const { data, error } = await this.client()
      .from('iro_module_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return {
        iro_line_contract: false,
        cutover_gate: 'closed',
        workspace_tested: false,
        transferred_records_checked: false,
        access_permissions_confirmed: false,
      };
    }
    const row = data as Row;
    return {
      iro_line_contract: row.iro_line_contract === true,
      cutover_gate: row.cutover_gate === 'open' ? 'open' : 'closed',
      workspace_tested: row.workspace_tested === true,
      transferred_records_checked: row.transferred_records_checked === true,
      access_permissions_confirmed: row.access_permissions_confirmed === true,
    };
  }

  async saveSettings(settings: IroSettings): Promise<void> {
    const { error } = await this.client().from('iro_module_settings').upsert({
      id: 1,
      ...settings,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
  }

  private async hydrate(row: Row): Promise<IroPhysician> {
    const physician = emptyPhysician(row);
    const id = physician.id;
    const db = this.client();
    const [licenses, boards, sanctions, experience, agreements, outstanding, events, evidence] =
      await Promise.all([
        db.from('iro_licenses').select('*').eq('physician_id', id),
        db.from('iro_board_certifications').select('*').eq('physician_id', id),
        db.from('iro_sanctions_screenings').select('*').eq('physician_id', id),
        db.from('iro_clinical_experience').select('*').eq('physician_id', id),
        db.from('iro_agreements').select('*').eq('physician_id', id),
        db.from('iro_outstanding_items').select('*').eq('physician_id', id),
        db.from('iro_credential_events').select('*').eq('physician_id', id),
        db.from('iro_evidence').select('*').eq('physician_id', id),
      ]);
    for (const result of [licenses, boards, sanctions, experience, agreements, outstanding, events, evidence]) {
      if (result.error) throw new Error(result.error.message);
    }
    physician.licenses = ((licenses.data ?? []) as Row[]).map((item) => ({
      id: String(item.id),
      state: String(item.state),
      license_number: String(item.license_number),
      expires_on: asDate(item.expires_on) ?? '',
      status: item.status as IroPhysician['licenses'][number]['status'],
      primary_source_verified_at: asDate(item.primary_source_verified_at),
      primary_source_method: (item.primary_source_method as string | null) ?? null,
      primary_source_result: (item.primary_source_result as IroPhysician['licenses'][number]['primary_source_result']) ?? null,
      evidence_storage_key: (item.evidence_storage_key as string | null) ?? null,
    }));
    physician.board_certifications = ((boards.data ?? []) as Row[]).map((item) => ({
      id: String(item.id),
      board_name: String(item.board_name),
      specialty: String(item.specialty),
      certified_on: asDate(item.certified_on),
      expires_on: asDate(item.expires_on),
      status: item.status as IroPhysician['board_certifications'][number]['status'],
      evidence_storage_key: (item.evidence_storage_key as string | null) ?? null,
    }));
    physician.sanctions = ((sanctions.data ?? []) as Row[]).map((item) => ({
      id: String(item.id),
      source: item.source as IroPhysician['sanctions'][number]['source'],
      screened_at: asDate(item.screened_at) ?? '',
      result: item.result as IroPhysician['sanctions'][number]['result'],
      finding_summary: String(item.finding_summary ?? ''),
      evidence_storage_key: (item.evidence_storage_key as string | null) ?? null,
      live_call: false,
    }));
    physician.clinical_experience = ((experience.data ?? []) as Row[]).map((item) => ({
      id: String(item.id),
      setting: String(item.setting),
      role_title: String(item.role_title ?? ''),
      specialty: String(item.specialty ?? ''),
      started_on: asDate(item.started_on) ?? '',
      ended_on: asDate(item.ended_on),
      direct_patient_care: item.direct_patient_care === true,
      recency_note: (item.recency_note as string | null) ?? null,
    }));
    physician.agreements = ((agreements.data ?? []) as Row[]).map((item) => ({
      id: String(item.id),
      agreement_type: item.agreement_type as IroPhysician['agreements'][number]['agreement_type'],
      title: String(item.title),
      status: item.status as IroPhysician['agreements'][number]['status'],
      acknowledged_at: asDate(item.acknowledged_at),
      evidence_storage_key: (item.evidence_storage_key as string | null) ?? null,
      evidence_link: (item.evidence_link as string | null) ?? null,
    }));
    physician.outstanding_items = ((outstanding.data ?? []) as Row[]).map((item) => ({
      id: String(item.id),
      label: String(item.label),
      due_on: asDate(item.due_on),
      resolved_at: asIso(item.resolved_at),
    }));
    physician.events = ((events.data ?? []) as Row[]).map((item) => ({
      id: String(item.id),
      physician_id: String(item.physician_id),
      event_type: item.event_type as IroPhysician['events'][number]['event_type'],
      summary: String(item.summary),
      actor: String(item.actor),
      created_at: asIso(item.created_at) ?? new Date().toISOString(),
    }));
    physician.evidence = ((evidence.data ?? []) as IroEvidence[]).map((item) => ({
      id: String(item.id),
      physician_id: String(item.physician_id),
      path: String(item.path),
      label: String(item.label),
      kind: item.kind,
      content_type: String(item.content_type),
      created_at: asIso(item.created_at) ?? new Date().toISOString(),
      created_by: String(item.created_by),
    }));
    return physician;
  }

  async listPhysicians(): Promise<IroPhysician[]> {
    const { data, error } = await this.client().from('iro_physicians').select('*');
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Row[];
    return Promise.all(rows.map((row) => this.hydrate(row)));
  }

  async getPhysician(id: string): Promise<IroPhysician | null> {
    const byId = await this.client().from('iro_physicians').select('*').eq('id', id).maybeSingle();
    if (byId.error) throw new Error(byId.error.message);
    if (byId.data) return this.hydrate(byId.data as Row);
    const byKey = await this.client().from('iro_physicians').select('*').eq('external_key', id).maybeSingle();
    if (byKey.error) throw new Error(byKey.error.message);
    if (!byKey.data) return null;
    return this.hydrate(byKey.data as Row);
  }

  private async replaceChildren(table: string, physicianId: string, rows: Record<string, unknown>[]): Promise<void> {
    const db = this.client();
    const removed = await db.from(table).delete().eq('physician_id', physicianId);
    if (removed.error) throw new Error(removed.error.message);
    if (rows.length === 0) return;
    const inserted = await db.from(table).insert(rows);
    if (inserted.error) throw new Error(inserted.error.message);
  }

  async savePhysician(physician: IroPhysician): Promise<void> {
    const db = this.client();
    const saved = await db.from('iro_physicians').upsert(physicianScalars(physician), { onConflict: 'id' });
    if (saved.error) throw new Error(saved.error.message);
    const id = physician.id;
    await this.replaceChildren(
      'iro_licenses',
      id,
      physician.licenses.map((row) => ({ ...row, physician_id: id })),
    );
    await this.replaceChildren(
      'iro_board_certifications',
      id,
      physician.board_certifications.map((row) => ({ ...row, physician_id: id })),
    );
    await this.replaceChildren(
      'iro_sanctions_screenings',
      id,
      physician.sanctions.map((row) => ({
        id: row.id,
        physician_id: id,
        source: row.source,
        screened_at: row.screened_at,
        result: row.result,
        finding_summary: row.finding_summary,
        evidence_storage_key: row.evidence_storage_key,
        live_call: false,
      })),
    );
    await this.replaceChildren(
      'iro_clinical_experience',
      id,
      physician.clinical_experience.map((row) => ({ ...row, physician_id: id })),
    );
    await this.replaceChildren(
      'iro_agreements',
      id,
      physician.agreements.map((row) => ({ ...row, physician_id: id })),
    );
    await this.replaceChildren(
      'iro_outstanding_items',
      id,
      physician.outstanding_items.map((row) => ({ ...row, physician_id: id })),
    );
    await this.replaceChildren(
      'iro_evidence',
      id,
      physician.evidence.map((row) => ({ ...row, physician_id: id })),
    );
    for (const event of physician.events) {
      const existing = await db.from('iro_credential_events').select('id').eq('id', event.id).maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (existing.data) continue;
      const inserted = await db.from('iro_credential_events').insert({ ...event, physician_id: id });
      if (inserted.error) throw new Error(inserted.error.message);
    }
  }

  async listAssignmentRows(_now: Date): Promise<AssignmentIdentity[]> {
    const spec = assignmentQuerySpec();
    const { data, error } = await this.client().from(spec.view).select(spec.columns.join(','));
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map((row) => ({
      id: String(row.id),
      display_name: String(row.display_name),
      specialties: (row.specialties as string[]) ?? [],
      jurisdictions: (row.jurisdictions as string[]) ?? [],
      availability: row.availability as AssignmentIdentity['availability'],
      assignment_status: row.assignment_status as AssignmentIdentity['assignment_status'],
    }));
  }

  async listCaseChecks(caseRef: string): Promise<CaseCheckRow[]> {
    const { data, error } = await this.client()
      .from('iro_case_check_status_v')
      .select('physician_id, case_checks_complete')
      .eq('case_ref', caseRef);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Row[]).map((row) => ({
      physician_id: String(row.physician_id),
      case_checks_complete: row.case_checks_complete === true,
    }));
  }

  async getAttestation(caseRef: string, physicianId: string): Promise<IroAttestation | null> {
    const { data, error } = await this.client()
      .from('iro_case_attestations')
      .select('*')
      .eq('case_ref', caseRef)
      .eq('physician_id', physicianId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const row = data as Row;
    return {
      id: String(row.id),
      case_ref: String(row.case_ref),
      physician_id: String(row.physician_id),
      reviewer_user_id: String(row.reviewer_user_id),
      reviewer_email: String(row.reviewer_email),
      conflict_attested: row.conflict_attested === true,
      conflict_free: row.conflict_free === true,
      conflict_note: (row.conflict_note as string | null) ?? null,
      qualification_attested: row.qualification_attested === true,
      specialty_match: row.specialty_match === true,
      jurisdiction_match: row.jurisdiction_match === true,
      attested_at: asIso(row.attested_at) ?? new Date().toISOString(),
    };
  }

  async saveAttestation(attestation: IroAttestation): Promise<void> {
    const { error } = await this.client().from('iro_case_attestations').insert(attestation);
    if (error) {
      if (/duplicate|unique/i.test(error.message)) throw new Error('attestation_exists');
      throw new Error(error.message);
    }
  }

  async getCaseReview(caseRef: string): Promise<IroCaseReview | null> {
    const { data, error } = await this.client()
      .from('iro_case_reviews')
      .select('*')
      .eq('case_ref', caseRef)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const row = data as Row;
    return {
      case_ref: String(row.case_ref),
      required_specialty: String(row.required_specialty),
      required_jurisdiction: String(row.required_jurisdiction),
      assigned_physician_id: (row.assigned_physician_id as string | null) ?? null,
      assignment_state: row.assignment_state as IroCaseReview['assignment_state'],
      completed_at: asIso(row.completed_at),
    };
  }

  async saveCaseReview(review: IroCaseReview): Promise<void> {
    const { error } = await this.client().from('iro_case_reviews').upsert(review, { onConflict: 'case_ref' });
    if (error) throw new Error(error.message);
  }

  async listReminders(): Promise<IroReminder[]> {
    const { data, error } = await this.client().from('iro_reminders').select('*').eq('status', 'open');
    if (error) throw new Error(error.message);
    return ((data ?? []) as Row[]).map((row) => ({
      id: String(row.id),
      physician_id: String(row.physician_id),
      display_name: String(row.display_name),
      kind: row.kind as IroReminder['kind'],
      due_on: asDate(row.due_on),
      message: String(row.message),
      status: 'open',
    }));
  }

  async replaceReminders(reminders: IroReminder[]): Promise<void> {
    const db = this.client();
    const removed = await db.from('iro_reminders').delete().eq('status', 'open');
    if (removed.error) throw new Error(removed.error.message);
    if (reminders.length === 0) return;
    const inserted = await db.from('iro_reminders').insert(reminders);
    if (inserted.error) throw new Error(inserted.error.message);
  }
}

const database = new DbIroRepository();

export function iroUsesMemoryStore(): boolean {
  return process.env.IRO_STORE === 'memory' || isDemoMode();
}

export function getIroRepository(): IroRepository {
  return iroUsesMemoryStore() ? memory : database;
}

/** Test seam. Production code does not call this. */
export function useMemoryIroRepositoryForTests(enabled: boolean): void {
  if (enabled) {
    process.env.IRO_STORE = 'memory';
    memory.reset();
  } else if (process.env.IRO_STORE === 'memory') {
    delete process.env.IRO_STORE;
  }
}
