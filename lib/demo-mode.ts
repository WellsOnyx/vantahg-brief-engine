import type { Case, Reviewer, Client, AuditLogEntry, AIBrief } from './types';
import {
  demoCases,
  demoReviewers,
  demoClients,
  demoAuditLog,
  DEMO_CASE_IDS,
} from './demo-data';

/**
 * Returns true when the app is running without a Supabase connection.
 * This enables the full demo data layer so the app works at conferences
 * and in local development without any external dependencies.
 */
export function isDemoMode(): boolean {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL;
}

// ============================================================================
// Cases
// ============================================================================

export interface GetDemoCasesOptions {
  status?: string | null;
  vertical?: string | null;
  service_category?: string | null;
  priority?: string | null;
  review_type?: string | null;
  assigned_reviewer_id?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  search?: string | null;
}

/**
 * Returns all demo cases, optionally filtered by status, service_category/vertical, priority,
 * review_type, assigned_reviewer_id, date range, or search term.
 * Mirrors the Supabase query behavior in the cases GET route.
 */
export function getDemoCases(options: GetDemoCasesOptions = {}): Case[] {
  let cases = [...demoCases];

  if (options.status) {
    cases = cases.filter((c) => c.status === options.status);
  }

  if (options.service_category) {
    cases = cases.filter((c) => c.service_category === options.service_category);
  }

  if (options.vertical) {
    cases = cases.filter((c) => c.vertical === options.vertical);
  }

  if (options.priority) {
    cases = cases.filter((c) => c.priority === options.priority);
  }

  if (options.review_type) {
    cases = cases.filter((c) => c.review_type === options.review_type);
  }

  if (options.assigned_reviewer_id) {
    cases = cases.filter((c) => c.assigned_reviewer_id === options.assigned_reviewer_id);
  }

  if (options.date_from) {
    const from = new Date(options.date_from).getTime();
    cases = cases.filter((c) => new Date(c.created_at).getTime() >= from);
  }

  if (options.date_to) {
    const to = new Date(options.date_to);
    to.setHours(23, 59, 59, 999);
    cases = cases.filter((c) => new Date(c.created_at).getTime() <= to.getTime());
  }

  if (options.search) {
    const term = options.search.toLowerCase();
    cases = cases.filter(
      (c) =>
        c.case_number.toLowerCase().includes(term) ||
        (c.patient_name && c.patient_name.toLowerCase().includes(term)) ||
        (c.patient_member_id && c.patient_member_id.toLowerCase().includes(term)) ||
        (c.procedure_description && c.procedure_description.toLowerCase().includes(term))
    );
  }

  // Sort by created_at descending (newest first), same as the Supabase query
  cases.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return cases;
}

/**
 * Returns a single demo case by ID, or null if not found.
 */
export function getDemoCase(id: string): Case | null {
  return demoCases.find((c) => c.id === id) ?? null;
}

// ============================================================================
// Reviewers
// ============================================================================

/**
 * Returns all demo reviewers, sorted by name ascending.
 */
export function getDemoReviewers(): Reviewer[] {
  return [...demoReviewers].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Returns a single demo reviewer by ID, or null if not found.
 */
export function getDemoReviewer(id: string): Reviewer | null {
  return demoReviewers.find((r) => r.id === id) ?? null;
}

// ============================================================================
// Clients
// ============================================================================

/**
 * Returns all demo clients, sorted by name ascending.
 */
export function getDemoClients(): Client[] {
  return [...demoClients].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Returns a single demo client by ID, or null if not found.
 */
export function getDemoClient(id: string): Client | null {
  return demoClients.find((c) => c.id === id) ?? null;
}

// ============================================================================
// Audit Log
// ============================================================================

/**
 * Returns audit log entries for a given case ID, sorted newest-first.
 * Returns null if the case ID does not match any demo case.
 */
export function getDemoAuditLog(caseId: string): AuditLogEntry[] | null {
  // Verify the case exists
  const caseExists = demoCases.some((c) => c.id === caseId);
  if (!caseExists) {
    return null;
  }

  return demoAuditLog
    .filter((entry) => entry.case_id === caseId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

// ============================================================================
// Brief Generation (returns a pre-built brief for demo purposes)
// ============================================================================

/**
 * Returns a pre-built AI brief for the given case ID.
 * If the case already has a brief, returns that brief.
 * If the case doesn't have a brief (e.g. the CPAP device case in intake),
 * returns a generated brief appropriate for the procedure codes.
 */
export function getDemoBrief(caseId: string): { case: Case; brief: AIBrief } | null {
  const caseData = getDemoCase(caseId);
  if (!caseData) {
    return null;
  }

  // If the case already has a brief, return it
  if (caseData.ai_brief) {
    return { case: caseData, brief: caseData.ai_brief };
  }

  // For the CPAP case (or any case without a brief), generate one on-the-fly
  const cpapBrief: AIBrief = {
    clinical_question:
      'Does this patient meet coverage criteria for a continuous positive airway pressure (CPAP) device (HCPCS E0601) based on the documented sleep study results and face-to-face clinical evaluation?',
    patient_summary:
      'Robert Garcia is a 50-year-old male (DOB 09/12/1975) presenting with excessive daytime sleepiness, witnessed apneic episodes reported by his spouse, and an elevated BMI of 34. A home sleep apnea test (HSAT) demonstrates an apnea-hypopnea index (AHI) of 22 events per hour, consistent with moderate obstructive sleep apnea. A face-to-face clinical evaluation was completed on 02/01/2026 by the prescribing physician. The patient has comorbid hypertension currently managed with two antihypertensive medications (lisinopril 20mg daily, amlodipine 5mg daily). No prior CPAP trial or sleep center-based titration study has been performed.',
    diagnosis_analysis: {
      primary_diagnosis: 'G47.33 - Obstructive sleep apnea',
      secondary_diagnoses: [],
      diagnosis_procedure_alignment: 'Diagnosis of obstructive sleep apnea directly supports the need for CPAP therapy. AHI of 22 (moderate OSA) meets the diagnostic threshold for CPAP coverage. Comorbid hypertension on multiple medications further supports the medical necessity of treatment.',
    },
    procedure_analysis: {
      codes: ['E0601 - Continuous positive airway pressure (CPAP) device'],
      clinical_rationale:
        'The prescribing sleep medicine physician documents moderate obstructive sleep apnea (AHI 22) on home sleep testing with symptomatic excessive daytime sleepiness and witnessed apneas. CPAP is the first-line treatment for moderate OSA per AASM guidelines. The patient has comorbid hypertension that may benefit from OSA treatment. A face-to-face evaluation has been completed within 30 days of the order.',
      complexity_level: 'routine',
      setting_appropriateness: 'Home use is the appropriate setting for CPAP therapy. Auto-titrating CPAP (APAP) may be prescribed without a laboratory titration study for moderate OSA per current guidelines.',
    },
    criteria_match: {
      guideline_source: 'InterQual / CMS LCD / AASM',
      applicable_guideline:
        'InterQual 2026: DME - CPAP; CMS Local Coverage Determination for CPAP (L33718); AASM Clinical Practice Guideline for PAP Treatment of OSA (2024); Western Employers Trust DME Policy',
      criteria_met: [
        'AHI of 22 events/hour on HSAT meets the CMS threshold of AHI >= 15 for CPAP coverage',
        'Face-to-face clinical evaluation completed within 30 days prior to the CPAP order (02/01/2026)',
        'Symptomatic: excessive daytime sleepiness, witnessed apneas documented',
        'Sleep testing was performed with a CMS-approved device (Type III HSAT)',
        'Comorbid cardiovascular disease (hypertension on 2 medications) supports treatment urgency',
      ],
      criteria_not_met: [],
      criteria_unable_to_assess: [
        'Whether the HSAT was interpreted by a board-certified sleep medicine physician (interpreting physician credentials not included in submitted records)',
        'Whether the patient will receive adequate CPAP education and mask fitting from a qualified DME supplier',
      ],
      conservative_alternatives: [
        'Positional therapy (if OSA is predominantly positional - not assessed)',
        'Weight loss counseling and management (supportive but not a substitute for CPAP with AHI 22)',
        'Oral appliance therapy (typically second-line for moderate OSA or for patients intolerant of CPAP)',
      ],
    },
    documentation_review: {
      documents_provided:
        'Home sleep apnea test report and face-to-face clinical evaluation notes',
      key_findings: [
        'HSAT report demonstrates AHI of 22 events/hour with lowest oxygen desaturation to 84%',
        'Face-to-face evaluation notes document history of excessive daytime sleepiness (Epworth Sleepiness Scale score of 14/24), witnessed apneas, and morning headaches',
        'BMI of 34 documented, consistent with obesity-related OSA risk',
        'Hypertension managed with lisinopril 20mg and amlodipine 5mg daily - uncontrolled hypertension may improve with OSA treatment',
        'Face-to-face evaluation date (02/01/2026) is within the required 30-day window prior to CPAP order',
      ],
      missing_documentation: [
        'Interpreting physician credentials for the HSAT (should confirm board-certified sleep medicine physician)',
        'Specific CPAP device prescription (device type, pressure settings or auto-titration parameters)',
        'DME supplier information and patient education plan',
        'Documentation of Epworth Sleepiness Scale in the provider notes (referenced but score sheet not submitted)',
      ],
    },
    ai_recommendation: {
      recommendation: 'approve',
      confidence: 'high',
      rationale:
        'The patient meets CMS and InterQual coverage criteria for CPAP therapy. AHI of 22 on HSAT exceeds the CMS threshold of >= 15 for CPAP coverage without additional documentation requirements. Face-to-face evaluation has been completed within the required timeframe. The patient is symptomatic with excessive daytime sleepiness and has comorbid hypertension that may benefit from OSA treatment. While some documentation gaps exist (interpreting physician credentials, device prescription details), these are administrative items that do not affect the medical necessity determination.',
      key_considerations: [
        'CMS requires a compliance check at 31-90 days of CPAP use demonstrating >= 4 hours of use per night for >= 70% of nights for continued coverage',
        'The patient should be informed of the compliance requirements at the time of CPAP initiation',
        'Follow-up with the prescribing physician should be scheduled within 90 days to assess treatment response and compliance',
        'Weight management counseling should be recommended as an adjunct to CPAP therapy given BMI of 34',
      ],
      if_modify_suggestion: null,
    },
    reviewer_action: {
      decision_required:
        'Confirm that the HSAT results and face-to-face evaluation meet CMS and plan-specific criteria for CPAP coverage',
      time_sensitivity:
        'Standard turnaround per Western Employers Trust 24-hour SLA. Routine DME authorization - non-emergent but patient has symptomatic moderate OSA with comorbid hypertension.',
      peer_to_peer_suggested: false,
      additional_info_needed: [
        'Interpreting physician credentials for HSAT (administrative requirement - should not delay authorization)',
        'Specific CPAP device prescription with pressure parameters or auto-titration settings',
      ],
      state_specific_requirements: [],
    },
  };

  // Return the case with the brief applied
  const updatedCase: Case = {
    ...caseData,
    ai_brief: cpapBrief,
    ai_brief_generated_at: new Date().toISOString(),
    status: 'brief_ready',
  };

  return { case: updatedCase, brief: cpapBrief };
}
