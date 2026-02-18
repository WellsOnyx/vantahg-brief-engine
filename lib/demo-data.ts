import type { Case, Reviewer, Client, AuditLogEntry, AIBrief } from './types';

// ============================================================================
// DEMO IDs - Stable UUIDs for cross-referencing
// ============================================================================

export const DEMO_REVIEWER_IDS = {
  morales: 'rev-001-patricia-morales',
  chang: 'rev-002-michael-chang',
  blackwell: 'rev-003-sarah-blackwell',
} as const;

export const DEMO_CLIENT_IDS = {
  deltaDental: 'cli-001-delta-dental-az',
  guardian: 'cli-002-guardian-life',
  cigna: 'cli-003-cigna-dental',
} as const;

export const DEMO_CASE_IDS = {
  implant: 'case-001-implant-d6010',
  ortho: 'case-002-ortho-d8080',
  srp: 'case-003-srp-d4260',
  extraction: 'case-004-extraction-d7240',
  sedation: 'case-005-sedation-d9222',
  crownLengthening: 'case-006-crown-lengthening-d4249',
} as const;

// ============================================================================
// Helper: relative dates from "now" for realistic timestamps
// ============================================================================

function daysAgo(days: number, hours = 0, minutes = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hours, d.getMinutes() - minutes, 0, 0);
  return d.toISOString();
}

// ============================================================================
// REVIEWERS
// ============================================================================

export const demoReviewers: Reviewer[] = [
  {
    id: DEMO_REVIEWER_IDS.morales,
    created_at: '2024-03-15T08:00:00.000Z',
    name: 'Dr. Patricia Morales',
    credentials: 'DMD',
    specialty: 'Periodontics',
    license_state: ['AZ', 'CA', 'NV'],
    email: 'p.morales@vantahg.com',
    phone: '(602) 555-0147',
    status: 'active',
    cases_completed: 847,
    avg_turnaround_hours: 4.2,
  },
  {
    id: DEMO_REVIEWER_IDS.chang,
    created_at: '2024-01-10T08:00:00.000Z',
    name: 'Dr. Michael Chang',
    credentials: 'DDS',
    specialty: 'Oral Surgery',
    license_state: ['AZ', 'TX', 'CO'],
    email: 'm.chang@vantahg.com',
    phone: '(480) 555-0293',
    status: 'active',
    cases_completed: 1203,
    avg_turnaround_hours: 3.8,
  },
  {
    id: DEMO_REVIEWER_IDS.blackwell,
    created_at: '2024-06-01T08:00:00.000Z',
    name: 'Dr. Sarah Blackwell',
    credentials: 'DMD',
    specialty: 'Orthodontics',
    license_state: ['AZ', 'CA'],
    email: 's.blackwell@vantahg.com',
    phone: '(520) 555-0381',
    status: 'active',
    cases_completed: 632,
    avg_turnaround_hours: 5.1,
  },
];

// ============================================================================
// CLIENTS
// ============================================================================

export const demoClients: Client[] = [
  {
    id: DEMO_CLIENT_IDS.deltaDental,
    created_at: '2024-02-01T08:00:00.000Z',
    name: 'Delta Dental of Arizona',
    type: 'dental_plan',
    contact_name: 'Jennifer Hawkins',
    contact_email: 'j.hawkins@deltadentalaz.com',
    contact_phone: '(602) 555-0200',
  },
  {
    id: DEMO_CLIENT_IDS.guardian,
    created_at: '2025-01-15T08:00:00.000Z',
    name: 'Guardian Life Insurance',
    type: 'health_plan',
    contact_name: 'Mark Ellison',
    contact_email: 'm.ellison@guardianlife.com',
    contact_phone: '(212) 555-0415',
  },
  {
    id: DEMO_CLIENT_IDS.cigna,
    created_at: '2025-02-01T08:00:00.000Z',
    name: 'Cigna Dental Plans',
    type: 'dental_plan',
    contact_name: 'Lisa Tran',
    contact_email: 'l.tran@cigna.com',
    contact_phone: '(860) 555-0178',
  },
];

// ============================================================================
// AI BRIEFS - Realistic clinical content for each case
// ============================================================================

const implantBrief: AIBrief = {
  clinical_question:
    'Is endosseous implant placement at site #14 medically necessary given the documented clinical presentation and proposed treatment plan?',
  patient_summary:
    'Maria Santos is a 47-year-old female presenting with a missing upper left first premolar (#14) following extraction 8 months prior due to vertical root fracture. The patient reports difficulty with mastication on the left side and has declined a removable partial denture. Medical history is unremarkable with no contraindications to implant surgery. Non-smoker, no history of uncontrolled diabetes or immunosuppressive therapy.',
  procedure_analysis: {
    codes: ['D6010 - Endosseous implant body'],
    clinical_rationale:
      'The requesting provider has documented that the edentulous site at #14 presents with adequate ridge width (>6mm) and vertical bone height (>10mm) as confirmed on CBCT imaging dated 2 weeks prior. Adjacent teeth #13 and #15 are intact and unrestored, making a fixed bridge an unnecessarily invasive alternative that would require preparation of two virgin teeth.',
    complexity_level: 'moderate',
  },
  criteria_match: {
    applicable_guideline:
      'ADA/AAOMS Guidelines for Dental Implant Placement; Delta Dental Clinical Policy Bulletin: Endosseous Implants (2024)',
    criteria_met: [
      'Adequate bone volume confirmed by CBCT imaging (ridge width >6mm, vertical height >10mm)',
      'Adjacent teeth are intact and unrestored, making fixed bridge an inferior alternative',
      'Patient is an adult with completed skeletal growth',
      'No active periodontal disease - most recent perio charting shows probing depths 2-3mm throughout',
      'No uncontrolled systemic conditions (diabetes HbA1c 5.4%, no immunosuppression)',
      'Tooth has been missing >4 months with documented extraction history',
    ],
    criteria_not_met: [],
    criteria_unable_to_assess: [
      'Long-term maintenance plan and prosthetic phase timeline not detailed in submitted records',
    ],
  },
  documentation_review: {
    documents_provided:
      'Panoramic radiograph, CBCT scan with cross-sectional views, periodontal charting, medical history form, clinical photographs, and narrative letter of medical necessity from requesting provider',
    key_findings: [
      'CBCT confirms Class I ridge morphology at site #14 with adequate dimensions for standard-diameter implant',
      'Periodontal charting dated within 30 days shows generalized probing depths of 2-3mm with no bleeding on probing',
      'Clinical photographs confirm healed extraction site with adequate keratinized tissue',
      'Provider narrative documents functional impairment and rationale for implant over alternative prosthetic options',
    ],
    missing_documentation: [
      'Surgical treatment plan with implant system specifications',
    ],
  },
  ai_recommendation: {
    recommendation: 'approve',
    confidence: 'high',
    rationale:
      'All primary criteria for endosseous implant placement are met. Clinical documentation is thorough, imaging confirms adequate bone for implant placement, and the functional indication is well-supported. Adjacent intact teeth make a bridge a less conservative option. No contraindications identified.',
    key_considerations: [
      'Confirm CBCT measurements support the planned implant diameter and length',
      'Verify that the prosthetic restoration phase (D6065) will be submitted as a separate authorization',
      'Note that the provider has documented functional impairment rather than purely cosmetic indication',
    ],
  },
  reviewer_action: {
    decision_required:
      'Confirm medical necessity for implant placement at site #14 based on clinical documentation and imaging findings',
    time_sensitivity:
      'Standard 15-day turnaround per Delta Dental PA requirements; case received within contractual window',
    peer_to_peer_suggested: false,
    additional_info_needed: [
      'Implant system specification and surgical plan may be requested but is not required for PA determination',
    ],
  },
};

const orthoBrief: AIBrief = {
  clinical_question:
    'Does this adolescent patient meet medical necessity criteria for comprehensive orthodontic treatment based on documented malocclusion severity?',
  patient_summary:
    'James Chen is a 16-year-old male presenting with Class II Division 1 malocclusion with an overjet of 9mm, deep overbite (85% overlap), and moderate crowding in both arches. The patient has completed pubertal growth as evidenced by hand-wrist radiograph showing closed epiphyseal plates. No prior orthodontic treatment. No relevant medical history or craniofacial anomalies.',
  procedure_analysis: {
    codes: ['D8080 - Comprehensive orthodontic treatment, adolescent dentition'],
    clinical_rationale:
      'The requesting orthodontist has documented a handicapping malocclusion with functional implications including traumatic anterior bite relationship, difficulty with incision of food, and Class II molar relationship bilaterally. The Handicapping Labiolingual Deviation (HLD) index score is calculated at 31, which exceeds the plan threshold of 26 for medical necessity.',
    complexity_level: 'moderate',
  },
  criteria_match: {
    applicable_guideline:
      'Guardian Life Orthodontic Coverage Criteria (2025); AAO Guidelines for Medically Necessary Orthodontic Treatment',
    criteria_met: [
      'Handicapping malocclusion documented with HLD score of 31 (threshold: 26)',
      'Cephalometric analysis provided with ANB angle of 7 degrees confirming skeletal Class II relationship',
      'Treatment plan submitted with estimated duration of 24 months',
      'Patient age and growth status documented (16 years, post-pubertal per hand-wrist radiograph)',
      'Functional impairment documented: traumatic overbite, difficulty with incision',
    ],
    criteria_not_met: [],
    criteria_unable_to_assess: [
      'Verification of HLD scoring methodology - reviewer should confirm calculation against submitted records',
    ],
  },
  documentation_review: {
    documents_provided:
      'Panoramic radiograph, lateral cephalometric radiograph with tracing, hand-wrist radiograph, dental models/digital scans, intraoral and extraoral photographs, HLD scoring sheet, and treatment plan with timeline',
    key_findings: [
      'Cephalometric analysis confirms skeletal Class II pattern (ANB 7 degrees, SNA 83, SNB 76)',
      'Overjet measured at 9mm on clinical examination and confirmed on lateral cephalogram',
      'Model analysis shows 7mm of crowding in the maxillary arch and 5mm in the mandibular arch',
      'HLD index score of 31 documented with supporting measurements; score is above the threshold of 26 for medical necessity',
      'Hand-wrist radiograph confirms skeletal maturity (Risser stage 4-5)',
    ],
    missing_documentation: [],
  },
  ai_recommendation: {
    recommendation: 'approve',
    confidence: 'high',
    rationale:
      'The patient presents with a well-documented handicapping malocclusion with an HLD score exceeding the plan threshold. Comprehensive records including cephalometric analysis, study models, and growth assessment have been provided. Functional impairment is documented. All primary orthodontic authorization criteria appear to be met.',
    key_considerations: [
      'Verify HLD scoring calculations independently against the submitted measurement data',
      'Confirm that the proposed 24-month treatment duration is consistent with the documented complexity',
      'Note that this is an initial treatment request with no prior orthodontic history',
    ],
  },
  reviewer_action: {
    decision_required:
      'Validate HLD score calculation and confirm that the documented malocclusion meets the plan definition of handicapping malocclusion requiring treatment',
    time_sensitivity:
      'Standard 30-day turnaround per Guardian Life orthodontic PA policy; treatment is elective and non-emergent',
    peer_to_peer_suggested: false,
    additional_info_needed: [],
  },
};

const srpBrief: AIBrief = {
  clinical_question:
    'Does this patient meet clinical criteria for osseous surgery (D4260) in the mandibular right quadrant based on periodontal disease severity and prior treatment history?',
  patient_summary:
    'Robert Williams is a 59-year-old male with a diagnosis of generalized chronic periodontitis (Stage III, Grade B) presenting for osseous surgery in the mandibular right quadrant (teeth #28-31). The patient has a history of type 2 diabetes (controlled, HbA1c 6.8%) and a 15-year smoking history with cessation 3 years ago. He completed scaling and root planing in all four quadrants approximately 5 months ago with documented incomplete resolution of periodontal pockets in the mandibular right quadrant.',
  procedure_analysis: {
    codes: ['D4260 - Osseous surgery, four or more contiguous teeth per quadrant'],
    clinical_rationale:
      'The requesting periodontist documents persistent probing depths of 6-8mm at sites #28-31 despite completion of initial non-surgical periodontal therapy (SRP) and two subsequent maintenance visits. The provider notes radiographic evidence of moderate to severe horizontal bone loss with localized vertical defects at #29 and #30.',
    complexity_level: 'complex',
  },
  criteria_match: {
    applicable_guideline:
      'AAP Clinical Practice Guidelines for Periodontal Surgery; Cigna Dental Clinical Policy: Osseous Surgery (2024)',
    criteria_met: [
      'Probing depths >=5mm documented at multiple sites (#28: 6mm, #29: 7mm distolingual, #30: 8mm mesial, #31: 6mm)',
      'Bone loss confirmed on radiographs (horizontal loss with vertical defects at #29 and #30)',
      'Non-surgical treatment (SRP) attempted 5 months prior with documented incomplete response',
      'Comprehensive periodontal charting provided within 30 days of request',
    ],
    criteria_not_met: [
      'Documentation of compliance with oral hygiene instructions and home care regimen is limited',
    ],
    criteria_unable_to_assess: [
      'Post-SRP re-evaluation charting is present but comparison to baseline is unclear - reviewer should verify probing depth changes from pre-SRP to post-SRP',
      'Smoking cessation duration of 3 years noted but not independently verified',
    ],
  },
  documentation_review: {
    documents_provided:
      'Full-mouth periapical radiograph series, periodontal charting (baseline and post-SRP), narrative report from periodontist, treatment history documentation, and medical history with HbA1c laboratory results',
    key_findings: [
      'Post-SRP re-evaluation shows persistent 6-8mm probing depths in mandibular right quadrant despite initial therapy',
      'Periapical radiographs demonstrate moderate horizontal bone loss with 2-3 wall vertical defects at #29D and #30M',
      'Bleeding on probing present at 60% of sites in the affected quadrant',
      'HbA1c of 6.8% indicates controlled diabetes, within acceptable range for surgical intervention',
      'Two periodontal maintenance visits documented since SRP with continued pocket depth concerns',
    ],
    missing_documentation: [
      'Pre-SRP baseline charting for direct comparison to post-SRP measurements',
      'Documentation of patient compliance with prescribed oral hygiene regimen',
      'Written confirmation of smoking cessation status',
    ],
  },
  ai_recommendation: {
    recommendation: 'approve',
    confidence: 'medium',
    rationale:
      'The clinical presentation supports medical necessity for osseous surgery given persistent probing depths and bone loss after non-surgical intervention. However, the case would be strengthened by documentation of pre-SRP baseline comparison and patient compliance with home care. The missing documentation items are noteworthy but do not in themselves contraindicate the procedure.',
    key_considerations: [
      'Evaluate whether the post-SRP probing depths represent a true non-response or whether additional SRP/maintenance cycles should be attempted',
      'Consider the impact of controlled diabetes (HbA1c 6.8%) on surgical healing prognosis',
      'Assess whether the 5-month interval between SRP and surgery request is adequate to determine non-response',
      'Note missing baseline comparison - the reviewer should determine if this is a critical gap',
    ],
  },
  reviewer_action: {
    decision_required:
      'Determine if the documented failure of non-surgical therapy is sufficient to justify osseous surgery, considering the gaps in baseline comparison documentation',
    time_sensitivity:
      'Standard 15-day turnaround per Cigna PA policy; progressive bone loss may be occurring but condition is not emergent',
    peer_to_peer_suggested: false,
    additional_info_needed: [
      'Pre-SRP baseline periodontal charting for direct comparison',
      'Documentation of patient oral hygiene compliance and home care instruction',
    ],
  },
};

const sedationBrief: AIBrief = {
  clinical_question:
    'Is deep sedation/general anesthesia (D9222) medically necessary for this adult patient undergoing a single restorative procedure?',
  patient_summary:
    'David Park is a 40-year-old male requesting deep sedation/general anesthesia for a single posterior crown preparation (tooth #19). The patient cites severe dental anxiety as the primary indication. Medical history is unremarkable with no documented cognitive, behavioral, or physical disability. No prior record of failed treatment under local anesthesia. ASA classification is ASA I (healthy patient).',
  procedure_analysis: {
    codes: ['D9222 - Deep sedation/general anesthesia, first 15 minutes'],
    clinical_rationale:
      'The requesting provider has submitted a prior authorization for IV sedation/general anesthesia to manage patient anxiety during a single crown preparation. The provider narrative states the patient has "severe dental phobia" but does not document a diagnosed anxiety disorder, prior sedation attempts, or failed local anesthesia attempts.',
    complexity_level: 'routine',
  },
  criteria_match: {
    applicable_guideline:
      'ADA Guidelines for the Use of Sedation and General Anesthesia; Delta Dental Clinical Policy: Deep Sedation/General Anesthesia (2024)',
    criteria_met: [],
    criteria_not_met: [
      'Patient does not meet age criteria (not under age 7)',
      'No documented behavioral, cognitive, or physical disability',
      'No evidence of failed attempt at treatment under local anesthesia',
      'Single routine procedure does not require extended chair time to justify GA',
      'ASA I classification does not indicate a medical condition requiring GA',
    ],
    criteria_unable_to_assess: [
      'Whether the patient has a formally diagnosed dental phobia or anxiety disorder (e.g., DSM-5 specific phobia) that would constitute a qualifying condition',
    ],
  },
  documentation_review: {
    documents_provided:
      'Treatment plan for crown preparation #19, medical history form, narrative letter from requesting provider, and patient intake questionnaire noting dental anxiety',
    key_findings: [
      'Provider narrative references "severe dental phobia" but no formal psychiatric or psychological diagnosis is documented',
      'Medical history form shows ASA I status with no significant medical conditions',
      'No documentation of prior dental visits with failed treatment under local anesthesia or moderate sedation',
      'Planned procedure is a single crown preparation, estimated at 45-60 minutes of chair time',
    ],
    missing_documentation: [
      'Documentation of failed previous dental treatment under local anesthesia',
      'Formal diagnosis of dental phobia or anxiety disorder from a qualified provider',
      'ASA classification justification if requesting GA for a medical indication',
      'Documentation of why moderate sedation (nitrous oxide or oral conscious sedation) is insufficient',
    ],
  },
  ai_recommendation: {
    recommendation: 'deny',
    confidence: 'medium',
    rationale:
      'Based on the submitted documentation, the primary criteria for deep sedation/general anesthesia are not met. The patient is an otherwise healthy adult (ASA I) undergoing a single routine restorative procedure. No documented disability, failed local anesthesia attempt, or medical condition necessitating GA has been provided. Self-reported dental anxiety alone, without a formal diagnosis or documentation of failed alternative approaches, does not typically meet medical necessity criteria per plan policy.',
    key_considerations: [
      'A peer-to-peer consultation may clarify whether the provider has additional clinical justification not captured in the submitted documentation',
      'If the patient has a formally diagnosed specific phobia (dental), this may qualify under disability criteria in some plan interpretations',
      'The provider should be informed that moderate sedation alternatives (D9230, D9239) may be covered and could address the patient anxiety concern',
      'Denial should include information about the appeals process and option to submit additional documentation',
    ],
  },
  reviewer_action: {
    decision_required:
      'Determine whether the patient meets any qualifying criteria for deep sedation/general anesthesia, considering the limited documentation of medical necessity',
    time_sensitivity:
      'Standard 15-day turnaround; procedure is elective and non-emergent. P2P should be offered within 5 business days of determination if denied.',
    peer_to_peer_suggested: true,
    additional_info_needed: [
      'Formal psychological/psychiatric evaluation documenting dental phobia diagnosis',
      'Documentation of failed treatment attempts under local anesthesia or moderate sedation',
      'Clinical rationale for why moderate sedation alternatives are inadequate',
    ],
  },
};

const crownLengtheningBrief: AIBrief = {
  clinical_question:
    'Is surgical crown lengthening (D4249) at site #12 medically necessary to establish adequate ferrule and biologic width for a definitive restoration?',
  patient_summary:
    'Sarah Mitchell is a 53-year-old female presenting for crown lengthening at tooth #12 (upper left first premolar). The tooth has a fractured lingual cusp with the fracture line extending 2mm subgingivally. The requesting provider indicates that a definitive restoration (full coverage crown) cannot be placed without surgical crown lengthening to expose adequate sound tooth structure and establish a minimum 4mm supracrestal tissue attachment. Patient medical history includes well-controlled hypothyroidism (levothyroxine 75mcg daily) and no contraindications to periodontal surgery.',
  procedure_analysis: {
    codes: ['D4249 - Clinical crown lengthening, hard tissue'],
    clinical_rationale:
      'The requesting periodontist documents a subgingival fracture at tooth #12 that violates biologic width. The current supracrestal tooth structure is insufficient for ferrule effect, which is essential for long-term crown retention. Osseous recontouring is planned to provide 4mm of supracrestal attachment and 2mm of ferrule for crown margins.',
    complexity_level: 'moderate',
  },
  criteria_match: {
    applicable_guideline:
      'AAP Position Paper on Crown Lengthening (2023); Guardian Life Periodontic Coverage Criteria for Crown Lengthening',
    criteria_met: [
      'Subgingival fracture documented with 2mm extension below the gingival margin',
      'Biologic width violation present, precluding placement of restoration margins in healthy tissue',
      'Tooth is restorable with adequate root length for crown lengthening and subsequent restoration',
      'Periodontally sound adjacent teeth that will not be compromised by osseous recontouring',
      'Medical history does not contraindicate periodontal surgery',
    ],
    criteria_not_met: [],
    criteria_unable_to_assess: [
      'Root length-to-crown ratio after planned osseous resection - periapical radiograph is provided but specific measurements are not documented in the narrative',
      'Proximity to the maxillary sinus floor at site #12',
    ],
  },
  documentation_review: {
    documents_provided:
      'Periapical radiograph of #12, clinical photographs showing fracture, periodontal charting, provider narrative with surgical plan, medical history form, and referral letter from restorative dentist',
    key_findings: [
      'Clinical photographs clearly demonstrate lingual cusp fracture with subgingival extension',
      'Periapical radiograph shows adequate root length for crown lengthening (estimated 16mm root, 4mm planned resection)',
      'Periodontal charting shows probing depths of 2-3mm around #12 with no attachment loss, indicating localized surgical need',
      'Referral letter from restorative dentist confirms inability to place crown margins on sound tooth structure without crown lengthening',
      'Provider narrative outlines planned osseous resection of 3-4mm on the lingual and interproximal aspects',
    ],
    missing_documentation: [
      'Explicit post-operative crown-to-root ratio calculation',
      'CBCT or additional imaging to confirm sinus floor proximity at #12',
    ],
  },
  ai_recommendation: {
    recommendation: 'approve',
    confidence: 'high',
    rationale:
      'Clinical documentation supports the medical necessity of crown lengthening at #12. The subgingival fracture precludes definitive restoration without surgical intervention, and the tooth appears to have adequate root structure for the planned procedure. Documentation is comprehensive with clinical photographs, radiograph, and a corroborating referral from the restorative dentist.',
    key_considerations: [
      'Verify on the periapical radiograph that the crown-to-root ratio after planned 3-4mm osseous resection will remain favorable (at least 1:1)',
      'Consider whether the proximity to adjacent tooth #11 root may be affected by interproximal osseous recontouring',
      'Confirm that the restorative treatment plan (crown placement) will proceed within the appropriate healing window post-surgery',
    ],
  },
  reviewer_action: {
    decision_required:
      'Confirm that the radiographic anatomy supports the planned osseous resection without compromising the tooth prognosis or adjacent structures',
    time_sensitivity:
      'Standard 15-day turnaround per Guardian Life PA requirements; tooth has a temporary restoration in place that should not remain long-term',
    peer_to_peer_suggested: false,
    additional_info_needed: [
      'Post-operative crown-to-root ratio projection',
    ],
  },
};

// ============================================================================
// CASES - Fully populated with joined reviewer/client data and AI briefs
// ============================================================================

export const demoCases: Case[] = [
  // CASE 1: Implant - Completed, Approved
  {
    id: DEMO_CASE_IDS.implant,
    created_at: daysAgo(6, 14),
    updated_at: daysAgo(1, 8),
    case_number: 'VHG-DENTAL-0147',
    status: 'determination_made',
    priority: 'standard',
    vertical: 'dental',
    patient_name: 'Maria Santos',
    patient_dob: '1978-03-15',
    patient_member_id: 'DDA-882910475',
    requesting_provider: 'Dr. Alan Fitzgerald',
    requesting_provider_npi: '1234567890',
    procedure_codes: ['D6010'],
    diagnosis_codes: ['K08.1', 'M26.30'],
    procedure_description: 'Endosseous implant placement at site #14, upper left first premolar',
    clinical_question: 'Is implant placement medically necessary at site #14 given documented bone volume and adjacent tooth condition?',
    assigned_reviewer_id: DEMO_REVIEWER_IDS.morales,
    review_type: 'prior_auth',
    payer_name: 'Delta Dental of Arizona',
    plan_type: 'PPO',
    ai_brief: implantBrief,
    ai_brief_generated_at: daysAgo(6, 12),
    determination: 'approve',
    determination_rationale: 'All clinical criteria met. CBCT confirms adequate bone dimensions. Implant placement is the most conservative treatment option given intact adjacent teeth. Functional impairment is well-documented. Approved per Delta Dental PA policy.',
    determination_at: daysAgo(1, 8),
    determined_by: DEMO_REVIEWER_IDS.morales,
    submitted_documents: ['panoramic_radiograph.dcm', 'cbct_scan.dcm', 'periodontal_charting.pdf', 'clinical_photographs.zip', 'provider_narrative.pdf', 'medical_history.pdf'],
    client_id: DEMO_CLIENT_IDS.deltaDental,
    reviewer: demoReviewers[0],
    client: demoClients[0],
  },

  // CASE 2: Orthodontic Treatment - In Review
  {
    id: DEMO_CASE_IDS.ortho,
    created_at: daysAgo(4, 10),
    updated_at: daysAgo(1, 3),
    case_number: 'VHG-DENTAL-0148',
    status: 'in_review',
    priority: 'standard',
    vertical: 'dental',
    patient_name: 'James Chen',
    patient_dob: '2009-06-22',
    patient_member_id: 'GLI-441209887',
    requesting_provider: 'Dr. Rebecca Nolan',
    requesting_provider_npi: '9876543210',
    procedure_codes: ['D8080'],
    diagnosis_codes: ['M26.212', 'M26.29', 'K07.3'],
    procedure_description: 'Comprehensive orthodontic treatment, adolescent dentition - Class II Division 1 malocclusion with severe overjet',
    clinical_question: 'Does this patient meet HLD threshold for medically necessary orthodontic treatment?',
    assigned_reviewer_id: DEMO_REVIEWER_IDS.blackwell,
    review_type: 'prior_auth',
    payer_name: 'Guardian Life Insurance',
    plan_type: 'DHMO',
    ai_brief: orthoBrief,
    ai_brief_generated_at: daysAgo(4, 8),
    determination: null,
    determination_rationale: null,
    determination_at: null,
    determined_by: null,
    submitted_documents: ['panoramic_radiograph.dcm', 'lateral_cephalogram.dcm', 'hand_wrist_radiograph.dcm', 'dental_models_scan.stl', 'intraoral_photos.zip', 'extraoral_photos.zip', 'hld_scoring_sheet.pdf', 'treatment_plan.pdf'],
    client_id: DEMO_CLIENT_IDS.guardian,
    reviewer: demoReviewers[2],
    client: demoClients[1],
  },

  // CASE 3: Scaling & Root Planing / Osseous Surgery - Pending Review
  {
    id: DEMO_CASE_IDS.srp,
    created_at: daysAgo(3, 6),
    updated_at: daysAgo(0, 12),
    case_number: 'VHG-DENTAL-0149',
    status: 'brief_ready',
    priority: 'standard',
    vertical: 'dental',
    patient_name: 'Robert Williams',
    patient_dob: '1965-11-08',
    patient_member_id: 'CIG-330198722',
    requesting_provider: 'Dr. Maria Vasilyev',
    requesting_provider_npi: '5678901234',
    procedure_codes: ['D4260'],
    diagnosis_codes: ['K05.31', 'E11.65'],
    procedure_description: 'Osseous surgery, four or more contiguous teeth, mandibular right quadrant (#28-31)',
    clinical_question: 'Has conservative therapy failed sufficiently to justify osseous surgery in the mandibular right quadrant?',
    assigned_reviewer_id: null,
    review_type: 'prior_auth',
    payer_name: 'Cigna Dental Plans',
    plan_type: 'PPO',
    ai_brief: srpBrief,
    ai_brief_generated_at: daysAgo(3, 4),
    determination: null,
    determination_rationale: null,
    determination_at: null,
    determined_by: null,
    submitted_documents: ['full_mouth_periapicals.dcm', 'periodontal_charting_baseline.pdf', 'periodontal_charting_reeval.pdf', 'periodontist_narrative.pdf', 'treatment_history.pdf', 'medical_history_hba1c.pdf'],
    client_id: DEMO_CLIENT_IDS.cigna,
    reviewer: undefined,
    client: demoClients[2],
  },

  // CASE 4: Surgical Extraction - Just Submitted
  {
    id: DEMO_CASE_IDS.extraction,
    created_at: daysAgo(0, 4),
    updated_at: daysAgo(0, 4),
    case_number: 'VHG-DENTAL-0150',
    status: 'intake',
    priority: 'urgent',
    vertical: 'dental',
    patient_name: 'Angela Thompson',
    patient_dob: '1990-04-20',
    patient_member_id: 'DDA-552740118',
    requesting_provider: 'Dr. James Okonkwo',
    requesting_provider_npi: '3456789012',
    procedure_codes: ['D7240'],
    diagnosis_codes: ['K01.1', 'K04.01'],
    procedure_description: 'Surgical extraction of completely bony impacted tooth #32 with acute pericoronitis',
    clinical_question: 'Is surgical extraction of impacted #32 medically necessary given clinical presentation of acute pericoronitis?',
    assigned_reviewer_id: null,
    review_type: 'prior_auth',
    payer_name: 'Delta Dental of Arizona',
    plan_type: 'PPO',
    ai_brief: null,
    ai_brief_generated_at: null,
    determination: null,
    determination_rationale: null,
    determination_at: null,
    determined_by: null,
    submitted_documents: ['panoramic_radiograph.dcm', 'referral_letter.pdf'],
    client_id: DEMO_CLIENT_IDS.deltaDental,
    reviewer: undefined,
    client: demoClients[0],
  },

  // CASE 5: IV Sedation - Completed, Denied
  {
    id: DEMO_CASE_IDS.sedation,
    created_at: daysAgo(5, 11),
    updated_at: daysAgo(2, 6),
    case_number: 'VHG-DENTAL-0145',
    status: 'determination_made',
    priority: 'standard',
    vertical: 'dental',
    patient_name: 'David Park',
    patient_dob: '1985-09-12',
    patient_member_id: 'DDA-771093246',
    requesting_provider: 'Dr. Steven Hadid',
    requesting_provider_npi: '7890123456',
    procedure_codes: ['D9222'],
    diagnosis_codes: ['F40.10'],
    procedure_description: 'Deep sedation/general anesthesia for crown preparation #19 - patient reports severe dental anxiety',
    clinical_question: 'Is deep sedation/general anesthesia medically necessary for a single restorative procedure in this otherwise healthy adult patient?',
    assigned_reviewer_id: DEMO_REVIEWER_IDS.chang,
    review_type: 'prior_auth',
    payer_name: 'Delta Dental of Arizona',
    plan_type: 'PPO',
    ai_brief: sedationBrief,
    ai_brief_generated_at: daysAgo(5, 9),
    determination: 'deny',
    determination_rationale: 'Medical necessity for deep sedation/general anesthesia is not established based on submitted documentation. The patient is an otherwise healthy adult (ASA I) undergoing a single routine restorative procedure. No prior failed attempts at treatment under local anesthesia or moderate sedation are documented. Self-reported dental anxiety without a formal diagnosis does not meet plan criteria. Peer-to-peer consultation has been offered to the requesting provider. The patient may consider moderate sedation alternatives (D9230, D9239) which may be covered under the plan.',
    determination_at: daysAgo(2, 6),
    determined_by: DEMO_REVIEWER_IDS.chang,
    submitted_documents: ['treatment_plan.pdf', 'medical_history.pdf', 'provider_narrative.pdf', 'patient_intake_form.pdf'],
    client_id: DEMO_CLIENT_IDS.deltaDental,
    reviewer: demoReviewers[1],
    client: demoClients[0],
  },

  // CASE 6: Crown Lengthening - In Review
  {
    id: DEMO_CASE_IDS.crownLengthening,
    created_at: daysAgo(2, 9),
    updated_at: daysAgo(0, 6),
    case_number: 'VHG-DENTAL-0146',
    status: 'in_review',
    priority: 'expedited',
    vertical: 'dental',
    patient_name: 'Sarah Mitchell',
    patient_dob: '1972-07-30',
    patient_member_id: 'GLI-889034156',
    requesting_provider: 'Dr. Alicia Brennan',
    requesting_provider_npi: '2345678901',
    procedure_codes: ['D4249'],
    diagnosis_codes: ['K02.53', 'K08.539'],
    procedure_description: 'Clinical crown lengthening, hard tissue, tooth #12 - subgingival fracture with biologic width violation',
    clinical_question: 'Is crown lengthening at #12 necessary to establish adequate ferrule for definitive restoration given the subgingival fracture?',
    assigned_reviewer_id: DEMO_REVIEWER_IDS.morales,
    review_type: 'prior_auth',
    payer_name: 'Guardian Life Insurance',
    plan_type: 'PPO',
    ai_brief: crownLengtheningBrief,
    ai_brief_generated_at: daysAgo(2, 7),
    determination: null,
    determination_rationale: null,
    determination_at: null,
    determined_by: null,
    submitted_documents: ['periapical_radiograph_12.dcm', 'clinical_photographs.zip', 'periodontal_charting.pdf', 'provider_narrative.pdf', 'medical_history.pdf', 'restorative_referral_letter.pdf'],
    client_id: DEMO_CLIENT_IDS.guardian,
    reviewer: demoReviewers[0],
    client: demoClients[1],
  },
];

// ============================================================================
// AUDIT LOG ENTRIES - Realistic timeline for each case
// ============================================================================

export const demoAuditLog: AuditLogEntry[] = [
  // --- Case 1: Implant (full workflow) ---
  {
    id: 'audit-001-01',
    created_at: daysAgo(6, 14),
    case_id: DEMO_CASE_IDS.implant,
    action: 'case_created',
    actor: 'system',
    details: { case_number: 'VHG-DENTAL-0147', vertical: 'dental', source: 'portal_submission' },
  },
  {
    id: 'audit-001-02',
    created_at: daysAgo(6, 13, 55),
    case_id: DEMO_CASE_IDS.implant,
    action: 'status_changed',
    actor: 'system',
    details: { new_status: 'processing', previous_status: 'intake' },
  },
  {
    id: 'audit-001-03',
    created_at: daysAgo(6, 12),
    case_id: DEMO_CASE_IDS.implant,
    action: 'brief_generated',
    actor: 'system',
    details: { generated_automatically: true, confidence: 'high', recommendation: 'approve' },
  },
  {
    id: 'audit-001-04',
    created_at: daysAgo(6, 11, 50),
    case_id: DEMO_CASE_IDS.implant,
    action: 'status_changed',
    actor: 'system',
    details: { new_status: 'brief_ready', previous_status: 'processing' },
  },
  {
    id: 'audit-001-05',
    created_at: daysAgo(5, 8),
    case_id: DEMO_CASE_IDS.implant,
    action: 'reviewer_assigned',
    actor: 'admin@vantahg.com',
    details: { reviewer_id: DEMO_REVIEWER_IDS.morales, reviewer_name: 'Dr. Patricia Morales' },
  },
  {
    id: 'audit-001-06',
    created_at: daysAgo(5, 8),
    case_id: DEMO_CASE_IDS.implant,
    action: 'status_changed',
    actor: 'admin@vantahg.com',
    details: { new_status: 'in_review', previous_status: 'brief_ready' },
  },
  {
    id: 'audit-001-07',
    created_at: daysAgo(1, 8),
    case_id: DEMO_CASE_IDS.implant,
    action: 'determination_made',
    actor: DEMO_REVIEWER_IDS.morales,
    details: { determination: 'approve', rationale: 'All clinical criteria met. CBCT confirms adequate bone dimensions.' },
  },
  {
    id: 'audit-001-08',
    created_at: daysAgo(1, 8),
    case_id: DEMO_CASE_IDS.implant,
    action: 'status_changed',
    actor: DEMO_REVIEWER_IDS.morales,
    details: { new_status: 'determination_made', previous_status: 'in_review' },
  },

  // --- Case 2: Orthodontic (in review) ---
  {
    id: 'audit-002-01',
    created_at: daysAgo(4, 10),
    case_id: DEMO_CASE_IDS.ortho,
    action: 'case_created',
    actor: 'system',
    details: { case_number: 'VHG-DENTAL-0148', vertical: 'dental', source: 'portal_submission' },
  },
  {
    id: 'audit-002-02',
    created_at: daysAgo(4, 9, 55),
    case_id: DEMO_CASE_IDS.ortho,
    action: 'status_changed',
    actor: 'system',
    details: { new_status: 'processing', previous_status: 'intake' },
  },
  {
    id: 'audit-002-03',
    created_at: daysAgo(4, 8),
    case_id: DEMO_CASE_IDS.ortho,
    action: 'brief_generated',
    actor: 'system',
    details: { generated_automatically: true, confidence: 'high', recommendation: 'approve' },
  },
  {
    id: 'audit-002-04',
    created_at: daysAgo(4, 7, 55),
    case_id: DEMO_CASE_IDS.ortho,
    action: 'status_changed',
    actor: 'system',
    details: { new_status: 'brief_ready', previous_status: 'processing' },
  },
  {
    id: 'audit-002-05',
    created_at: daysAgo(1, 3),
    case_id: DEMO_CASE_IDS.ortho,
    action: 'reviewer_assigned',
    actor: 'admin@vantahg.com',
    details: { reviewer_id: DEMO_REVIEWER_IDS.blackwell, reviewer_name: 'Dr. Sarah Blackwell' },
  },
  {
    id: 'audit-002-06',
    created_at: daysAgo(1, 3),
    case_id: DEMO_CASE_IDS.ortho,
    action: 'status_changed',
    actor: 'admin@vantahg.com',
    details: { new_status: 'in_review', previous_status: 'brief_ready' },
  },

  // --- Case 3: SRP / Osseous Surgery (brief ready, not yet assigned) ---
  {
    id: 'audit-003-01',
    created_at: daysAgo(3, 6),
    case_id: DEMO_CASE_IDS.srp,
    action: 'case_created',
    actor: 'system',
    details: { case_number: 'VHG-DENTAL-0149', vertical: 'dental', source: 'portal_submission' },
  },
  {
    id: 'audit-003-02',
    created_at: daysAgo(3, 5, 55),
    case_id: DEMO_CASE_IDS.srp,
    action: 'status_changed',
    actor: 'system',
    details: { new_status: 'processing', previous_status: 'intake' },
  },
  {
    id: 'audit-003-03',
    created_at: daysAgo(3, 4),
    case_id: DEMO_CASE_IDS.srp,
    action: 'brief_generated',
    actor: 'system',
    details: { generated_automatically: true, confidence: 'medium', recommendation: 'approve' },
  },
  {
    id: 'audit-003-04',
    created_at: daysAgo(3, 3, 55),
    case_id: DEMO_CASE_IDS.srp,
    action: 'status_changed',
    actor: 'system',
    details: { new_status: 'brief_ready', previous_status: 'processing' },
  },

  // --- Case 4: Extraction (just submitted) ---
  {
    id: 'audit-004-01',
    created_at: daysAgo(0, 4),
    case_id: DEMO_CASE_IDS.extraction,
    action: 'case_created',
    actor: 'system',
    details: { case_number: 'VHG-DENTAL-0150', vertical: 'dental', source: 'portal_submission', priority: 'urgent' },
  },

  // --- Case 5: IV Sedation (denied) ---
  {
    id: 'audit-005-01',
    created_at: daysAgo(5, 11),
    case_id: DEMO_CASE_IDS.sedation,
    action: 'case_created',
    actor: 'system',
    details: { case_number: 'VHG-DENTAL-0145', vertical: 'dental', source: 'portal_submission' },
  },
  {
    id: 'audit-005-02',
    created_at: daysAgo(5, 10, 55),
    case_id: DEMO_CASE_IDS.sedation,
    action: 'status_changed',
    actor: 'system',
    details: { new_status: 'processing', previous_status: 'intake' },
  },
  {
    id: 'audit-005-03',
    created_at: daysAgo(5, 9),
    case_id: DEMO_CASE_IDS.sedation,
    action: 'brief_generated',
    actor: 'system',
    details: { generated_automatically: true, confidence: 'medium', recommendation: 'deny' },
  },
  {
    id: 'audit-005-04',
    created_at: daysAgo(5, 8, 55),
    case_id: DEMO_CASE_IDS.sedation,
    action: 'status_changed',
    actor: 'system',
    details: { new_status: 'brief_ready', previous_status: 'processing' },
  },
  {
    id: 'audit-005-05',
    created_at: daysAgo(4, 7),
    case_id: DEMO_CASE_IDS.sedation,
    action: 'reviewer_assigned',
    actor: 'admin@vantahg.com',
    details: { reviewer_id: DEMO_REVIEWER_IDS.chang, reviewer_name: 'Dr. Michael Chang' },
  },
  {
    id: 'audit-005-06',
    created_at: daysAgo(4, 7),
    case_id: DEMO_CASE_IDS.sedation,
    action: 'status_changed',
    actor: 'admin@vantahg.com',
    details: { new_status: 'in_review', previous_status: 'brief_ready' },
  },
  {
    id: 'audit-005-07',
    created_at: daysAgo(2, 6),
    case_id: DEMO_CASE_IDS.sedation,
    action: 'determination_made',
    actor: DEMO_REVIEWER_IDS.chang,
    details: { determination: 'deny', rationale: 'Medical necessity not established. Peer-to-peer offered.' },
  },
  {
    id: 'audit-005-08',
    created_at: daysAgo(2, 6),
    case_id: DEMO_CASE_IDS.sedation,
    action: 'status_changed',
    actor: DEMO_REVIEWER_IDS.chang,
    details: { new_status: 'determination_made', previous_status: 'in_review' },
  },
  {
    id: 'audit-005-09',
    created_at: daysAgo(2, 5),
    case_id: DEMO_CASE_IDS.sedation,
    action: 'p2p_offered',
    actor: 'system',
    details: { provider_notified: true, method: 'secure_message', deadline: daysAgo(-3) },
  },

  // --- Case 6: Crown Lengthening (in review) ---
  {
    id: 'audit-006-01',
    created_at: daysAgo(2, 9),
    case_id: DEMO_CASE_IDS.crownLengthening,
    action: 'case_created',
    actor: 'system',
    details: { case_number: 'VHG-DENTAL-0146', vertical: 'dental', source: 'portal_submission', priority: 'expedited' },
  },
  {
    id: 'audit-006-02',
    created_at: daysAgo(2, 8, 55),
    case_id: DEMO_CASE_IDS.crownLengthening,
    action: 'status_changed',
    actor: 'system',
    details: { new_status: 'processing', previous_status: 'intake' },
  },
  {
    id: 'audit-006-03',
    created_at: daysAgo(2, 7),
    case_id: DEMO_CASE_IDS.crownLengthening,
    action: 'brief_generated',
    actor: 'system',
    details: { generated_automatically: true, confidence: 'high', recommendation: 'approve' },
  },
  {
    id: 'audit-006-04',
    created_at: daysAgo(2, 6, 55),
    case_id: DEMO_CASE_IDS.crownLengthening,
    action: 'status_changed',
    actor: 'system',
    details: { new_status: 'brief_ready', previous_status: 'processing' },
  },
  {
    id: 'audit-006-05',
    created_at: daysAgo(0, 6),
    case_id: DEMO_CASE_IDS.crownLengthening,
    action: 'reviewer_assigned',
    actor: 'admin@vantahg.com',
    details: { reviewer_id: DEMO_REVIEWER_IDS.morales, reviewer_name: 'Dr. Patricia Morales' },
  },
  {
    id: 'audit-006-06',
    created_at: daysAgo(0, 6),
    case_id: DEMO_CASE_IDS.crownLengthening,
    action: 'status_changed',
    actor: 'admin@vantahg.com',
    details: { new_status: 'in_review', previous_status: 'brief_ready' },
  },
];
