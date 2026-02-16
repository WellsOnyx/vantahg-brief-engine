import { generateClinicalBrief } from './claude';
import { getCriteriaForCodes } from './dental-criteria';
import type { Case, AIBrief } from './types';

export async function generateBriefForCase(caseData: Case): Promise<AIBrief> {
  const systemPrompt = `You are a clinical review intelligence engine for VantaHG, a utilization review organization. Your job is to analyze clinical case data and generate a structured one-page clinical brief that a board-certified dentist or physician can review in 5-10 minutes to render a medical necessity determination.

You are NOT rendering a determination. You are preparing the brief so the human reviewer can make the clinical judgment efficiently.

Be precise, clinical, and cite specific criteria. Use standard dental/medical terminology. Flag any missing information that the reviewer should note.`;

  let criteriaContext = '';
  if (caseData.vertical === 'dental' && caseData.procedure_codes?.length) {
    const matchedCriteria = getCriteriaForCodes(caseData.procedure_codes);
    if (Object.keys(matchedCriteria).length > 0) {
      criteriaContext = `\n\nDENTAL CRITERIA REFERENCE:\n${JSON.stringify(matchedCriteria, null, 2)}`;
    }
  }

  const userPrompt = `Generate a clinical review brief for the following case:

CASE NUMBER: ${caseData.case_number}
REVIEW TYPE: ${caseData.review_type || 'Not specified'}
VERTICAL: ${caseData.vertical}

PATIENT:
- Name: ${caseData.patient_name || 'Not provided'}
- DOB: ${caseData.patient_dob || 'Not provided'}
- Member ID: ${caseData.patient_member_id || 'Not provided'}

REQUESTING PROVIDER:
- Name: ${caseData.requesting_provider || 'Not provided'}
- NPI: ${caseData.requesting_provider_npi || 'Not provided'}

PROCEDURE REQUESTED:
- Codes: ${caseData.procedure_codes?.join(', ') || 'None'}
- Description: ${caseData.procedure_description || 'Not provided'}

DIAGNOSIS CODES: ${caseData.diagnosis_codes?.join(', ') || 'None'}

CLINICAL QUESTION: ${caseData.clinical_question || 'Is this procedure medically necessary?'}

PAYER: ${caseData.payer_name || 'Not provided'} (${caseData.plan_type || 'Not specified'})

SUBMITTED DOCUMENTATION: ${caseData.submitted_documents?.length || 0} documents attached
${criteriaContext}

---

Generate a structured clinical brief in the following JSON format:

{
  "clinical_question": "Refined clinical question for the reviewer",
  "patient_summary": "Brief patient demographics and relevant clinical context",
  "procedure_analysis": {
    "codes": ["array of codes with descriptions"],
    "clinical_rationale": "Why is this procedure being requested",
    "complexity_level": "routine | moderate | complex"
  },
  "criteria_match": {
    "applicable_guideline": "Which clinical guideline or standard applies",
    "criteria_met": ["List of criteria that appear to be met based on available info"],
    "criteria_not_met": ["List of criteria that are NOT met or unclear"],
    "criteria_unable_to_assess": ["Criteria that cannot be assessed due to missing info"]
  },
  "documentation_review": {
    "documents_provided": "Summary of what documentation was submitted",
    "key_findings": ["Key clinical findings from the documentation"],
    "missing_documentation": ["Any documentation that would be needed but is missing"]
  },
  "ai_recommendation": {
    "recommendation": "approve | deny | pend | peer_to_peer_recommended",
    "confidence": "high | medium | low",
    "rationale": "Clinical rationale for the recommendation",
    "key_considerations": ["Things the reviewer should specifically evaluate"]
  },
  "reviewer_action": {
    "decision_required": "What specific clinical judgment is needed",
    "time_sensitivity": "Any regulatory or clinical time constraints",
    "peer_to_peer_suggested": true/false,
    "additional_info_needed": ["Any information that should be requested"]
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
