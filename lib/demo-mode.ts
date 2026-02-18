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
  priority?: string | null;
  search?: string | null;
}

/**
 * Returns all demo cases, optionally filtered by status, vertical, priority, or search term.
 * Mirrors the Supabase query behavior in the cases GET route.
 */
export function getDemoCases(options: GetDemoCasesOptions = {}): Case[] {
  let cases = [...demoCases];

  if (options.status) {
    cases = cases.filter((c) => c.status === options.status);
  }

  if (options.vertical) {
    cases = cases.filter((c) => c.vertical === options.vertical);
  }

  if (options.priority) {
    cases = cases.filter((c) => c.priority === options.priority);
  }

  if (options.search) {
    const term = options.search.toLowerCase();
    cases = cases.filter(
      (c) =>
        c.case_number.toLowerCase().includes(term) ||
        (c.patient_name && c.patient_name.toLowerCase().includes(term)) ||
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
 * If the case doesn't have a brief (e.g. the extraction case), returns a
 * generic brief appropriate for the procedure codes.
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

  // For the extraction case (or any case without a brief), generate one on-the-fly
  const extractionBrief: AIBrief = {
    clinical_question:
      'Is surgical extraction of completely bony impacted tooth #32 medically necessary given the documented acute pericoronitis and clinical presentation?',
    patient_summary:
      'Angela Thompson is a 35-year-old female presenting with acute pericoronitis associated with a completely bony impacted mandibular right third molar (#32). The patient reports 5 days of worsening pain, swelling, and limited mouth opening (maximum interincisal opening of 22mm). Clinical examination reveals erythematous, edematous soft tissue overlying the distal aspect of #31 with purulent drainage on palpation. Temperature 99.8°F. The patient is otherwise healthy with no significant medical history.',
    procedure_analysis: {
      codes: ['D7240 - Removal of impacted tooth, completely bony'],
      clinical_rationale:
        'The requesting oral surgeon documents a completely bony impacted #32 with acute pericoronitis that has not resolved with antibiotic therapy (amoxicillin 500mg TID x 7 days completed). Panoramic radiograph confirms complete bony impaction with close proximity to the inferior alveolar nerve canal. The clinical presentation of acute infection with trismus and purulent drainage supports the need for surgical intervention.',
      complexity_level: 'moderate',
    },
    criteria_match: {
      applicable_guideline:
        'AAOMS White Paper on Third Molar Management; Delta Dental Clinical Policy: Surgical Extraction of Impacted Teeth (2024)',
      criteria_met: [
        'Impaction confirmed on panoramic radiograph as completely bony',
        'Clinical indication present: acute pericoronitis with purulent drainage, pain, and trismus',
        'Classification of impaction provided: Class II, Position C (completely bony)',
        'Failed conservative management documented (completed course of antibiotics without resolution)',
      ],
      criteria_not_met: [],
      criteria_unable_to_assess: [
        'CBCT imaging to evaluate IAN proximity has not been submitted but may be obtained pre-operatively',
      ],
    },
    documentation_review: {
      documents_provided:
        'Panoramic radiograph and referral letter from general dentist',
      key_findings: [
        'Panoramic radiograph confirms completely bony impaction of #32 with mesioangular orientation',
        'Referral letter documents failed antibiotic course and worsening symptoms',
        'Clinical signs of acute infection are described in the referral documentation',
      ],
      missing_documentation: [
        'Clinical photographs documenting soft tissue swelling and drainage',
        'CBCT scan for detailed assessment of IAN proximity (may be deferred to surgical planning)',
        'Full medical history form (only referral letter provided)',
        'Detailed clinical examination notes from the oral surgeon',
      ],
    },
    ai_recommendation: {
      recommendation: 'approve',
      confidence: 'high',
      rationale:
        'The clinical presentation of acute pericoronitis with failed antibiotic therapy and a completely bony impacted tooth provides strong medical necessity for surgical extraction. The panoramic radiograph confirms the impaction classification. While additional documentation would strengthen the record, the acute clinical presentation supports expedited authorization.',
      key_considerations: [
        'This case is marked as urgent due to the acute infection and should be prioritized accordingly',
        'The proximity to the inferior alveolar nerve should be noted, though this is a surgical planning consideration rather than an authorization concern',
        'Verify that the provider has appropriate oral surgery credentials for completely bony impaction removal',
      ],
    },
    reviewer_action: {
      decision_required:
        'Confirm medical necessity for surgical extraction of completely bony impacted #32 in the setting of acute pericoronitis',
      time_sensitivity:
        'Urgent: Active infection with trismus. Expedited review recommended per plan policy for acute/urgent cases (48-72 hour turnaround).',
      peer_to_peer_suggested: false,
      additional_info_needed: [
        'Full clinical examination notes from the oral surgeon would be ideal but should not delay authorization given acute presentation',
      ],
    },
  };

  // Return the case with the brief applied
  const updatedCase: Case = {
    ...caseData,
    ai_brief: extractionBrief,
    ai_brief_generated_at: new Date().toISOString(),
    status: 'brief_ready',
  };

  return { case: updatedCase, brief: extractionBrief };
}
