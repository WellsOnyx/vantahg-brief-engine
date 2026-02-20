import type { Case, Reviewer, Client, AuditLogEntry, AIBrief } from './types';

// ============================================================================
// DEMO IDs - Stable UUIDs for cross-referencing
// ============================================================================

export const DEMO_REVIEWER_IDS = {
  richardson: 'rev-001-james-richardson',
  patel: 'rev-002-priya-patel',
  torres: 'rev-003-michael-torres',
} as const;

export const DEMO_CLIENT_IDS = {
  southwestAdmin: 'cli-001-southwest-administrators',
  pinnacleHealth: 'cli-002-pinnacle-health-plan',
  westernEmployers: 'cli-003-western-employers-trust',
} as const;

export const DEMO_CASE_IDS = {
  mriLumbar: 'case-001-mri-lumbar-72148',
  totalKnee: 'case-002-tka-27447',
  infliximab: 'case-003-infliximab-j1745',
  cpap: 'case-004-cpap-e0601',
  psychotherapy: 'case-005-psychotherapy-90837',
  epiduralInjection: 'case-006-esi-64483',
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

/** Helper: return an ISO date string for N hours from now. */
function hoursFromNow(hours: number, minutes = 0): string {
  const d = new Date();
  d.setTime(d.getTime() + hours * 60 * 60 * 1000 + minutes * 60 * 1000);
  return d.toISOString();
}

/** Helper: return an ISO date string for N hours after a given date. */
function hoursAfter(dateStr: string, hours: number): string {
  const d = new Date(dateStr);
  d.setTime(d.getTime() + hours * 60 * 60 * 1000);
  return d.toISOString();
}

// ============================================================================
// REVIEWERS
// ============================================================================

export const demoReviewers: Reviewer[] = [
  {
    id: DEMO_REVIEWER_IDS.richardson,
    created_at: '2024-01-15T08:00:00.000Z',
    name: 'Dr. James Richardson',
    credentials: 'MD, FACP',
    specialty: 'Internal Medicine',
    subspecialty: 'Pulmonology',
    board_certifications: ['American Board of Internal Medicine', 'American Board of Internal Medicine - Pulmonary Disease'],
    license_state: ['AZ', 'CA', 'TX', 'NY', 'FL'],
    license_states: ['AZ', 'CA', 'TX', 'NY', 'FL'],
    approved_service_categories: ['imaging', 'surgery', 'dme', 'infusion', 'pain_management'],
    max_cases_per_day: null,
    avg_turnaround_hours: 2.1,
    dea_number: null,
    email: 'j.richardson@vantahg.com',
    phone: '(602) 555-0147',
    status: 'active',
    cases_completed: 1203,
  },
  {
    id: DEMO_REVIEWER_IDS.patel,
    created_at: '2024-06-01T08:00:00.000Z',
    name: 'Dr. Priya Patel',
    credentials: 'MD',
    specialty: 'Orthopedic Surgery',
    subspecialty: 'Sports Medicine',
    board_certifications: ['American Board of Orthopaedic Surgery'],
    license_state: ['AZ', 'CA', 'NV', 'CO'],
    license_states: ['AZ', 'CA', 'NV', 'CO'],
    approved_service_categories: ['surgery', 'imaging', 'rehab_therapy', 'pain_management'],
    max_cases_per_day: null,
    avg_turnaround_hours: 1.8,
    dea_number: null,
    email: 'p.patel@vantahg.com',
    phone: '(480) 555-0293',
    status: 'active',
    cases_completed: 847,
  },
  {
    id: DEMO_REVIEWER_IDS.torres,
    created_at: '2025-01-10T08:00:00.000Z',
    name: 'Dr. Michael Torres',
    credentials: 'DO, MBA',
    specialty: 'Psychiatry',
    subspecialty: 'Addiction Medicine',
    board_certifications: ['American Board of Psychiatry and Neurology', 'American Board of Preventive Medicine - Addiction Medicine'],
    license_state: ['AZ', 'TX', 'FL', 'GA', 'NC'],
    license_states: ['AZ', 'TX', 'FL', 'GA', 'NC'],
    approved_service_categories: ['behavioral_health', 'infusion', 'rehab_therapy'],
    max_cases_per_day: null,
    avg_turnaround_hours: 2.5,
    dea_number: null,
    email: 'm.torres@vantahg.com',
    phone: '(520) 555-0381',
    status: 'active',
    cases_completed: 632,
  },
];

// ============================================================================
// CLIENTS
// ============================================================================

export const demoClients: Client[] = [
  {
    id: DEMO_CLIENT_IDS.southwestAdmin,
    created_at: '2024-03-01T08:00:00.000Z',
    name: 'Southwest Administrators Inc',
    type: 'tpa',
    contact_name: 'Jennifer Hawkins',
    contact_email: 'j.hawkins@southwestadmin.com',
    contact_phone: '(602) 555-0200',
    uses_interqual: true,
    uses_mcg: false,
    custom_guidelines_url: null,
    contracted_sla_hours: 48,
    contracted_rate_per_case: 85.00,
  },
  {
    id: DEMO_CLIENT_IDS.pinnacleHealth,
    created_at: '2025-01-15T08:00:00.000Z',
    name: 'Pinnacle Health Plan',
    type: 'health_plan',
    contact_name: 'Mark Ellison',
    contact_email: 'm.ellison@pinnaclehp.com',
    contact_phone: '(480) 555-0415',
    uses_interqual: false,
    uses_mcg: true,
    custom_guidelines_url: null,
    contracted_sla_hours: 72,
    contracted_rate_per_case: 95.00,
  },
  {
    id: DEMO_CLIENT_IDS.westernEmployers,
    created_at: '2025-02-01T08:00:00.000Z',
    name: 'Western Employers Trust',
    type: 'self_funded_employer',
    contact_name: 'Lisa Tran',
    contact_email: 'l.tran@westernemployers.com',
    contact_phone: '(520) 555-0178',
    uses_interqual: true,
    uses_mcg: true,
    custom_guidelines_url: null,
    contracted_sla_hours: 24,
    contracted_rate_per_case: 110.00,
  },
];

// ============================================================================
// AI BRIEFS - Realistic clinical content for each case
// ============================================================================

const mriLumbarBrief: AIBrief = {
  clinical_question:
    'Is MRI of the lumbar spine without contrast (CPT 72148) medically necessary for this patient presenting with progressive low back pain and left lower extremity radiculopathy refractory to conservative management?',
  patient_summary:
    'Maria Santos is a 52-year-old female (DOB 03/15/1968) presenting with 8 weeks of progressive low back pain radiating to the left lower extremity in an L5 dermatomal distribution. She has completed 6 weeks of physical therapy, a trial of NSAIDs (naproxen 500mg BID), and activity modification without meaningful improvement. Physical examination demonstrates a positive straight leg raise test on the left at 40 degrees. Neurological examination shows diminished sensation in the L5 dermatome of the left foot. No red flag symptoms (no bowel/bladder dysfunction, no saddle anesthesia, no progressive motor deficit, no history of malignancy). Plain radiographs demonstrate mild degenerative changes at L4-5. Medical history is otherwise unremarkable.',
  diagnosis_analysis: {
    primary_diagnosis: 'M54.5 - Low back pain',
    secondary_diagnoses: ['M54.16 - Radiculopathy, lumbar region'],
    diagnosis_procedure_alignment: 'Diagnosis codes are consistent with the requested imaging study. Low back pain with radiculopathy in a specific dermatomal distribution supports the clinical need for advanced imaging to evaluate for structural pathology (disc herniation, stenosis) correlating with the neurological findings.',
  },
  procedure_analysis: {
    codes: ['72148 - MRI lumbar spine without contrast'],
    clinical_rationale:
      'The requesting provider has documented an 8-week course of progressive lumbar radiculopathy with failure of conservative management including physical therapy, pharmacotherapy, and activity modification. The clinical examination findings of positive straight leg raise and dermatomal sensory changes support a radicular etiology that warrants advanced imaging to evaluate for disc herniation, foraminal stenosis, or other structural pathology at the L4-5 or L5-S1 levels.',
    complexity_level: 'routine',
    setting_appropriateness: 'Outpatient imaging center is the appropriate and cost-effective setting for non-emergent lumbar MRI.',
  },
  criteria_match: {
    guideline_source: 'InterQual / ACR',
    applicable_guideline:
      'InterQual 2026 Advanced Imaging: Lumbar Spine MRI; ACR Appropriateness Criteria for Low Back Pain',
    criteria_met: [
      'Duration of symptoms exceeds 6 weeks with progressive radiculopathy',
      'Failure of conservative management documented: PT x 6 weeks, NSAIDs, activity modification',
      'Objective neurological findings present: positive straight leg raise, L5 dermatomal sensory deficit',
      'No prior advanced imaging of the lumbar spine for this episode of care',
      'Clinical presentation consistent with radiculopathy in a specific dermatomal pattern (L5)',
      'Red flag symptoms have been appropriately screened and are absent',
    ],
    criteria_not_met: [],
    criteria_unable_to_assess: [
      'Specific physical therapy notes documenting the exercise protocol and patient compliance were not included in the submitted records',
    ],
    conservative_alternatives: [
      'Continued physical therapy (already completed 6 weeks without improvement)',
      'Oral corticosteroid taper (not yet tried but imaging is appropriate at this stage)',
    ],
  },
  documentation_review: {
    documents_provided:
      'Clinical notes from requesting provider, lumbar spine X-ray report, physical therapy summary, medication history, and narrative letter of medical necessity',
    key_findings: [
      'Provider clinical notes document progressive left L5 radiculopathy with positive SLR at 40 degrees and dermatomal sensory changes',
      'Lumbar X-ray report (dated 6 weeks prior) shows mild degenerative disc disease at L4-5 with disc space narrowing',
      'Physical therapy summary documents 12 sessions over 6 weeks with minimal improvement in pain scores (VAS 7/10 to 6/10) and persistent radicular symptoms',
      'Medication history confirms trial of naproxen 500mg BID for 4 weeks with inadequate relief',
      'Provider narrative clearly articulates the clinical rationale for advanced imaging and the plan for results-directed treatment',
    ],
    missing_documentation: [
      'Detailed physical therapy notes (only summary provided)',
    ],
  },
  ai_recommendation: {
    recommendation: 'approve',
    confidence: 'high',
    rationale:
      'All InterQual criteria for lumbar spine MRI are met. The patient has progressive radiculopathy with objective neurological findings that has persisted beyond 6 weeks despite documented conservative management. Advanced imaging is appropriate to guide further treatment decisions. The clinical presentation, duration of symptoms, and failure of conservative care all support medical necessity.',
    key_considerations: [
      'All primary InterQual imaging criteria are satisfied including duration, failed conservative care, and objective neurological findings',
      'The absence of red flag symptoms confirms this is not an emergent indication, supporting standard authorization timeline',
      'Results may guide referral to pain management or surgical evaluation depending on findings',
    ],
    if_modify_suggestion: null,
  },
  reviewer_action: {
    decision_required:
      'Confirm medical necessity for lumbar spine MRI based on documented failure of 6 weeks conservative management and progressive radiculopathy with objective neurological findings',
    time_sensitivity:
      'Standard turnaround per Southwest Administrators 48-hour SLA; case received within contractual window. Non-emergent imaging request.',
    peer_to_peer_suggested: false,
    additional_info_needed: [
      'Detailed PT notes would strengthen the record but are not required for determination given the PT summary and clinical findings',
    ],
    state_specific_requirements: [],
  },
};

const totalKneeBrief: AIBrief = {
  clinical_question:
    'Does this patient meet medical necessity criteria for total knee arthroplasty (CPT 27447) of the right knee based on documented severity of osteoarthritis and failure of conservative management?',
  patient_summary:
    'James Wilson is a 70-year-old male (DOB 11/08/1955) presenting with severe right knee osteoarthritis, Kellgren-Lawrence (KL) grade 4 on weight-bearing radiographs. He has undergone 4 months of conservative treatment including physical therapy (12 sessions), NSAID therapy, two intra-articular corticosteroid injections (the most recent providing only 3 weeks of partial relief), and bracing. BMI is 31.2 kg/m2. HbA1c is 6.1% (pre-diabetic but well-controlled). The patient reports significant functional limitation: unable to walk more than 1 block, difficulty with stairs, and sleep disruption from nocturnal pain. WOMAC functional score of 62/96 indicates moderate-to-severe disability. Patient is independent in ADLs but reports progressive decline over 6 months.',
  diagnosis_analysis: {
    primary_diagnosis: 'M17.11 - Primary osteoarthritis, right knee',
    secondary_diagnoses: [],
    diagnosis_procedure_alignment: 'Diagnosis of primary osteoarthritis of the right knee directly supports the requested total knee arthroplasty. KL grade 4 on imaging confirms end-stage disease consistent with surgical indication.',
  },
  procedure_analysis: {
    codes: ['27447 - Total knee arthroplasty'],
    clinical_rationale:
      'The requesting orthopedic surgeon documents end-stage osteoarthritis of the right knee with KL grade 4 changes including complete loss of joint space, subchondral sclerosis, and osteophyte formation. The patient has failed a comprehensive course of conservative management over 4 months. The proposed setting is an outpatient ambulatory surgery center, which is consistent with current CMS guidelines for appropriate TKA candidates based on age, comorbidity profile, and social support system.',
    complexity_level: 'complex',
    setting_appropriateness: 'Outpatient ASC setting is appropriate and cost-effective for this patient profile. Patient has controlled comorbidities (BMI 31.2, HbA1c 6.1%), adequate social support, and no contraindications to outpatient joint replacement per CMS criteria.',
  },
  criteria_match: {
    guideline_source: 'MCG / AAOS',
    applicable_guideline:
      'MCG 27th Edition: Total Knee Arthroplasty; AAOS Clinical Practice Guidelines for OA of the Knee (2021)',
    criteria_met: [
      'Radiographic evidence of severe OA: Kellgren-Lawrence grade 4 with complete joint space loss',
      'Failure of physical therapy: 12 sessions over 4 months with documented lack of improvement',
      'Failure of pharmacotherapy: NSAID trial with inadequate pain relief',
      'Failure of intra-articular injections: 2 corticosteroid injections with diminishing and temporary relief (last injection provided only 3 weeks partial relief)',
      'Significant functional limitation documented: WOMAC score 62/96, inability to walk >1 block, stair difficulty, sleep disruption',
      'BMI documented at 31.2 - within acceptable range for most plan surgical thresholds (typically <40)',
      'HbA1c 6.1% - within acceptable range for elective surgical clearance (<8.0%)',
    ],
    criteria_not_met: [],
    criteria_unable_to_assess: [
      'Whether viscosupplementation (hyaluronic acid injection series) was offered or considered as an intermediate step prior to TKA - not addressed in the documentation',
    ],
    conservative_alternatives: [
      'Viscosupplementation series (not yet tried, though not required per MCG for KL grade 4)',
      'Unloader knee brace (already in use with insufficient relief)',
      'Continued NSAID/analgesic management (failed)',
    ],
  },
  documentation_review: {
    documents_provided:
      'Bilateral weight-bearing AP knee radiographs, lateral and sunrise views, orthopedic evaluation notes, physical therapy progress notes, injection records, primary care clearance letter, laboratory results (HbA1c, CBC, BMP), and surgical consent documentation',
    key_findings: [
      'Weight-bearing radiographs demonstrate KL grade 4 OA of the right knee with bone-on-bone contact in the medial compartment and significant osteophyte formation',
      'Physical therapy progress notes document 12 sessions with minimal functional improvement and persistent pain (VAS 7-8/10)',
      'Two corticosteroid injections documented (4 months ago and 6 weeks ago) with progressively shorter duration of relief',
      'Primary care clearance letter confirms the patient is an appropriate surgical candidate with controlled comorbidities',
      'HbA1c of 6.1% and BMI of 31.2 are within acceptable pre-surgical parameters',
      'WOMAC functional assessment score of 62/96 supports moderate-to-severe functional impairment',
    ],
    missing_documentation: [],
  },
  ai_recommendation: {
    recommendation: 'approve',
    confidence: 'high',
    rationale:
      'The patient presents with well-documented end-stage right knee osteoarthritis (KL grade 4) with comprehensive failure of conservative management over 4 months including PT, pharmacotherapy, and injections. Functional limitation is significant and well-documented with validated outcome measures. Pre-operative medical optimization is demonstrated with acceptable HbA1c and BMI. All MCG criteria for total knee arthroplasty appear to be met. The proposed outpatient ASC setting is appropriate for this patient.',
    key_considerations: [
      'Viscosupplementation was not documented as having been tried or discussed, though this is not a required prerequisite per MCG criteria when KL grade 4 OA is present',
      'BMI of 31.2 is above normal but well within surgical candidacy thresholds for most plans',
      'Outpatient ASC setting is appropriate and cost-effective for this patient profile per current CMS guidance',
      'Post-operative PT and rehabilitation plan should be verified as part of the surgical authorization',
    ],
    if_modify_suggestion: null,
  },
  reviewer_action: {
    decision_required:
      'Confirm medical necessity for right total knee arthroplasty based on KL grade 4 OA with documented failure of 4 months conservative management and significant functional limitation',
    time_sensitivity:
      'Standard 72-hour turnaround per Pinnacle Health Plan SLA; elective surgical procedure with no urgent clinical indication.',
    peer_to_peer_suggested: false,
    additional_info_needed: [],
    state_specific_requirements: [],
  },
};

const infliximabBrief: AIBrief = {
  clinical_question:
    'Is infliximab infusion (HCPCS J1745) medically necessary for induction therapy in this patient with moderate-to-severe Crohn\'s disease who has failed conventional therapies?',
  patient_summary:
    'Angela Thompson is a 35-year-old female (DOB 04/20/1990) with a diagnosis of moderate-to-severe Crohn\'s disease involving the large intestine. She has documented failure of mesalamine therapy (6 months) and budesonide (3 months), and was intolerant of azathioprine (developed drug-induced pancreatitis requiring hospitalization). Pre-biologic screening is complete: tuberculosis screening (QuantiFERON-TB Gold) is negative, hepatitis B surface antigen is negative, hepatitis B core antibody is negative. The requesting gastroenterologist is requesting infliximab 5mg/kg induction dosing (0, 2, and 6 week schedule). Current disease activity: Harvey-Bradshaw Index (HBI) score of 11, indicating moderate disease. Recent colonoscopy (4 weeks prior) confirms active mucosal inflammation with deep ulcerations in the transverse and descending colon.',
  diagnosis_analysis: {
    primary_diagnosis: 'K50.10 - Crohn\'s disease of large intestine without complications',
    secondary_diagnoses: [],
    diagnosis_procedure_alignment: 'Diagnosis of Crohn\'s disease of the large intestine directly supports the use of anti-TNF biologic therapy. Endoscopic confirmation of active mucosal inflammation with deep ulcerations corroborates the moderate-to-severe disease classification.',
  },
  procedure_analysis: {
    codes: ['J1745 - Infliximab injection, 10mg'],
    clinical_rationale:
      'The requesting gastroenterologist documents moderate-to-severe Crohn\'s disease that has failed two conventional therapies (mesalamine, budesonide) and is intolerant of a third (azathioprine). Biologic therapy with an anti-TNF agent is the appropriate next step per established step therapy protocols. Pre-biologic infectious screening has been completed and is negative. The infusion will be administered in an outpatient infusion center setting.',
    complexity_level: 'moderate',
    setting_appropriateness: 'Outpatient infusion center is the appropriate setting for infliximab administration. First infusion requires monitoring for infusion reactions; subsequent infusions may be administered in the same setting with standard monitoring protocols.',
  },
  criteria_match: {
    guideline_source: 'InterQual / AGA / Plan-specific formulary',
    applicable_guideline:
      'InterQual 2026: Biologic Therapy for Inflammatory Bowel Disease; AGA Clinical Practice Guidelines for Management of Crohn\'s Disease (2024); Southwest Administrators Specialty Pharmacy Policy',
    criteria_met: [
      'Confirmed diagnosis of Crohn\'s disease with endoscopic evidence of active mucosal inflammation',
      'Failure of first-line therapy: mesalamine x 6 months without adequate disease control',
      'Failure of second-line therapy: budesonide x 3 months without adequate disease control',
      'Intolerance to immunomodulator therapy: azathioprine discontinued due to drug-induced pancreatitis',
      'Step therapy requirements met: two conventional agents failed/not tolerated prior to biologic initiation',
      'Pre-biologic screening completed and negative: TB (QuantiFERON-Gold), Hep B surface antigen, Hep B core antibody',
      'Disease severity supports biologic initiation: HBI score 11 (moderate), endoscopic confirmation of active deep ulceration',
    ],
    criteria_not_met: [
      'Plan formulary requires biosimilar infliximab (Inflectra/infliximab-dyyb) as first-line anti-TNF rather than reference product Remicade - step therapy through biosimilar not documented',
    ],
    criteria_unable_to_assess: [
      'Whether the requesting provider has considered or documented a rationale for reference infliximab (Remicade) over the plan-preferred biosimilar (Inflectra)',
    ],
    conservative_alternatives: [
      'Biosimilar infliximab (Inflectra/infliximab-dyyb) - plan-preferred and clinically equivalent',
      'Adalimumab (Humira or biosimilar) - alternative anti-TNF with subcutaneous administration',
      'Vedolizumab - gut-selective biologic if anti-TNF is contraindicated',
    ],
  },
  documentation_review: {
    documents_provided:
      'Gastroenterology clinical notes, colonoscopy report with photographs, pathology report, medication history, laboratory results (QuantiFERON-TB Gold, hepatitis panel, CBC, CMP, CRP, ESR), and prior authorization request form',
    key_findings: [
      'Colonoscopy report (dated 4 weeks prior) describes deep longitudinal ulcerations in the transverse and descending colon with cobblestoning, consistent with active moderate-to-severe Crohn\'s disease',
      'Pathology confirms chronic active colitis with granulomas, consistent with Crohn\'s disease',
      'Medication history documents sequential failure of mesalamine and budesonide with specific dates and dosages',
      'Hospitalization record for azathioprine-induced pancreatitis confirms drug intolerance with lipase elevation to 4x upper limit of normal',
      'All pre-biologic screening labs are negative and current (within 3 months)',
      'CRP is elevated at 2.8 mg/dL (normal <0.5), supporting active inflammation',
    ],
    missing_documentation: [
      'Clinical rationale for reference infliximab (Remicade) versus plan-preferred biosimilar (Inflectra/infliximab-dyyb)',
    ],
  },
  ai_recommendation: {
    recommendation: 'pend',
    confidence: 'high',
    rationale:
      'The clinical indication for anti-TNF biologic therapy is well-supported with documented failure of two conventional agents and intolerance to a third. Pre-biologic screening is complete. However, the plan formulary requires step therapy through the biosimilar infliximab product (Inflectra/infliximab-dyyb) before authorizing the reference product (Remicade). The request should be pended to allow the provider to either switch the request to the biosimilar or provide a clinical rationale for medical necessity of the reference product over the biosimilar.',
    key_considerations: [
      'IMPORTANT: Plan formulary requires biosimilar infliximab (Inflectra) as first-line anti-TNF. The request is for reference Remicade (J1745). Provider should be contacted to clarify product selection.',
      'If the provider switches to the biosimilar, all other clinical criteria are fully met and the case would support approval',
      'If the provider has a clinical rationale for reference product (e.g., prior adverse reaction to biosimilar), that documentation should be obtained',
      'The clinical urgency of this case (moderate-to-severe disease with active deep ulceration) suggests expedited handling of the formulary clarification',
    ],
    if_modify_suggestion: 'Approve biosimilar infliximab (Inflectra/infliximab-dyyb, HCPCS Q5103) at the same dose and schedule if provider agrees to formulary-preferred product. All other clinical criteria are met.',
  },
  reviewer_action: {
    decision_required:
      'Determine whether to pend for biosimilar step therapy clarification or approve based on clinical urgency. Contact requesting provider to clarify reference vs. biosimilar product selection.',
    time_sensitivity:
      'Urgent: Patient has moderate-to-severe active Crohn\'s disease with deep ulceration. Expedited review and provider outreach recommended. Southwest Administrators 48-hour SLA applies.',
    peer_to_peer_suggested: true,
    additional_info_needed: [
      'Provider clarification on reference infliximab vs. biosimilar (Inflectra) product selection',
      'If provider insists on reference product, clinical rationale for medical necessity of Remicade over Inflectra',
    ],
    state_specific_requirements: [],
  },
};

const psychotherapyBrief: AIBrief = {
  clinical_question:
    'Is continued authorization of weekly extended psychotherapy sessions (CPT 90837, 53+ minutes) medically necessary for this patient with recurrent major depressive disorder who has demonstrated significant clinical improvement?',
  patient_summary:
    'David Park is a 40-year-old male (DOB 07/30/1985) with a diagnosis of major depressive disorder, recurrent, moderate (F33.1), currently in treatment for 18 months. The requesting psychiatrist is seeking continued authorization for weekly 53-minute psychotherapy sessions. Validated outcome measures demonstrate significant improvement: PHQ-9 score has improved from 19 (moderately severe) at intake to 8 (mild) currently. GAD-7 has improved from 14 (moderate anxiety) to 5 (mild anxiety). The provider reports functional improvement including return to full-time employment, improved interpersonal relationships, and re-engagement in previously abandoned hobbies. Current medications include sertraline 150mg daily (stable for 6 months). No hospitalizations or crisis episodes in the past 12 months.',
  diagnosis_analysis: {
    primary_diagnosis: 'F33.1 - Major depressive disorder, recurrent, moderate',
    secondary_diagnoses: [],
    diagnosis_procedure_alignment: 'Diagnosis of recurrent MDD supports the general need for psychotherapy. However, the current symptom severity (PHQ-9 of 8 = mild) may not support the requested intensity (weekly extended sessions) given documented treatment plateau and functional recovery.',
  },
  procedure_analysis: {
    codes: ['90837 - Psychotherapy, 53 minutes or more'],
    clinical_rationale:
      'The requesting psychiatrist is seeking continued authorization for extended (53+ minute) psychotherapy sessions on a weekly basis. The clinical notes document that the patient has been engaged in cognitive behavioral therapy with a focus on relapse prevention and maintenance of gains. The provider indicates that the patient still has "ongoing therapeutic needs" but the specific clinical rationale for extended sessions (versus standard 38-52 minute sessions per CPT 90834) at the current frequency is not clearly articulated.',
    complexity_level: 'routine',
    setting_appropriateness: 'Outpatient office-based psychotherapy is the appropriate setting. The level of care (outpatient) is appropriate for the current symptom severity.',
  },
  criteria_match: {
    guideline_source: 'MCG / APA / Plan-specific',
    applicable_guideline:
      'MCG 27th Edition: Outpatient Psychotherapy; Pinnacle Health Plan Behavioral Health Coverage Policy; APA Practice Guidelines for Major Depressive Disorder',
    criteria_met: [
      'Established diagnosis of major depressive disorder, recurrent, moderate (F33.1)',
      'Active treatment relationship with qualified psychiatrist',
      'Validated outcome measures documented at intake and current (PHQ-9, GAD-7)',
      'Medication management is concurrent and stable (sertraline 150mg daily x 6 months)',
    ],
    criteria_not_met: [
      'Current symptom severity does not support extended session length: PHQ-9 of 8 indicates mild depression, typically managed with standard session length (90834)',
      'Treatment plateau is evident: PHQ-9 has been in the 7-9 range for the past 4 months with no further clinically significant improvement',
      'Functional goals have been largely achieved: return to full-time work, improved relationships, re-engagement in activities',
      'Clinical rationale for extended session (90837) over standard session (90834) not provided',
      'Weekly frequency not supported at current symptom level: guidelines recommend step-down to biweekly when PHQ-9 < 10 and functional improvement is documented',
    ],
    criteria_unable_to_assess: [
      'Whether the patient has specific relapse risk factors (e.g., recent major life stressors, history of rapid relapse) that would justify maintaining current intensity',
    ],
    conservative_alternatives: [
      'Standard psychotherapy session (90834, 38-52 minutes) at biweekly frequency',
      'Medication management only with PRN psychotherapy sessions',
      'Group therapy as adjunct or alternative to individual extended sessions',
    ],
  },
  documentation_review: {
    documents_provided:
      'Psychiatrist clinical notes (past 3 months), treatment plan update, PHQ-9 and GAD-7 serial scores, medication management notes, and continued stay authorization request form',
    key_findings: [
      'PHQ-9 trajectory: 19 (intake) -> 14 (3 months) -> 10 (6 months) -> 8 (12 months) -> 8 (current, 18 months) - improvement has plateaued in the mild range',
      'GAD-7 trajectory: 14 (intake) -> 9 (6 months) -> 5 (current) - sustained improvement',
      'Treatment plan update lists "relapse prevention" and "maintenance of gains" as current treatment goals',
      'Clinical notes describe productive sessions but do not identify acute clinical issues requiring extended session format',
      'No crisis events, hospitalizations, or medication changes in the past 12 months',
      'Functional status is markedly improved from baseline across all domains (occupational, social, recreational)',
    ],
    missing_documentation: [
      'Specific clinical rationale for extended session length (90837) versus standard session (90834)',
      'Relapse prevention plan with step-down criteria',
      'Documentation of any current acute stressors or risk factors that would support maintaining current treatment intensity',
    ],
  },
  ai_recommendation: {
    recommendation: 'deny',
    confidence: 'medium',
    rationale:
      'The patient has achieved significant and sustained clinical improvement over 18 months of treatment, with PHQ-9 improving from 19 to 8 and GAD-7 from 14 to 5. Functional recovery is well-documented. The current symptom severity (PHQ-9 of 8, mild depression) does not support continued weekly extended psychotherapy sessions (90837). Treatment plateau is evident, with scores stable in the mild range for 4+ months. Guidelines support step-down to standard session length (90834) and reduced frequency (biweekly) when substantial clinical improvement has been achieved and maintained. Continued extended sessions at current frequency are not medically necessary.',
    key_considerations: [
      'Denial is for the session length and frequency, not for all psychotherapy services. Step-down to standard session (90834) at biweekly frequency is the recommended alternative.',
      'The provider should be informed that the patient may continue psychotherapy at a standard session length and reduced frequency without additional authorization',
      'If the provider identifies specific relapse risk factors or acute clinical needs not reflected in the submitted documentation, a peer-to-peer review may support reconsideration',
      'The patient\'s sustained improvement and functional recovery are positive indicators, but the treatment plan should reflect a maintenance and eventual termination trajectory',
    ],
    if_modify_suggestion: 'Approve standard psychotherapy sessions (90834, 38-52 minutes) at biweekly frequency for continued relapse prevention. This step-down in intensity is clinically appropriate given the documented treatment plateau and sustained improvement.',
  },
  reviewer_action: {
    decision_required:
      'Determine whether continued weekly extended psychotherapy sessions (90837) are medically necessary given documented treatment plateau and significant clinical improvement, or whether step-down to standard sessions (90834) at reduced frequency is appropriate',
    time_sensitivity:
      'Standard 72-hour turnaround per Pinnacle Health Plan SLA. This is a concurrent review for continued authorization; current authorization expires in 2 weeks. Non-urgent.',
    peer_to_peer_suggested: true,
    additional_info_needed: [
      'Provider rationale for extended session format at current symptom severity',
      'Relapse prevention plan with specific step-down criteria and target termination timeline',
      'Documentation of any current acute stressors or relapse risk factors not reflected in submitted records',
    ],
    state_specific_requirements: [],
  },
};

const epiduralInjectionBrief: AIBrief = {
  clinical_question:
    'Is a second lumbar transforaminal epidural steroid injection (CPT 64483) at L4-5 medically necessary for this patient with left L5 radiculopathy from disc herniation, given that the first injection provided significant but time-limited relief?',
  patient_summary:
    'Sarah Mitchell is a 53-year-old female (DOB 06/15/1972) presenting with left L5 radiculopathy secondary to MRI-confirmed L4-5 disc herniation with left foraminal stenosis. She has undergone 6 weeks of physical therapy, a trial of gabapentin (titrated to 600mg TID), and NSAIDs with partial but insufficient relief. She received her first lumbar transforaminal epidural steroid injection at L4-5 approximately 3 months ago, which provided approximately 60% pain relief lasting 3 months. Pain has now returned to near-baseline levels (VAS 7/10). The patient\'s functional goals include returning to her desk job (currently on modified duty) and resuming her walking exercise program. No history of prior spine surgery. This would be the 2nd injection in the current calendar year.',
  diagnosis_analysis: {
    primary_diagnosis: 'M51.16 - Intervertebral disc degeneration, lumbar region',
    secondary_diagnoses: ['M54.16 - Radiculopathy, lumbar region'],
    diagnosis_procedure_alignment: 'Diagnosis codes directly support the requested epidural steroid injection. MRI-confirmed disc herniation with foraminal stenosis correlates with the clinical presentation of L5 radiculopathy, establishing an anatomic basis for targeted injection therapy.',
  },
  procedure_analysis: {
    codes: ['64483 - Transforaminal epidural steroid injection, lumbar/sacral, single level'],
    clinical_rationale:
      'The requesting pain management physician documents a positive response to the first epidural steroid injection with 60% relief lasting 3 months, which is considered a clinically significant response. The recurrence of symptoms after a meaningful period of relief supports a repeat injection as part of a continued conservative management strategy before consideration of surgical intervention. MRI findings of disc herniation with foraminal stenosis correlate with the clinical presentation of L5 radiculopathy.',
    complexity_level: 'moderate',
    setting_appropriateness: 'Ambulatory surgery center (ASC) is the appropriate setting for fluoroscopically-guided transforaminal epidural steroid injection. This is consistent with the setting used for the first injection.',
  },
  criteria_match: {
    guideline_source: 'InterQual / ASIPP / Plan-specific',
    applicable_guideline:
      'InterQual 2026: Epidural Steroid Injections; ASIPP Evidence-Based Guidelines for Interventional Techniques in Chronic Spinal Pain (2024); Southwest Administrators Pain Management Policy',
    criteria_met: [
      'MRI-confirmed structural pathology correlating with clinical presentation: L4-5 disc herniation with left foraminal stenosis matching L5 radiculopathy',
      'Documented failure of conservative management: PT x 6 weeks, gabapentin, NSAIDs',
      'Positive response to prior injection: 60% relief lasting 3 months meets the threshold for clinically meaningful response (typically >50% relief for >6 weeks)',
      'Return of symptoms to near-baseline levels after period of relief supports repeat injection',
      'Functional goals are clearly articulated: return to work full duty, resume exercise program',
      'This is the 2nd injection this year, within the typical plan limit of 3-4 per year per region',
    ],
    criteria_not_met: [],
    criteria_unable_to_assess: [
      'Whether the plan has a specific minimum interval requirement between epidural injections (typically 2-4 weeks; 3 months exceeds any standard minimum interval)',
      'Long-term treatment plan if repeat injection provides similar duration of relief - surgical consultation timing is not addressed',
    ],
    conservative_alternatives: [
      'Continued gabapentin titration or switch to pregabalin',
      'Formal spine surgery consultation for potential microdiscectomy (may be appropriate if repeat injection provides similar time-limited relief)',
      'Multidisciplinary pain rehabilitation program',
    ],
  },
  documentation_review: {
    documents_provided:
      'Pain management clinical notes, lumbar MRI report, physical therapy discharge summary, medication history, first injection procedure note and follow-up documentation, and prior authorization request with functional assessment',
    key_findings: [
      'Lumbar MRI (dated 4 months prior) demonstrates left paracentral and foraminal disc herniation at L4-5 with moderate left foraminal stenosis and left L5 nerve root impingement',
      'First injection procedure note confirms fluoroscopically-guided left L4-5 transforaminal ESI performed without complication',
      'Post-injection follow-up note at 2 weeks documents 60% improvement in pain (VAS 7/10 to 3/10) with improved ambulation',
      'Physical therapy discharge summary documents completion of 6-week program with 30% improvement in function but persistent radicular symptoms',
      'Current clinical notes document return of pain to VAS 7/10 with recurrent left leg radiation and positive SLR',
      'Patient is on modified work duty and has not been able to return to full employment',
    ],
    missing_documentation: [
      'Documentation of gabapentin dosing titration and specific response/side effects',
      'Discussion of long-term treatment strategy including criteria for surgical referral if repeat injections provide only temporary relief',
    ],
  },
  ai_recommendation: {
    recommendation: 'approve',
    confidence: 'medium',
    rationale:
      'The request for a second lumbar epidural steroid injection is supported by a documented positive response to the first injection (60% relief for 3 months), MRI-confirmed structural pathology correlating with the clinical syndrome, and failure of conservative management. This is the 2nd injection this year and is within standard frequency guidelines. However, the reviewer should note that while criteria are met, the patient is approaching a decision point regarding the long-term management strategy, as recurrent symptoms after time-limited injection relief may ultimately support surgical consultation.',
    key_considerations: [
      'This is the 2nd ESI this calendar year; most plans allow 3-4 per year per spinal region. Approaching frequency limits should be noted for future requests.',
      'The 60% relief lasting 3 months from the first injection is a positive prognostic indicator for repeat injection',
      'Consider whether the authorization should include a recommendation that the provider discuss surgical consultation if the second injection provides similar time-limited relief',
      'The expedited priority is appropriate given the patient\'s functional limitation and work status impact',
    ],
    if_modify_suggestion: null,
  },
  reviewer_action: {
    decision_required:
      'Confirm medical necessity for second lumbar transforaminal ESI based on documented positive response to first injection and continued radiculopathy with MRI-confirmed structural pathology',
    time_sensitivity:
      'Expedited review: Patient is on modified work duty with functional limitation. Southwest Administrators 48-hour SLA applies. Provider has requested expedited processing.',
    peer_to_peer_suggested: false,
    additional_info_needed: [
      'Documentation of gabapentin response and titration details would strengthen the record',
      'Long-term management plan including surgical referral criteria, though this is not required for the current authorization determination',
    ],
    state_specific_requirements: [],
  },
};

// ============================================================================
// CASES - Fully populated with joined reviewer/client data and AI briefs
// ============================================================================

export const demoCases: Case[] = [
  // CASE 1: MRI Lumbar Spine - Completed, Approved
  {
    id: DEMO_CASE_IDS.mriLumbar,
    created_at: daysAgo(6, 14),
    updated_at: daysAgo(1, 8),
    case_number: 'VHG-MED-0201',
    status: 'determination_made',
    priority: 'standard',
    service_category: 'imaging',
    vertical: 'medical',
    patient_name: 'Maria Santos',
    patient_dob: '1968-03-15',
    patient_member_id: 'SWA-2026-44891',
    patient_gender: 'Female',
    requesting_provider: 'Dr. Robert Chen',
    requesting_provider_npi: '1234567890',
    requesting_provider_specialty: 'Family Medicine',
    servicing_provider: null,
    servicing_provider_npi: null,
    facility_name: 'Valley Imaging Center',
    facility_type: 'outpatient',
    procedure_codes: ['72148'],
    diagnosis_codes: ['M54.5', 'M54.16'],
    procedure_description: 'MRI lumbar spine without contrast - progressive low back pain with left L5 radiculopathy',
    clinical_question: 'Is lumbar MRI medically necessary given 8 weeks progressive radiculopathy refractory to conservative management?',
    assigned_reviewer_id: DEMO_REVIEWER_IDS.richardson,
    review_type: 'prior_auth',
    payer_name: 'Blue Cross Blue Shield',
    plan_type: 'PPO',
    turnaround_deadline: hoursAfter(daysAgo(6, 14), 48),
    sla_hours: 48,
    ai_brief: mriLumbarBrief,
    ai_brief_generated_at: daysAgo(6, 12),
    fact_check: null,
    fact_check_at: null,
    determination: 'approve',
    determination_rationale: 'All InterQual imaging criteria met. Patient has progressive L5 radiculopathy with objective neurological findings (positive SLR, dermatomal sensory deficit) refractory to 6 weeks of conservative management including PT, NSAIDs, and activity modification. Advanced imaging is medically necessary to evaluate for structural pathology and guide further treatment. Approved per InterQual criteria.',
    determination_at: daysAgo(1, 8),
    determined_by: DEMO_REVIEWER_IDS.richardson,
    denial_reason: null,
    denial_criteria_cited: null,
    alternative_recommended: null,
    submitted_documents: ['clinical_notes.pdf', 'lumbar_xray_report.pdf', 'pt_summary.pdf', 'medication_history.pdf', 'provider_narrative.pdf'],
    client_id: DEMO_CLIENT_IDS.southwestAdmin,
    reviewer: demoReviewers[0],
    client: demoClients[0],
  },

  // CASE 2: Total Knee Arthroplasty - In Review
  {
    id: DEMO_CASE_IDS.totalKnee,
    created_at: daysAgo(4, 10),
    updated_at: daysAgo(1, 3),
    case_number: 'VHG-MED-0202',
    status: 'in_review',
    priority: 'standard',
    service_category: 'surgery',
    vertical: 'medical',
    patient_name: 'James Wilson',
    patient_dob: '1955-11-08',
    patient_member_id: 'PHM-2026-22103',
    patient_gender: 'Male',
    requesting_provider: 'Dr. Sarah Blackwell',
    requesting_provider_npi: '2345678901',
    requesting_provider_specialty: 'Orthopedic Surgery',
    servicing_provider: null,
    servicing_provider_npi: null,
    facility_name: 'Scottsdale Surgical Center',
    facility_type: 'asc',
    procedure_codes: ['27447'],
    diagnosis_codes: ['M17.11'],
    procedure_description: 'Total knee arthroplasty, right knee - end-stage osteoarthritis KL grade 4',
    clinical_question: 'Does this patient meet criteria for TKA given KL grade 4 OA with 4 months failed conservative management?',
    assigned_reviewer_id: DEMO_REVIEWER_IDS.patel,
    review_type: 'prior_auth',
    payer_name: 'Pinnacle Health Plan',
    plan_type: 'HMO',
    turnaround_deadline: hoursFromNow(8),
    sla_hours: 72,
    ai_brief: totalKneeBrief,
    ai_brief_generated_at: daysAgo(4, 8),
    fact_check: null,
    fact_check_at: null,
    determination: null,
    determination_rationale: null,
    determination_at: null,
    determined_by: null,
    denial_reason: null,
    denial_criteria_cited: null,
    alternative_recommended: null,
    submitted_documents: ['knee_xrays_weightbearing.dcm', 'orthopedic_evaluation.pdf', 'pt_progress_notes.pdf', 'injection_records.pdf', 'pcp_clearance_letter.pdf', 'lab_results.pdf', 'surgical_consent.pdf'],
    client_id: DEMO_CLIENT_IDS.pinnacleHealth,
    reviewer: demoReviewers[1],
    client: demoClients[1],
  },

  // CASE 3: Infliximab Infusion - Brief Ready
  {
    id: DEMO_CASE_IDS.infliximab,
    created_at: daysAgo(3, 6),
    updated_at: daysAgo(0, 12),
    case_number: 'VHG-MED-0203',
    status: 'brief_ready',
    priority: 'urgent',
    service_category: 'infusion',
    vertical: 'medical',
    patient_name: 'Angela Thompson',
    patient_dob: '1990-04-20',
    patient_member_id: 'SWA-2026-67234',
    patient_gender: 'Female',
    requesting_provider: 'Dr. David Kim',
    requesting_provider_npi: '3456789012',
    requesting_provider_specialty: 'Gastroenterology',
    servicing_provider: null,
    servicing_provider_npi: null,
    facility_name: 'Desert Infusion Center',
    facility_type: 'outpatient',
    procedure_codes: ['J1745'],
    diagnosis_codes: ['K50.10'],
    procedure_description: 'Infliximab infusion 5mg/kg induction - moderate-severe Crohn\'s disease, failed conventional therapy',
    clinical_question: 'Is infliximab infusion medically necessary given documented failure of mesalamine, budesonide, and azathioprine intolerance?',
    assigned_reviewer_id: null,
    review_type: 'prior_auth',
    payer_name: 'Blue Cross Blue Shield',
    plan_type: 'PPO',
    turnaround_deadline: hoursFromNow(3),
    sla_hours: 24,
    ai_brief: infliximabBrief,
    ai_brief_generated_at: daysAgo(3, 4),
    fact_check: null,
    fact_check_at: null,
    determination: null,
    determination_rationale: null,
    determination_at: null,
    determined_by: null,
    denial_reason: null,
    denial_criteria_cited: null,
    alternative_recommended: null,
    submitted_documents: ['gi_clinical_notes.pdf', 'colonoscopy_report.pdf', 'pathology_report.pdf', 'medication_history.pdf', 'lab_results_screening.pdf', 'prior_auth_request.pdf'],
    client_id: DEMO_CLIENT_IDS.southwestAdmin,
    reviewer: undefined,
    client: demoClients[0],
  },

  // CASE 4: CPAP Device - Just Submitted (Intake)
  {
    id: DEMO_CASE_IDS.cpap,
    created_at: daysAgo(0, 4),
    updated_at: daysAgo(0, 4),
    case_number: 'VHG-MED-0204',
    status: 'intake',
    priority: 'standard',
    service_category: 'dme',
    vertical: 'medical',
    patient_name: 'Robert Garcia',
    patient_dob: '1975-09-12',
    patient_member_id: 'WET-2026-11456',
    patient_gender: 'Male',
    requesting_provider: 'Dr. Lisa Nguyen',
    requesting_provider_npi: '4567890123',
    requesting_provider_specialty: 'Pulmonology / Sleep Medicine',
    servicing_provider: null,
    servicing_provider_npi: null,
    facility_name: 'Arizona Sleep Center',
    facility_type: 'office',
    procedure_codes: ['E0601'],
    diagnosis_codes: ['G47.33'],
    procedure_description: 'CPAP device, continuous positive airway pressure - obstructive sleep apnea, AHI 22',
    clinical_question: 'Does this patient meet criteria for CPAP device based on home sleep test results and face-to-face evaluation?',
    assigned_reviewer_id: null,
    review_type: 'prior_auth',
    payer_name: 'Western Employers Trust',
    plan_type: 'Self-funded PPO',
    turnaround_deadline: hoursFromNow(96),
    sla_hours: 24,
    ai_brief: null,
    ai_brief_generated_at: null,
    fact_check: null,
    fact_check_at: null,
    determination: null,
    determination_rationale: null,
    determination_at: null,
    determined_by: null,
    denial_reason: null,
    denial_criteria_cited: null,
    alternative_recommended: null,
    submitted_documents: ['sleep_study_report.pdf', 'clinical_notes_f2f.pdf'],
    client_id: DEMO_CLIENT_IDS.westernEmployers,
    reviewer: undefined,
    client: demoClients[2],
  },

  // CASE 5: Psychotherapy - Completed, Denied
  {
    id: DEMO_CASE_IDS.psychotherapy,
    created_at: daysAgo(5, 11),
    updated_at: daysAgo(2, 6),
    case_number: 'VHG-MED-0199',
    status: 'determination_made',
    priority: 'standard',
    service_category: 'behavioral_health',
    vertical: 'medical',
    patient_name: 'David Park',
    patient_dob: '1985-07-30',
    patient_member_id: 'PHM-2026-33891',
    patient_gender: 'Male',
    requesting_provider: 'Dr. Jennifer Walsh',
    requesting_provider_npi: '5678901234',
    requesting_provider_specialty: 'Psychiatry',
    servicing_provider: null,
    servicing_provider_npi: null,
    facility_name: 'Behavioral Health Associates',
    facility_type: 'office',
    procedure_codes: ['90837'],
    diagnosis_codes: ['F33.1'],
    procedure_description: 'Psychotherapy, 53+ minutes - continued authorization for weekly extended sessions, MDD recurrent moderate',
    clinical_question: 'Are continued weekly extended psychotherapy sessions medically necessary given significant clinical improvement and treatment plateau?',
    assigned_reviewer_id: DEMO_REVIEWER_IDS.torres,
    review_type: 'concurrent',
    payer_name: 'Pinnacle Health Plan',
    plan_type: 'HMO',
    turnaround_deadline: hoursAfter(daysAgo(5, 11), 120),
    sla_hours: 24,
    ai_brief: psychotherapyBrief,
    ai_brief_generated_at: daysAgo(5, 9),
    fact_check: null,
    fact_check_at: null,
    determination: 'deny',
    determination_rationale: 'Continued weekly extended psychotherapy sessions (90837) are not medically necessary at the current level of clinical improvement. PHQ-9 has improved from 19 (moderately severe) to 8 (mild) with a documented plateau in the 7-9 range over the past 4 months. GAD-7 has improved from 14 to 5. Functional recovery is well-documented including return to full-time work. Treatment plateau has been reached. Step-down to standard session length (90834) at biweekly frequency is clinically appropriate per MCG guidelines. The patient may continue psychotherapy at a standard session format without additional authorization. Peer-to-peer consultation has been offered to the requesting provider.',
    determination_at: daysAgo(2, 6),
    determined_by: DEMO_REVIEWER_IDS.torres,
    denial_reason: 'Treatment plateau reached; current symptom severity (PHQ-9: 8, mild) does not support continued weekly extended sessions',
    denial_criteria_cited: 'MCG 27th Edition: Outpatient Psychotherapy; Pinnacle Health Plan Behavioral Health Coverage Policy',
    alternative_recommended: 'Standard psychotherapy sessions (90834) at biweekly frequency for relapse prevention',
    submitted_documents: ['psychiatrist_clinical_notes.pdf', 'treatment_plan_update.pdf', 'phq9_gad7_scores.pdf', 'medication_management_notes.pdf', 'csa_request_form.pdf'],
    client_id: DEMO_CLIENT_IDS.pinnacleHealth,
    reviewer: demoReviewers[2],
    client: demoClients[1],
  },

  // CASE 6: Lumbar Epidural Steroid Injection - In Review
  {
    id: DEMO_CASE_IDS.epiduralInjection,
    created_at: daysAgo(2, 9),
    updated_at: daysAgo(0, 6),
    case_number: 'VHG-MED-0200',
    status: 'in_review',
    priority: 'expedited',
    service_category: 'pain_management',
    vertical: 'medical',
    patient_name: 'Sarah Mitchell',
    patient_dob: '1972-06-15',
    patient_member_id: 'SWA-2026-55678',
    patient_gender: 'Female',
    requesting_provider: 'Dr. Mark Stevens',
    requesting_provider_npi: '6789012345',
    requesting_provider_specialty: 'Pain Management / Anesthesiology',
    servicing_provider: null,
    servicing_provider_npi: null,
    facility_name: 'Desert Pain & Spine Center',
    facility_type: 'asc',
    procedure_codes: ['64483'],
    diagnosis_codes: ['M51.16', 'M54.16'],
    procedure_description: 'Lumbar transforaminal epidural steroid injection, L4-5 - 2nd injection this year for L5 radiculopathy from disc herniation',
    clinical_question: 'Is a repeat lumbar ESI medically necessary given 60% relief from first injection lasting 3 months, now with recurrent symptoms?',
    assigned_reviewer_id: DEMO_REVIEWER_IDS.richardson,
    review_type: 'prior_auth',
    payer_name: 'Blue Cross Blue Shield',
    plan_type: 'PPO',
    turnaround_deadline: hoursFromNow(18),
    sla_hours: 48,
    ai_brief: epiduralInjectionBrief,
    ai_brief_generated_at: daysAgo(2, 7),
    fact_check: null,
    fact_check_at: null,
    determination: null,
    determination_rationale: null,
    determination_at: null,
    determined_by: null,
    denial_reason: null,
    denial_criteria_cited: null,
    alternative_recommended: null,
    submitted_documents: ['pain_management_notes.pdf', 'lumbar_mri_report.pdf', 'pt_discharge_summary.pdf', 'medication_history.pdf', 'first_injection_procedure_note.pdf', 'first_injection_followup.pdf', 'prior_auth_request.pdf'],
    client_id: DEMO_CLIENT_IDS.southwestAdmin,
    reviewer: demoReviewers[0],
    client: demoClients[0],
  },
];

// ============================================================================
// AUDIT LOG ENTRIES - Realistic timeline for each case
// ============================================================================

export const demoAuditLog: AuditLogEntry[] = [
  // --- Case 1: MRI Lumbar Spine (full workflow, approved) ---
  {
    id: 'audit-001-01',
    created_at: daysAgo(6, 14),
    case_id: DEMO_CASE_IDS.mriLumbar,
    action: 'case_created',
    actor: 'system',
    details: { case_number: 'VHG-MED-0201', vertical: 'medical', service_category: 'imaging', source: 'portal_submission' },
  },
  {
    id: 'audit-001-02',
    created_at: daysAgo(6, 13, 55),
    case_id: DEMO_CASE_IDS.mriLumbar,
    action: 'status_changed',
    actor: 'system',
    details: { new_status: 'processing', previous_status: 'intake' },
  },
  {
    id: 'audit-001-03',
    created_at: daysAgo(6, 12),
    case_id: DEMO_CASE_IDS.mriLumbar,
    action: 'brief_generated',
    actor: 'system',
    details: { generated_automatically: true, confidence: 'high', recommendation: 'approve' },
  },
  {
    id: 'audit-001-04',
    created_at: daysAgo(6, 11, 50),
    case_id: DEMO_CASE_IDS.mriLumbar,
    action: 'status_changed',
    actor: 'system',
    details: { new_status: 'brief_ready', previous_status: 'processing' },
  },
  {
    id: 'audit-001-05',
    created_at: daysAgo(5, 8),
    case_id: DEMO_CASE_IDS.mriLumbar,
    action: 'reviewer_assigned',
    actor: 'admin@vantahg.com',
    details: { reviewer_id: DEMO_REVIEWER_IDS.richardson, reviewer_name: 'Dr. James Richardson' },
  },
  {
    id: 'audit-001-06',
    created_at: daysAgo(5, 8),
    case_id: DEMO_CASE_IDS.mriLumbar,
    action: 'status_changed',
    actor: 'admin@vantahg.com',
    details: { new_status: 'in_review', previous_status: 'brief_ready' },
  },
  {
    id: 'audit-001-07',
    created_at: daysAgo(1, 8),
    case_id: DEMO_CASE_IDS.mriLumbar,
    action: 'determination_made',
    actor: DEMO_REVIEWER_IDS.richardson,
    details: { determination: 'approve', rationale: 'All InterQual imaging criteria met. Progressive radiculopathy refractory to conservative management.' },
  },
  {
    id: 'audit-001-08',
    created_at: daysAgo(1, 8),
    case_id: DEMO_CASE_IDS.mriLumbar,
    action: 'status_changed',
    actor: DEMO_REVIEWER_IDS.richardson,
    details: { new_status: 'determination_made', previous_status: 'in_review' },
  },

  // --- Case 2: Total Knee Arthroplasty (in review) ---
  {
    id: 'audit-002-01',
    created_at: daysAgo(4, 10),
    case_id: DEMO_CASE_IDS.totalKnee,
    action: 'case_created',
    actor: 'system',
    details: { case_number: 'VHG-MED-0202', vertical: 'medical', service_category: 'surgery', source: 'portal_submission' },
  },
  {
    id: 'audit-002-02',
    created_at: daysAgo(4, 9, 55),
    case_id: DEMO_CASE_IDS.totalKnee,
    action: 'status_changed',
    actor: 'system',
    details: { new_status: 'processing', previous_status: 'intake' },
  },
  {
    id: 'audit-002-03',
    created_at: daysAgo(4, 8),
    case_id: DEMO_CASE_IDS.totalKnee,
    action: 'brief_generated',
    actor: 'system',
    details: { generated_automatically: true, confidence: 'high', recommendation: 'approve' },
  },
  {
    id: 'audit-002-04',
    created_at: daysAgo(4, 7, 55),
    case_id: DEMO_CASE_IDS.totalKnee,
    action: 'status_changed',
    actor: 'system',
    details: { new_status: 'brief_ready', previous_status: 'processing' },
  },
  {
    id: 'audit-002-05',
    created_at: daysAgo(1, 3),
    case_id: DEMO_CASE_IDS.totalKnee,
    action: 'reviewer_assigned',
    actor: 'admin@vantahg.com',
    details: { reviewer_id: DEMO_REVIEWER_IDS.patel, reviewer_name: 'Dr. Priya Patel' },
  },
  {
    id: 'audit-002-06',
    created_at: daysAgo(1, 3),
    case_id: DEMO_CASE_IDS.totalKnee,
    action: 'status_changed',
    actor: 'admin@vantahg.com',
    details: { new_status: 'in_review', previous_status: 'brief_ready' },
  },

  // --- Case 3: Infliximab Infusion (brief ready, not yet assigned) ---
  {
    id: 'audit-003-01',
    created_at: daysAgo(3, 6),
    case_id: DEMO_CASE_IDS.infliximab,
    action: 'case_created',
    actor: 'system',
    details: { case_number: 'VHG-MED-0203', vertical: 'medical', service_category: 'infusion', source: 'portal_submission', priority: 'urgent' },
  },
  {
    id: 'audit-003-02',
    created_at: daysAgo(3, 5, 55),
    case_id: DEMO_CASE_IDS.infliximab,
    action: 'status_changed',
    actor: 'system',
    details: { new_status: 'processing', previous_status: 'intake' },
  },
  {
    id: 'audit-003-03',
    created_at: daysAgo(3, 4),
    case_id: DEMO_CASE_IDS.infliximab,
    action: 'brief_generated',
    actor: 'system',
    details: { generated_automatically: true, confidence: 'high', recommendation: 'pend' },
  },
  {
    id: 'audit-003-04',
    created_at: daysAgo(3, 3, 55),
    case_id: DEMO_CASE_IDS.infliximab,
    action: 'status_changed',
    actor: 'system',
    details: { new_status: 'brief_ready', previous_status: 'processing' },
  },

  // --- Case 4: CPAP Device (just submitted) ---
  {
    id: 'audit-004-01',
    created_at: daysAgo(0, 4),
    case_id: DEMO_CASE_IDS.cpap,
    action: 'case_created',
    actor: 'system',
    details: { case_number: 'VHG-MED-0204', vertical: 'medical', service_category: 'dme', source: 'portal_submission', priority: 'standard' },
  },

  // --- Case 5: Psychotherapy (denied) ---
  {
    id: 'audit-005-01',
    created_at: daysAgo(5, 11),
    case_id: DEMO_CASE_IDS.psychotherapy,
    action: 'case_created',
    actor: 'system',
    details: { case_number: 'VHG-MED-0199', vertical: 'medical', service_category: 'behavioral_health', source: 'portal_submission' },
  },
  {
    id: 'audit-005-02',
    created_at: daysAgo(5, 10, 55),
    case_id: DEMO_CASE_IDS.psychotherapy,
    action: 'status_changed',
    actor: 'system',
    details: { new_status: 'processing', previous_status: 'intake' },
  },
  {
    id: 'audit-005-03',
    created_at: daysAgo(5, 9),
    case_id: DEMO_CASE_IDS.psychotherapy,
    action: 'brief_generated',
    actor: 'system',
    details: { generated_automatically: true, confidence: 'medium', recommendation: 'deny' },
  },
  {
    id: 'audit-005-04',
    created_at: daysAgo(5, 8, 55),
    case_id: DEMO_CASE_IDS.psychotherapy,
    action: 'status_changed',
    actor: 'system',
    details: { new_status: 'brief_ready', previous_status: 'processing' },
  },
  {
    id: 'audit-005-05',
    created_at: daysAgo(4, 7),
    case_id: DEMO_CASE_IDS.psychotherapy,
    action: 'reviewer_assigned',
    actor: 'admin@vantahg.com',
    details: { reviewer_id: DEMO_REVIEWER_IDS.torres, reviewer_name: 'Dr. Michael Torres' },
  },
  {
    id: 'audit-005-06',
    created_at: daysAgo(4, 7),
    case_id: DEMO_CASE_IDS.psychotherapy,
    action: 'status_changed',
    actor: 'admin@vantahg.com',
    details: { new_status: 'in_review', previous_status: 'brief_ready' },
  },
  {
    id: 'audit-005-07',
    created_at: daysAgo(2, 6),
    case_id: DEMO_CASE_IDS.psychotherapy,
    action: 'determination_made',
    actor: DEMO_REVIEWER_IDS.torres,
    details: { determination: 'deny', rationale: 'Treatment plateau reached. Step-down to standard session (90834) at biweekly frequency recommended.' },
  },
  {
    id: 'audit-005-08',
    created_at: daysAgo(2, 6),
    case_id: DEMO_CASE_IDS.psychotherapy,
    action: 'status_changed',
    actor: DEMO_REVIEWER_IDS.torres,
    details: { new_status: 'determination_made', previous_status: 'in_review' },
  },
  {
    id: 'audit-005-09',
    created_at: daysAgo(2, 5),
    case_id: DEMO_CASE_IDS.psychotherapy,
    action: 'p2p_offered',
    actor: 'system',
    details: { provider_notified: true, method: 'secure_message', deadline: daysAgo(-3) },
  },

  // --- Case 6: Lumbar Epidural Steroid Injection (in review) ---
  {
    id: 'audit-006-01',
    created_at: daysAgo(2, 9),
    case_id: DEMO_CASE_IDS.epiduralInjection,
    action: 'case_created',
    actor: 'system',
    details: { case_number: 'VHG-MED-0200', vertical: 'medical', service_category: 'pain_management', source: 'portal_submission', priority: 'expedited' },
  },
  {
    id: 'audit-006-02',
    created_at: daysAgo(2, 8, 55),
    case_id: DEMO_CASE_IDS.epiduralInjection,
    action: 'status_changed',
    actor: 'system',
    details: { new_status: 'processing', previous_status: 'intake' },
  },
  {
    id: 'audit-006-03',
    created_at: daysAgo(2, 7),
    case_id: DEMO_CASE_IDS.epiduralInjection,
    action: 'brief_generated',
    actor: 'system',
    details: { generated_automatically: true, confidence: 'medium', recommendation: 'approve' },
  },
  {
    id: 'audit-006-04',
    created_at: daysAgo(2, 6, 55),
    case_id: DEMO_CASE_IDS.epiduralInjection,
    action: 'status_changed',
    actor: 'system',
    details: { new_status: 'brief_ready', previous_status: 'processing' },
  },
  {
    id: 'audit-006-05',
    created_at: daysAgo(0, 6),
    case_id: DEMO_CASE_IDS.epiduralInjection,
    action: 'reviewer_assigned',
    actor: 'admin@vantahg.com',
    details: { reviewer_id: DEMO_REVIEWER_IDS.richardson, reviewer_name: 'Dr. James Richardson' },
  },
  {
    id: 'audit-006-06',
    created_at: daysAgo(0, 6),
    case_id: DEMO_CASE_IDS.epiduralInjection,
    action: 'status_changed',
    actor: 'admin@vantahg.com',
    details: { new_status: 'in_review', previous_status: 'brief_ready' },
  },
];
