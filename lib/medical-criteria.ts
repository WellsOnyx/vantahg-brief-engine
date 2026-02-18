export interface MedicalCriteria {
  name: string;
  category: string;
  typical_criteria: string[];
  common_denial_reasons: string[];
  guideline_references: string[];
}

export const medicalCriteria: Record<string, MedicalCriteria> = {
  // ── IMAGING ────────────────────────────────────────────────────────────────

  "72148": {
    name: "MRI Lumbar Spine without Contrast",
    category: "imaging",
    typical_criteria: [
      "Low back pain >6 weeks despite conservative treatment",
      "Progressive neurological deficit",
      "Red flags present (cancer history, unexplained weight loss, fever, IVDU)",
      "Failed conservative measures (PT, NSAIDs, activity modification)",
      "Radiculopathy with dermatomal distribution",
      "Prior X-ray showing abnormality requiring further evaluation"
    ],
    common_denial_reasons: [
      "Duration of symptoms <6 weeks without red flags",
      "No conservative treatment documented",
      "No neurological deficit documented on exam",
      "Repeat MRI within 12 months without clinical change",
      "No prior imaging performed"
    ],
    guideline_references: [
      "ACR Appropriateness Criteria - Low Back Pain",
      "InterQual Imaging Criteria",
      "MCG Imaging Guidelines"
    ]
  },

  "70553": {
    name: "MRI Brain with and without Contrast",
    category: "imaging",
    typical_criteria: [
      "New-onset seizures in adults",
      "Suspected intracranial mass or lesion",
      "Follow-up of known intracranial pathology",
      "Suspected multiple sclerosis (MS)",
      "Thunderclap headache after negative CT",
      "Persistent neurological symptoms unexplained by other workup"
    ],
    common_denial_reasons: [
      "Chronic headache without change in pattern or new features",
      "Repeat imaging without interval clinical change",
      "Screening without clinical indication",
      "Contrast not clinically justified"
    ],
    guideline_references: [
      "ACR Appropriateness Criteria - Headache",
      "AAN Clinical Practice Guidelines"
    ]
  },

  "74177": {
    name: "CT Abdomen and Pelvis with Contrast",
    category: "imaging",
    typical_criteria: [
      "Acute abdominal pain with concerning features (peritoneal signs, fever, leukocytosis)",
      "Known malignancy - staging or restaging",
      "Suspected abscess, appendicitis, or diverticulitis",
      "Unexplained weight loss with GI symptoms",
      "Hematuria workup",
      "Trauma evaluation"
    ],
    common_denial_reasons: [
      "Chronic abdominal pain without new findings or red flags",
      "Surveillance imaging outside recommended interval",
      "IV contrast not clinically indicated",
      "Ultrasound more appropriate as first-line study"
    ],
    guideline_references: [
      "ACR Appropriateness Criteria - Abdominal Pain",
      "NCCN Guidelines (oncology staging)"
    ]
  },

  // ── SURGERY ────────────────────────────────────────────────────────────────

  "27447": {
    name: "Total Knee Arthroplasty (TKA)",
    category: "surgery",
    typical_criteria: [
      "Kellgren-Lawrence grade 3-4 osteoarthritis on radiographic imaging",
      "Failed conservative treatment for >=3 months (PT, weight management, analgesics)",
      "Significant functional impairment documented (gait, ADLs, validated outcome scores)",
      "BMI documented and addressed in surgical planning",
      "Corticosteroid and/or viscosupplementation injections trialed without sustained relief",
      "No active infection at the surgical site"
    ],
    common_denial_reasons: [
      "Insufficient conservative treatment (<3 months or incomplete trial)",
      "Mild arthritis - Kellgren-Lawrence grade 1-2",
      "BMI >40 without documented optimization plan",
      "No documentation of functional limitation or validated outcome measures",
      "Missing physical therapy records",
      "Active infection or uncontrolled HbA1c >8%"
    ],
    guideline_references: [
      "AAOS Clinical Practice Guidelines - Osteoarthritis of the Knee",
      "MCG Surgery Guidelines",
      "InterQual Procedures"
    ]
  },

  "29881": {
    name: "Knee Arthroscopy with Meniscectomy",
    category: "surgery",
    typical_criteria: [
      "Mechanical symptoms present (locking, catching, giving way)",
      "MRI-confirmed meniscal tear",
      "Failed conservative treatment for >=6 weeks",
      "Positive McMurray test or joint line tenderness on exam",
      "Age <40 with traumatic mechanism, or any age with true mechanical symptoms"
    ],
    common_denial_reasons: [
      "Degenerative tear without mechanical symptoms (especially age >50)",
      "No MRI performed or MRI shows degenerative changes only",
      "Insufficient conservative treatment (<6 weeks)",
      "Concurrent advanced osteoarthritis (KL grade 3-4)",
      "No mechanical symptoms documented on exam"
    ],
    guideline_references: [
      "AAOS Clinical Practice Guidelines",
      "Cochrane Reviews - Arthroscopic Surgery for Degenerative Knee"
    ]
  },

  "63030": {
    name: "Lumbar Discectomy / Decompression",
    category: "surgery",
    typical_criteria: [
      "MRI-confirmed disc herniation correlating with clinical symptoms",
      "Radiculopathy with dermatomal distribution matching imaging findings",
      "Failed conservative treatment for >=6 weeks (PT, medications, injections)",
      "Progressive neurological deficit on serial exams",
      "Cauda equina syndrome (emergent indication)",
      "Significant functional impairment documented"
    ],
    common_denial_reasons: [
      "Imaging findings do not correlate with clinical symptoms",
      "Insufficient conservative treatment (<6 weeks without emergent indication)",
      "No neurological deficit documented on physical exam",
      "Axial low back pain only without radiculopathy",
      "Prior surgery at same level without documented recurrence or new pathology"
    ],
    guideline_references: [
      "NASS Clinical Guidelines - Lumbar Disc Herniation",
      "InterQual Procedures"
    ]
  },

  // ── PAIN MANAGEMENT ────────────────────────────────────────────────────────

  "64483": {
    name: "Transforaminal Epidural Steroid Injection (TFESI)",
    category: "pain_management",
    typical_criteria: [
      "Radicular pain correlating with imaging findings",
      "Failed conservative treatment for >=4 weeks (PT, oral medications)",
      "Not exceeding 3 injections in 12 months at the same spinal level",
      "Functional goals documented in treatment plan",
      "No infection at the injection site",
      "Cross-sectional imaging (MRI/CT) confirming pathology within the past 12 months"
    ],
    common_denial_reasons: [
      "Exceeds frequency limits (>3 injections in 12 months at same level)",
      "No cross-sectional imaging performed or available",
      "Axial pain only without radicular component",
      "No conservative treatment documented prior to injection request",
      "Prior injections at the same level without documented benefit"
    ],
    guideline_references: [
      "ASIPP Guidelines for Interventional Techniques",
      "InterQual Procedures",
      "MCG Procedures"
    ]
  },

  // ── DME ────────────────────────────────────────────────────────────────────

  "E0601": {
    name: "Continuous Positive Airway Pressure (CPAP) Device",
    category: "dme",
    typical_criteria: [
      "Qualifying sleep study (in-lab PSG or home sleep test) confirming obstructive sleep apnea",
      "AHI >=15 events/hour, OR AHI >=5 with documented symptoms (excessive daytime sleepiness, impaired cognition, mood disorders, hypertension, ischemic heart disease, history of stroke)",
      "Face-to-face clinical evaluation within 6 months prior to the sleep study",
      "Prescription from the treating physician",
      "Medicare compliance check at 90 days (if applicable)"
    ],
    common_denial_reasons: [
      "No qualifying sleep study performed",
      "AHI <5 events/hour",
      "AHI 5-14 without qualifying comorbid symptoms or conditions",
      "Missing face-to-face clinical evaluation",
      "Non-compliance with prior CPAP trial"
    ],
    guideline_references: [
      "CMS LCD for CPAP - Positive Airway Pressure Devices",
      "AASM Clinical Practice Guidelines for OSA"
    ]
  },

  // ── INFUSION / ONCOLOGY ────────────────────────────────────────────────────

  "96413": {
    name: "Chemotherapy IV Infusion (First Hour)",
    category: "oncology",
    typical_criteria: [
      "Pathology-confirmed malignancy with histologic diagnosis",
      "Treatment regimen consistent with NCCN Compendium guidelines",
      "Adequate organ function documented (labs: CBC, CMP, LFTs)",
      "ECOG performance status documented",
      "Prior treatment history reviewed",
      "Treatment plan with regimen, number of cycles, and goals of therapy documented"
    ],
    common_denial_reasons: [
      "Regimen not consistent with NCCN guidelines or recognized compendium",
      "Off-label use without supporting evidence or clinical trial enrollment",
      "Missing pathology or histologic confirmation",
      "Laboratory values contraindicating treatment",
      "No treatment goals documented (curative vs. palliative)"
    ],
    guideline_references: [
      "NCCN Clinical Practice Guidelines in Oncology",
      "CMS NCD for Cancer Chemotherapy Treatment"
    ]
  },

  "J1745": {
    name: "Infliximab (Remicade) Injection",
    category: "infusion",
    typical_criteria: [
      "Approved diagnosis (Crohn's disease, ulcerative colitis, rheumatoid arthritis, ankylosing spondylitis, psoriatic arthritis, plaque psoriasis)",
      "Failed conventional therapy (e.g., DMARDs for RA, aminosalicylates/immunomodulators for IBD)",
      "Step therapy requirements met (biosimilar trial where required by plan)",
      "TB screening (PPD or IGRA) completed and documented",
      "Hepatitis B screening completed and documented",
      "Dosing consistent with FDA-approved labeling"
    ],
    common_denial_reasons: [
      "Step therapy not completed (biosimilar not tried when required)",
      "Missing TB or Hepatitis B screening documentation",
      "Conventional therapy not adequately trialed",
      "Dosing exceeds FDA-approved limits without clinical justification",
      "Unapproved indication"
    ],
    guideline_references: [
      "ACR Guidelines for Management of Rheumatoid Arthritis",
      "AGA Clinical Practice Guidelines (IBD)",
      "AAD Guidelines for Psoriasis Management"
    ]
  },

  // ── BEHAVIORAL HEALTH ─────────────────────────────────────────────────────

  "90837": {
    name: "Psychotherapy, 53+ Minutes",
    category: "behavioral_health",
    typical_criteria: [
      "DSM-5 diagnosis documented and clinically appropriate for psychotherapy",
      "Individualized treatment plan with measurable, time-limited goals",
      "Medical necessity for extended session duration (complexity, acuity, crisis)",
      "Progress notes demonstrating patient response to treatment",
      "Continued functional impairment documented for concurrent review requests"
    ],
    common_denial_reasons: [
      "No individualized treatment plan with measurable goals",
      "Extended session duration not clinically justified (30-minute session sufficient)",
      "Treatment plateau without documented plan modification",
      "Maintenance therapy without continued medical necessity",
      "Missing progress notes or clinical documentation"
    ],
    guideline_references: [
      "APA Practice Guidelines",
      "MCG Behavioral Health Guidelines"
    ]
  },

  // ── REHAB THERAPY ──────────────────────────────────────────────────────────

  "97110": {
    name: "Therapeutic Exercise",
    category: "rehab_therapy",
    typical_criteria: [
      "Functional limitation documented with objective outcome measures",
      "Treatment plan with specific goals, frequency, and duration",
      "Skilled therapeutic intervention required (beyond patient self-management)",
      "Documented progress toward functional goals",
      "Ongoing improvement or documented maintenance necessity"
    ],
    common_denial_reasons: [
      "Treatment plateau with no further functional gains documented",
      "Maintenance program performable independently by patient",
      "Exceeded visit limits without supporting documentation of continued need",
      "No standardized outcome measures used",
      "Goals not specific, measurable, or time-limited"
    ],
    guideline_references: [
      "CMS Therapy Services Guidelines (Medicare Benefit Policy Manual)",
      "InterQual Rehabilitation Criteria"
    ]
  },

  // ── HOME HEALTH ────────────────────────────────────────────────────────────

  "G0151": {
    name: "Home Health Physical Therapy Services",
    category: "home_health",
    typical_criteria: [
      "Homebound status documented (leaving home requires considerable and taxing effort)",
      "Skilled physical therapy services required (not custodial or maintenance)",
      "Face-to-face encounter with certifying physician within required timeframe",
      "Plan of care established, signed, and dated by the certifying physician",
      "Functional goals with specified duration and frequency documented"
    ],
    common_denial_reasons: [
      "Patient does not meet homebound criteria",
      "Services are custodial in nature, not requiring skilled intervention",
      "Missing or untimely face-to-face encounter documentation",
      "Plan of care not signed by physician or has expired",
      "Functional goals achieved or patient discharged to outpatient therapy"
    ],
    guideline_references: [
      "CMS Home Health Conditions of Participation",
      "InterQual Home Care Criteria"
    ]
  },

  // ── GENETIC TESTING ────────────────────────────────────────────────────────

  "81528": {
    name: "Oncotype DX Breast Recurrence Score (Oncology Panel Genetic Testing)",
    category: "genetic_testing",
    typical_criteria: [
      "Early-stage invasive breast cancer (ER-positive, HER2-negative)",
      "Node-negative or 1-3 positive lymph nodes",
      "Test results will impact adjuvant treatment decision (chemotherapy vs. endocrine therapy alone)",
      "Patient is a candidate for systemic chemotherapy",
      "Tumor meets test eligibility criteria (size, grade, receptor status)",
      "Test ordered by the treating oncologist"
    ],
    common_denial_reasons: [
      "Patient is not a chemotherapy candidate regardless of test result",
      "Tumor type or receptor status not appropriate for the test",
      "Duplicate or repeat testing without clinical justification",
      "Test not FDA-approved or validated for the specific indication",
      "Adjuvant treatment decision has already been made"
    ],
    guideline_references: [
      "NCCN Guidelines - Breast Cancer",
      "ASCO Clinical Practice Guidelines - Biomarkers for Adjuvant Therapy",
      "CMS LCD for Molecular Diagnostic Testing"
    ]
  }
};

// ── Top 50 commonly reviewed CPT/HCPCS codes ────────────────────────────────

export const commonMedicalCodes: { code: string; description: string; category: string }[] = [
  // The 14 detailed codes above
  { code: "72148", description: "MRI Lumbar Spine without Contrast", category: "imaging" },
  { code: "70553", description: "MRI Brain with and without Contrast", category: "imaging" },
  { code: "74177", description: "CT Abdomen and Pelvis with Contrast", category: "imaging" },
  { code: "27447", description: "Total Knee Arthroplasty (TKA)", category: "surgery" },
  { code: "29881", description: "Knee Arthroscopy with Meniscectomy", category: "surgery" },
  { code: "63030", description: "Lumbar Discectomy / Decompression", category: "surgery" },
  { code: "64483", description: "Transforaminal Epidural Steroid Injection", category: "pain_management" },
  { code: "E0601", description: "CPAP Device", category: "dme" },
  { code: "96413", description: "Chemotherapy IV Infusion (first hour)", category: "oncology" },
  { code: "J1745", description: "Infliximab (Remicade) Injection", category: "infusion" },
  { code: "90837", description: "Psychotherapy, 53+ Minutes", category: "behavioral_health" },
  { code: "97110", description: "Therapeutic Exercise", category: "rehab_therapy" },
  { code: "G0151", description: "Home Health Physical Therapy", category: "home_health" },
  { code: "81528", description: "Oncotype DX Breast Recurrence Score", category: "genetic_testing" },

  // Additional imaging codes
  { code: "70551", description: "MRI Brain without Contrast", category: "imaging" },
  { code: "70552", description: "MRI Brain with Contrast", category: "imaging" },
  { code: "72141", description: "MRI Cervical Spine without Contrast", category: "imaging" },
  { code: "72146", description: "MRI Thoracic Spine without Contrast", category: "imaging" },
  { code: "72149", description: "MRI Lumbar Spine with Contrast", category: "imaging" },
  { code: "73721", description: "MRI Joint of Lower Extremity (Knee)", category: "imaging" },
  { code: "73221", description: "MRI Joint of Upper Extremity (Shoulder)", category: "imaging" },
  { code: "74176", description: "CT Abdomen and Pelvis without Contrast", category: "imaging" },
  { code: "77067", description: "Screening Mammography, Bilateral", category: "imaging" },
  { code: "78452", description: "Myocardial Perfusion Imaging (SPECT MPI)", category: "cardiology" },

  // Additional surgery codes
  { code: "27130", description: "Total Hip Arthroplasty (THA)", category: "surgery" },
  { code: "22551", description: "Anterior Cervical Discectomy and Fusion (ACDF)", category: "surgery" },
  { code: "22612", description: "Lumbar Spinal Fusion - Posterior", category: "surgery" },
  { code: "23472", description: "Total Shoulder Arthroplasty / Reverse TSA", category: "surgery" },
  { code: "47562", description: "Laparoscopic Cholecystectomy", category: "surgery" },
  { code: "49505", description: "Inguinal Hernia Repair", category: "surgery" },

  // Additional pain management codes
  { code: "64493", description: "Lumbar Facet Joint Injection - L1-L2", category: "pain_management" },
  { code: "62322", description: "Interlaminar Epidural Steroid Injection - Lumbar", category: "pain_management" },
  { code: "63650", description: "Spinal Cord Stimulator Implant", category: "pain_management" },

  // Additional DME codes
  { code: "E0470", description: "RAD (Respiratory Assist Device) - BiPAP without backup rate", category: "dme" },
  { code: "L5301", description: "Below Knee Prosthesis", category: "dme" },
  { code: "K0856", description: "Power Wheelchair - Group 3 Standard", category: "dme" },
  { code: "E1390", description: "Oxygen Concentrator - Stationary", category: "dme" },

  // Additional infusion / specialty pharmacy codes
  { code: "J0897", description: "Denosumab (Prolia) Injection", category: "infusion" },
  { code: "J2182", description: "Mepolizumab (Nucala) Injection", category: "infusion" },
  { code: "J0717", description: "Certolizumab Pegol (Cimzia) Injection", category: "infusion" },

  // Additional behavioral health codes
  { code: "90834", description: "Psychotherapy, 38-52 Minutes", category: "behavioral_health" },
  { code: "90847", description: "Family Psychotherapy with Patient", category: "behavioral_health" },
  { code: "90791", description: "Psychiatric Diagnostic Evaluation", category: "behavioral_health" },

  // Additional rehab therapy codes
  { code: "97140", description: "Manual Therapy Techniques", category: "rehab_therapy" },
  { code: "97530", description: "Therapeutic Activities", category: "rehab_therapy" },
  { code: "92507", description: "Speech-Language Therapy", category: "rehab_therapy" },

  // Cardiology codes
  { code: "93306", description: "Transthoracic Echocardiography (TTE) Complete", category: "cardiology" },
  { code: "93458", description: "Left Heart Catheterization", category: "cardiology" },
  { code: "33361", description: "Transcatheter Aortic Valve Replacement (TAVR)", category: "cardiology" },

  // Skilled nursing / home health
  { code: "99495", description: "Transitional Care Management (moderate complexity)", category: "skilled_nursing" },
];

// ── Utility Functions ────────────────────────────────────────────────────────

/**
 * Given an array of CPT/HCPCS codes, return matching criteria objects.
 */
export function getCriteriaForCodes(codes: string[]): Record<string, MedicalCriteria> {
  const matched: Record<string, MedicalCriteria> = {};
  for (const code of codes) {
    const trimmed = code.trim().toUpperCase();
    if (medicalCriteria[trimmed]) {
      matched[trimmed] = medicalCriteria[trimmed];
    }
  }
  return matched;
}

/**
 * Returns the full list of medical service categories used across the platform.
 */
export function getServiceCategories(): string[] {
  return [
    "imaging",
    "surgery",
    "specialty_referral",
    "dme",
    "infusion",
    "behavioral_health",
    "rehab_therapy",
    "home_health",
    "skilled_nursing",
    "transplant",
    "genetic_testing",
    "pain_management",
    "cardiology",
    "oncology",
    "other",
  ];
}
