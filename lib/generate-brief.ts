import { getCriteriaForCodes } from '@/lib/medical-criteria';
import { factCheckBrief } from './fact-checker';
import { analyzeTwoMidnightRule, getTwoMidnightBriefContext } from './two-midnight-rule';
import { isRealAnthropicEnabled } from './env';
import { completeWithTool, LlmError } from './llm';
import { BRIEF_TOOL_INPUT_SCHEMA, validateAIBrief } from './llm/brief-schema';
import { logAuditEvent } from './audit';
import type { Case, Client, AIBrief, FactCheckResult } from './types';

const BRIEF_TOOL_NAME = 'record_clinical_brief';
const MAX_ATTEMPTS = 2;
const BRIEF_MAX_TOKENS = 4096;

interface BriefOptions {
  client?: Client | null;
  /** When true, uses evidence-based medicine framing instead of commercial criteria matching */
  mdReviewMode?: boolean;
}

export async function generateBriefForCase(
  caseData: Case,
  options: BriefOptions = {},
): Promise<{ brief: AIBrief; factCheck: FactCheckResult }> {
  // Gate at the lib boundary so any caller (route, cron, ad-hoc script) is
  // protected — not just the /api/generate-brief route. Demo-mode callers
  // should use getDemoBrief() from lib/demo-mode.ts; this function is for
  // real Anthropic calls only.
  if (!isRealAnthropicEnabled()) {
    throw new Error(
      'generateBriefForCase requires real Anthropic. Caller should use getDemoBrief() in demo mode.',
    );
  }

  const isMdReview =
    options.mdReviewMode ||
    caseData.status === 'md_review' ||
    caseData.review_type === 'second_level_review' ||
    caseData.review_type === 'appeal';

  const systemPrompt = buildSystemPrompt(isMdReview);
  const userPrompt = buildUserPrompt(caseData, options.client ?? null, isMdReview);

  logAuditEvent(caseData.id, 'brief_generation_started', 'system', {
    md_review_mode: isMdReview,
    procedure_code_count: caseData.procedure_codes?.length ?? 0,
  }).catch(() => { /* already logged inside logAuditEvent */ });

  // Retry loop. The Anthropic SDK already retries 5xx/429 transport errors
  // internally; this loop handles a different class of failure — the model
  // returns successfully but emits a payload that doesn't match the schema
  // (missing field, wrong enum, etc.). We give it one more chance with
  // explicit feedback before giving up.
  let lastValidationReason: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const promptForAttempt = lastValidationReason
      ? `${userPrompt}\n\n---\nNOTE: Your previous response failed schema validation. Issues: ${lastValidationReason}. Re-emit the tool call with all required fields populated and correct types.`
      : userPrompt;

    let result;
    try {
      result = await completeWithTool({
        system: systemPrompt,
        user: promptForAttempt,
        maxTokens: BRIEF_MAX_TOKENS,
        tool: {
          name: BRIEF_TOOL_NAME,
          description:
            'Record the structured clinical review brief. Call this exactly once with the full brief object.',
          input_schema: BRIEF_TOOL_INPUT_SCHEMA as unknown as Record<string, unknown>,
        },
      });
    } catch (err) {
      // Transport-level failure. SDK already retried. Bubble to caller with
      // structured audit; the route maps LlmError to status code.
      logBriefFailure(caseData.id, attempt, err);
      throw err;
    }

    const validation = validateAIBrief(result.toolInput);
    if (validation.ok) {
      logAuditEvent(caseData.id, 'brief_generation_completed', 'system', {
        attempt,
        model: result.model,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        cache_read_tokens: result.cacheReadTokens,
      }).catch(() => { /* already logged inside logAuditEvent */ });

      const factCheck = factCheckBrief(validation.brief, caseData);
      logAuditEvent(caseData.id, 'fact_check_completed', 'system', {
        score: factCheck.overall_score,
        status: factCheck.overall_status,
        flagged: factCheck.summary.flagged,
      }).catch(() => { /* already logged inside logAuditEvent */ });

      return { brief: validation.brief, factCheck };
    }

    lastValidationReason = validation.reason;
    logAuditEvent(caseData.id, 'brief_generation_invalid_payload', 'system', {
      attempt,
      reason: validation.reason,
      will_retry: attempt < MAX_ATTEMPTS,
    }).catch(() => { /* already logged inside logAuditEvent */ });
  }

  logBriefFailure(caseData.id, MAX_ATTEMPTS, new Error('schema_validation_exhausted'));
  throw new LlmError(
    `Brief generation produced an invalid payload after ${MAX_ATTEMPTS} attempts. Last issue: ${lastValidationReason}`,
    'no_response',
    false,
  );
}

function logBriefFailure(caseId: string, attempt: number, err: unknown): void {
  const kind = err instanceof Error ? err.name : typeof err;
  logAuditEvent(caseId, 'brief_generation_failed', 'system', {
    attempt,
    error_kind: kind,
    // For LlmError specifically, surface the structured discriminators we
    // already trust to be PHI-safe (kind/status/retryable).
    error_llm_kind: err instanceof LlmError ? err.kind : null,
    error_llm_status: err instanceof LlmError ? err.status ?? null : null,
    error_llm_retryable: err instanceof LlmError ? err.retryable : null,
  }).catch(() => { /* already logged inside logAuditEvent */ });
}

function buildSystemPrompt(isMdReview: boolean): string {
  return isMdReview
    ? `You are the clinical intelligence behind VantaUM, preparing a second-level physician advisor review brief. Your role is to do the heavy lifting so the reviewing physician can spend their time on clinical judgment, not paperwork. This brief is for a board-certified physician advisor who will render a medical necessity determination using EVIDENCE-BASED MEDICINE — NOT commercial criteria like InterQual or MCG.

The physician advisor uses:
- Published peer-reviewed medical literature
- Specialty society clinical practice guidelines (AAOS, ACS, AHA, AAN, NCCN, etc.)
- CMS National Coverage Determinations (NCDs) and Local Coverage Determinations (LCDs)
- Clinical experience and medical judgment
- Evidence-based assessment of the patient's individual clinical circumstances

You are NOT rendering a determination. You are preparing a comprehensive evidence-based brief.

Key principles:
- Cite specific published guidelines and medical literature, not commercial criteria products
- Assess the clinical evidence supporting or contradicting the requested service
- Evaluate whether conservative/step therapy has been adequately trialed per published evidence
- Consider the patient's individual risk factors, comorbidities, and clinical trajectory
- Note the strength of evidence (systematic review > RCT > cohort > case series > expert opinion)
- Address level of care determination: inpatient vs. observation vs. outpatient based on clinical acuity
- If this is an appeal, analyze why the original denial may or may not have been appropriate

Call the record_clinical_brief tool exactly once with the complete structured brief. Populate every required field; use empty arrays where a list field has no entries.`
    : `You are the clinical intelligence behind VantaUM, a concierge utilization management service for TPAs, health plans, and self-funded employers. Your role is to do the heavy lifting — analyzing clinical data and preparing a structured one-page brief — so the reviewing physician can spend their time on what matters: clinical judgment, not paperwork.

You are NOT rendering a determination. You are preparing the brief so the physician has more time with the case, not less.

Be precise, clinical, and cite specific criteria. Use standard medical terminology (ICD-10, CPT/HCPCS). Reference applicable clinical guidelines (InterQual, MCG, ACR Appropriateness Criteria, specialty society guidelines, CMS National Coverage Determinations as relevant). Flag any missing information that the reviewer should note.

Key principles:
- Evaluate diagnosis-procedure alignment (does the diagnosis support the requested procedure?)
- Assess setting appropriateness (inpatient vs. outpatient vs. ASC vs. office)
- Identify conservative alternatives that may not have been tried
- Note any state-specific regulatory requirements that apply
- Consider the review type context (prior auth, concurrent, retrospective, appeal, P2P)

Call the record_clinical_brief tool exactly once with the complete structured brief. Populate every required field; use empty arrays where a list field has no entries.`;
}

function buildUserPrompt(caseData: Case, client: Client | null, isMdReview: boolean): string {
  // Look up medical criteria for the submitted procedure codes
  let criteriaContext = '';
  if (caseData.procedure_codes?.length) {
    const matchedCriteria = getCriteriaForCodes(caseData.procedure_codes);
    if (Object.keys(matchedCriteria).length > 0) {
      criteriaContext = `\n\nMEDICAL CRITERIA REFERENCE:\n${JSON.stringify(matchedCriteria, null, 2)}`;
    }
  }

  // Client-specific criteria source context
  let clientCriteriaContext = '';
  if (client) {
    const sources: string[] = [];
    if (client.uses_interqual) sources.push('InterQual (Change Healthcare)');
    if (client.uses_mcg) sources.push('MCG Health (Cite)');
    if (client.custom_guidelines_url) sources.push(`Custom guidelines: ${client.custom_guidelines_url}`);
    if (sources.length > 0) {
      clientCriteriaContext = `\n\nCLIENT-REQUIRED CRITERIA SOURCES: This client (${client.name}) requires reviews to reference: ${sources.join(', ')}. Prioritize these sources when citing guideline matches.`;
      if (client.contracted_sla_hours) {
        clientCriteriaContext += `\nClient SLA: ${client.contracted_sla_hours} hours turnaround.`;
      }
    }
  }

  const twoMidnight = analyzeTwoMidnightRule(caseData);
  const twoMidnightContext = getTwoMidnightBriefContext(twoMidnight);

  const mdReviewBanner = isMdReview
    ? '\n\nREVIEW LEVEL: SECOND-LEVEL PHYSICIAN ADVISOR REVIEW. Use evidence-based medicine and published clinical guidelines. Do NOT rely on commercial criteria products (InterQual/MCG) as the primary basis — cite peer-reviewed literature and specialty society guidelines instead.'
    : '';

  return `Generate a clinical review brief for the following case:

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
${criteriaContext}${clientCriteriaContext}${twoMidnightContext}${mdReviewBanner}

---

Call the record_clinical_brief tool with the structured brief. The tool's schema enumerates every required field — do not omit any. Use empty arrays for list fields with no entries.`;
}
