import { jsPDF } from 'jspdf';
import type { Case, Reviewer, AIBrief } from './types';

const NAVY = '#0c2340';
const GOLD = '#c9a227';
const GRAY = '#6b7280';
const RED = '#dc2626';
const GREEN = '#16a34a';
const AMBER = '#d97706';

const DETERMINATION_LABELS: Record<string, string> = {
  approve: 'APPROVED',
  deny: 'DENIED',
  partial_approve: 'PARTIALLY APPROVED',
  modify: 'APPROVED WITH MODIFICATIONS',
  pend: 'PENDED — ADDITIONAL INFORMATION REQUIRED',
  peer_to_peer_requested: 'PEER-TO-PEER REVIEW REQUESTED',
};

/**
 * Generate a PDF determination letter for a case.
 * Returns a Buffer containing the PDF binary data.
 */
export async function generateDeterminationPdf(caseData: Case): Promise<Buffer> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const reviewer = (caseData as any).reviewer as Reviewer | undefined;
  const determinationDate = caseData.determination_at
    ? new Date(caseData.determination_at).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : 'N/A';
  const isDenial = caseData.determination === 'deny' || caseData.determination === 'partial_approve';

  // ── Header ──
  doc.setFillColor(NAVY);
  doc.rect(0, 0, pageWidth, 22, 'F');
  doc.setTextColor(GOLD);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('V', margin, 14);
  doc.setTextColor('#ffffff');
  doc.setFontSize(14);
  doc.text('VantaUM', margin + 10, 14);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Clinical Brief Engine', margin + 10, 19);

  // Right side header
  doc.setTextColor('#ffffff');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('UTILIZATION REVIEW DETERMINATION', pageWidth - margin, 10, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`Case: ${caseData.case_number}`, pageWidth - margin, 15, { align: 'right' });
  doc.text(`Date: ${determinationDate}`, pageWidth - margin, 19, { align: 'right' });

  y = 30;

  // ── Determination Banner ──
  const detLabel = DETERMINATION_LABELS[caseData.determination!] || caseData.determination!.toUpperCase();
  const bannerColor = isDenial ? '#fef2f2' : '#f0fdf4';
  const textColor = isDenial ? RED : GREEN;

  doc.setFillColor(bannerColor);
  doc.roundedRect(margin, y, contentWidth, 16, 2, 2, 'F');
  doc.setTextColor(GRAY);
  doc.setFontSize(7);
  doc.text('DETERMINATION', pageWidth / 2, y + 5, { align: 'center' });
  doc.setTextColor(textColor);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(detLabel, pageWidth / 2, y + 13, { align: 'center' });

  y += 22;

  // ── Helper functions ──
  function sectionHeader(title: string) {
    if (y > 260) { doc.addPage(); y = margin; }
    doc.setTextColor(GRAY);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(title.toUpperCase(), margin, y);
    doc.setDrawColor('#e5e7eb');
    doc.line(margin, y + 1.5, margin + contentWidth, y + 1.5);
    y += 6;
  }

  function fieldRow(label: string, value: string, x = margin, width = contentWidth / 2 - 5) {
    doc.setTextColor(GRAY);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(label, x, y);
    doc.setTextColor('#111827');
    doc.setFont('helvetica', 'bold');
    const lines = doc.splitTextToSize(value || '—', width - 30);
    doc.text(lines, x + 28, y);
    y += Math.max(lines.length * 4, 5);
  }

  function wrappedText(text: string, fontSize = 8) {
    if (y > 260) { doc.addPage(); y = margin; }
    doc.setTextColor('#111827');
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(text, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * (fontSize * 0.5) + 3;
  }

  // ── Patient & Provider Info ──
  const colLeft = margin;
  const colRight = pageWidth / 2 + 5;

  sectionHeader('Patient Information');
  const savedY = y;
  fieldRow('Name', caseData.patient_name || '—', colLeft);
  fieldRow('DOB', caseData.patient_dob || '—', colLeft);
  fieldRow('Gender', caseData.patient_gender || '—', colLeft);
  fieldRow('Member ID', caseData.patient_member_id || '—', colLeft);
  const leftEnd = y;

  y = savedY;
  sectionHeader('Provider Information');
  fieldRow('Provider', caseData.requesting_provider || '—', colRight);
  fieldRow('NPI', caseData.requesting_provider_npi || '—', colRight);
  fieldRow('Specialty', caseData.requesting_provider_specialty || '—', colRight);
  y = Math.max(leftEnd, y) + 4;

  // ── Service Details ──
  sectionHeader('Service Details');
  fieldRow('Category', (caseData.service_category || '—').replace(/_/g, ' '));
  fieldRow('Review Type', (caseData.review_type || '—').replace(/_/g, ' '));
  fieldRow('CPT/HCPCS', caseData.procedure_codes?.join(', ') || '—');
  fieldRow('ICD-10', caseData.diagnosis_codes?.join(', ') || '—');
  y += 2;

  // ── Procedure Description ──
  if (caseData.procedure_description) {
    sectionHeader('Procedure Description');
    wrappedText(caseData.procedure_description);
    y += 2;
  }

  // ── Clinical Rationale ──
  sectionHeader('Clinical Rationale');
  wrappedText(caseData.determination_rationale || 'No rationale provided.');
  y += 2;

  // ── Denial Details ──
  if (isDenial) {
    sectionHeader('Denial Details');
    if (caseData.denial_reason) {
      doc.setTextColor(RED);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text('REASON FOR DENIAL', margin, y);
      y += 4;
      wrappedText(caseData.denial_reason);
    }
    if (caseData.denial_criteria_cited) {
      doc.setTextColor(RED);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text('CLINICAL CRITERIA CITED', margin, y);
      y += 4;
      wrappedText(caseData.denial_criteria_cited);
    }
    y += 2;
  }

  // ── Clinical Criteria Reference ──
  if (caseData.ai_brief?.criteria_match) {
    sectionHeader('Clinical Criteria Reference');
    const cm = caseData.ai_brief.criteria_match;
    if (cm.applicable_guideline) {
      doc.setTextColor(GRAY);
      doc.setFontSize(7);
      doc.text('APPLICABLE GUIDELINE', margin, y);
      y += 4;
      wrappedText(cm.applicable_guideline);
    }
    if (cm.criteria_met?.length) {
      doc.setTextColor(GREEN);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text('CRITERIA MET', margin, y);
      y += 4;
      for (const c of cm.criteria_met) {
        wrappedText(`• ${c}`);
      }
    }
    if (cm.criteria_not_met?.length) {
      doc.setTextColor(RED);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text('CRITERIA NOT MET', margin, y);
      y += 4;
      for (const c of cm.criteria_not_met) {
        wrappedText(`• ${c}`);
      }
    }
    y += 2;
  }

  // ── Appeal Rights ──
  if (isDenial) {
    if (y > 245) { doc.addPage(); y = margin; }
    sectionHeader('Appeal Rights');
    wrappedText(
      'You have the right to appeal this determination. To initiate an appeal or request a ' +
      'peer-to-peer review with the reviewing physician, please contact VantaUM within 30 days ' +
      'of this notice. Peer-to-peer reviews are available for all denied or partially approved cases.'
    );
    y += 2;
  }

  // ── Signature Block ──
  if (y > 245) { doc.addPage(); y = margin; }
  doc.setDrawColor(NAVY);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + contentWidth, y);
  y += 8;

  doc.setDrawColor('#111827');
  doc.setLineWidth(0.2);
  doc.line(margin, y + 6, margin + 60, y + 6);
  doc.setTextColor('#111827');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(reviewer?.name || 'Reviewing Physician', margin, y + 10);
  if (reviewer?.credentials) {
    doc.setFont('helvetica', 'normal');
    doc.text(reviewer.credentials, margin, y + 14);
  }
  if (reviewer?.specialty) {
    doc.text(reviewer.specialty, margin, y + 18);
  }

  // Date signature
  doc.line(colRight, y + 6, colRight + 60, y + 6);
  doc.setFont('helvetica', 'bold');
  doc.text('Date', colRight, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(determinationDate, colRight, y + 14);

  // ── Footer ──
  const footerY = doc.internal.pageSize.getHeight() - 12;
  doc.setDrawColor('#e5e7eb');
  doc.line(margin, footerY - 3, margin + contentWidth, footerY - 3);
  doc.setTextColor(GRAY);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `This determination was made by ${reviewer?.name || 'a board-certified physician'}. ` +
    'AI-generated clinical briefs assist in preparation but do not render medical determinations.',
    pageWidth / 2, footerY, { align: 'center' }
  );
  doc.text(
    'VantaUM Clinical Brief Engine — A Wells Onyx Service',
    pageWidth / 2, footerY + 4, { align: 'center' }
  );

  // Return as Buffer
  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

// ───────────────────────────────────────────────────────────────────────────
// Clinical Review Brief PDF
//
// Distinct from the determination letter above. This is the AI-prepared
// brief that physicians read BEFORE making a determination — what TPAs and
// medical directors evaluate when comparing UM vendors.
// ───────────────────────────────────────────────────────────────────────────

const RECOMMENDATION_LABELS: Record<AIBrief['ai_recommendation']['recommendation'], string> = {
  approve: 'APPROVE',
  deny: 'DENY',
  pend: 'PEND — ADDITIONAL INFORMATION REQUIRED',
  peer_to_peer_recommended: 'PEER-TO-PEER RECOMMENDED',
};

const CONFIDENCE_LABEL: Record<AIBrief['ai_recommendation']['confidence'], string> = {
  high: 'HIGH CONFIDENCE',
  medium: 'MEDIUM CONFIDENCE',
  low: 'LOW CONFIDENCE',
};

const CONFIDENCE_COLOR: Record<AIBrief['ai_recommendation']['confidence'], string> = {
  high: GREEN,
  medium: AMBER,
  low: RED,
};

const RECOMMENDATION_COLOR: Record<AIBrief['ai_recommendation']['recommendation'], string> = {
  approve: GREEN,
  deny: RED,
  pend: AMBER,
  peer_to_peer_recommended: NAVY,
};

/**
 * Generate the clinical brief PDF for a case.
 *
 * Sections (in render order):
 *   Header — VantaUM branding + case meta
 *   Recommendation banner — rec + confidence
 *   Clinical Question
 *   Patient & Provider Info
 *   Patient Summary
 *   Clinical Findings (diagnosis + procedure analysis)
 *   Guideline Matches (criteria_met / criteria_not_met / unable / conservative alternatives)
 *   Recommended Determination + Rationale
 *   Supporting Excerpts (documentation_review.key_findings — per product spec, the closest
 *     semantic match to "excerpts" in the current AIBrief schema)
 *   Reviewer Action Required
 *   Footer (audit metadata + advisory disclaimer)
 *
 * Throws if `caseData.ai_brief` is missing — callers should check first.
 */
export async function generateBriefPdf(caseData: Case): Promise<Buffer> {
  const brief = caseData.ai_brief;
  if (!brief) {
    throw new Error('Cannot generate brief PDF: caseData.ai_brief is null');
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  const colRight = pageWidth / 2 + 5;
  let y = margin;

  const generatedDate = caseData.ai_brief_generated_at
    ? new Date(caseData.ai_brief_generated_at).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // ── Page-break helper. jsPDF doesn't auto-paginate text. ──
  const ensureRoom = (needed: number): void => {
    if (y + needed > pageHeight - 18) {
      doc.addPage();
      y = margin;
    }
  };

  const sectionHeader = (title: string): void => {
    ensureRoom(12);
    doc.setTextColor(GRAY);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(title.toUpperCase(), margin, y);
    doc.setDrawColor('#e5e7eb');
    doc.line(margin, y + 1.5, margin + contentWidth, y + 1.5);
    y += 6;
  };

  const wrappedText = (text: string, fontSize = 8, color = '#111827'): void => {
    if (!text) return;
    doc.setTextColor(color);
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(text, contentWidth) as string[];
    const lineHeight = fontSize * 0.5;
    for (const line of lines) {
      ensureRoom(lineHeight + 1);
      doc.text(line, margin, y);
      y += lineHeight;
    }
    y += 1.5;
  };

  const bullets = (
    items: string[],
    options?: { bullet?: string; color?: string; emptyText?: string },
  ): void => {
    const bullet = options?.bullet ?? '•';
    const color = options?.color ?? '#111827';
    if (!items || items.length === 0) {
      if (options?.emptyText) {
        doc.setTextColor(GRAY);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        ensureRoom(5);
        doc.text(options.emptyText, margin + 4, y);
        y += 5;
      }
      return;
    }
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(color);
    for (const item of items) {
      const lines = doc.splitTextToSize(`${bullet} ${item}`, contentWidth - 4) as string[];
      for (const line of lines) {
        ensureRoom(4.5);
        doc.text(line, margin + 4, y);
        y += 4.2;
      }
      y += 0.8;
    }
    y += 1;
  };

  const labelValue = (label: string, value: string, x = margin, width = contentWidth / 2 - 5): void => {
    doc.setTextColor(GRAY);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(label, x, y);
    doc.setTextColor('#111827');
    doc.setFont('helvetica', 'bold');
    const lines = doc.splitTextToSize(value || '—', width - 28) as string[];
    doc.text(lines, x + 26, y);
    y += Math.max(lines.length * 4, 5);
  };

  // ── Header ────────────────────────────────────────────────────────────
  doc.setFillColor(NAVY);
  doc.rect(0, 0, pageWidth, 22, 'F');
  doc.setTextColor(GOLD);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('V', margin, 14);
  doc.setTextColor('#ffffff');
  doc.setFontSize(14);
  doc.text('VantaUM', margin + 10, 14);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Clinical Brief Engine', margin + 10, 19);

  doc.setTextColor('#ffffff');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('CLINICAL REVIEW BRIEF', pageWidth - margin, 10, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`Case: ${caseData.case_number}`, pageWidth - margin, 15, { align: 'right' });
  doc.text(`Generated: ${generatedDate}`, pageWidth - margin, 19, { align: 'right' });

  y = 30;

  // ── Recommendation banner ────────────────────────────────────────────
  const recColor = RECOMMENDATION_COLOR[brief.ai_recommendation.recommendation];
  const confColor = CONFIDENCE_COLOR[brief.ai_recommendation.confidence];

  doc.setFillColor('#f9fafb');
  doc.roundedRect(margin, y, contentWidth, 18, 2, 2, 'F');
  doc.setTextColor(GRAY);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('AI RECOMMENDATION', margin + 4, y + 5);
  doc.setTextColor(recColor);
  doc.setFontSize(13);
  doc.text(RECOMMENDATION_LABELS[brief.ai_recommendation.recommendation], margin + 4, y + 13);

  doc.setTextColor(GRAY);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('CONFIDENCE', pageWidth - margin - 4, y + 5, { align: 'right' });
  doc.setTextColor(confColor);
  doc.setFontSize(10);
  doc.text(CONFIDENCE_LABEL[brief.ai_recommendation.confidence], pageWidth - margin - 4, y + 13, { align: 'right' });
  y += 24;

  // ── Clinical Question ────────────────────────────────────────────────
  sectionHeader('Clinical Question');
  wrappedText(brief.clinical_question, 9, NAVY);

  // ── Patient & Provider info side-by-side ─────────────────────────────
  const headerY = y;
  sectionHeader('Patient Information');
  labelValue('Name', caseData.patient_name || '—', margin);
  labelValue('DOB', caseData.patient_dob || '—', margin);
  labelValue('Gender', caseData.patient_gender || '—', margin);
  labelValue('Member ID', caseData.patient_member_id || '—', margin);
  const leftEnd = y;

  y = headerY;
  sectionHeader('Provider & Service');
  labelValue('Provider', caseData.requesting_provider || '—', colRight);
  labelValue('NPI', caseData.requesting_provider_npi || '—', colRight);
  labelValue('Specialty', caseData.requesting_provider_specialty || '—', colRight);
  labelValue('CPT/HCPCS', caseData.procedure_codes?.join(', ') || '—', colRight);
  y = Math.max(leftEnd, y) + 3;

  // ── Patient Summary ──────────────────────────────────────────────────
  sectionHeader('Patient Summary');
  wrappedText(brief.patient_summary);

  // ── Clinical Findings (Diagnosis + Procedure Analysis) ──────────────
  sectionHeader('Clinical Findings');
  doc.setTextColor(GRAY);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  ensureRoom(5);
  doc.text('PRIMARY DIAGNOSIS', margin, y);
  y += 4;
  wrappedText(brief.diagnosis_analysis.primary_diagnosis);

  if (brief.diagnosis_analysis.secondary_diagnoses.length > 0) {
    doc.setTextColor(GRAY);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    ensureRoom(5);
    doc.text('SECONDARY DIAGNOSES', margin, y);
    y += 4;
    bullets(brief.diagnosis_analysis.secondary_diagnoses);
  }

  doc.setTextColor(GRAY);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  ensureRoom(5);
  doc.text('DIAGNOSIS–PROCEDURE ALIGNMENT', margin, y);
  y += 4;
  wrappedText(brief.diagnosis_analysis.diagnosis_procedure_alignment);

  doc.setTextColor(GRAY);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  ensureRoom(5);
  doc.text(`PROCEDURE RATIONALE (${brief.procedure_analysis.complexity_level.toUpperCase()})`, margin, y);
  y += 4;
  wrappedText(brief.procedure_analysis.clinical_rationale);

  doc.setTextColor(GRAY);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  ensureRoom(5);
  doc.text('SETTING APPROPRIATENESS', margin, y);
  y += 4;
  wrappedText(brief.procedure_analysis.setting_appropriateness);

  // ── Guideline Matches ────────────────────────────────────────────────
  sectionHeader('Guideline Matches');
  if (brief.criteria_match.applicable_guideline) {
    doc.setTextColor(GRAY);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    ensureRoom(5);
    doc.text('APPLICABLE GUIDELINE', margin, y);
    y += 4;
    wrappedText(`${brief.criteria_match.applicable_guideline} (source: ${brief.criteria_match.guideline_source})`);
  }

  doc.setTextColor(GREEN);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  ensureRoom(5);
  doc.text('CRITERIA MET', margin, y);
  y += 4;
  bullets(brief.criteria_match.criteria_met, { bullet: '✓', color: '#065f46', emptyText: 'None identified' });

  doc.setTextColor(RED);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  ensureRoom(5);
  doc.text('CRITERIA NOT MET', margin, y);
  y += 4;
  bullets(brief.criteria_match.criteria_not_met, { bullet: '✗', color: '#991b1b', emptyText: 'None identified' });

  if (brief.criteria_match.criteria_unable_to_assess.length > 0) {
    doc.setTextColor(AMBER);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    ensureRoom(5);
    doc.text('UNABLE TO ASSESS', margin, y);
    y += 4;
    bullets(brief.criteria_match.criteria_unable_to_assess, { bullet: '?', color: '#92400e' });
  }

  if (brief.criteria_match.conservative_alternatives.length > 0) {
    doc.setTextColor(NAVY);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    ensureRoom(5);
    doc.text('CONSERVATIVE ALTERNATIVES', margin, y);
    y += 4;
    bullets(brief.criteria_match.conservative_alternatives, { bullet: '→', color: NAVY });
  }

  // ── Recommended Determination + Rationale ────────────────────────────
  sectionHeader('Recommended Determination & Rationale');
  wrappedText(brief.ai_recommendation.rationale);

  if (brief.ai_recommendation.key_considerations.length > 0) {
    doc.setTextColor(GRAY);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    ensureRoom(5);
    doc.text('KEY CONSIDERATIONS FOR REVIEWER', margin, y);
    y += 4;
    bullets(brief.ai_recommendation.key_considerations);
  }

  if (brief.ai_recommendation.if_modify_suggestion) {
    doc.setTextColor(GRAY);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    ensureRoom(5);
    doc.text('MODIFICATION SUGGESTION', margin, y);
    y += 4;
    wrappedText(brief.ai_recommendation.if_modify_suggestion);
  }

  // ── Supporting Excerpts ──────────────────────────────────────────────
  // Per product spec: mapped to documentation_review.key_findings. If/when
  // a dedicated excerpts field is added to AIBrief, swap here.
  sectionHeader('Supporting Excerpts from Documentation');
  if (brief.documentation_review.documents_provided) {
    doc.setTextColor(GRAY);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    ensureRoom(5);
    doc.text(`Documentation reviewed: ${brief.documentation_review.documents_provided}`, margin, y);
    y += 5;
  }
  bullets(brief.documentation_review.key_findings, { emptyText: 'No key findings extracted from submitted documentation' });

  if (brief.documentation_review.missing_documentation.length > 0) {
    doc.setTextColor(AMBER);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    ensureRoom(5);
    doc.text('MISSING DOCUMENTATION', margin, y);
    y += 4;
    bullets(brief.documentation_review.missing_documentation, { bullet: '⚠', color: '#92400e' });
  }

  // ── Reviewer Action Required ────────────────────────────────────────
  sectionHeader('Reviewer Action Required');
  wrappedText(brief.reviewer_action.decision_required);

  doc.setTextColor(GRAY);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  ensureRoom(5);
  doc.text('TIME SENSITIVITY', margin, y);
  y += 4;
  wrappedText(brief.reviewer_action.time_sensitivity);

  if (brief.reviewer_action.peer_to_peer_suggested) {
    doc.setTextColor(NAVY);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    ensureRoom(5);
    doc.text('• Peer-to-peer review suggested', margin, y);
    y += 5;
  }

  if (brief.reviewer_action.additional_info_needed.length > 0) {
    doc.setTextColor(GRAY);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    ensureRoom(5);
    doc.text('ADDITIONAL INFORMATION NEEDED', margin, y);
    y += 4;
    bullets(brief.reviewer_action.additional_info_needed);
  }

  if (brief.reviewer_action.state_specific_requirements.length > 0) {
    doc.setTextColor(GRAY);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    ensureRoom(5);
    doc.text('STATE-SPECIFIC REQUIREMENTS', margin, y);
    y += 4;
    bullets(brief.reviewer_action.state_specific_requirements);
  }

  // ── Footer on every page ─────────────────────────────────────────────
  // jsPDF page count is set after all addPage() calls. Loop and stamp.
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const footerY = pageHeight - 12;
    doc.setDrawColor('#e5e7eb');
    doc.line(margin, footerY - 3, margin + contentWidth, footerY - 3);
    doc.setTextColor(GRAY);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'italic');
    doc.text(
      'AI-generated clinical brief for reviewer use. The determination is rendered solely by the reviewing physician.',
      pageWidth / 2, footerY, { align: 'center' },
    );
    doc.setFont('helvetica', 'normal');
    doc.text(
      `VantaUM Clinical Brief Engine  ·  Case ${caseData.case_number}  ·  Generated ${generatedDate}  ·  Page ${i} of ${pageCount}`,
      pageWidth / 2, footerY + 4, { align: 'center' },
    );
  }

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}
