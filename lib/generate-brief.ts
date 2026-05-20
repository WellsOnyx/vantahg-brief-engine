import { getCriteriaForCodes } from '@/lib/medical-criteria';
import { factCheckBrief } from './fact-checker';
import { analyzeTwoMidnightRule, getTwoMidnightBriefContext } from './two-midnight-rule';
import { isRealAnthropicEnabled } from './env';
import { completeWithTool, LlmError } from './llm';
import {
  BRIEF_TOOL_INPUT_SCHEMA,
  BRIEF_CRITIQUE_TOOL_NAME,
  BRIEF_CRITIQUE_TOOL_SCHEMA,
  validateAIBrief,
  type BriefCritique,
} from './llm/brief-schema';
import { logAuditEvent } from './audit';
import type { Case, Client, AIBrief, FactCheckResult } from './types';

const BRIEF_TOOL_NAME = 'record_clinical_brief';
const MAX_ATTEMPTS_PER_PASS = 2;
const BRIEF_MAX_TOKENS = 4096;

// Self-improvement thresholds (production-tuned for clinical defensibility)
const SELF_CRITIQUE_SCORE_THRESHOLD = 82; // Below this (or non-'pass' status) triggers revision pass
const MAX_PASSES = 3; // Hard cap — 1 initial + up to 2 self-critique/revision loops

interface BriefOptions {
  client?: Client | null;
  /** When true, uses evidence-based medicine framing instead of commercial criteria matching */
  mdReviewMode?: boolean;
}

interface PassResult {
  brief: AIBrief;
  factCheck: FactCheckResult;
  pass: number;
  critique?: BriefCritique;
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
    self_improvement_enabled: true,
    max_passes: MAX_PASSES,
    critique_threshold: SELF_CRITIQUE_SCORE_THRESHOLD,
  }).catch(() => { /* already logged inside logAuditEvent */ });

  const passes: PassResult[] = [];
  let lastValidationReason: string | null = null;

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const isRevisionPass = pass > 1;
    const prior = passes.length > 0 ? passes[passes.length - 1] : null;

    // Build the prompt for this pass (initial vs. revision informed by prior critique + fact-check)
    let promptForPass = userPrompt;
    if (isRevisionPass && prior?.critique) {
      promptForPass = buildRevisionUserPrompt(
        caseData,
        options.client ?? null,
        isMdReview,
        prior.brief,
        prior.factCheck,
        prior.critique,
      );
    } else if (lastValidationReason) {
      promptForPass = `${userPrompt}\n\n---\nNOTE: Your previous response failed schema validation. Issues: ${lastValidationReason}. Re-emit the tool call with all required fields populated and correct types.`;
    }

    const currentSystem = isRevisionPass
      ? buildRevisionSystemPrompt(isMdReview, prior?.critique)
      : systemPrompt;

    // Per-pass schema validation retry (distinct from content self-critique)
    let passBrief: AIBrief | null = null;
    let passModelInfo: any = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_PASS; attempt++) {
      const attemptPrompt = lastValidationReason && attempt > 1
        ? `${promptForPass}\n\n---\nNOTE: Previous attempt in this pass failed schema validation: ${lastValidationReason}. Fix and re-emit complete tool call.`
        : promptForPass;

      let result;
      try {
        result = await completeWithTool({
          system: currentSystem,
          user: attemptPrompt,
          maxTokens: BRIEF_MAX_TOKENS,
          tool: {
            name: BRIEF_TOOL_NAME,
            description: isRevisionPass
              ? 'Record the REVISED structured clinical review brief after incorporating self-critique. Call exactly once with the full improved brief object. Explicitly strengthen any areas called out in the critique.'
              : 'Record the structured clinical review brief. Call this exactly once with the full brief object.',
            input_schema: BRIEF_TOOL_INPUT_SCHEMA as unknown as Record<string, unknown>,
          },
        });
        passModelInfo = result;
      } catch (err) {
        logBriefFailure(caseData.id, pass, attempt, err);
        throw err;
      }

      const validation = validateAIBrief(result.toolInput);
      if (validation.ok) {
        passBrief = validation.brief;
        lastValidationReason = null;
        break;
      }

      lastValidationReason = validation.reason;
      logAuditEvent(caseData.id, 'brief_generation_invalid_payload', 'system', {
        pass,
        attempt,
        reason: validation.reason,
        will_retry: attempt < MAX_ATTEMPTS_PER_PASS,
      }).catch(() => {});
    }

    if (!passBrief) {
      logBriefFailure(caseData.id, pass, MAX_ATTEMPTS_PER_PASS, new Error('schema_validation_exhausted'));
      throw new LlmError(
        `Brief generation (pass ${pass}) produced invalid payload after ${MAX_ATTEMPTS_PER_PASS} attempts. Last: ${lastValidationReason}`,
        'no_response',
        false,
      );
    }

    // Run deterministic fact-check on this pass output
    const factCheck = factCheckBrief(passBrief, caseData);

    logAuditEvent(caseData.id, 'brief_generation_pass_completed', 'system', {
      pass,
      model: passModelInfo?.model,
      input_tokens: passModelInfo?.inputTokens,
      output_tokens: passModelInfo?.outputTokens,
      score: factCheck.overall_score,
      status: factCheck.overall_status,
      flagged_count: Array.isArray(factCheck.summary?.flagged) ? factCheck.summary.flagged.length : 0,
    }).catch(() => {});

    // Self-critique step if warranted (structured clinical reasoning)
    let critiqueForThisPass: BriefCritique | undefined;
    const needsCritique =
      pass < MAX_PASSES &&
      (factCheck.overall_score < SELF_CRITIQUE_SCORE_THRESHOLD || factCheck.overall_status !== 'pass');

    if (needsCritique) {
      logAuditEvent(caseData.id, 'brief_self_critique_started', 'system', {
        pass,
        current_score: factCheck.overall_score,
        current_status: factCheck.overall_status,
      }).catch(() => {});

      try {
        critiqueForThisPass = await performSelfCritique(
          caseData,
          passBrief,
          factCheck,
          isMdReview,
          options.client ?? null,
        );

        logAuditEvent(caseData.id, 'brief_self_critique_completed', 'system', {
          pass,
          issues_count: critiqueForThisPass.issues_identified.length,
          sections_to_revisit: critiqueForThisPass.sections_recommended_for_revision,
          summary: critiqueForThisPass.critique_summary?.slice(0, 200),
        }).catch(() => {});
      } catch (critErr) {
        // Critique failure is non-fatal — we still surface the current best brief.
        // This preserves forward progress while maintaining audit.
        logAuditEvent(caseData.id, 'brief_self_critique_failed', 'system', {
          pass,
          error: critErr instanceof Error ? critErr.message : String(critErr),
        }).catch(() => {});
      }
    }

    const thisPassResult: PassResult = {
      brief: passBrief,
      factCheck,
      pass,
      critique: critiqueForThisPass,
    };
    passes.push(thisPassResult);

    // Decision: continue to another revision pass or stop?
    if (!needsCritique) {
      // Strong enough — stop early for efficiency
      break;
    }
  }

  // Select the final (best) pass result
  const finalPass = passes[passes.length - 1];
  const initialPass = passes[0];

  // Attach rich generation_metadata for auditability + UI (no DB migration)
  const finalBrief: AIBrief = {
    ...finalPass.brief,
    generation_metadata: {
      passes_completed: passes.length,
      self_improvement_applied: passes.length > 1,
      initial_fact_check_score: initialPass.factCheck.overall_score,
      final_fact_check_score: finalPass.factCheck.overall_score,
      revisions: passes
        .filter((p, idx) => idx > 0 && p.critique)
        .map((p) => ({
          pass: p.pass,
          issues_addressed: p.critique!.issues_identified,
          sections_revised: p.critique!.sections_recommended_for_revision,
          score_before: passes[p.pass - 2]?.factCheck.overall_score ?? initialPass.factCheck.overall_score,
          score_after: p.factCheck.overall_score,
          critique_summary: p.critique!.critique_summary,
        })),
    },
  };

  // Final consolidated audit (replaces the old single "completed")
  logAuditEvent(caseData.id, 'brief_generation_completed', 'system', {
    passes_completed: passes.length,
    self_improvement_applied: passes.length > 1,
    initial_score: initialPass.factCheck.overall_score,
    final_score: finalPass.factCheck.overall_score,
    score_lift: finalPass.factCheck.overall_score - initialPass.factCheck.overall_score,
    final_status: finalPass.factCheck.overall_status,
  }).catch(() => {});

  logAuditEvent(caseData.id, 'fact_check_completed', 'system', {
    score: finalPass.factCheck.overall_score,
    status: finalPass.factCheck.overall_status,
    flagged: finalPass.factCheck.summary.flagged,
    after_self_improvement: true,
  }).catch(() => {});

  return { brief: finalBrief, factCheck: finalPass.factCheck };
}

function logBriefFailure(caseId: string, passOrAttempt: number, attemptOrErr: number | unknown, maybeErr?: unknown): void {
  // Back-compat + new multi-pass signature: logBriefFailure(id, pass, attempt, err) or legacy (id, attempt, err)
  const pass = typeof attemptOrErr === 'number' ? passOrAttempt : undefined;
  const attempt = typeof attemptOrErr === 'number' ? attemptOrErr : passOrAttempt;
  const err = (maybeErr ?? attemptOrErr) as unknown;

  const kind = err instanceof Error ? err.name : typeof err;
  logAuditEvent(caseId, 'brief_generation_failed', 'system', {
    pass,
    attempt,
    error_kind: kind,
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

// ── Self-Improvement (Multi-Pass Clinical Reasoning) Helpers ─────────────────

function buildRevisionSystemPrompt(isMdReview: boolean, priorCritique?: BriefCritique): string {
  const base = buildSystemPrompt(isMdReview);
  const critiqueDirective = priorCritique
    ? `

SELF-CRITIQUE REVISION DIRECTIVE (MANDATORY):
You previously produced a draft that was fact-checked and self-critiqued. The following issues were identified by your own clinical reasoning engine:
${priorCritique.issues_identified.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}

You MUST produce a REVISED brief that directly addresses EVERY issue above.
- Strengthen criteria citations and evidence where flagged.
- Add or improve conservative alternatives where recommended.
- Clarify or expand rationale in ai_recommendation and reviewer_action.
- Fix any documentation gaps or alignment weaknesses explicitly called out.
- In the revised ai_recommendation.rationale and key_considerations, briefly note the specific improvements made for defensibility.

Output the COMPLETE revised brief via the record_clinical_brief tool. Do not omit fields.`
    : '';

  return base + critiqueDirective;
}

function buildRevisionUserPrompt(
  caseData: Case,
  client: Client | null,
  isMdReview: boolean,
  priorBrief: AIBrief,
  priorFactCheck: FactCheckResult,
  critique: BriefCritique,
): string {
  const base = buildUserPrompt(caseData, client, isMdReview);

  return `${base}

--- PRIOR DRAFT BRIEF (for targeted revision) ---
Draft AI Recommendation: ${priorBrief.ai_recommendation.recommendation} (confidence: ${priorBrief.ai_recommendation.confidence})
Draft Fact-Check Score: ${priorFactCheck.overall_score}/100 (status: ${priorFactCheck.overall_status})
Fact-Check Flags (count): ${typeof priorFactCheck.summary?.flagged === 'number' ? priorFactCheck.summary.flagged : '0'}

SELF-CRITIQUE FROM PREVIOUS PASS:
${critique.critique_summary}

Issues to explicitly resolve in this revision:
${critique.issues_identified.map((i) => `• ${i}`).join('\n')}

Recommended fixes (incorporate):
${critique.recommended_fixes.map((f) => `• ${f}`).join('\n')}

Produce the FULL REVISED structured brief via the tool call. Your revised output will be re-fact-checked and must demonstrate measurable improvement in clinical defensibility.`;
}

/**
 * Structured self-critique pass.
 * Uses a dedicated critique tool so the model surfaces explicit reasoning
 * before we ask it to revise. This is the core of "AI improves its own output".
 */
async function performSelfCritique(
  caseData: Case,
  draftBrief: AIBrief,
  draftFactCheck: FactCheckResult,
  isMdReview: boolean,
  _client: Client | null,
): Promise<BriefCritique> {
  const critiqueSystem = isMdReview
    ? `You are a senior board-certified physician advisor performing a structured self-audit of a draft utilization review brief. Your only job is to ruthlessly identify clinical defensibility gaps, weak evidence links, missing conservative alternatives, over-claimed criteria, or documentation issues that would be challenged on audit or appeal. Be specific and cite the draft content. Output ONLY via the ${BRIEF_CRITIQUE_TOOL_NAME} tool.`
    : `You are the VantaUM clinical intelligence engine performing an internal quality self-audit of your own draft brief. Identify any weaknesses that could reduce defensibility for the human concierge validation gate or subsequent clinical reviewer. Be precise and actionable. Output ONLY via the ${BRIEF_CRITIQUE_TOOL_NAME} tool.`;

  const critiqueUser = `CASE: ${caseData.case_number} | ${caseData.patient_name} | ${caseData.procedure_codes?.join(', ')}
DRAFT BRIEF SUMMARY:
- Recommendation: ${draftBrief.ai_recommendation.recommendation} (${draftBrief.ai_recommendation.confidence})
- Criteria met count: ${draftBrief.criteria_match.criteria_met.length} | not met: ${draftBrief.criteria_match.criteria_not_met.length} | unable: ${draftBrief.criteria_match.criteria_unable_to_assess.length}
- Fact-check score: ${draftFactCheck.overall_score} (${draftFactCheck.overall_status})
- Flagged items (count): ${typeof draftFactCheck.summary?.flagged === 'number' ? draftFactCheck.summary.flagged : 0}

DRAFT CRITERIA MATCH (key excerpts):
Guideline: ${draftBrief.criteria_match.applicable_guideline}
Met (first 3): ${draftBrief.criteria_match.criteria_met.slice(0, 3).join(' || ')}
Not met / Unable (first 3): ${(draftBrief.criteria_match.criteria_not_met.length ? draftBrief.criteria_match.criteria_not_met : draftBrief.criteria_match.criteria_unable_to_assess).slice(0, 3).join(' || ')}

AI RATIONALE (excerpt): ${draftBrief.ai_recommendation.rationale.slice(0, 280)}

Perform the structured critique now.`;

  const result = await completeWithTool({
    system: critiqueSystem,
    user: critiqueUser,
    maxTokens: 1200,
    tool: {
      name: BRIEF_CRITIQUE_TOOL_NAME,
      description: 'Record a structured self-critique of the draft clinical brief. Identify specific issues that reduce defensibility. This drives the revision pass.',
      input_schema: BRIEF_CRITIQUE_TOOL_SCHEMA as unknown as Record<string, unknown>,
    },
  });

  // The tool input is already validated shape by Anthropic, but we still coerce defensively
  const raw = result.toolInput as Partial<BriefCritique>;
  return {
    issues_identified: Array.isArray(raw.issues_identified) ? raw.issues_identified : [],
    sections_recommended_for_revision: Array.isArray(raw.sections_recommended_for_revision) ? raw.sections_recommended_for_revision : ['criteria_match', 'ai_recommendation'],
    critique_summary: typeof raw.critique_summary === 'string' ? raw.critique_summary : 'Draft requires targeted strengthening for clinical defensibility before human validation gate.',
    recommended_fixes: Array.isArray(raw.recommended_fixes) ? raw.recommended_fixes : [],
  };
}

/**
 * Shared persistence helper for brief + fact-check results.
 * Guarantees that *every* brief creation path (manual generate, case create, batch, eFax triage promote, streaming, future cron)
 * persists the fact_check alongside the ai_brief using identical logic + audit.
 * Centralizes the "AI proposes, fact-check always travels with it, persisted for human gates" contract.
 * Callers still responsible for triggering assignment/notifications.
 */
export async function persistBriefResult(
  caseId: string,
  result: { brief: AIBrief; factCheck: FactCheckResult },
  supabase: ReturnType<typeof import('@/lib/supabase').getServiceClient>,
  options: {
    /** For differentiated audit messages (e.g. 'batch_upload', 'triage_promote', 'auto_on_create') */
    generatedFrom?: string;
    /** Additional safe context for the brief_generated audit payload */
    auditContext?: Record<string, unknown>;
  } = {}
): Promise<void> {
  const { brief, factCheck } = result;

  await supabase
    .from('cases')
    .update({
      ai_brief: brief,
      ai_brief_generated_at: new Date().toISOString(),
      fact_check: factCheck,
      fact_check_at: new Date().toISOString(),
      status: 'brief_ready',
    })
    .eq('id', caseId);

  await logAuditEvent(caseId, 'brief_generated', 'system', {
    generated_automatically: true,
    ...(options.generatedFrom ? { generated_from: options.generatedFrom } : {}),
    ...(options.auditContext ?? {}),
    fact_check_score: factCheck.overall_score,
    fact_check_status: factCheck.overall_status,
    human_review_recommended: factCheck.human_review_recommended,
  });
}
