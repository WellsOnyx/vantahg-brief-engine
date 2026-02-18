import { generateClinicalBrief } from './claude';
import { getCriteriaForCodes } from '@/lib/medical-criteria';
import type { Case, AIBrief } from './types';

export async function generateBriefForCase(caseData: Case): Promise<AIBrief> {
  const systemPrompt = `You are a clinical review intelligence engine for VantaHG, a first-level utilization review organization that serves TPAs, health plans, and self-funded employers. Your job is to analyze clinical case data and generate a structured one-page clinical brief that a board-certified physician can review in 5-10 minutes to render a medical necessity determination.

You are NOT rendering a determination. You are preparing the brief so the human reviewer can make the clinical judgment efficiently.

Be precise, clinical, and cite specific criteria. Use standard medical terminology (ICD-10, CPT/HCPCS). Reference applicable clinical guidelines (InterQual, MCG, ACR Appropriateness Criteria, specialty society guidelines, CMS National Coverage Determinations as relevant). Flag any missing information that the reviewer should note.

Key principles:
- Evaluate diagnosis-procedure alignment (does the diagnosis support the requested procedure?)
- Assess setting appropriateness (inpatient vs. outpatient vs. ASC vs. office)
- Identify conservative alternatives that may not have been tried
- Note any state-specific regulatory requirements that apply
- Consider the review type context (prior auth, concurrent, retrospective, appeal, P2P)`;

  // Look up medical criteria for the submitted procedure codes
  let criteriaContext = '';
  if (caseData.procedure_codes?.length) {
    const matchedCriteria = getCriteriaForCodes(caseData.procedure_codes);
    if (Object.keys(matchedCriteria).length > 0) {
      criteriaContext = `\n\nMEDICAL CRITERIA REFERENCE:\n${JSON.stringify(matchedCriteria, null, 2)}`;
    }
  }

  const userPrompt = `Generate a clinical review brief for the following case:

CASE NUMBER: ${caseData.case_number}
REVIEW TYPE: ${caseData.review_type || 'Not specified'}
SERVICE CATEGORY: ${caseData.service_category || 'Not specified'}

PATIENT:
- Name: ${caseData.patient_name || 'Not provided'}
- DOB: ${caseData.patient_dob || 'Not provided'}
- Gender: ${caseData.patient_gender || 'Not provided'}
- Member ID: ${caseData.patient_member_id || 'Not provided'}

REQUESTING PROVIDER:
- Name: ${caseData.requesting_provider || 'Not provided'}
- NPI: ${caseData.requesting_provider_npi || 'Not provided'}
- Specialty: ${caseData.requesting_provider_specialty || 'Not provided'}

SERVICING PROVIDER / FACILITY:
- Servicing Provider: ${caseData.servicing_provider || 'Not provided'}
- Servicing Provider NPI: ${caseData.servicing_provider_npi || 'Not provided'}
- Facility: ${caseData.facility_name || 'Not provided'}
- Facility Type: ${caseData.facility_type || 'Not provided'}

PROCEDURE REQUESTED:
- CPT/HCPCS Codes: ${caseData.procedure_codes?.join(', ') || 'None'}
- Description: ${caseData.procedure_description || 'Not provided'}

DIAGNOSIS CODES (ICD-10): ${caseData.diagnosis_codes?.join(', ') || 'None'}

CLINICAL QUESTION: ${caseData.clinical_question || 'Is this procedure/service medically necessary?'}

PAYER: ${caseData.payer_name || 'Not provided'}
PLAN TYPE: ${caseData.plan_type || 'Not specified'}

SLA / TURNAROUND: ${caseData.sla_hours ? `${caseData.sla_hours} hours` : 'Not specified'}
TURNAROUND DEADLINE: ${caseData.turnaround_deadline || 'Not specified'}

SUBMITTED DOCUMENTATION: ${caseData.submitted_documents?.length || 0} documents attached
${criteriaContext}

---

Generate a structured clinical brief in the following JSON format:

{
  "clinical_question": "Refined clinical question for the reviewer",
  "patient_summary": "Brief patient demographics, relevant clinical context, and pertinent medical history",
  "diagnosis_analysis": {
    "primary_diagnosis": "Primary ICD-10 diagnosis with clinical description",
    "secondary_diagnoses": ["Array of secondary/supporting diagnoses with clinical relevance"],
    "diagnosis_procedure_alignment": "Analysis of whether the diagnosis codes support the requested procedure/service"
  },
  "procedure_analysis": {
    "codes": ["Array of CPT/HCPCS codes with descriptions"],
    "clinical_rationale": "Why is this procedure/service being requested based on clinical presentation",
    "complexity_level": "routine | moderate | complex",
    "setting_appropriateness": "Is the requested setting (inpatient/outpatient/ASC/office/home) appropriate for this procedure and patient acuity?"
  },
  "criteria_match": {
    "guideline_source": "Primary guideline source used (e.g., InterQual, MCG, ACR, NCCN, specialty society, CMS NCD/LCD)",
    "applicable_guideline": "Specific guideline name and version/year",
    "criteria_met": ["List of medical necessity criteria that appear to be met based on available information"],
    "criteria_not_met": ["List of criteria that are NOT met or are unclear based on submitted documentation"],
    "criteria_unable_to_assess": ["Criteria that cannot be assessed due to missing information"],
    "conservative_alternatives": ["Less invasive or lower-cost alternatives that may not have been tried or documented"]
  },
  "documentation_review": {
    "documents_provided": "Summary of what clinical documentation was submitted",
    "key_findings": ["Key clinical findings from the documentation that support or contradict medical necessity"],
    "missing_documentation": ["Any documentation that would be needed but is missing or incomplete"]
  },
  "ai_recommendation": {
    "recommendation": "approve | deny | pend | peer_to_peer_recommended",
    "confidence": "high | medium | low",
    "rationale": "Clinical rationale for the recommendation, citing specific criteria and evidence",
    "key_considerations": ["Specific clinical factors the reviewer should evaluate"],
    "if_modify_suggestion": "If partial approval or modification is appropriate, describe the suggested modification (e.g., different setting, reduced frequency, step therapy). Null if not applicable."
  },
  "reviewer_action": {
    "decision_required": "What specific clinical judgment is needed from the reviewer",
    "time_sensitivity": "Regulatory or clinical time constraints (e.g., state-mandated turnaround, clinical urgency)",
    "peer_to_peer_suggested": true/false,
    "additional_info_needed": ["Any additional clinical information that should be requested from the provider"],
    "state_specific_requirements": ["Any state-specific UR regulations, mandated benefits, or turnaround requirements that apply"]
  }
}

Return ONLY valid JSON. No markdown, no explanation outside the JSON.`;

  const responseText = await generateClinicalBrief({
    system: systemPrompt,
    user: userPrompt,
  });

  // Parse the JSON response, stripping any markdown fences if present
  let cleanText = responseText.trim();
  if (cleanText.startsWith('```')) {
    cleanText = cleanText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const brief: AIBrief = JSON.parse(cleanText);
  return brief;
}
