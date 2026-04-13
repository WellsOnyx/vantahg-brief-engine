/**
 * VantaUM Demo Seed Script
 *
 * Populates Supabase with realistic UM demo data.
 * Idempotent — safe to run multiple times (uses upsert / ON CONFLICT).
 *
 * Usage:
 *   npx tsx scripts/seed-demo.ts
 *
 * Requires env vars:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// ENV
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them in .env.local or export them."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(days: number, hours = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hours, 0, 0, 0);
  return d.toISOString();
}

function hoursFromNow(hours: number): string {
  const d = new Date();
  d.setTime(d.getTime() + hours * 3600000);
  return d.toISOString();
}

function hoursAfter(iso: string, hours: number): string {
  const d = new Date(iso);
  d.setTime(d.getTime() + hours * 3600000);
  return d.toISOString();
}

function log(msg: string) {
  console.log(`[seed] ${msg}`);
}

// ---------------------------------------------------------------------------
// Stable IDs (deterministic so upserts work)
// ---------------------------------------------------------------------------

const REVIEWER_IDS = {
  okafor: "d0000001-0000-0000-0000-000000000001",
  nakamura: "d0000001-0000-0000-0000-000000000002",
  brennan: "d0000001-0000-0000-0000-000000000003",
};

const CLIENT_IDS = {
  southwestAdmin: "d0000002-0000-0000-0000-000000000001",
  gulfHealth: "d0000002-0000-0000-0000-000000000002",
};

const CASE_IDS = {
  totalKnee: "d0000003-0000-0000-0000-000000000001",
  cardiacCath: "d0000003-0000-0000-0000-000000000002",
  chemotherapy: "d0000003-0000-0000-0000-000000000003",
  mriLumbar: "d0000003-0000-0000-0000-000000000004",
  mastectomy: "d0000003-0000-0000-0000-000000000005",
  stentPlacement: "d0000003-0000-0000-0000-000000000006",
  ptRehab: "d0000003-0000-0000-0000-000000000007",
  colonoscopy: "d0000003-0000-0000-0000-000000000008",
  immunotherapy: "d0000003-0000-0000-0000-000000000009",
  shoulderArthro: "d0000003-0000-0000-0000-00000000000a",
};

const EFAX_IDS = {
  completed: "d0000004-0000-0000-0000-000000000001",
  manualReview: "d0000004-0000-0000-0000-000000000002",
  received1: "d0000004-0000-0000-0000-000000000003",
  received2: "d0000004-0000-0000-0000-000000000004",
};

// ---------------------------------------------------------------------------
// REVIEWERS
// ---------------------------------------------------------------------------

const reviewers = [
  {
    id: REVIEWER_IDS.okafor,
    name: "Dr. Chinedu Okafor",
    credentials: "MD, FACS",
    specialty: "Orthopedic Surgery",
    subspecialty: "Joint Reconstruction",
    board_certifications: [
      "American Board of Orthopaedic Surgery",
      "Subspecialty Certificate in Surgery of the Hand",
    ],
    license_state: ["TX", "AZ", "NM", "OK"],
    license_states: ["TX", "AZ", "NM", "OK"],
    approved_service_categories: [
      "surgery",
      "imaging",
      "rehab_therapy",
      "pain_management",
      "dme",
    ],
    max_cases_per_day: 18,
    avg_turnaround_hours: 1.8,
    dea_number: "BO1234567",
    email: "c.okafor@vantaum.com",
    phone: "(214) 555-0193",
    status: "active",
    cases_completed: 1847,
  },
  {
    id: REVIEWER_IDS.nakamura,
    name: "Dr. Kenji Nakamura",
    credentials: "MD, FACC",
    specialty: "Cardiology",
    subspecialty: "Interventional Cardiology",
    board_certifications: [
      "American Board of Internal Medicine - Cardiovascular Disease",
      "American Board of Internal Medicine - Interventional Cardiology",
    ],
    license_state: ["TX", "LA", "MS", "AL", "FL"],
    license_states: ["TX", "LA", "MS", "AL", "FL"],
    approved_service_categories: [
      "cardiology",
      "imaging",
      "surgery",
      "infusion",
    ],
    max_cases_per_day: 15,
    avg_turnaround_hours: 2.3,
    dea_number: "BN9876543",
    email: "k.nakamura@vantaum.com",
    phone: "(713) 555-0247",
    status: "active",
    cases_completed: 932,
  },
  {
    id: REVIEWER_IDS.brennan,
    name: "Dr. Catherine Brennan",
    credentials: "MD, FACP",
    specialty: "Hematology/Oncology",
    subspecialty: "Breast Oncology",
    board_certifications: [
      "American Board of Internal Medicine",
      "American Board of Internal Medicine - Medical Oncology",
      "American Board of Internal Medicine - Hematology",
    ],
    license_state: ["TX", "FL", "GA", "NC", "VA"],
    license_states: ["TX", "FL", "GA", "NC", "VA"],
    approved_service_categories: [
      "oncology",
      "infusion",
      "imaging",
      "genetic_testing",
      "surgery",
    ],
    max_cases_per_day: 12,
    avg_turnaround_hours: 2.9,
    dea_number: "BB5551234",
    email: "c.brennan@vantaum.com",
    phone: "(404) 555-0312",
    status: "active",
    cases_completed: 614,
  },
];

// ---------------------------------------------------------------------------
// CLIENTS
// ---------------------------------------------------------------------------

const clients = [
  {
    id: CLIENT_IDS.southwestAdmin,
    name: "Southwest Administrators",
    type: "tpa",
    contact_name: "Rachel Gutierrez",
    contact_email: "rachel.g@southwestadmin.com",
    contact_phone: "(602) 555-0188",
    uses_interqual: true,
    uses_mcg: false,
    custom_guidelines_url: null,
    contracted_sla_hours: 48,
    contracted_rate_per_case: 85.0,
  },
  {
    id: CLIENT_IDS.gulfHealth,
    name: "Gulf Health Partners",
    type: "health_plan",
    contact_name: "Mohammed Al-Rashid",
    contact_email: "m.alrashid@gulfhealthpartners.com",
    contact_phone: "(713) 555-0299",
    uses_interqual: false,
    uses_mcg: true,
    custom_guidelines_url: "https://portal.gulfhealthpartners.com/guidelines",
    contracted_sla_hours: 72,
    contracted_rate_per_case: 110.0,
  },
];

// ---------------------------------------------------------------------------
// CASES
// ---------------------------------------------------------------------------

const casesCreatedAt = {
  totalKnee: daysAgo(5, 3),
  cardiacCath: daysAgo(4, 6),
  chemotherapy: daysAgo(3, 2),
  mriLumbar: daysAgo(2, 8),
  mastectomy: daysAgo(2, 1),
  stentPlacement: daysAgo(1, 5),
  ptRehab: daysAgo(1, 2),
  colonoscopy: daysAgo(0, 6),
  immunotherapy: daysAgo(0, 4),
  shoulderArthro: daysAgo(0, 1),
};

const sampleBrief = (
  question: string,
  diagnosis: string,
  codes: string[],
  recommendation: "approve" | "deny" | "pend"
): object => ({
  clinical_question: question,
  patient_summary: `Patient presents with ${diagnosis}. Conservative treatment has been attempted per documentation.`,
  diagnosis_analysis: {
    primary_diagnosis: diagnosis,
    secondary_diagnoses: ["Essential hypertension (I10)", "Type 2 diabetes mellitus (E11.9)"],
    diagnosis_procedure_alignment: "Strong alignment between diagnosis and requested procedure.",
  },
  procedure_analysis: {
    codes,
    clinical_rationale: "Procedure is clinically indicated based on documented failed conservative therapy.",
    complexity_level: "moderate",
    setting_appropriateness: "Appropriate for the requested setting.",
  },
  criteria_match: {
    guideline_source: "InterQual 2024.1",
    applicable_guideline: "Musculoskeletal — Surgical Intervention",
    criteria_met: ["Failed conservative therapy > 6 weeks", "Functional limitation documented"],
    criteria_not_met: [],
    criteria_unable_to_assess: [],
    conservative_alternatives: [],
  },
  documentation_review: {
    documents_provided: "Clinical notes, imaging reports, referral letter",
    key_findings: ["Imaging confirms pathology", "Prior auth for conservative therapy on file"],
    missing_documentation: [],
  },
  ai_recommendation: {
    recommendation,
    confidence: "high",
    rationale: `Clinical documentation supports medical necessity for the requested procedure.`,
    key_considerations: ["Well-documented clinical pathway", "Appropriate setting"],
    if_modify_suggestion: null,
  },
  reviewer_action: {
    decision_required: "Standard medical necessity determination",
    time_sensitivity: "Standard — within SLA window",
    peer_to_peer_suggested: false,
    additional_info_needed: [],
    state_specific_requirements: [],
  },
});

const cases = [
  {
    id: CASE_IDS.totalKnee,
    created_at: casesCreatedAt.totalKnee,
    case_number: "UM-2026-04-0001",
    status: "delivered",
    priority: "standard",
    service_category: "surgery",
    review_type: "prior_auth",
    patient_name: "Robert J. Henderson",
    patient_dob: "1958-03-14",
    patient_member_id: "SWA-881204",
    patient_gender: "Male",
    requesting_provider: "Dr. Alan Whitfield",
    requesting_provider_npi: "1234567890",
    requesting_provider_specialty: "Orthopedic Surgery",
    servicing_provider: "Dr. Alan Whitfield",
    servicing_provider_npi: "1234567890",
    facility_name: "Banner University Medical Center",
    facility_type: "inpatient",
    procedure_codes: ["27447"],
    diagnosis_codes: ["M17.11", "M17.12"],
    procedure_description: "Total knee arthroplasty, right knee",
    clinical_question:
      "Medical necessity for total knee replacement after failed conservative management including physical therapy, NSAIDs, and corticosteroid injections over 14 months.",
    assigned_reviewer_id: REVIEWER_IDS.okafor,
    payer_name: "Southwest Administrators",
    plan_type: "PPO",
    sla_hours: 48,
    turnaround_deadline: hoursAfter(casesCreatedAt.totalKnee, 48),
    ai_brief: sampleBrief(
      "Medical necessity for TKA",
      "Primary osteoarthritis, bilateral knees (M17.11, M17.12)",
      ["27447"],
      "approve"
    ),
    ai_brief_generated_at: hoursAfter(casesCreatedAt.totalKnee, 0.5),
    determination: "approve",
    determination_rationale:
      "Patient meets InterQual criteria for total knee arthroplasty. Documented failure of conservative therapy over 14 months including PT, NSAIDs, and intra-articular injections. Radiographic evidence of Kellgren-Lawrence grade IV osteoarthritis bilaterally.",
    determination_at: hoursAfter(casesCreatedAt.totalKnee, 6),
    determined_by: REVIEWER_IDS.okafor,
    client_id: CLIENT_IDS.southwestAdmin,
    intake_channel: "portal",
  },
  {
    id: CASE_IDS.cardiacCath,
    created_at: casesCreatedAt.cardiacCath,
    case_number: "UM-2026-04-0002",
    status: "determination_made",
    priority: "urgent",
    service_category: "cardiology",
    review_type: "prior_auth",
    patient_name: "Maria Elena Vasquez",
    patient_dob: "1965-09-22",
    patient_member_id: "GHP-447891",
    patient_gender: "Female",
    requesting_provider: "Dr. Stephen Park",
    requesting_provider_npi: "2345678901",
    requesting_provider_specialty: "Cardiology",
    servicing_provider: "Dr. Stephen Park",
    servicing_provider_npi: "2345678901",
    facility_name: "Houston Methodist Hospital",
    facility_type: "inpatient",
    procedure_codes: ["93458", "93459"],
    diagnosis_codes: ["I25.10", "I20.0", "R07.9"],
    procedure_description: "Left heart catheterization with coronary angiography",
    clinical_question:
      "Medical necessity for diagnostic cardiac catheterization in patient with unstable angina and positive stress test with reversible perfusion defects.",
    assigned_reviewer_id: REVIEWER_IDS.nakamura,
    payer_name: "Gulf Health Partners",
    plan_type: "HMO",
    sla_hours: 24,
    turnaround_deadline: hoursAfter(casesCreatedAt.cardiacCath, 24),
    ai_brief: sampleBrief(
      "Medical necessity for cardiac catheterization",
      "Unstable angina (I20.0), chronic ischemic heart disease (I25.10)",
      ["93458", "93459"],
      "approve"
    ),
    ai_brief_generated_at: hoursAfter(casesCreatedAt.cardiacCath, 0.3),
    determination: "approve",
    determination_rationale:
      "Meets MCG criteria for diagnostic catheterization. Patient presents with accelerating anginal symptoms, troponin-negative but with dynamic ST changes on telemetry. Nuclear stress test demonstrates moderate reversible inferior and apical perfusion defects. Catheterization indicated for risk stratification and potential intervention.",
    determination_at: hoursAfter(casesCreatedAt.cardiacCath, 3),
    determined_by: REVIEWER_IDS.nakamura,
    client_id: CLIENT_IDS.gulfHealth,
    intake_channel: "efax",
  },
  {
    id: CASE_IDS.chemotherapy,
    created_at: casesCreatedAt.chemotherapy,
    case_number: "UM-2026-04-0003",
    status: "md_review",
    priority: "urgent",
    service_category: "oncology",
    review_type: "prior_auth",
    patient_name: "Dorothy Mae Williams",
    patient_dob: "1951-12-05",
    patient_member_id: "GHP-223847",
    patient_gender: "Female",
    requesting_provider: "Dr. Lisa Chen",
    requesting_provider_npi: "3456789012",
    requesting_provider_specialty: "Medical Oncology",
    servicing_provider: "Gulf Coast Cancer Center",
    servicing_provider_npi: "3456789013",
    facility_name: "Gulf Coast Cancer Center",
    facility_type: "outpatient",
    procedure_codes: ["96413", "96415", "J9271"],
    diagnosis_codes: ["C50.911", "Z85.3"],
    procedure_description:
      "Pembrolizumab (Keytruda) infusion therapy for metastatic triple-negative breast cancer",
    clinical_question:
      "Medical necessity for pembrolizumab plus chemotherapy as first-line treatment for PD-L1 positive metastatic triple-negative breast cancer (CPS >= 10).",
    assigned_reviewer_id: REVIEWER_IDS.brennan,
    payer_name: "Gulf Health Partners",
    plan_type: "HMO",
    sla_hours: 72,
    turnaround_deadline: hoursAfter(casesCreatedAt.chemotherapy, 72),
    ai_brief: sampleBrief(
      "Medical necessity for pembrolizumab + chemotherapy",
      "Metastatic triple-negative breast cancer (C50.911), PD-L1 positive",
      ["96413", "96415", "J9271"],
      "approve"
    ),
    ai_brief_generated_at: hoursAfter(casesCreatedAt.chemotherapy, 0.4),
    determination: null,
    determination_rationale: null,
    determination_at: null,
    determined_by: null,
    client_id: CLIENT_IDS.gulfHealth,
    intake_channel: "portal",
  },
  {
    id: CASE_IDS.mriLumbar,
    created_at: casesCreatedAt.mriLumbar,
    case_number: "UM-2026-04-0004",
    status: "brief_ready",
    priority: "standard",
    service_category: "imaging",
    review_type: "prior_auth",
    patient_name: "James K. Thornton",
    patient_dob: "1972-07-30",
    patient_member_id: "SWA-559312",
    patient_gender: "Male",
    requesting_provider: "Dr. Patricia Morales",
    requesting_provider_npi: "4567890123",
    requesting_provider_specialty: "Family Medicine",
    servicing_provider: "Desert Imaging Associates",
    servicing_provider_npi: "4567890124",
    facility_name: "Desert Imaging Associates",
    facility_type: "outpatient",
    procedure_codes: ["72148"],
    diagnosis_codes: ["M54.5", "M51.16"],
    procedure_description: "MRI lumbar spine without contrast",
    clinical_question:
      "Medical necessity for lumbar MRI in patient with 8-week history of low back pain radiating to left lower extremity, failed 6 weeks of conservative therapy.",
    assigned_reviewer_id: null,
    payer_name: "Southwest Administrators",
    plan_type: "PPO",
    sla_hours: 48,
    turnaround_deadline: hoursAfter(casesCreatedAt.mriLumbar, 48),
    ai_brief: sampleBrief(
      "Medical necessity for lumbar MRI",
      "Low back pain (M54.5), lumbar disc herniation (M51.16)",
      ["72148"],
      "approve"
    ),
    ai_brief_generated_at: hoursAfter(casesCreatedAt.mriLumbar, 0.3),
    determination: null,
    determination_rationale: null,
    determination_at: null,
    determined_by: null,
    client_id: CLIENT_IDS.southwestAdmin,
    intake_channel: "efax",
  },
  {
    id: CASE_IDS.mastectomy,
    created_at: casesCreatedAt.mastectomy,
    case_number: "UM-2026-04-0005",
    status: "md_review",
    priority: "expedited",
    service_category: "surgery",
    review_type: "prior_auth",
    patient_name: "Angela R. Morrison",
    patient_dob: "1968-04-18",
    patient_member_id: "SWA-772019",
    patient_gender: "Female",
    requesting_provider: "Dr. Howard Ng",
    requesting_provider_npi: "5678901234",
    requesting_provider_specialty: "Surgical Oncology",
    servicing_provider: "Dr. Howard Ng",
    servicing_provider_npi: "5678901234",
    facility_name: "Scottsdale Surgical Center",
    facility_type: "inpatient",
    procedure_codes: ["19303", "19357"],
    diagnosis_codes: ["C50.412", "Z80.3"],
    procedure_description:
      "Bilateral mastectomy with immediate tissue expander reconstruction",
    clinical_question:
      "Medical necessity for bilateral mastectomy with reconstruction in patient with left breast invasive ductal carcinoma (stage IIA) and strong family history (BRCA1 positive).",
    assigned_reviewer_id: REVIEWER_IDS.brennan,
    payer_name: "Southwest Administrators",
    plan_type: "PPO",
    sla_hours: 48,
    turnaround_deadline: hoursAfter(casesCreatedAt.mastectomy, 48),
    ai_brief: sampleBrief(
      "Medical necessity for bilateral mastectomy with reconstruction",
      "Invasive ductal carcinoma left breast (C50.412), BRCA1 positive",
      ["19303", "19357"],
      "approve"
    ),
    ai_brief_generated_at: hoursAfter(casesCreatedAt.mastectomy, 0.5),
    determination: null,
    determination_rationale: null,
    determination_at: null,
    determined_by: null,
    client_id: CLIENT_IDS.southwestAdmin,
    intake_channel: "portal",
  },
  {
    id: CASE_IDS.stentPlacement,
    created_at: casesCreatedAt.stentPlacement,
    case_number: "UM-2026-04-0006",
    status: "processing",
    priority: "urgent",
    service_category: "cardiology",
    review_type: "prior_auth",
    patient_name: "William T. Crawford",
    patient_dob: "1955-11-09",
    patient_member_id: "GHP-661088",
    patient_gender: "Male",
    requesting_provider: "Dr. Amir Hassan",
    requesting_provider_npi: "6789012345",
    requesting_provider_specialty: "Interventional Cardiology",
    servicing_provider: "Dr. Amir Hassan",
    servicing_provider_npi: "6789012345",
    facility_name: "Memorial Hermann Heart & Vascular Institute",
    facility_type: "inpatient",
    procedure_codes: ["92928", "C9600"],
    diagnosis_codes: ["I25.110", "I25.700"],
    procedure_description:
      "Percutaneous coronary intervention with drug-eluting stent placement, LAD",
    clinical_question:
      "Medical necessity for PCI with DES placement in patient with severe single-vessel CAD of LAD with 90% stenosis on diagnostic catheterization.",
    assigned_reviewer_id: null,
    payer_name: "Gulf Health Partners",
    plan_type: "HMO",
    sla_hours: 24,
    turnaround_deadline: hoursAfter(casesCreatedAt.stentPlacement, 24),
    ai_brief: null,
    ai_brief_generated_at: null,
    determination: null,
    determination_rationale: null,
    determination_at: null,
    determined_by: null,
    client_id: CLIENT_IDS.gulfHealth,
    intake_channel: "efax",
  },
  {
    id: CASE_IDS.ptRehab,
    created_at: casesCreatedAt.ptRehab,
    case_number: "UM-2026-04-0007",
    status: "brief_ready",
    priority: "standard",
    service_category: "rehab_therapy",
    review_type: "concurrent",
    patient_name: "Susan M. Dalton",
    patient_dob: "1960-01-25",
    patient_member_id: "SWA-334871",
    patient_gender: "Female",
    requesting_provider: "Dr. Kevin Brooks",
    requesting_provider_npi: "7890123456",
    requesting_provider_specialty: "Physical Medicine & Rehabilitation",
    servicing_provider: "Arizona Sports & Spine Rehab",
    servicing_provider_npi: "7890123457",
    facility_name: "Arizona Sports & Spine Rehab",
    facility_type: "outpatient",
    procedure_codes: ["97110", "97140", "97530"],
    diagnosis_codes: ["M75.111", "S46.011A"],
    procedure_description:
      "Physical therapy — continued authorization for 12 additional visits post rotator cuff repair",
    clinical_question:
      "Concurrent review for extended PT visits following right rotator cuff repair. Patient at 8 weeks post-op, progressing but not yet at functional baseline.",
    assigned_reviewer_id: null,
    payer_name: "Southwest Administrators",
    plan_type: "PPO",
    sla_hours: 48,
    turnaround_deadline: hoursAfter(casesCreatedAt.ptRehab, 48),
    ai_brief: sampleBrief(
      "Concurrent review for extended PT after rotator cuff repair",
      "Rotator cuff tear, right shoulder (M75.111)",
      ["97110", "97140", "97530"],
      "approve"
    ),
    ai_brief_generated_at: hoursAfter(casesCreatedAt.ptRehab, 0.4),
    determination: null,
    determination_rationale: null,
    determination_at: null,
    determined_by: null,
    client_id: CLIENT_IDS.southwestAdmin,
    intake_channel: "portal",
  },
  {
    id: CASE_IDS.colonoscopy,
    created_at: casesCreatedAt.colonoscopy,
    case_number: "UM-2026-04-0008",
    status: "intake",
    priority: "standard",
    service_category: "surgery",
    review_type: "prior_auth",
    patient_name: "Frank D. Nguyen",
    patient_dob: "1970-06-12",
    patient_member_id: "GHP-998412",
    patient_gender: "Male",
    requesting_provider: "Dr. Sarah Feldman",
    requesting_provider_npi: "8901234567",
    requesting_provider_specialty: "Gastroenterology",
    servicing_provider: "Dr. Sarah Feldman",
    servicing_provider_npi: "8901234567",
    facility_name: "Houston Endoscopy Center",
    facility_type: "asc",
    procedure_codes: ["45385", "45380"],
    diagnosis_codes: ["K63.5", "D12.6", "Z86.010"],
    procedure_description:
      "Colonoscopy with polypectomy — surveillance for history of colorectal polyps",
    clinical_question:
      "Medical necessity for surveillance colonoscopy with polypectomy in patient with personal history of adenomatous polyps, 3 years since last colonoscopy.",
    assigned_reviewer_id: null,
    payer_name: "Gulf Health Partners",
    plan_type: "HMO",
    sla_hours: 72,
    turnaround_deadline: hoursAfter(casesCreatedAt.colonoscopy, 72),
    ai_brief: null,
    ai_brief_generated_at: null,
    determination: null,
    determination_rationale: null,
    determination_at: null,
    determined_by: null,
    client_id: CLIENT_IDS.gulfHealth,
    intake_channel: "phone",
  },
  {
    id: CASE_IDS.immunotherapy,
    created_at: casesCreatedAt.immunotherapy,
    case_number: "UM-2026-04-0009",
    status: "intake",
    priority: "urgent",
    service_category: "oncology",
    review_type: "prior_auth",
    patient_name: "Patricia A. Jackson",
    patient_dob: "1948-08-03",
    patient_member_id: "GHP-115539",
    patient_gender: "Female",
    requesting_provider: "Dr. Raj Mehta",
    requesting_provider_npi: "9012345678",
    requesting_provider_specialty: "Medical Oncology",
    servicing_provider: "MD Anderson Regional Care Center",
    servicing_provider_npi: "9012345679",
    facility_name: "MD Anderson Regional Care Center",
    facility_type: "outpatient",
    procedure_codes: ["96413", "J9299"],
    diagnosis_codes: ["C34.11", "C78.01"],
    procedure_description:
      "Nivolumab (Opdivo) infusion for metastatic non-small cell lung cancer",
    clinical_question:
      "Medical necessity for nivolumab as second-line therapy for stage IV NSCLC with liver metastases, PD-L1 expression >= 1%, progression on first-line platinum-based chemotherapy.",
    assigned_reviewer_id: null,
    payer_name: "Gulf Health Partners",
    plan_type: "HMO",
    sla_hours: 72,
    turnaround_deadline: hoursAfter(casesCreatedAt.immunotherapy, 72),
    ai_brief: null,
    ai_brief_generated_at: null,
    determination: null,
    determination_rationale: null,
    determination_at: null,
    determined_by: null,
    client_id: CLIENT_IDS.gulfHealth,
    intake_channel: "efax",
  },
  {
    id: CASE_IDS.shoulderArthro,
    created_at: casesCreatedAt.shoulderArthro,
    case_number: "UM-2026-04-0010",
    status: "processing",
    priority: "standard",
    service_category: "surgery",
    review_type: "prior_auth",
    patient_name: "Michael R. Torres",
    patient_dob: "1980-02-28",
    patient_member_id: "SWA-440267",
    patient_gender: "Male",
    requesting_provider: "Dr. Emily Sato",
    requesting_provider_npi: "0123456789",
    requesting_provider_specialty: "Orthopedic Surgery",
    servicing_provider: "Dr. Emily Sato",
    servicing_provider_npi: "0123456789",
    facility_name: "Phoenix Orthopedic Surgery Center",
    facility_type: "asc",
    procedure_codes: ["29827"],
    diagnosis_codes: ["M75.120", "M24.411"],
    procedure_description:
      "Arthroscopic rotator cuff repair with subacromial decompression, left shoulder",
    clinical_question:
      "Medical necessity for arthroscopic rotator cuff repair after 12 weeks of failed conservative management including PT, corticosteroid injection, and activity modification.",
    assigned_reviewer_id: null,
    payer_name: "Southwest Administrators",
    plan_type: "PPO",
    sla_hours: 48,
    turnaround_deadline: hoursAfter(casesCreatedAt.shoulderArthro, 48),
    ai_brief: null,
    ai_brief_generated_at: null,
    determination: null,
    determination_rationale: null,
    determination_at: null,
    determined_by: null,
    client_id: CLIENT_IDS.southwestAdmin,
    intake_channel: "efax",
  },
];

// ---------------------------------------------------------------------------
// EFAX QUEUE
// ---------------------------------------------------------------------------

const efaxEntries = [
  {
    id: EFAX_IDS.completed,
    fax_id: "phx-fax-20260412-001",
    from_number: "+16025551234",
    to_number: "+18005559876",
    page_count: 4,
    status: "case_created",
    ocr_text:
      "Patient: James K. Thornton DOB: 07/30/1972 Member ID: SWA-559312 ... MRI Lumbar Spine ... Diagnosis: M54.5 Low back pain, M51.16 Lumbar disc herniation ... Requesting Provider: Dr. Patricia Morales NPI: 4567890123",
    ocr_confidence: 94.5,
    parsed_data: {
      patient_name: "James K. Thornton",
      patient_dob: "1972-07-30",
      patient_member_id: "SWA-559312",
      procedure_codes: ["72148"],
      diagnosis_codes: ["M54.5", "M51.16"],
      requesting_provider: "Dr. Patricia Morales",
      requesting_provider_npi: "4567890123",
      procedure_description: "MRI lumbar spine without contrast",
    },
    case_id: CASE_IDS.mriLumbar,
    provider: "phaxio",
    provider_metadata: {
      phaxio_fax_id: "phx-fax-20260412-001",
      direction: "received",
      num_pages: 4,
    },
    attempts: 1,
    extraction_method: "ai",
    ocr_provider: "google_vision",
    submission_fingerprint: "sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
    processing_started_at: daysAgo(2, 7),
    processing_completed_at: daysAgo(2, 7),
  },
  {
    id: EFAX_IDS.manualReview,
    fax_id: "phx-fax-20260413-002",
    from_number: "+17135559988",
    to_number: "+18005559876",
    page_count: 7,
    status: "manual_review",
    ocr_text:
      "... partially legible ... Patient: [illegible] ... DOB: [illegible] ... referring Dr. [smudged] ... cardiology consult ... chest pain evaluation ...",
    ocr_confidence: 42.1,
    parsed_data: {
      patient_name: null,
      patient_dob: null,
      procedure_codes: [],
      diagnosis_codes: ["R07.9"],
      requesting_provider: null,
      procedure_description: "Cardiology consult - chest pain evaluation",
    },
    case_id: null,
    needs_manual_review: true,
    manual_review_reasons: [
      "OCR confidence below 60%",
      "Missing patient demographics",
      "Missing provider information",
    ],
    provider: "phaxio",
    provider_metadata: {
      phaxio_fax_id: "phx-fax-20260413-002",
      direction: "received",
      num_pages: 7,
    },
    attempts: 1,
    extraction_method: "regex_fallback",
    ocr_provider: "google_vision",
    processing_started_at: daysAgo(0, 3),
    processing_completed_at: daysAgo(0, 3),
  },
  {
    id: EFAX_IDS.received1,
    fax_id: "phx-fax-20260413-003",
    from_number: "+14045557766",
    to_number: "+18005559876",
    page_count: 3,
    status: "received",
    ocr_text: null,
    ocr_confidence: null,
    parsed_data: null,
    case_id: null,
    provider: "phaxio",
    provider_metadata: {
      phaxio_fax_id: "phx-fax-20260413-003",
      direction: "received",
      num_pages: 3,
    },
    attempts: 0,
    extraction_method: null,
    ocr_provider: null,
    processing_started_at: null,
    processing_completed_at: null,
  },
  {
    id: EFAX_IDS.received2,
    fax_id: "phx-fax-20260413-004",
    from_number: "+12145553344",
    to_number: "+18005559876",
    page_count: 5,
    status: "received",
    ocr_text: null,
    ocr_confidence: null,
    parsed_data: null,
    case_id: null,
    provider: "phaxio",
    provider_metadata: {
      phaxio_fax_id: "phx-fax-20260413-004",
      direction: "received",
      num_pages: 5,
    },
    attempts: 0,
    extraction_method: null,
    ocr_provider: null,
    processing_started_at: null,
    processing_completed_at: null,
  },
];

// ---------------------------------------------------------------------------
// Seed functions
// ---------------------------------------------------------------------------

async function upsertRows(
  table: string,
  rows: Record<string, unknown>[],
  conflictColumn = "id"
) {
  const { error } = await supabase.from(table).upsert(rows, {
    onConflict: conflictColumn,
    ignoreDuplicates: true,
  });
  if (error) {
    console.error(`  ERROR upserting into ${table}:`, error.message);
    throw error;
  }
}

async function main() {
  log("Starting VantaUM demo seed...\n");

  // 1. Reviewers
  log("Inserting 3 reviewers...");
  await upsertRows("reviewers", reviewers);
  log("  Done: Dr. Okafor (Ortho), Dr. Nakamura (Cards), Dr. Brennan (Onc)\n");

  // 2. Clients
  log("Inserting 2 clients...");
  await upsertRows("clients", clients);
  log("  Done: Southwest Administrators (TPA), Gulf Health Partners (Health Plan)\n");

  // 3. Cases
  log("Inserting 10 cases...");
  await upsertRows("cases", cases, "case_number");
  log("  Done: statuses span intake -> delivered across surgical, cardiology, oncology, imaging, rehab\n");

  // 4. eFax queue
  log("Inserting 4 efax_queue entries...");
  await upsertRows("efax_queue", efaxEntries);
  log("  Done: 1 case_created, 1 manual_review, 2 received (pending)\n");

  // 5. Audit log entries for determined cases
  log("Inserting audit log entries...");
  const auditEntries = [
    {
      case_id: CASE_IDS.totalKnee,
      action: "determination_made",
      actor: "Dr. Chinedu Okafor",
      details: { determination: "approve", method: "standard_review" },
    },
    {
      case_id: CASE_IDS.totalKnee,
      action: "determination_delivered",
      actor: "system",
      details: { delivery_method: "portal", delivered_to: "Southwest Administrators" },
    },
    {
      case_id: CASE_IDS.cardiacCath,
      action: "determination_made",
      actor: "Dr. Kenji Nakamura",
      details: { determination: "approve", method: "urgent_review" },
    },
    {
      case_id: CASE_IDS.chemotherapy,
      action: "brief_generated",
      actor: "system",
      details: { model: "claude-opus-4-6", confidence: "high" },
    },
    {
      case_id: CASE_IDS.mriLumbar,
      action: "efax_received",
      actor: "system",
      details: { fax_id: "phx-fax-20260412-001", pages: 4 },
    },
  ];
  // Audit log has no natural key, so just insert (duplicates are harmless log entries)
  const { error: auditErr } = await supabase.from("audit_log").insert(auditEntries);
  if (auditErr) {
    console.error("  WARNING: audit_log insert:", auditErr.message);
  } else {
    log("  Done: 5 audit log entries\n");
  }

  log("Seed complete. Database is ready for demo.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
