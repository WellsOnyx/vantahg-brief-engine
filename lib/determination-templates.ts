import { getServiceClient } from '@/lib/supabase';
import { isDemoMode, getDemoDeterminationTemplates } from '@/lib/demo-mode';
import type { DeterminationTemplate, Case, Reviewer, Client } from '@/lib/types';

// ============================================================================
// Template Retrieval
// ============================================================================

/**
 * Get the determination template for a specific client and template type.
 * Falls back to the default template (client_id === null) if no client-specific one exists.
 */
export async function getTemplateForClient(
  clientId: string | null,
  templateType: 'approval' | 'denial' | 'partial_approval' | 'pend' | 'modification' | 'idr_offer_upheld' | 'idr_offer_modified',
): Promise<DeterminationTemplate | null> {
  if (isDemoMode()) {
    const templates = getDemoDeterminationTemplates(clientId ?? undefined);
    // Prefer client-specific, fall back to default
    const clientSpecific = templates.find(
      (t) => t.client_id === clientId && t.template_type === templateType
    );
    if (clientSpecific) return clientSpecific;
    return templates.find(
      (t) => t.client_id === null && t.template_type === templateType
    ) ?? null;
  }

  const supabase = getServiceClient();

  // Try client-specific first
  if (clientId) {
    const { data: clientTemplate } = await supabase
      .from('determination_templates')
      .select('*')
      .eq('client_id', clientId)
      .eq('template_type', templateType)
      .eq('is_active', true)
      .single();

    if (clientTemplate) return clientTemplate;
  }

  // Fall back to default
  const { data: defaultTemplate } = await supabase
    .from('determination_templates')
    .select('*')
    .is('client_id', null)
    .eq('template_type', templateType)
    .eq('is_active', true)
    .single();

  return defaultTemplate;
}

// ============================================================================
// Template Rendering
// ============================================================================

interface TemplateContext {
  patient_name?: string;
  member_id?: string;
  authorization_number?: string;
  procedure_description?: string;
  provider_name?: string;
  reviewer_name?: string;
  reviewer_credentials?: string;
  denial_reason?: string;
  denial_criteria_cited?: string;
  alternative_recommended?: string;
  appeal_instructions?: string;
  effective_date?: string;
  expiration_date?: string;
  case_number?: string;
  [key: string]: string | undefined;
}

/**
 * Render a determination letter using a Handlebars-style template.
 * Replaces {{variable}} with values from the context.
 */
export function renderDeterminationLetter(
  template: DeterminationTemplate,
  context: TemplateContext,
): string {
  let rendered = template.body_template;

  // If the template has appeal instructions and the context doesn't override
  if (template.appeal_instructions && !context.appeal_instructions) {
    context.appeal_instructions = template.appeal_instructions;
  }

  // Replace all {{variable}} tokens
  for (const [key, value] of Object.entries(context)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    rendered = rendered.replace(regex, value || '');
  }

  // Clean up any unreplaced tokens
  rendered = rendered.replace(/\{\{[^}]+\}\}/g, '[Not Available]');

  return rendered;
}

/**
 * Build a complete determination letter for a case.
 */
export async function buildDeterminationLetter(
  caseData: Case,
  reviewer: Reviewer | null,
  client: Client | null,
): Promise<string> {
  const isIdr = caseData.case_type === 'payer_idr';
  const isIro = caseData.case_type === 'iro' || caseData.case_type === 'ire';

  let templateType: any = 'pend';
  if (isIdr) {
    // IDR uses different template types
    templateType = caseData.determination === 'approve' || caseData.determination === 'partial_approve'
      ? 'idr_offer_modified'
      : 'idr_offer_upheld';
  } else if (isIro) {
    // IRO/IRE external review templates (new in Phase B)
    templateType = caseData.determination === 'approve' || caseData.determination === 'partial_approve'
      ? 'iro_approved'
      : 'iro_denied';
  } else {
    templateType = caseData.determination === 'approve'
      ? 'approval'
      : caseData.determination === 'deny'
      ? 'denial'
      : caseData.determination === 'partial_approve'
      ? 'partial_approval'
      : 'pend';
  }

  const template = await getTemplateForClient(
    caseData.client_id,
    templateType,
  );

  if (!template) {
    // Fallback
    return `Determination: ${caseData.determination?.toUpperCase()}\n\nPatient: ${caseData.patient_name}\nCase: ${caseData.case_number}\n\n${caseData.determination_rationale || ''}`;
  }

  const today = new Date();
  const expirationDate = new Date(today);
  expirationDate.setDate(expirationDate.getDate() + 90);

  const billed = caseData.billed_amount_cents ? (caseData.billed_amount_cents / 100).toFixed(2) : '';

  return renderDeterminationLetter(template, {
    patient_name: caseData.patient_name || '',
    member_id: caseData.patient_member_id || '',
    authorization_number: caseData.authorization_number || '',
    procedure_description: caseData.procedure_description || '',
    provider_name: caseData.requesting_provider || '',
    reviewer_name: reviewer?.name || '',
    reviewer_credentials: reviewer?.credentials || '',
    denial_reason: caseData.denial_reason || '',
    denial_criteria_cited: caseData.denial_criteria_cited || '',
    alternative_recommended: caseData.alternative_recommended || '',
    effective_date: today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    expiration_date: expirationDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    case_number: caseData.case_number || '',
    billed_amount: billed,
    qpa_amount: caseData.billed_amount_cents ? ((caseData.billed_amount_cents * 0.3) / 100).toFixed(2) : '', // placeholder
    modified_amount: caseData.billed_amount_cents ? ((caseData.billed_amount_cents * 0.6) / 100).toFixed(2) : '',
    rationale: caseData.determination_rationale || '',
  });
}

/**
 * Get appeal instructions for a client.
 */
export async function getAppealInstructions(clientId: string | null): Promise<string> {
  const denialTemplate = await getTemplateForClient(clientId, 'denial');
  return denialTemplate?.appeal_instructions || 'You have the right to appeal this decision. Please contact us for details.';
}
