import type {
  IroAttestation,
  IroCaseReview,
  IroPhysician,
  IroReminder,
  IroSettings,
} from './types';

export const SYNTH_ADA_ID = '11111111-1111-4111-8111-111111111111';
export const SYNTH_LUIS_ID = '22222222-2222-4222-8222-222222222222';
export const SYNTH_NIA_ID = '33333333-3333-4333-8333-333333333333';
export const SYNTH_CASE_REF = 'case_synth_iro_ortho_tx';

/** Strings that prove a leak if they show up on the assignment card. */
export const SYNTH_SENTINELS = {
  legal_name: 'Adanna Chioma Okonkwo',
  email: 'ada.okonkwo@synthetic.invalid',
  phone: '555-010-1001',
  npi: '1099990001',
  license_number: 'TX-SYN-44021',
  contract_ref: 'SYN-HR-CONTRACT-ADA',
  notes_hr: 'HR-only compensation note SYN-COMP-ADA',
  finding_summary: 'OIG LEIE clear — synthetic screen SYN-OIG-ADA',
  cv_storage_key: `physicians/${SYNTH_ADA_ID}/cv-synthetic.pdf`,
  experience_setting: 'Synthetic General Hospital — not a real facility',
  outstanding: 'Board certificate copy outstanding SYN-OUT-LUIS',
  nia_contract: 'SYN-HR-CONTRACT-NIA',
} as const;

const ADA_ID = SYNTH_ADA_ID;

function ada(): IroPhysician {
  return {
    id: ADA_ID,
    external_key: 'ada',
    display_name: 'Ada Okonkwo, MD',
    legal_name: SYNTH_SENTINELS.legal_name,
    email: SYNTH_SENTINELS.email,
    phone: SYNTH_SENTINELS.phone,
    npi: SYNTH_SENTINELS.npi,
    status: 'approved',
    specialties: ['orthopedic_surgery'],
    jurisdictions: ['TX', 'OK'],
    availability: 'available',
    assignment_status: 'assignable',
    cv_storage_key: SYNTH_SENTINELS.cv_storage_key,
    contract_ref: SYNTH_SENTINELS.contract_ref,
    notes_hr: SYNTH_SENTINELS.notes_hr,
    board_cert_waiver: null,
    application_received_at: '2026-01-15',
    recredential_due_at: '2026-12-01',
    approved_at: '2026-03-01T00:00:00.000Z',
    approved_expires_at: '2028-03-01',
    verification_completed_at: '2026-02-20T00:00:00.000Z',
    verification_completed_by: 'thelma@synthetic.invalid',
    clinical_decision_at: '2026-03-01T00:00:00.000Z',
    clinical_decision_by: 'md-unassigned@synthetic.invalid',
    clinical_decision_note: 'Synthetic panel approval.',
    conditional_terms: null,
    licenses: [
      {
        id: '11111111-1111-4111-8111-111111111101',
        state: 'TX',
        license_number: SYNTH_SENTINELS.license_number,
        expires_on: '2027-08-01',
        status: 'active',
        primary_source_verified_at: '2026-02-18',
        primary_source_method: 'state_board_stub',
        primary_source_result: 'clear',
        evidence_storage_key: `physicians/${ADA_ID}/license-tx.pdf`,
      },
    ],
    board_certifications: [
      {
        id: '11111111-1111-4111-8111-111111111102',
        board_name: 'Synthetic Board of Orthopaedic Surgery',
        specialty: 'orthopedic_surgery',
        certified_on: '2018-06-01',
        expires_on: '2028-06-01',
        status: 'active',
        evidence_storage_key: null,
      },
    ],
    sanctions: [
      {
        id: '11111111-1111-4111-8111-111111111103',
        source: 'oig_leie',
        screened_at: '2026-02-18',
        result: 'clear',
        finding_summary: SYNTH_SENTINELS.finding_summary,
        evidence_storage_key: null,
        live_call: false,
      },
      {
        id: '11111111-1111-4111-8111-111111111104',
        source: 'sam',
        screened_at: '2026-02-18',
        result: 'clear',
        finding_summary: 'SAM exclusion screen clear — synthetic stub, no live API',
        evidence_storage_key: null,
        live_call: false,
      },
    ],
    clinical_experience: [
      {
        id: '11111111-1111-4111-8111-111111111105',
        setting: SYNTH_SENTINELS.experience_setting,
        role_title: 'Attending',
        specialty: 'orthopedic_surgery',
        started_on: '2016-07-01',
        ended_on: null,
        direct_patient_care: true,
        recency_note: 'Current direct care (synthetic).',
      },
    ],
    agreements: [
      {
        id: '11111111-1111-4111-8111-111111111106',
        agreement_type: 'confidentiality',
        title: 'Confidentiality acknowledgment',
        status: 'acknowledged',
        acknowledged_at: '2026-02-01',
        evidence_storage_key: null,
        evidence_link: 'evidence://synthetic/ada/confidentiality',
      },
      {
        id: '11111111-1111-4111-8111-111111111107',
        agreement_type: 'conflict_policy',
        title: 'Conflict policy acknowledgment',
        status: 'acknowledged',
        acknowledged_at: '2026-02-01',
        evidence_storage_key: null,
        evidence_link: null,
      },
      {
        id: '11111111-1111-4111-8111-111111111108',
        agreement_type: 'panel_participation',
        title: 'Panel participation agreement',
        status: 'acknowledged',
        acknowledged_at: '2026-02-01',
        evidence_storage_key: null,
        evidence_link: null,
      },
    ],
    outstanding_items: [],
    events: [],
    evidence: [
      {
        id: '11111111-1111-4111-8111-111111111109',
        physician_id: ADA_ID,
        path: SYNTH_SENTINELS.cv_storage_key,
        label: 'CV',
        kind: 'cv',
        content_type: 'application/pdf',
        created_at: '2026-02-01T00:00:00.000Z',
        created_by: 'thelma@synthetic.invalid',
      },
      {
        id: '11111111-1111-4111-8111-11111111110a',
        physician_id: ADA_ID,
        path: `physicians/${ADA_ID}/contract.pdf`,
        label: SYNTH_SENTINELS.contract_ref,
        kind: 'contract',
        content_type: 'application/pdf',
        created_at: '2026-02-01T00:00:00.000Z',
        created_by: 'thelma@synthetic.invalid',
      },
    ],
  };
}

function luis(): IroPhysician {
  return {
    id: SYNTH_LUIS_ID,
    external_key: 'luis',
    display_name: 'Luis Herrera, MD',
    legal_name: 'Luis M. Herrera',
    email: 'luis.herrera@synthetic.invalid',
    phone: '555-010-1002',
    npi: '1099990002',
    status: 'in_verification',
    specialties: ['cardiology'],
    jurisdictions: ['CA'],
    availability: 'unavailable',
    assignment_status: 'unassigned',
    cv_storage_key: null,
    contract_ref: null,
    notes_hr: null,
    board_cert_waiver: null,
    application_received_at: '2026-09-01',
    recredential_due_at: null,
    approved_at: null,
    approved_expires_at: null,
    verification_completed_at: null,
    verification_completed_by: null,
    clinical_decision_at: null,
    clinical_decision_by: null,
    clinical_decision_note: null,
    conditional_terms: null,
    licenses: [
      {
        id: '22222222-2222-4222-8222-222222222201',
        state: 'CA',
        license_number: 'CA-SYN-88002',
        expires_on: '2026-11-15',
        status: 'active',
        primary_source_verified_at: null,
        primary_source_method: null,
        primary_source_result: null,
        evidence_storage_key: null,
      },
    ],
    board_certifications: [],
    sanctions: [],
    clinical_experience: [],
    agreements: [
      {
        id: '22222222-2222-4222-8222-222222222202',
        agreement_type: 'confidentiality',
        title: 'Confidentiality acknowledgment',
        status: 'outstanding',
        acknowledged_at: null,
        evidence_storage_key: null,
        evidence_link: null,
      },
    ],
    outstanding_items: [
      {
        id: '22222222-2222-4222-8222-222222222203',
        label: SYNTH_SENTINELS.outstanding,
        due_on: '2026-09-15',
        resolved_at: null,
      },
    ],
    events: [],
    evidence: [],
  };
}

function nia(): IroPhysician {
  return {
    id: SYNTH_NIA_ID,
    external_key: 'nia',
    display_name: 'Nia Shah, MD',
    legal_name: 'Nia R. Shah',
    email: 'nia.shah@synthetic.invalid',
    phone: '555-010-1003',
    npi: '1099990003',
    status: 'pending_clinical_approval',
    specialties: ['neurology'],
    jurisdictions: ['TX'],
    availability: 'limited',
    assignment_status: 'hold',
    cv_storage_key: `physicians/${SYNTH_NIA_ID}/cv-synthetic.pdf`,
    contract_ref: SYNTH_SENTINELS.nia_contract,
    notes_hr: 'HR-only note SYN-COMP-NIA',
    board_cert_waiver: null,
    application_received_at: '2026-08-01',
    recredential_due_at: '2028-08-01',
    approved_at: null,
    approved_expires_at: null,
    verification_completed_at: '2026-09-20T00:00:00.000Z',
    verification_completed_by: 'thelma@synthetic.invalid',
    clinical_decision_at: null,
    clinical_decision_by: null,
    clinical_decision_note: null,
    conditional_terms: null,
    licenses: [
      {
        id: '33333333-3333-4333-8333-333333333301',
        state: 'TX',
        license_number: 'TX-SYN-77003',
        expires_on: '2028-01-01',
        status: 'active',
        primary_source_verified_at: '2026-09-18',
        primary_source_method: 'state_board_stub',
        primary_source_result: 'clear',
        evidence_storage_key: null,
      },
    ],
    board_certifications: [
      {
        id: '33333333-3333-4333-8333-333333333302',
        board_name: 'Synthetic Board of Psychiatry and Neurology',
        specialty: 'neurology',
        certified_on: '2019-01-01',
        expires_on: '2029-01-01',
        status: 'active',
        evidence_storage_key: null,
      },
    ],
    sanctions: [
      {
        id: '33333333-3333-4333-8333-333333333303',
        source: 'oig_leie',
        screened_at: '2026-09-18',
        result: 'clear',
        finding_summary: 'OIG stub clear for Nia Shah',
        evidence_storage_key: null,
        live_call: false,
      },
      {
        id: '33333333-3333-4333-8333-333333333304',
        source: 'sam',
        screened_at: '2026-09-18',
        result: 'clear',
        finding_summary: 'SAM stub clear for Nia Shah',
        evidence_storage_key: null,
        live_call: false,
      },
    ],
    clinical_experience: [
      {
        id: '33333333-3333-4333-8333-333333333305',
        setting: 'Synthetic Neurology Clinic',
        role_title: 'Attending',
        specialty: 'neurology',
        started_on: '2019-02-01',
        ended_on: null,
        direct_patient_care: true,
        recency_note: 'Current (synthetic).',
      },
    ],
    agreements: [
      {
        id: '33333333-3333-4333-8333-333333333306',
        agreement_type: 'confidentiality',
        title: 'Confidentiality acknowledgment',
        status: 'acknowledged',
        acknowledged_at: '2026-09-01',
        evidence_storage_key: null,
        evidence_link: null,
      },
      {
        id: '33333333-3333-4333-8333-333333333307',
        agreement_type: 'conflict_policy',
        title: 'Conflict policy acknowledgment',
        status: 'acknowledged',
        acknowledged_at: '2026-09-01',
        evidence_storage_key: null,
        evidence_link: null,
      },
      {
        id: '33333333-3333-4333-8333-333333333308',
        agreement_type: 'panel_participation',
        title: 'Panel participation agreement',
        status: 'acknowledged',
        acknowledged_at: '2026-09-01',
        evidence_storage_key: null,
        evidence_link: null,
      },
    ],
    outstanding_items: [],
    events: [],
    evidence: [
      {
        id: '33333333-3333-4333-8333-333333333309',
        physician_id: SYNTH_NIA_ID,
        path: `physicians/${SYNTH_NIA_ID}/contract.pdf`,
        label: SYNTH_SENTINELS.nia_contract,
        kind: 'contract',
        content_type: 'application/pdf',
        created_at: '2026-09-01T00:00:00.000Z',
        created_by: 'thelma@synthetic.invalid',
      },
    ],
  };
}

export interface IroMemorySnapshot {
  settings: IroSettings;
  physicians: IroPhysician[];
  reminders: IroReminder[];
  cases: IroCaseReview[];
  attestations: IroAttestation[];
}

export function syntheticIroSnapshot(): IroMemorySnapshot {
  return {
    settings: {
      iro_line_contract: false,
      cutover_gate: 'closed',
      workspace_tested: false,
      transferred_records_checked: false,
      access_permissions_confirmed: false,
    },
    physicians: [ada(), luis(), nia()],
    reminders: [],
    cases: [
      {
        case_ref: SYNTH_CASE_REF,
        required_specialty: 'orthopedic_surgery',
        required_jurisdiction: 'TX',
        assigned_physician_id: null,
        assignment_state: 'unassigned',
        completed_at: null,
      },
    ],
    attestations: [],
  };
}
